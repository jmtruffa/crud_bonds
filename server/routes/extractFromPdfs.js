const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { openai } = require('../config/openai');
const { sendError } = require('../middleware/auth');

const router = express.Router();

// ~75k tokens for user message — safely under gpt-4o-mini's 128k limit
// (leaves room for system prompt ~400 tokens + response 16k tokens)
const MAX_USER_CHARS = 300_000;

const CF_KEYWORDS = [
  'fecha', 'pago', 'amortiz', 'tasa', 'cuota', 'capital',
  'interés', 'interes', 'vencimiento', 'período', 'periodo',
  'residual', 'cronograma', 'flujo', 'cashflow', 'schedule',
  'payment', 'maturity', 'coupon', 'rate', 'amort', 'interest',
];

function scoreChunk(text) {
  const lower = text.toLowerCase();
  let score = CF_KEYWORDS.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
  // Bonus for date patterns (YYYY-MM-DD or DD/MM/YYYY)
  score += Math.min((text.match(/\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}/g) || []).length * 2, 10);
  // Bonus for decimal numbers (financial data)
  score += Math.min((text.match(/\d+[.,]\d+/g) || []).length, 5);
  return score;
}

function selectRelevantText(text, budget) {
  if (text.length <= budget) return text;

  const CHUNK = 800;
  const STEP = 700; // 100-char overlap
  const chunks = [];
  for (let i = 0; i < text.length; i += STEP) {
    chunks.push({ start: i, text: text.slice(i, i + CHUNK) });
  }
  chunks.forEach(c => { c.score = scoreChunk(c.text); });

  // Pick highest-scoring chunks until budget is full
  const byScore = [...chunks].sort((a, b) => b.score - a.score);
  const kept = new Set();
  let used = 0;
  for (const c of byScore) {
    if (used + c.text.length > budget) break;
    kept.add(c.start);
    used += c.text.length;
  }

  // Reassemble in document order, insert […] where sections were dropped
  const result = [];
  let prevEnd = -1;
  for (const c of chunks) {
    if (!kept.has(c.start)) continue;
    if (prevEnd !== -1 && c.start > prevEnd) result.push('\n[…]\n');
    result.push(c.text);
    prevEnd = c.start + c.text.length;
  }
  return result.join('');
}

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

    const rawTotal = pdfTexts.reduce((s, p) => s + p.text.length, 0);

    // Per-file budget: distribute MAX_USER_CHARS proportionally by file size
    const processedTexts = pdfTexts.map(p => {
      const fileBudget = Math.floor((p.text.length / rawTotal) * MAX_USER_CHARS);
      const filtered = selectRelevantText(p.text, fileBudget);
      if (filtered.length < p.text.length) {
        console.log(`[ExtractFromPdfs] "${p.filename}": ${p.text.length} -> ${filtered.length} chars (keyword filter)`);
      }
      return { filename: p.filename, text: filtered, originalChars: p.text.length };
    });

    const concatenatedText = processedTexts
      .map(p => `--- ${p.filename} ---\n${p.text}`)
      .join('\n\n');

    console.log(`[ExtractFromPdfs] Total texto: ${rawTotal} raw -> ${concatenatedText.length} chars (~${Math.ceil(concatenatedText.length / 4)} tokens estimados)`);

    const systemPromptPath = path.join(__dirname, '..', 'system_prompt_cashflows.txt');
    const systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8');

    // Debug mode: return the AI input without calling OpenAI
    if (req.query.debug === 'true') {
      return res.json({
        debug: true,
        pdfFiles: processedTexts.map(p => ({
          filename: p.filename,
          originalChars: p.originalChars,
          filteredChars: p.text.length,
          reduced: p.text.length < p.originalChars,
        })),
        totalChars: concatenatedText.length,
        estimatedTokens: Math.ceil(concatenatedText.length / 4),
        systemPrompt,
        userMessage: concatenatedText,
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: concatenatedText },
      ],
      max_completion_tokens: 16000,
      seed: 42,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'cashflow_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              principal: {
                type: 'object',
                properties: {
                  issue_date:    { type: ['string', 'null'] },
                  maturity_date: { type: ['string', 'null'] },
                },
                required: ['issue_date', 'maturity_date'],
                additionalProperties: false,
              },
              cashflows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date:   { type: 'string' },
                    rate:   { type: 'number' },
                    amort:  { type: 'number' },
                    amount: { type: 'number' },
                  },
                  required: ['date', 'rate', 'amort', 'amount'],
                  additionalProperties: false,
                },
              },
              error: { type: ['string', 'null'] },
            },
            required: ['principal', 'cashflows', 'error'],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices[0].message.content;
    console.log(`[ExtractFromPdfs] system_fingerprint: ${completion.system_fingerprint}`);
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
