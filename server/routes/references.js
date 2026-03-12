const express = require('express');
const { pool } = require('../config/db');
const { sendError } = require('../middleware/auth');

const router = express.Router();

// Indexes
router.get('/indexes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT code FROM index_types ORDER BY code');
    res.json(rows.map(r => r.code));
  } catch (err) {
    console.error(err);
    sendError(res, err, 'db error', 500);
  }
});

// Day-count conventions
router.get('/day-count-conventions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, convention FROM day_count_convention ORDER BY convention');
    const mapped = rows.map(r => ({ id: r.id, code: r.convention, description: null }));
    res.json(mapped);
  } catch (err) {
    console.error(err);
    sendError(res, err, 'db error', 500);
  }
});

module.exports = router;
