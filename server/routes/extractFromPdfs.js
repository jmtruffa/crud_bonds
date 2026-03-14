const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { openai } = require('../config/openai');
const { sendError } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/', upload.array('pdfs', 10), async (req, res) => {
  if (!openai) {
    return res.status(503).json({ error: 'OpenAI no configurado. Agregar OPENAI_API_KEY en .env del servidor.' });
  }

  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron archivos PDF.' });
  }

  try {
    const pdfTexts = [];
    for (const file of files) {
      const parsed = await pdfParse(file.buffer);
      const filename = file.originalname;
      console.log(`[ExtractFromPdfs] PDF "${filename}": ${parsed.text.length} chars extraidos`);
      pdfTexts.push({ filename, text: parsed.text });
    }

    const concatenatedText = pdfTexts
      .map(p => `--- ${p.filename} ---\n${p.text}`)
      .join('\n\n');

    console.log(`[ExtractFromPdfs] Total texto: ${concatenatedText.length} chars (~${Math.ceil(concatenatedText.length / 4)} tokens estimados)`);

    const systemPromptPath = path.join(__dirname, '..', 'system_prompt_cashflows.txt');
    const systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8');

    // Debug mode: return the AI input without calling OpenAI
    if (req.query.debug === 'true') {
      return res.json({
        debug: true,
        pdfFiles: pdfTexts.map(p => ({ filename: p.filename, chars: p.text.length })),
        totalChars: concatenatedText.length,
        estimatedTokens: Math.ceil(concatenatedText.length / 4),
        systemPrompt,
        userMessage: concatenatedText,
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: concatenatedText },
      ],
      temperature: 0,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message.content;
    console.log(`[ExtractFromPdfs] Respuesta OpenAI (${raw.length} chars):\n${raw.substring(0, 1000)}`);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'La respuesta de la IA no es JSON válido', raw });
    }

    if (parsed.error) {
      return res.status(422).json({ error: parsed.error });
    }

    // Extract principal (issue_date, maturity_date) — handle both nested and flat formats
    const principalRaw = parsed.principal || {};
    const principal = {
      issue_date: principalRaw.issue_date || parsed.issue_date || null,
      maturity_date: principalRaw.maturity_date || parsed.maturity_date || null,
    };

    // Validate principal dates
    if (principal.issue_date && !/^\d{4}-\d{2}-\d{2}$/.test(principal.issue_date)) {
      principal.issue_date = null;
    }
    if (principal.maturity_date && !/^\d{4}-\d{2}-\d{2}$/.test(principal.maturity_date)) {
      principal.maturity_date = null;
    }

    let cashflowArray = Array.isArray(parsed) ? parsed : (parsed.cashflows || parsed.data || []);
    if (!Array.isArray(cashflowArray) || cashflowArray.length === 0) {
      return res.status(422).json({ error: 'La IA no devolvió cashflows válidos', raw: parsed });
    }

    // Sanitize & validate
    const errors = [];
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

    // Auto-normalize amort: if AI returned values in 0-1 decimal range instead of 0-100
    if (sanitized.length > 0 && totalAmort > 0 && totalAmort <= 1.01) {
      console.log(`[ExtractFromPdfs] Amort total ${totalAmort} parece estar en rango 0-1, normalizando ×100`);
      sanitized.forEach(cf => { cf.amort = +(cf.amort * 100).toFixed(4); });
      totalAmort = +(totalAmort * 100).toFixed(4);
    }

    sanitized.sort((a, b) => a.date.localeCompare(b.date));

    const warnings = [];
    if (Math.abs(totalAmort - 100) > 0.1) {
      warnings.push(`Amort total (${totalAmort.toFixed(2)}) no suma 100.`);
    }

    res.json({
      principal,
      cashflows: sanitized,
      validation: { errors, warnings, totalAmort },
    });
  } catch (err) {
    console.error('[ExtractFromPdfs] Error:', err);
    sendError(res, err, err.message || 'Error en la extracción con IA', 500);
  }
});

module.exports = router;
