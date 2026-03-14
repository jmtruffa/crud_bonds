import { request, getToken, setToken, API_BASE } from './client.js';

export const extractCashflowsAI = (bondId) =>
  request(`/bonds/${bondId}/extract-cashflows`, { method: 'POST' });

export const debugExtractAI = (bondId) =>
  request(`/bonds/${bondId}/extract-cashflows?debug=true`, { method: 'POST' });

export async function extractFromPdfsDebug(files) {
  const token = getToken();
  const formData = new FormData();
  files.forEach(f => formData.append('pdfs', f));
  const res = await fetch(`${API_BASE}/extract-from-pdfs?debug=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json();
}

export async function extractFromPdfs(files) {
  const token = getToken();
  const formData = new FormData();
  files.forEach(f => formData.append('pdfs', f));
  const res = await fetch(`${API_BASE}/extract-from-pdfs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json();
}
