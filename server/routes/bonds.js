const express = require('express');
const { pool } = require('../config/db');
const { sendError } = require('../middleware/auth');

const router = express.Router();

const BOND_SELECT = `
  SELECT
    b.*,
    b."offset" AS offset_days,
    b.day_count_conv AS day_count_conv_id,
    c.convention AS day_count_conv,
    it.code AS index_code,
    it.name AS index_name
  FROM bonds b
  LEFT JOIN day_count_convention c ON b.day_count_conv = c.id
  LEFT JOIN index_types it ON b.index_type_id = it.id`;

// List bonds
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`${BOND_SELECT} ORDER BY b.id`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudieron listar los bonos', 500);
  }
});

// List LECAPS
router.get('/lecaps', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ticker, date_liq, date_vto, tasa, vf
       FROM lecaps
       ORDER BY date_vto DESC, ticker ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudieron listar las LECAPS', 500);
  }
});

// Create bond with cashflows (atomic transaction)
router.post('/with-cashflows', async (req, res) => {
  const { bond: bondData, cashflows: cashflowRows } = req.body;
  if (!bondData) return res.status(400).json({ error: 'Falta campo "bond"' });
  if (!Array.isArray(cashflowRows) || cashflowRows.length === 0) {
    return res.status(400).json({ error: 'Falta campo "cashflows" (array no vacío)' });
  }

  const ticker = bondData.ticker ? bondData.ticker.toUpperCase().trim() : bondData.ticker;
  const { issue_date, maturity, coupon, index_code, offset_days, day_count_conv_id } = bondData;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Duplicate ticker check
    const dupCheck = await client.query('SELECT id FROM bonds WHERE UPPER(ticker) = $1 LIMIT 1', [ticker]);
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Ya existe un bono con ticker "${ticker}"` });
    }

    // Resolve index_type_id
    let index_type_id = null;
    if (index_code) {
      const r = await client.query('SELECT id FROM index_types WHERE code = $1 LIMIT 1', [index_code]);
      if (r.rows[0]) index_type_id = r.rows[0].id;
    }

    // Insert bond
    await client.query('LOCK TABLE bonds IN EXCLUSIVE MODE');
    const maxRes = await client.query('SELECT COALESCE(MAX(id), 0) + 1 AS nid FROM bonds');
    const newBondId = maxRes.rows[0].nid;

    const bondInsert = await client.query(
      `INSERT INTO bonds
        (id, ticker, issue_date, maturity, coupon, index_type_id, "offset", day_count_conv, active, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
        RETURNING id, ticker, issue_date, maturity, coupon, index_type_id, "offset" AS offset_days, day_count_conv AS day_count_conv_id, active, created_at, updated_at`,
      [newBondId, ticker, issue_date, maturity, coupon, index_type_id, offset_days, day_count_conv_id, true]
    );
    const newBond = bondInsert.rows[0];

    // Validate cashflow rates and dates
    for (let i = 0; i < cashflowRows.length; i++) {
      if (cashflowRows[i].rate < 0 || cashflowRows[i].rate > 1) {
        throw new Error(`Rate debe estar entre 0 y 1 en fila ${i + 1} (recibido: ${cashflowRows[i].rate})`);
      }
      const d = new Date(cashflowRows[i].date);
      if (isNaN(d.getTime())) throw new Error(`Fecha inválida en fila ${i + 1}`);
      if (i > 0 && cashflowRows[i].date <= cashflowRows[i - 1].date) {
        throw new Error(`Fila ${i + 1}: fecha debe ser posterior a la fila anterior`);
      }
    }

    // Compute residuals and build processed rows
    const processedRows = [];
    let currentResidual = 100;
    for (let i = 0; i < cashflowRows.length; i++) {
      const amort = parseFloat(cashflowRows[i].amort) || 0;
      currentResidual = +(currentResidual - amort).toFixed(2);
      if (currentResidual < 0) {
        throw new Error(`Fila ${i + 1}: amortización excede residual disponible. Residual sería ${currentResidual}`);
      }
      processedRows.push({
        seq: i + 1,
        date: cashflowRows[i].date,
        rate: cashflowRows[i].rate,
        amort: cashflowRows[i].amort,
        residual: currentResidual,
        amount: cashflowRows[i].amount,
      });
    }

    // Bulk insert cashflows
    await client.query('LOCK TABLE bond_cashflows IN EXCLUSIVE MODE');
    const maxCfRes = await client.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM bond_cashflows');
    let nextCfId = maxCfRes.rows[0].max_id + 1;

    for (const r of processedRows) {
      await client.query(
        `INSERT INTO bond_cashflows (id, bond_id, seq, "date", rate, amort, residual, amount, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())`,
        [nextCfId++, newBondId, r.seq, r.date, r.rate, r.amort, r.residual, r.amount]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ bond: newBond, cashflows_inserted: processedRows.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating bond with cashflows:', err);
    sendError(res, err, err.message || 'No se pudo crear el bono con cashflows', 400);
  } finally {
    client.release();
  }
});

// Get single bond
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`${BOND_SELECT} WHERE b.id = $1`, [req.params.id]);
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudo obtener el bono', 500);
  }
});

// Create bond
router.post('/', async (req, res) => {
  const { issue_date, maturity, coupon, index_code, offset_days, day_count_conv_id, active } = req.body;
  const ticker = req.body.ticker ? req.body.ticker.toUpperCase().trim() : req.body.ticker;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dupCheck = await client.query('SELECT id FROM bonds WHERE UPPER(ticker) = $1 LIMIT 1', [ticker]);
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Ya existe un bono con ticker "${ticker}"` });
    }

    let index_type_id = null;
    if (index_code) {
      const r = await client.query('SELECT id FROM index_types WHERE code = $1 LIMIT 1', [index_code]);
      if (r.rows[0]) index_type_id = r.rows[0].id;
    }

    await client.query('LOCK TABLE bonds IN EXCLUSIVE MODE');
    const maxRes = await client.query('SELECT COALESCE(MAX(id), 0) + 1 AS nid FROM bonds');
    const newId = maxRes.rows[0].nid;

    const q = `INSERT INTO bonds
      (id, ticker, issue_date, maturity, coupon, index_type_id, "offset", day_count_conv, active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
      RETURNING id, ticker, issue_date, maturity, coupon, index_type_id, "offset" AS offset_days, day_count_conv AS day_count_conv_id, active, created_at, updated_at`;
    const values = [newId, ticker, issue_date, maturity, coupon, index_type_id, offset_days, day_count_conv_id, active !== undefined ? active : true];

    const insertRes = await client.query(q, values);
    await client.query('COMMIT');
    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating bond:', err);
    sendError(res, err, 'No se pudo crear el bono', 400);
  } finally {
    client.release();
  }
});

// Create LECAP and vencTitulos entry (atomic transaction)
router.post('/lecaps', async (req, res) => {
  const ticker = req.body.ticker ? req.body.ticker.toUpperCase().trim() : '';
  const { date_liq, date_vto } = req.body;
  const tasa = Number(req.body.tasa);
  const vf = Number(req.body.vf);

  if (!ticker || !date_liq || !date_vto) {
    return res.status(400).json({ error: 'Campos requeridos: ticker, date_liq, date_vto' });
  }
  if (Number.isNaN(tasa) || Number.isNaN(vf)) {
    return res.status(400).json({ error: 'Campos invalidos: tasa y vf deben ser numericos' });
  }

  const liqDate = new Date(date_liq);
  const vtoDate = new Date(date_vto);
  if (Number.isNaN(liqDate.getTime()) || Number.isNaN(vtoDate.getTime())) {
    return res.status(400).json({ error: 'Fechas invalidas: date_liq y date_vto deben tener formato valido' });
  }
  if (vtoDate <= liqDate) {
    return res.status(400).json({ error: 'date_vto debe ser posterior a date_liq' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lecapInsert = await client.query(
      `INSERT INTO lecaps (ticker, date_liq, date_vto, tasa, vf)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ticker, date_liq, date_vto, tasa, vf`,
      [ticker, date_liq, date_vto, tasa, vf]
    );

    await client.query(
      `INSERT INTO "vencTitulos" (ticker, vto)
       VALUES ($1, $2)`,
      [ticker, date_vto]
    );

    await client.query('COMMIT');
    res.status(201).json(lecapInsert.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating lecap:', err);
    sendError(res, err, 'No se pudo crear la LECAP', 400);
  } finally {
    client.release();
  }
});

// Update bond
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { issue_date, maturity, coupon, index_code, offset_days, day_count_conv_id, active } = req.body;
  const ticker = req.body.ticker ? req.body.ticker.toUpperCase().trim() : req.body.ticker;
  try {
    const dupCheck = await pool.query('SELECT id FROM bonds WHERE UPPER(ticker) = $1 AND id != $2 LIMIT 1', [ticker, id]);
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: `Ya existe un bono con ticker "${ticker}"` });
    }

    let index_type_id = null;
    if (index_code) {
      const r = await pool.query('SELECT id FROM index_types WHERE code = $1 LIMIT 1', [index_code]);
      if (r.rows[0]) index_type_id = r.rows[0].id;
    }

    const q = `UPDATE bonds SET
                 ticker=$1, issue_date=$2, maturity=$3, coupon=$4,
                 index_type_id=$5, "offset"=$6, day_count_conv=$7, active=$8, updated_at=now()
               WHERE id=$9
               RETURNING id, ticker, issue_date, maturity, coupon, index_type_id, "offset" AS offset_days, day_count_conv AS day_count_conv_id, active, created_at, updated_at`;
    const { rows } = await pool.query(q, [ticker, issue_date, maturity, coupon, index_type_id, offset_days, day_count_conv_id, active !== undefined ? active : true, id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bono no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudo actualizar el bono', 400);
  }
});

// Delete bond - DISABLED
router.delete('/:id', (req, res) => {
  res.status(403).json({ error: 'Eliminación de bonos deshabilitada. Usar acceso directo a DB.' });
});

module.exports = router;
