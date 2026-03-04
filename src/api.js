const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

export function isAuthenticated() {
  return !!getToken();
}

async function request(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...opts,
  });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Login failed');
  }
  const data = await res.json();
  setToken(data.token);
  return data;
}

export const getBonds = () => request('/bonds');
export const createBond = (b) => request('/bonds', { method: 'POST', body: JSON.stringify(b) });
export const updateBond = (id, b) => request(`/bonds/${id}`, { method: 'PUT', body: JSON.stringify(b) });

export const getCashflows = (bondId) => request(`/bonds/${bondId}/cashflows`);
export const createCashflow = (bondId, cf) => request(`/bonds/${bondId}/cashflows`, { method: 'POST', body: JSON.stringify(cf) });
export const updateCashflow = (bondId, cfId, cf) => request(`/bonds/${bondId}/cashflows/${cfId}`, { method: 'PUT', body: JSON.stringify(cf) });
export const deleteCashflow = (bondId, cfId) => request(`/bonds/${bondId}/cashflows/${cfId}`, { method: 'DELETE' });

export const getIndexes = () => request('/indexes');
export const getDayCountConventions = () => request('/day-count-conventions');

export const uploadCashflowsJson = (bondId, arr) =>
  request(`/bonds/${bondId}/cashflows/bulk-json`, { method: 'POST', body: JSON.stringify(arr) });
