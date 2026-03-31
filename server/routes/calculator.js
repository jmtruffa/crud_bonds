const express = require('express');
const router = express.Router();

const CALC_BASE = process.env.CALC_BASE_URL || 'http://localhost:8080';

router.get('/yield', async (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  const url = `${CALC_BASE}/yield?${qs}`;
  console.log(`[CALC] GET ${url}`);
  try {
    const resp = await fetch(url);
    const body = await resp.text();
    console.log(`[CALC] → ${resp.status} ${body.substring(0, 200)}`);
    res.status(resp.status).set('Content-Type', resp.headers.get('content-type') || 'application/json').send(body);
  } catch (err) {
    console.error(`[CALC] Error: ${err.message}`);
    res.status(502).json({ error: `Calculator service unavailable: ${err.message}` });
  }
});

router.get('/price', async (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  const url = `${CALC_BASE}/price?${qs}`;
  console.log(`[CALC] GET ${url}`);
  try {
    const resp = await fetch(url);
    const body = await resp.text();
    console.log(`[CALC] → ${resp.status} ${body.substring(0, 200)}`);
    res.status(resp.status).set('Content-Type', resp.headers.get('content-type') || 'application/json').send(body);
  } catch (err) {
    console.error(`[CALC] Error: ${err.message}`);
    res.status(502).json({ error: `Calculator service unavailable: ${err.message}` });
  }
});

module.exports = router;
