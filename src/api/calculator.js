const CALC_BASE = 'http://localhost:8080';

export async function calcYield({ ticker, settlementDate, price, initialFee, endingFee, extendIndex }) {
  const params = new URLSearchParams({ ticker, settlementDate, price });
  if (initialFee != null && initialFee !== '') params.set('initialFee', initialFee);
  if (endingFee != null && endingFee !== '') params.set('endingFee', endingFee);
  if (extendIndex != null && extendIndex !== '') params.set('extendIndex', extendIndex);
  const res = await fetch(`${CALC_BASE}/yield?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function calcPrice({ ticker, settlementDate, rate, initialFee, endingFee, extendIndex }) {
  const params = new URLSearchParams({ ticker, settlementDate, rate });
  if (initialFee != null && initialFee !== '') params.set('initialFee', initialFee);
  if (endingFee != null && endingFee !== '') params.set('endingFee', endingFee);
  if (extendIndex != null && extendIndex !== '') params.set('extendIndex', extendIndex);
  const res = await fetch(`${CALC_BASE}/price?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}
