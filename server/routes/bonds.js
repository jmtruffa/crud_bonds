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
