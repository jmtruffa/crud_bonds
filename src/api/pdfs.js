import { request, getToken, setToken, API_BASE } from './client.js';

export async function uploadBondPdfs(ticker, files) {
  const token = getToken();
  const formData = new FormData();
  for (const f of files) {
    formData.append('pdfs', f);
  }
  const res = await fetch(`${API_BASE}/bonds/${ticker}/pdfs`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
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
  return res.json();
}

export const listBondPdfs = (ticker) => request(`/bonds/${ticker}/pdfs`);
