import { request } from './client.js';

export async function calcYield({ ticker, settlementDate, price, initialFee, endingFee, extendIndex }) {
  const params = new URLSearchParams({ ticker, settlementDate, price });
  if (initialFee != null && initialFee !== '') params.set('initialFee', initialFee);
  if (endingFee != null && endingFee !== '') params.set('endingFee', endingFee);
  if (extendIndex != null && extendIndex !== '') params.set('extendIndex', extendIndex);
  return request(`/calc/yield?${params}`, { method: 'GET' });
}

export async function calcPrice({ ticker, settlementDate, rate, initialFee, endingFee, extendIndex }) {
  const params = new URLSearchParams({ ticker, settlementDate, rate });
  if (initialFee != null && initialFee !== '') params.set('initialFee', initialFee);
  if (endingFee != null && endingFee !== '') params.set('endingFee', endingFee);
  if (extendIndex != null && extendIndex !== '') params.set('extendIndex', extendIndex);
  return request(`/calc/price?${params}`, { method: 'GET' });
}
