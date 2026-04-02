import { useEffect, useState } from 'react';
import { getLecaps } from '../api';
import LecapCalcModal from './LecapCalcModal';

const initialForm = {
  ticker: '',
  date_liq: '',
  date_vto: '',
  tasa: '',
  vf: '',
};

export default function LecapsCreateForm({ onCreate }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [lecaps, setLecaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTicker, setSearchTicker] = useState('');
  const [calcLecap, setCalcLecap] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  async function loadLecaps() {
    setLoading(true);
    try {
      const rows = await getLecaps();
      setLecaps(rows || []);
    } catch (err) {
      alert('No se pudo cargar el listado de LECAPS: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLecaps();
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const filteredLecaps = lecaps.filter((row) => {
    if (!searchTicker.trim()) return true;
    return (row.ticker || '').toLowerCase().includes(searchTicker.trim().toLowerCase());
  });

  const totalPages = Math.ceil(filteredLecaps.length / ITEMS_PER_PAGE);
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedLecaps = filteredLecaps.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [searchTicker]);

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      ticker: form.ticker.trim().toUpperCase(),
      date_liq: form.date_liq,
      date_vto: form.date_vto,
      tasa: Number(form.tasa) / 100,
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
      setShowForm(false);
      await loadLecaps();
    } catch (err) {
      alert('No se pudo crear la LECAP: ' + err.message);
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
            placeholder="Buscar LECAP por ticker..."
            value={searchTicker}
            onChange={(e) => setSearchTicker(e.target.value)}
            className="search-input"
          />
          <span className="search-count">
            {filteredLecaps.length} lecap{filteredLecaps.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="toolbar-right">
          <button
            className="btn btn-success"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancelar' : '+ Nueva LECAP'}
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
              Tasa (%)
              <input
                type="number"
                step="any"
                value={form.tasa}
                onChange={(e) => updateField('tasa', e.target.value)}
                className="search-input"
                required
              />
            </label>
            <label className="lecaps-field">
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
          </div>
          <div className="lecaps-actions">
            <button type="submit" className="btn btn-success" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar LECAP'}
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
              <th>Tasa (%)</th>
              <th>Valor final</th>
              <th style={{ width: '60px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="no-results">Cargando LECAPS...</td>
              </tr>
            ) : filteredLecaps.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-results">No hay LECAPS para ese filtro</td>
              </tr>
            ) : (
              paginatedLecaps.map((row, idx) => (
                <tr key={`${row.ticker}-${row.date_vto}-${idx}`}>
                  <td><strong>{row.ticker}</strong></td>
                  <td>{fmtDate(row.date_liq)}</td>
                  <td>{fmtDate(row.date_vto)}</td>
                  <td>{(Number(row.tasa) * 100).toFixed(2)}%</td>
                  <td>{row.vf}</td>
                  <td>
                    <button className="btn btn-sm btn-calc" onClick={() => setCalcLecap(row)}>Calc</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-secondary" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
          <span className="page-info">Página <span className="page-number">{currentPage}</span> de {totalPages}</span>
          <button className="btn btn-secondary" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
        </div>
      )}

      {calcLecap && (
        <LecapCalcModal lecap={calcLecap} onClose={() => setCalcLecap(null)} />
      )}
    </div>
  );
}
