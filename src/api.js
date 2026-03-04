const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

async function request(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

export const getBonds = () => request('/bonds');
export const createBond = (b) => request('/bonds', { method: 'POST', body: JSON.stringify(b) });
export const updateBond = (id, b) => request(`/bonds/${id}`, { method: 'PUT', body: JSON.stringify(b) });
export const deleteBond = (id) => request(`/bonds/${id}`, { method: 'DELETE' });

export const getCashflows = (bondId) => request(`/bonds/${bondId}/cashflows`);
export const createCashflow = (bondId, cf) => request(`/bonds/${bondId}/cashflows`, { method: 'POST', body: JSON.stringify(cf) });
export const updateCashflow = (bondId, cfId, cf) => request(`/bonds/${bondId}/cashflows/${cfId}`, { method: 'PUT', body: JSON.stringify(cf) });
export const deleteCashflow = (bondId, cfId) => request(`/bonds/${bondId}/cashflows/${cfId}`, { method: 'DELETE' });

export const getIndexes = () => request('/indexes');
export const getDayCountConventions = () => request('/day-count-conventions');

export async function uploadCashflowsJson(bondId, arr) {
  const res = await fetch(`${API_BASE}/bonds/${bondId}/cashflows/bulk-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arr)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}
