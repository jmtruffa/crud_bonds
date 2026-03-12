const express = require('express');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { pool } = require('../config/db');
const { gcsBucket } = require('../config/gcs');
const { openai } = require('../config/openai');
const { sendError } = require('../middleware/auth');
const { getRelevantChunks } = require('../services/rag');

const router = express.Router();

router.post('/:id/extract-cashflows', async (req, res) => {
  if (!openai) {
    return res.status(503).json({ error: 'OpenAI no configurado. Agregar OPENAI_API_KEY en .env del servidor.' });
  }
  if (!gcsBucket) {
    return res.status(503).json({ error: 'GCS no configurado. Agregar GCS_BUCKET en .env del servidor.' });
  }

  const bond_id = req.params.id;
  try {
    const bondRes = await pool.query(`
      SELECT b.*, it.code AS index_code
      FROM bonds b LEFT JOIN index_types it ON b.index_type_id = it.id
      WHERE b.id = $1`, [bond_id]);
    if (bondRes.rows.length === 0) {
      return res.status(404).json({ error: 'Bono no encontrado' });
    }
    const bond = bondRes.rows[0];
    const ticker = bond.ticker.toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    const [gcsFiles] = await gcsBucket.getFiles({ prefix: `${ticker}/` });
    const pdfFiles = gcsFiles.filter(f => f.name.endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      return res.status(400).json({ error: `No hay PDFs subidos para ${ticker}. Suba archivos primero.` });
    }

    const pdfTexts = [];
    for (const gcsFile of pdfFiles) {
      const [buf] = await gcsFile.download();
      const parsed = await pdfParse(buf);
      const text = parsed.text;
      const filename = gcsFile.name.split('/').pop();
      console.log(`[AI-Extract] PDF "${filename}": ${text.length} chars extraidos`);
      pdfTexts.push({ filename, text });
    }

    const totalChars = pdfTexts.reduce((sum, p) => sum + p.text.length, 0);
    console.log(`[AI-Extract] Total texto PDFs (crudo): ${totalChars} chars (${pdfTexts.length} archivos)`);

    // RAG: select relevant chunks per PDF
    const MAX_CHARS_PER_PDF = 15000;
    const filteredPdfTexts = [];
    for (const { filename, text } of pdfTexts) {
      const relevant = await getRelevantChunks(openai, text, MAX_CHARS_PER_PDF);
      console.log(`[AI-Extract] "${filename}": ${text.length} -> ${relevant.length} chars (RAG)`);
      filteredPdfTexts.push({ filename, text: relevant });
    }

    const filteredTotalChars = filteredPdfTexts.reduce((sum, p) => sum + p.text.length, 0);
    console.log(`[AI-Extract] Total texto post-RAG: ${filteredTotalChars} chars (de ${totalChars} original)`);

    const existingCfs = await pool.query(
      'SELECT seq, "date", rate, amort, residual, amount FROM bond_cashflows WHERE bond_id = $1 ORDER BY seq',
      [bond_id]
    );

    const existingInfo = existingCfs.rows.length > 0
      ? `\nCashflows ya cargados (no repetir estas fechas):\n${JSON.stringify(existingCfs.rows)}`
      : '\nNo hay cashflows cargados aún.';

    const systemPromptPath = path.join(__dirname, '..', 'system_prompt_cashflows.txt');
    const systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8');

    const userMessage = `Datos del bono:
- Ticker: ${bond.ticker}
- Issue Date: ${bond.issue_date ? new Date(bond.issue_date).toISOString().split('T')[0] : 'No definido'}
- Maturity: ${bond.maturity ? new Date(bond.maturity).toISOString().split('T')[0] : 'No definido'}
- Coupon: ${bond.coupon || 'No definido'}
- Index: ${bond.index_code || 'No definido'}
${existingInfo}

Documentos PDF:
${filteredPdfTexts.map(p => `--- ${p.filename} ---\n${p.text}`).join('\n\n')}

Devolvé un JSON con clave "cashflows" conteniendo el array de pagos.`;

    console.log(`[AI-Extract] userMessage total: ${userMessage.length} chars (~${Math.ceil(userMessage.length / 4)} tokens estimados)`);

    // Debug mode: return the context without calling OpenAI
    if (req.query.debug === 'true') {
      return res.json({
        debug: true,
        bond: {
          ticker: bond.ticker,
          issue_date: bond.issue_date,
          maturity: bond.maturity,
          coupon: bond.coupon,
          index_code: bond.index_code
        },
        pdfFiles: pdfTexts.map(p => ({ filename: p.filename, rawChars: p.text.length })),
        ragChunks: filteredPdfTexts.map(p => ({
          filename: p.filename,
          filteredChars: p.text.length,
          text: p.text
        })),
        existingCashflows: existingCfs.rows,
        userMessageChars: userMessage.length,
        estimatedTokens: Math.ceil(userMessage.length / 4),
        systemPromptChars: systemPrompt.length,
        userMessage
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.0,
      max_tokens: 16000,
      response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0].message.content;
    console.log(`[AI-Extract] Respuesta OpenAI (${raw.length} chars):\n${raw.substring(0, 1000)}`);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'La respuesta de la IA no es JSON válido', raw });
    }

    if (parsed.error) {
      console.log(`[AI-Extract] IA devolvió error: ${parsed.error}`);
      return res.status(422).json({ error: parsed.error });
    }

    let cashflowArray = Array.isArray(parsed) ? parsed : (parsed.cashflows || parsed.data || []);
    if (!Array.isArray(cashflowArray) || cashflowArray.length === 0) {
      return res.status(422).json({ error: 'La IA no devolvió cashflows válidos', raw: parsed });
    }

    // Sanitize & Validate
    const errors = [];
    const existingDates = new Set(existingCfs.rows.map(r => new Date(r.date).toISOString().split('T')[0]));
    let totalAmort = 0;

    const sanitized = [];
    for (let i = 0; i < cashflowArray.length; i++) {
      const cf = cashflowArray[i];
      const rowNum = i + 1;

      const dateStr = typeof cf.date === 'string' ? cf.date.trim() : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(new Date(dateStr).getTime())) {
        errors.push(`Fila ${rowNum}: fecha inválida "${cf.date}"`);
        continue;
      }
      if (existingDates.has(dateStr)) {
        errors.push(`Fila ${rowNum}: fecha ${dateStr} ya existe en cashflows cargados (omitida)`);
        continue;
      }

      let rate = parseFloat(cf.rate);
      if (isNaN(rate) || rate < 0 || rate > 1) {
        errors.push(`Fila ${rowNum}: rate inválido "${cf.rate}", usando 0`);
        rate = 0;
      }

      let amort = parseFloat(cf.amort);
      if (isNaN(amort) || amort < 0) {
        errors.push(`Fila ${rowNum}: amort inválido "${cf.amort}", usando 0`);
        amort = 0;
      }

      let amount = parseFloat(cf.amount);
      if (isNaN(amount)) amount = 0;

      totalAmort += amort;
      sanitized.push({ date: dateStr, rate, amort, amount });
    }

    sanitized.sort((a, b) => a.date.localeCompare(b.date));

    if (existingCfs.rows.length > 0 && sanitized.length > 0) {
      const lastExisting = new Date(existingCfs.rows[existingCfs.rows.length - 1].date).toISOString().split('T')[0];
      sanitized.forEach((cf, i) => {
        if (cf.date <= lastExisting) {
          errors.push(`Fila ${i + 1}: fecha ${cf.date} es anterior o igual al último cashflow existente (${lastExisting})`);
        }
      });
    }

    const warnings = [];
    const existingAmort = existingCfs.rows.reduce((sum, r) => sum + parseFloat(r.amort || 0), 0);
    if (Math.abs(totalAmort + existingAmort - 100) > 0.1) {
      warnings.push(`Amort total (existente ${existingAmort.toFixed(2)} + nuevo ${totalAmort.toFixed(2)} = ${(existingAmort + totalAmort).toFixed(2)}) no suma 100.`);
    }

    res.json({
      cashflows: sanitized,
      validation: {
        errors,
        warnings,
        totalNewAmort: totalAmort,
        totalExistingAmort: existingAmort,
        pdfFilesUsed: pdfTexts.map(p => p.filename)
      }
    });
  } catch (err) {
    console.error('AI extraction error:', err);
    sendError(res, err, err.message || 'Error en la extracción con IA', 500);
  }
});

module.exports = router;
