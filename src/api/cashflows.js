import { request } from './client.js';

export const getCashflows = (bondId) =>
  request(`/bonds/${bondId}/cashflows`);

export const createCashflow = (bondId, cf) =>
  request(`/bonds/${bondId}/cashflows`, { method: 'POST', body: JSON.stringify(cf) });

export const updateCashflow = (bondId, cfId, cf) =>
  request(`/bonds/${bondId}/cashflows/${cfId}`, { method: 'PUT', body: JSON.stringify(cf) });

export const deleteCashflow = (bondId, cfId) =>
  request(`/bonds/${bondId}/cashflows/${cfId}`, { method: 'DELETE' });

export const uploadCashflowsJson = (bondId, arr) =>
  request(`/bonds/${bondId}/cashflows/bulk-json`, { method: 'POST', body: JSON.stringify(arr) });
