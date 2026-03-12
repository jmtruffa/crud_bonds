const express = require('express');
const { pool } = require('../config/db');
const { sendError } = require('../middleware/auth');

const router = express.Router();

// --- Helpers ---

async function validateCashflowDateSequence(bondId, newDate, excludeId = null) {
  const query = excludeId
    ? `SELECT id, "date" FROM bond_cashflows WHERE bond_id = $1 AND id != $2 ORDER BY "date"`
    : `SELECT id, "date" FROM bond_cashflows WHERE bond_id = $1 ORDER BY "date"`;

  const params = excludeId ? [bondId, excludeId] : [bondId];
  const result = await pool.query(query, params);
  const allCashflows = result.rows;
  if (allCashflows.length === 0) return;

  const newDateObj = new Date(newDate);
  if (isNaN(newDateObj)) throw new Error('Fecha inválida');

  const oneDayMs = 24 * 60 * 60 * 1000;
  let previousDate = null;
  let nextDate = null;
  for (let i = 0; i < allCashflows.length; i++) {
    const cfDate = new Date(allCashflows[i].date);
    if (cfDate >= newDateObj) {
      nextDate = cfDate;
      if (i > 0) previousDate = new Date(allCashflows[i - 1].date);
      break;
    }
    previousDate = cfDate;
  }
  if (previousDate && newDateObj - previousDate < oneDayMs) {
    throw new Error(`La fecha debe ser al menos 1 día después del cashflow anterior (${previousDate.toISOString().split('T')[0]})`);
  }
  if (excludeId && nextDate && nextDate - newDateObj < oneDayMs) {
    throw new Error(`La fecha debe ser al menos 1 día antes del siguiente cashflow (${nextDate.toISOString().split('T')[0]})`);
  }
  if (nextDate) {
    throw new Error(`No se permite insertar cashflow entre fechas existentes. Debe agregarse al final con fecha posterior al último cashflow (${nextDate.toISOString().split('T')[0]})`);
  }
}

async function recalculateCashflowResiduals(bondId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, amort FROM bond_cashflows WHERE bond_id = $1 ORDER BY seq ASC, "date" ASC', [bondId]);
    let prevResidual = 100;
    for (const r of rows) {
      const amort = parseFloat(r.amort) || 0;
      const newResidual = +(prevResidual - amort).toFixed(2);
      if (newResidual < 0) {
        throw new Error(`Residual negativo (${newResidual}) para cashflow ID ${r.id}. Reducir amortización.`);
      }
      await client.query('UPDATE bond_cashflows SET residual = $1 WHERE id = $2', [newResidual, r.id]);
      prevResidual = newResidual;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Recalculate residuals error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// --- Routes ---

// List cashflows
router.get('/:id/cashflows', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, bond_id, seq, "date", rate, amort, residual, amount, created_at FROM bond_cashflows WHERE bond_id = $1 ORDER BY "date", seq',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudo obtener los cashflows', 500);
  }
});

// Add cashflow
router.post('/:id/cashflows', async (req, res) => {
  const bond_id = req.params.id;
  const { date, rate, amort, amount } = req.body;
  const client = await pool.connect();
  try {
    if (rate < 0 || rate > 1) {
      return res.status(400).json({ error: 'Rate debe estar entre 0 y 1' });
    }
    await client.query('BEGIN');
    await validateCashflowDateSequence(bond_id, date);

    const seqRes = await client.query('SELECT COALESCE(MAX(seq), 0) as maxSeq FROM bond_cashflows WHERE bond_id = $1', [bond_id]);
    const nextSeq = seqRes.rows[0].maxseq + 1;

    await client.query('LOCK TABLE bond_cashflows IN EXCLUSIVE MODE');
    const maxRes = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as nid FROM bond_cashflows');
    const newId = maxRes.rows[0].nid;

    const prevRes = await client.query(
      'SELECT residual FROM bond_cashflows WHERE bond_id = $1 ORDER BY seq DESC LIMIT 1',
      [bond_id]
    );
    const prevResidual = prevRes.rows.length > 0 ? parseFloat(prevRes.rows[0].residual) : 100;
    const expectedResidual = prevResidual - parseFloat(amort || 0);

    if (expectedResidual < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Amortización excede residual disponible (${prevResidual}). Máximo allowed amort: ${prevResidual}` });
    }

    const allCashflows = await client.query('SELECT id, amort FROM bond_cashflows WHERE bond_id = $1 ORDER BY seq ASC', [bond_id]);
    let testResidual = 100;
    for (const cf of allCashflows.rows) {
      testResidual = testResidual - parseFloat(cf.amort || 0);
      if (testResidual < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Las amortizaciones existentes causan residual negativo. Corrige primero.' });
      }
    }
    testResidual = testResidual - parseFloat(amort || 0);
    if (testResidual < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Esta amortización haría residual negativo (${testResidual}). Máximo permitido: ${prevResidual}` });
    }

    const q = `INSERT INTO bond_cashflows (id, bond_id, seq, "date", rate, amort, residual, amount, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING *`;
    const { rows } = await client.query(q, [newId, bond_id, nextSeq, date, rate, amort, expectedResidual, amount]);

    await client.query('COMMIT');
    await recalculateCashflowResiduals(bond_id);

    const { rows: updatedRows } = await pool.query('SELECT * FROM bond_cashflows WHERE id=$1', [rows[0].id]);
    res.status(201).json(updatedRows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    sendError(res, err, err.message || 'No se pudo agregar el cashflow', 400);
  } finally {
    client.release();
  }
});

// Update cashflow
router.put('/:bondId/cashflows/:cfId', async (req, res) => {
  const { bondId, cfId } = req.params;
  const { seq, date, rate, amort, amount } = req.body;
  const client = await pool.connect();
  try {
    if (rate < 0 || rate > 1) {
      return res.status(400).json({ error: 'Rate debe estar entre 0 y 1' });
    }
    await client.query('BEGIN');

    const seqCheck = await client.query('SELECT id FROM bond_cashflows WHERE bond_id = $1 AND seq = $2 AND id != $3', [bondId, seq, cfId]);
    if (seqCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Sequence ${seq} ya existe para este bono` });
    }

    await validateCashflowDateSequence(bondId, date, cfId);

    const allCashflows = await client.query('SELECT id, seq, amort FROM bond_cashflows WHERE bond_id = $1 ORDER BY seq ASC', [bondId]);
    let testResidual = 100;
    for (const cf of allCashflows.rows) {
      const amortValue = (parseInt(cf.id) === parseInt(cfId)) ? parseFloat(amort || 0) : parseFloat(cf.amort || 0);
      testResidual = testResidual - amortValue;
      if (testResidual < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Este cambio causaría residual negativo (${testResidual}). Reduce amortización.` });
      }
    }

    const q = `UPDATE bond_cashflows SET seq=$1, "date"=$2, rate=$3, amort=$4, amount=$5
               WHERE id=$6 AND bond_id=$7
               RETURNING *`;
    const { rows } = await client.query(q, [seq, date, rate, amort, amount, cfId, bondId]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cashflow no encontrado' });
    }

    await client.query('COMMIT');
    await recalculateCashflowResiduals(bondId);
    const { rows: updated } = await pool.query('SELECT * FROM bond_cashflows WHERE id=$1', [cfId]);
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    sendError(res, err, err.message || 'No se pudo actualizar el cashflow', 400);
  } finally {
    client.release();
  }
});

// Delete cashflow
router.delete('/:bondId/cashflows/:cfId', async (req, res) => {
  const { bondId, cfId } = req.params;
  try {
    const result = await pool.query('DELETE FROM bond_cashflows WHERE id=$1 AND bond_id=$2', [parseInt(cfId), parseInt(bondId)]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cashflow no encontrado' });
    }
    try {
      await recalculateCashflowResiduals(parseInt(bondId));
    } catch (e) {
      console.error('Residual recalc after delete failed:', e.message);
    }
    res.status(204).end();
  } catch (err) {
    console.error('Delete cashflow error:', err);
    sendError(res, err, 'No se pudo eliminar el cashflow', 500);
  }
});

// Bulk upload (Save All)
router.post('/:id/cashflows/bulk-json', async (req, res) => {
  const bond_id = req.params.id;
  const rows = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Expected non-empty array' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lastCf = await client.query(
      'SELECT seq, "date", residual FROM bond_cashflows WHERE bond_id = $1 ORDER BY seq DESC LIMIT 1',
      [bond_id]
    );
    let lastSeq = 0;
    let lastDate = null;
    let prevResidual = 100;
    if (lastCf.rows.length > 0) {
      lastSeq = lastCf.rows[0].seq;
      lastDate = lastCf.rows[0].date;
      prevResidual = parseFloat(lastCf.rows[0].residual);
    }

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].rate < 0 || rows[i].rate > 1) {
        throw new Error(`Rate debe estar entre 0 y 1 en fila ${i + 1} (recibido: ${rows[i].rate})`);
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const d = new Date(rows[i].date);
      if (isNaN(d.getTime())) throw new Error(`Fecha inválida en fila ${i + 1}`);
      if (lastDate && rows[i].date <= new Date(lastDate).toISOString().split('T')[0]) {
        throw new Error(`Fila ${i + 1}: fecha debe ser posterior al último cashflow existente (${new Date(lastDate).toISOString().split('T')[0]})`);
      }
      if (i > 0 && rows[i].date <= rows[i - 1].date) {
        throw new Error(`Fila ${i + 1}: fecha debe ser posterior a la fila anterior`);
      }
    }

    const processedRows = [];
    let currentResidual = prevResidual;
    for (let i = 0; i < rows.length; i++) {
      const amort = parseFloat(rows[i].amort) || 0;
      currentResidual = +(currentResidual - amort).toFixed(2);
      if (currentResidual < 0) {
        throw new Error(`Fila ${i + 1}: amortización excede residual disponible. Residual sería ${currentResidual}`);
      }
      processedRows.push({
        seq: lastSeq + i + 1,
        date: rows[i].date,
        rate: rows[i].rate,
        amort: rows[i].amort,
        residual: currentResidual,
        amount: rows[i].amount
      });
    }

    await client.query('LOCK TABLE bond_cashflows IN EXCLUSIVE MODE');
    const maxRes = await client.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM bond_cashflows');
    let nextId = maxRes.rows[0].max_id + 1;

    for (const r of processedRows) {
      await client.query(
        `INSERT INTO bond_cashflows (id, bond_id, seq, "date", rate, amort, residual, amount, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())`,
        [nextId++, bond_id, r.seq, r.date, r.rate, r.amort, r.residual, r.amount]
      );
    }

    await client.query('COMMIT');
    await recalculateCashflowResiduals(bond_id);

    const { rows: all } = await pool.query('SELECT * FROM bond_cashflows WHERE bond_id = $1 ORDER BY seq', [bond_id]);
    res.json({ inserted: processedRows.length, cashflows: all });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Bulk insert error:', err);
    sendError(res, err, err.message || 'No se pudieron insertar los cashflows', 400);
  } finally {
    client.release();
  }
});

module.exports = router;
