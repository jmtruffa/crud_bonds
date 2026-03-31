import { request } from './client.js';

export async function getTamarRates() {
  return request('/bcra/tamar', { method: 'GET' });
}
