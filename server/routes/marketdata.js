const { Router } = require('express');
const { getMarketData, getFuturesData, getTimezone, setTimezone } = require('../services/marketdata');
const { pool } = require('../config/db');

const router = Router();

router.get('/', (req, res) => {
  res.json(getMarketData());
});

router.get('/futures', (req, res) => {
  const md = getMarketData();
  res.json({
    contracts: getFuturesData(),
    connected: md.connected,
    dlrSpot: md.dlrSpot.value,
  });
});

router.get('/timezone', (req, res) => {
  res.json({ offsetHours: getTimezone() });
});

router.put('/timezone', (req, res) => {
  const { offsetHours } = req.body;
  if (typeof offsetHours !== 'number' || offsetHours < -12 || offsetHours > 14) {
    return res.status(400).json({ error: 'offsetHours must be a number between -12 and 14' });
  }
  setTimezone(offsetHours);
  res.json({ offsetHours: getTimezone() });
});

router.get('/futures/curve', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH last_day AS (
        SELECT MAX(date) AS d FROM "rofexHis"
      )
      SELECT
        r.date,
        r.symbol,
        r.settlement,
        r.volume,
        r."impliedRateTNA",
        r."impliedRateTEA",
        r."EOM",
        r.pos
      FROM "rofexHis" r
      JOIN last_day l ON r.date = l.d
      WHERE r.product = 'DLR'
      ORDER BY r.pos
    `);
    res.json({ rows, date: rows.length > 0 ? rows[0].date : null });
  } catch (err) {
    console.error('[MarketData] rofexHis query error:', err.message);
    res.status(500).json({ error: 'Failed to fetch futures curve data' });
  }
});

module.exports = router;
