require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Helpers ----------
function sendError(res, err, userMessage = 'Ocurrió un error', status = 400) {
  const payload = { error: userMessage };
  if (process.env.NODE_ENV !== 'production') {
    payload.details = err && err.message ? err.message : String(err);
  }
  res.status(status).json(payload);
}

// ---------- Load configuration ----------
const dbConfig = {
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : undefined
};

const missing = [];
['host','user','password','database','port'].forEach(k => {
  if (!dbConfig[k]) missing.push(k);
});
if (missing.length > 0) {
  console.error('❌ Faltan variables de configuración de la DB:', missing.join(', '));
  console.error('Define POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT.');
  process.exit(1);
}

// SSL handling
let ssl = false;
if (process.env.POSTGRES_SSL && process.env.POSTGRES_SSL.toLowerCase() === 'true') {
  ssl = { rejectUnauthorized: false };
} else {
  const hostLower = (dbConfig.host || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(hostLower)) {
    ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  port: dbConfig.port,
  ssl
});

console.log('🔧 Environment (DB):');
console.log(`   POSTGRES_HOST: ${dbConfig.host}`);
console.log(`   POSTGRES_USER: ${dbConfig.user}`);
console.log(`   POSTGRES_DB: ${dbConfig.database}`);
console.log(`   POSTGRES_PORT: ${dbConfig.port}`);
console.log(`   POSTGRES_SSL: ${ssl ? 'enabled' : 'disabled'}`);
console.log(`   PORT: ${process.env.PORT || 4000}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// ---------- Endpoints ----------

// List bonds
app.get('/bonds', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        b.*,
        b."offset" AS offset_days,
        b.day_count_conv AS day_count_conv_id,
        c.convention AS day_count_conv,
        it.code AS index_code,
        it.name AS index_name
      FROM bonds b
      LEFT JOIN day_count_convention c ON b.day_count_conv = c.id
      LEFT JOIN index_types it ON b.index_type_id = it.id
      ORDER BY b.id
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudieron listar los bonos', 500);
  }
});

// Get single bond
app.get('/bonds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT
        b.*,
        b."offset" AS offset_days,
        b.day_count_conv AS day_count_conv_id,
        c.convention AS day_count_conv,
        it.code AS index_code,
        it.name AS index_name
      FROM bonds b
      LEFT JOIN day_count_convention c ON b.day_count_conv = c.id
      LEFT JOIN index_types it ON b.index_type_id = it.id
      WHERE b.id = $1
    `, [id]);
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudo obtener el bono', 500);
  }
});

// Create bond — manteniendo tu enfoque: LOCK + MAX(id)+1
app.post('/bonds', async (req, res) => {
  const { ticker, issue_date, maturity, coupon, index_code, offset_days, day_count_conv_id, active } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve index_type_id from index_code if provided
    let index_type_id = null;
    if (index_code) {
      const r = await client.query('SELECT id FROM index_types WHERE code = $1 LIMIT 1', [index_code]);
      if (r.rows[0]) index_type_id = r.rows[0].id;
    }

    // Lock table and compute new id = max(id) + 1 atomically
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
app.put('/bonds/:id', async (req, res) => {
  const { id } = req.params;
  const { ticker, issue_date, maturity, coupon, index_code, offset_days, day_count_conv_id, active } = req.body;
  try {
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

// Delete bond
app.delete('/bonds/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM bonds WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Bono no encontrado' });
    }
    res.status(204).end();
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudo eliminar el bono', 500);
  }
});

// ---------- Cashflows ----------

app.get('/bonds/:id/cashflows', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT id, bond_id, seq, "date", rate, amort, residual, amount, created_at FROM bond_cashflows WHERE bond_id = $1 ORDER BY "date", seq', [id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'No se pudo obtener los cashflows', 500);
  }
});

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

// Add cashflow — manteniendo MAX(id)+1 + LOCK
app.post('/bonds/:id/cashflows', async (req, res) => {
  const bond_id = req.params.id;
  const { date, rate, amort, amount } = req.body;
  const client = await pool.connect();
  try {
    if (rate < 0 || rate > 1) {
      return res.status(400).json({ error: 'Rate debe estar entre 0 y 1' });
    }
    await client.query('BEGIN');

    await validateCashflowDateSequence(bond_id, date);

    // Next seq
    const seqRes = await client.query('SELECT COALESCE(MAX(seq), 0) as maxSeq FROM bond_cashflows WHERE bond_id = $1', [bond_id]);
    const nextSeq = seqRes.rows[0].maxseq + 1;

    // Lock table and compute new id
    await client.query('LOCK TABLE bond_cashflows IN EXCLUSIVE MODE');
    const maxRes = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as nid FROM bond_cashflows');
    const newId = maxRes.rows[0].nid;

    // prev residual
    const prevRes = await client.query(`
      SELECT residual FROM bond_cashflows 
      WHERE bond_id = $1 
      ORDER BY seq DESC 
      LIMIT 1
    `, [bond_id]);
    const prevResidual = prevRes.rows.length > 0 ? parseFloat(prevRes.rows[0].residual) : 100;
    const expectedResidual = prevResidual - parseFloat(amort || 0);

    if (expectedResidual < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Amortización excede residual disponible (${prevResidual}). Máximo allowed amort: ${prevResidual}` });
    }

    // Validate existing amortizations won't cause negative residual later
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
app.put('/bonds/:bondId/cashflows/:cfId', async (req, res) => {
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
app.delete('/bonds/:bondId/cashflows/:cfId', async (req, res) => {
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

// Bulk upload
app.post('/bonds/:id/cashflows/bulk-json', async (req, res) => {
  const bond_id = req.params.id;
  const rows = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'Expected array' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const values = [];
    const placeholders = [];
    let idx = 1;
    for (const r of rows) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(bond_id, r.seq, r.date, r.rate, r.amort, r.residual, r.amount);
    }
    if (placeholders.length > 0) {
      const sql = `INSERT INTO bond_cashflows (bond_id, seq, "date", rate, amort, residual, amount) VALUES ${placeholders.join(',')}`;
      await client.query(sql, values);
    }
    await client.query('COMMIT');
    res.json({ inserted: rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    sendError(res, err, 'No se pudieron insertar los cashflows', 400);
  } finally {
    client.release();
  }
});

// Indexes & day-counts
app.get('/indexes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT code FROM index_types ORDER BY code');
    res.json(rows.map(r => r.code));
  } catch (err) {
    console.error(err);
    sendError(res, err, 'db error', 500);
  }
});

app.get('/day-count-conventions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, convention FROM day_count_convention ORDER BY convention');
    const mapped = rows.map(r => ({ id: r.id, code: r.convention, description: null }));
    res.json(mapped);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'db error', 500);
  }
});

// Admin cleanup (dev)
app.delete('/admin/cleanup-null-cashflows', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM bond_cashflows WHERE id IS NULL');
    res.json({ deletedCount: result.rowCount });
  } catch (err) {
    console.error(err);
    sendError(res, err, 'db error', 500);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
