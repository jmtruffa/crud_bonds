import { useState } from 'react';

const initialForm = {
  ticker: '',
  date_liq: '',
  date_vto: '',
  tasa: '',
  vf: '',
};

export default function LecapsCreateForm({ onCreate }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      ticker: form.ticker.trim().toUpperCase(),
      date_liq: form.date_liq,
      date_vto: form.date_vto,
      tasa: Number(form.tasa),
      vf: Number(form.vf),
    };

    if (!payload.ticker || !payload.date_liq || !payload.date_vto) {
      alert('Completa ticker, date_liq y date_vto');
      return;
    }
    if (payload.date_vto <= payload.date_liq) {
      alert('date_vto debe ser posterior a date_liq');
      return;
    }
    if (Number.isNaN(payload.tasa) || Number.isNaN(payload.vf)) {
      alert('tasa y vf deben ser numericos');
      return;
    }

    try {
      setSaving(true);
      await onCreate(payload);
      alert(`LECAP ${payload.ticker} creada correctamente`);
      setForm(initialForm);
    } catch (err) {
      alert('No se pudo crear la LECAP: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bond-list-container">
      <div className="table-toolbar">
        <h2 style={{ margin: 0 }}>Alta de LECAPS</h2>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px', maxWidth: '560px' }}>
        <label>
          Ticker
          <input
            type="text"
            value={form.ticker}
            onChange={(e) => updateField('ticker', e.target.value.toUpperCase())}
            className="search-input"
            required
          />
        </label>
        <label>
          Fecha liquidacion (date_liq)
          <input
            type="date"
            value={form.date_liq}
            onChange={(e) => updateField('date_liq', e.target.value)}
            className="search-input"
            required
          />
        </label>
        <label>
          Fecha vencimiento (date_vto)
          <input
            type="date"
            value={form.date_vto}
            onChange={(e) => updateField('date_vto', e.target.value)}
            className="search-input"
            required
          />
        </label>
        <label>
          Tasa
          <input
            type="number"
            step="any"
            value={form.tasa}
            onChange={(e) => updateField('tasa', e.target.value)}
            className="search-input"
            required
          />
        </label>
        <label>
          Valor final (vf)
          <input
            type="number"
            step="any"
            value={form.vf}
            onChange={(e) => updateField('vf', e.target.value)}
            className="search-input"
            required
          />
        </label>
        <div>
          <button type="submit" className="btn btn-success" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar LECAP'}
          </button>
        </div>
      </form>
    </div>
  );
}
