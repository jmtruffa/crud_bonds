const express = require('express');
const router = express.Router();

// In-memory cache
let tamarCache = { data: null, fetchedAt: null };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

async function fetchBcraVariable(idVariable, desde, hasta) {
  const results = [];
  let current = new Date(desde);
  const end = new Date(hasta);

  // Segment into 180-day chunks
  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + 179);
    const segEnd = chunkEnd > end ? end : chunkEnd;

    const desdeStr = current.toISOString().split('T')[0];
    const hastaStr = segEnd.toISOString().split('T')[0];
    const url = `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${idVariable}?desde=${desdeStr}&hasta=${hastaStr}`;

    console.log(`[BCRA] Fetching ${url}`);
    try {
      const resp = await fetch(url, {
        headers: { 'Accept-Language': 'en-US' },
      });
      if (!resp.ok) {
        console.error(`[BCRA] HTTP ${resp.status} for ${desdeStr}→${hastaStr}`);
      } else {
        const parsed = await resp.json();
        const detalle = parsed?.results?.detalle;
        if (Array.isArray(detalle)) {
          for (const row of detalle) {
            if (row.fecha && row.valor != null) {
              results.push({
                date: row.fecha.split('T')[0],
                valor: parseFloat(String(row.valor).replace(',', '.')),
              });
            }
          }
        }
      }
    } catch (err) {
      console.error(`[BCRA] Error fetching ${desdeStr}→${hastaStr}: ${err.message}`);
    }

    current = new Date(segEnd);
    current.setDate(current.getDate() + 1);
  }

  return results;
}

router.get('/tamar', async (req, res) => {
  const now = Date.now();

  // Return cache if fresh
  if (tamarCache.data && tamarCache.fetchedAt && (now - tamarCache.fetchedAt) < CACHE_TTL_MS) {
    console.log(`[BCRA] Returning cached TAMAR data (${tamarCache.data.length} rows)`);
    return res.json(tamarCache.data);
  }

  try {
    const hasta = new Date().toISOString().split('T')[0];
    const desde = '2024-01-01';
    console.log(`[BCRA] Refreshing TAMAR cache ${desde}→${hasta}`);
    const data = await fetchBcraVariable(136, desde, hasta);
    tamarCache = { data, fetchedAt: now };
    console.log(`[BCRA] Cached ${data.length} TAMAR rows`);
    res.json(data);
  } catch (err) {
    console.error(`[BCRA] Error: ${err.message}`);
    // Return stale cache if available
    if (tamarCache.data) {
      return res.json(tamarCache.data);
    }
    res.status(502).json({ error: `BCRA API unavailable: ${err.message}` });
  }
});

module.exports = router;
