const express = require('express');
const path = require('path');
const multer = require('multer');
const { gcsBucket } = require('../config/gcs');
const { sendError } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se permiten archivos PDF'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Upload PDFs for a bond (by ticker) -> GCS
router.post('/:ticker/pdfs', upload.array('pdfs', 10), async (req, res) => {
  if (!gcsBucket) {
    return res.status(503).json({ error: 'GCS no configurado. Agregar GCS_BUCKET en .env del servidor.' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se subieron archivos' });
  }
  const ticker = req.params.ticker.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  try {
    const [existing] = await gcsBucket.getFiles({ prefix: `${ticker}/` });
    const pdfCount = existing.filter(f => f.name.endsWith('.pdf')).length;

    const uploaded = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const filename = `${ticker}_${pdfCount + i + 1}.pdf`;
      const gcsPath = `${ticker}/${filename}`;
      const blob = gcsBucket.file(gcsPath);
      await blob.save(file.buffer, { contentType: 'application/pdf' });
      uploaded.push({
        filename,
        size: file.size,
        path: `/bonds/${ticker}/pdfs/${filename}`
      });
    }
    console.log(`[GCS] Uploaded ${uploaded.length} PDFs for ${ticker}`);
    res.json({ uploaded });
  } catch (err) {
    console.error('GCS upload error:', err);
    sendError(res, err, 'Error subiendo PDFs a GCS', 500);
  }
});

// List PDFs for a bond ticker (from GCS)
router.get('/:ticker/pdfs', async (req, res) => {
  if (!gcsBucket) return res.json([]);
  const ticker = req.params.ticker.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  try {
    const [files] = await gcsBucket.getFiles({ prefix: `${ticker}/` });
    const pdfs = files
      .filter(f => f.name.endsWith('.pdf'))
      .map(f => {
        const filename = f.name.split('/').pop();
        return { filename, url: `/bonds/${ticker}/pdfs/${filename}` };
      });
    res.json(pdfs);
  } catch (err) {
    console.error('GCS list error:', err);
    sendError(res, err, 'Error listando PDFs', 500);
  }
});

// Serve a PDF file (stream from GCS)
router.get('/:ticker/pdfs/:filename', async (req, res) => {
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
