const express = require('express');
const { pool } = require('../config/db');
const { sendError } = require('../middleware/auth');

const router = express.Router();

router.delete('/cleanup-null-cashflows', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM bond_cashflows WHERE id IS NULL');
    res.json({ deletedCount: result.rowCount });
  } catch (err) {
    console.error(err);
    sendError(res, err, 'db error', 500);
  }
});

module.exports = router;
