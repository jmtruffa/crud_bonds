import { request } from './client.js';

export const extractCashflowsAI = (bondId) =>
  request(`/bonds/${bondId}/extract-cashflows`, { method: 'POST' });

export const debugExtractAI = (bondId) =>
  request(`/bonds/${bondId}/extract-cashflows?debug=true`, { method: 'POST' });
