import { request } from './client.js';

export const getBonds = () => request('/bonds');

export const createBond = (b) =>
  request('/bonds', { method: 'POST', body: JSON.stringify(b) });

export const updateBond = (id, b) =>
  request(`/bonds/${id}`, { method: 'PUT', body: JSON.stringify(b) });

export const createBondWithCashflows = (bond, cashflows) =>
  request('/bonds/with-cashflows', { method: 'POST', body: JSON.stringify({ bond, cashflows }) });

export const createLecap = (lecap) =>
  request('/bonds/lecaps', { method: 'POST', body: JSON.stringify(lecap) });
