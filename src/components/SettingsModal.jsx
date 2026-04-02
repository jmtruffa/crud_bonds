import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function SettingsModal({ onClose }) {
  const [offsetHours, setOffsetHours] = useState(-3);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/marketdata/timezone`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setOffsetHours(data.offsetHours); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/marketdata/timezone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offsetHours }),
      });
      if (res.ok) onClose();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  function formatLabel(offset) {
    const sign = offset >= 0 ? '+' : '';
    return `UTC${sign}${offset}`;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>X</button>
        </div>
        <div className="modal-body">
          <div className="settings-row">
            <label className="settings-label">Timezone</label>
            <div className="settings-control">
              <select
                className="cell-select"
                value={offsetHours}
                onChange={e => setOffsetHours(Number(e.target.value))}
              >
                {Array.from({ length: 27 }, (_, i) => i - 12).map(v => (
                  <option key={v} value={v}>{formatLabel(v)}</option>
                ))}
              </select>
              <span className="settings-hint">Usado para determinar los contratos de futuros a suscribir</span>
            </div>
          </div>
        </div>
        <div className="modal-body" style={{ paddingTop: 0 }}>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-success" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
