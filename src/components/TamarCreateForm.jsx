import { useEffect, useState } from 'react';
import { getTamars } from '../api';
import TamarCalcModal from './TamarCalcModal';

const initialForm = {
  ticker: '',
  date_liq: '',
  date_vto: '',
  tasa: '',
};

export default function TamarCreateForm({ onCreate }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [tamars, setTamars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTicker, setSearchTicker] = useState('');
  const [calcTamar, setCalcTamar] = useState(null);

  async function loadTamars() {
    setLoading(true);
    try {
      const rows = await getTamars();
      setTamars(rows || []);
    } catch (err) {
      alert('No se pudo cargar el listado de TAMAR: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTamars();
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const filteredTamars = tamars.filter((row) => {
    if (!searchTicker.trim()) return true;
    return (row.ticker || '').toLowerCase().includes(searchTicker.trim().toLowerCase());
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      ticker: form.ticker.trim().toUpperCase(),
      date_liq: form.date_liq,
      date_vto: form.date_vto,
      tasa: Number(form.tasa),
    };

    if (!payload.ticker || !payload.date_liq || !payload.date_vto) {
      alert('Completa ticker, date_liq y date_vto');
      return;
    }
    if (payload.date_vto <= payload.date_liq) {
      alert('date_vto debe ser posterior a date_liq');
      return;
    }
    if (Number.isNaN(payload.tasa)) {
      alert('tasa debe ser numerica');
      return;
    }

    try {
      setSaving(true);
      await onCreate(payload);
      alert(`TAMAR ${payload.ticker} creada correctamente`);
      setForm(initialForm);
      setShowForm(false);
      await loadTamars();
    } catch (err) {
      alert('No se pudo crear la TAMAR: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (d) => (typeof d === 'string' ? d.split('T')[0] : d) || '';

  return (
    <div className="bond-list-container">
      <div className="table-toolbar">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar TAMAR por ticker..."
            value={searchTicker}
            onChange={(e) => setSearchTicker(e.target.value)}
            className="search-input"
          />
          <span className="search-count">
            {filteredTamars.length} tamar{filteredTamars.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="toolbar-right">
          <button
            className="btn btn-success"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancelar' : '+ Nueva TAMAR'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="lecaps-form">
          <div className="lecaps-form-row">
            <label className="lecaps-field">
              Ticker
              <input
                type="text"
                value={form.ticker}
                onChange={(e) => updateField('ticker', e.target.value.toUpperCase())}
                className="search-input"
                autoFocus
                required
              />
            </label>
            <label className="lecaps-field">
              Fecha liquidacion (date_liq)
              <input
                type="date"
                value={form.date_liq}
                onChange={(e) => updateField('date_liq', e.target.value)}
                className="search-input"
                required
              />
            </label>
            <label className="lecaps-field">
              Fecha vencimiento (date_vto)
              <input
                type="date"
                value={form.date_vto}
                onChange={(e) => updateField('date_vto', e.target.value)}
                className="search-input"
                required
              />
            </label>
          </div>
          <div className="lecaps-form-row lecap-row-second">
            <label className="lecaps-field">
              Tasa (spread)
              <input
                type="number"
                step="any"
                value={form.tasa}
                onChange={(e) => updateField('tasa', e.target.value)}
                className="search-input"
                required
              />
            </label>
          </div>
          <div className="lecaps-actions">
            <button type="submit" className="btn btn-success" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar TAMAR'}
            </button>
          </div>
        </form>
      )}

      <div className="table-scroll-wrapper">
        <table className="table bond-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Fecha liqui.</th>
              <th>Fecha vto.</th>
              <th>Tasa</th>
              <th style={{ width: '60px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="no-results">Cargando TAMAR...</td>
              </tr>
            ) : filteredTamars.length === 0 ? (
              <tr>
                <td colSpan={5} className="no-results">No hay TAMAR para ese filtro</td>
              </tr>
            ) : (
              filteredTamars.map((row, idx) => (
                <tr key={`${row.ticker}-${row.date_vto}-${idx}`}>
                  <td><strong>{row.ticker}</strong></td>
                  <td>{fmtDate(row.date_liq)}</td>
                  <td>{fmtDate(row.date_vto)}</td>
                  <td>{row.tasa}</td>
                  <td>
                    <button className="btn btn-sm btn-calc" onClick={() => setCalcTamar(row)}>Calc</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {calcTamar && (
        <TamarCalcModal tamar={calcTamar} onClose={() => setCalcTamar(null)} />
      )}
    </div>
  );
}
