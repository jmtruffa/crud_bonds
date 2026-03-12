/**
 * Embedding-based RAG (Retrieval-Augmented Generation) for PDF cashflow extraction.
 * Chunks text, embeds via OpenAI, and returns the most relevant passages.
 */

/**
 * Split text into overlapping chunks by sentence boundaries.
 * Chunk size adapts to document length to keep total chunks manageable.
 */
function chunkText(text, maxChunks = 200) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  const targetChunks = Math.min(maxChunks, Math.max(20, Math.ceil(cleaned.length / 2000)));
  const chunkSize = Math.max(400, Math.ceil(cleaned.length / targetChunks));
  const overlap = Math.ceil(chunkSize * 0.15);

  const sentences = cleaned.split(/(?<=[\.\!\?\n])\s+/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(overlap / 5));
      current = overlapWords.join(' ') + ' ' + sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > 30);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Embed texts in batches to avoid API timeouts on large inputs.
 */
async function batchEmbed(openaiClient, texts, batchSize = 100) {
  const allEmbeddings = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`[RAG] Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} (${batch.length} texts)...`);
    const res = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch
    });
    for (const item of res.data) {
      allEmbeddings.push(item.embedding);
    }
  }
  return allEmbeddings;
}

/**
 * Use embeddings to find the most relevant chunks for cashflow extraction.
 */
async function getRelevantChunks(openaiClient, fullText, maxChars = 15000) {
  if (fullText.length <= maxChars) return fullText;

  const chunks = chunkText(fullText, 200);
  if (chunks.length === 0) return fullText;

  console.log(`[RAG] ${chunks.length} chunks (adaptive size ~${Math.ceil(fullText.length / chunks.length)} chars/chunk) from ${fullText.length} chars`);

  const query = 'calendario de pagos cashflows tabla cronograma fechas de pago amortización cupón intereses vencimiento payment schedule coupon amortization maturity interest dates';

  const allTexts = [query, ...chunks];
  const embeddings = await batchEmbed(openaiClient, allTexts, 100);
  const queryEmbedding = embeddings[0];

  const scored = chunks.map((chunk, i) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, embeddings[i + 1]),
    idx: i
  }));

  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  let charCount = 0;
  for (const item of scored) {
    if (charCount + item.chunk.length > maxChars) {
      if (item.score > 0.4 && charCount + item.chunk.length <= maxChars + 2000) {
        selected.push(item);
        charCount += item.chunk.length;
      }
      continue;
    }
    selected.push(item);
    charCount += item.chunk.length;
  }

  selected.sort((a, b) => a.idx - b.idx);

  const result = selected.map(s => s.chunk).join('\n\n');
  console.log(`[RAG] Selected ${selected.length}/${chunks.length} chunks (${result.length} chars). Top: ${scored[0]?.score.toFixed(3)}, cutoff: ${selected[selected.length - 1]?.score.toFixed(3)}`);
  return result;
}

module.exports = { chunkText, cosineSimilarity, batchEmbed, getRelevantChunks };
