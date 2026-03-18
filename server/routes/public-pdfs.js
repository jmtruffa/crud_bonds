const express = require('express');
const path = require('path');
const { gcsBucket } = require('../config/gcs');
const { sendError } = require('../middleware/auth');

const router = express.Router();

// Serve a PDF file (stream from GCS) - PUBLIC endpoint
router.get('/:ticker/:filename', async (req, res) => {
  if (!gcsBucket) return res.status(503).json({ error: 'GCS no configurado' });
  const ticker = req.params.ticker.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const filename = path.basename(req.params.filename).replace(/[^A-Z0-9_.\-]/gi, '');
  const gcsPath = `${ticker}/${filename}`;
  try {
    const blob = gcsBucket.file(gcsPath);
    const [exists] = await blob.exists();
    if (!exists) return res.status(404).json({ error: 'PDF no encontrado' });
    res.setHeader('Content-Type', 'application/pdf');
    blob.createReadStream().pipe(res);
  } catch (err) {
    console.error('GCS download error:', err);
    sendError(res, err, 'Error descargando PDF', 500);
  }
});

module.exports = router;