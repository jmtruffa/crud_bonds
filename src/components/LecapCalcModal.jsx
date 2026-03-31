import { useState, useCallback } from 'react';

function getDefaultSettlement() {
  const now = new Date();
  let d = new Date(now);
  d.setDate(d.getDate() + 1);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1);
  else if (day === 6) d.setDate(d.getDate() + 2);
  return d.toISOString().split('T')[0];
}

function daysBetween(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function calcFromPrice(lecap, settlementDate, precio) {
  const date_liq = lecap.date_liq.split('T')[0];
  const date_vto = lecap.date_vto.split('T')[0];
  const vf = Number(lecap.vf);

  const dias = daysBetween(date_liq, date_vto);
  const diasSettle = daysBetween(settlementDate, date_vto);
  const tasa_directa = vf / precio - 1;
  const tea = Math.pow(1 + tasa_directa, 365 / dias) - 1;
  const modified_duration = dias / (1 + tea);
  const tem = Math.pow(1 + tasa_directa, 30 / diasSettle) - 1;

  return {
    Precio: precio,
    VF: vf,
    'Días (liq→vto)': dias,
    'Días (settle→vto)': diasSettle,
    'Tasa Directa': tasa_directa,
    TEA: tea,
    TEM: tem,
    'Modified Duration': modified_duration,
  };
}

function calcFromTEM(lecap, settlementDate, tem) {
  const date_liq = lecap.date_liq.split('T')[0];
  const date_vto = lecap.date_vto.split('T')[0];
  const vf = Number(lecap.vf);

  const dias = daysBetween(date_liq, date_vto);
  const diasSettle = daysBetween(settlementDate, date_vto);
  const precio = vf / Math.pow(1 + tem, diasSettle / 30);
  const tasa_directa = vf / precio - 1;
  const tea = Math.pow(1 + tasa_directa, 365 / dias) - 1;
  const modified_duration = dias / (1 + tea);

  return {
    Precio: precio,
    VF: vf,
    'Días (liq→vto)': dias,
    'Días (settle→vto)': diasSettle,
    'Tasa Directa': tasa_directa,
    TEA: tea,
    TEM: tem,
    'Modified Duration': modified_duration,
  };
}

function formatValue(key, val) {
  if (val == null || val === '') return '—';
  if (typeof val === 'number') {
    if (['Días (liq→vto)', 'Días (settle→vto)'].includes(key)) return val.toFixed(0);
    if (['Precio', 'VF', 'Modified Duration'].includes(key)) return val.toFixed(4);
    return (val * 100).toFixed(4) + '%';
  }
  return String(val);
}

export default function LecapCalcModal({ lecap, onClose }) {
  const [mode, setMode] = useState('tem'); // 'tem' = given price → calc TEM, 'price' = given TEM → calc price
  const [settlementDate, setSettlementDate] = useState(getDefaultSettlement);
  const [precio, setPrecio] = useState('');
  const [tem, setTem] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCalc = useCallback(() => {
    setError(null);
    setResult(null);
    try {
      if (mode === 'tem') {
        if (!precio) { setError('Precio es requerido'); return; }
        setResult(calcFromPrice(lecap, settlementDate, Number(precio)));
      } else {
        if (!tem) { setError('TEM es requerida'); return; }
        setResult(calcFromTEM(lecap, settlementDate, Number(tem)));
      }
    } catch (e) {
      setError(e.message);
    }
  }, [mode, lecap, settlementDate, precio, tem]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCalc();
  };

  const fmtDate = (d) => (typeof d === 'string' ? d.split('T')[0] : d) || '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel calc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>CALC &gt; {lecap.ticker}</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>ESC</button>
        </div>

        <div className="modal-body">
          {/* Info de la LECAP */}
          <div className="calc-inputs" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="calc-field">
              <label>TICKER</label>
              <input type="text" value={lecap.ticker} readOnly className="cell-input" />
            </div>
            <div className="calc-field">
              <label>FECHA LIQ</label>
              <input type="text" value={fmtDate(lecap.date_liq)} readOnly className="cell-input" />
            </div>
            <div className="calc-field">
              <label>FECHA VTO</label>
              <input type="text" value={fmtDate(lecap.date_vto)} readOnly className="cell-input" />
            </div>
            <div className="calc-field">
              <label>VF</label>
              <input type="text" value={lecap.vf} readOnly className="cell-input" />
            </div>
          </div>

          {/* Mode toggle */}
          <div className="calc-mode-toggle">
            <button
              className={`calc-mode-btn ${mode === 'tem' ? 'active' : ''}`}
              onClick={() => { setMode('tem'); setResult(null); setError(null); }}
            >
              PRECIO → TEM
            </button>
            <button
              className={`calc-mode-btn ${mode === 'price' ? 'active' : ''}`}
              onClick={() => { setMode('price'); setResult(null); setError(null); }}
            >
              TEM → PRECIO
            </button>
          </div>

          {/* Inputs */}
          <div className="calc-inputs" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="calc-field">
              <label>SETTLE DATE</label>
              <input
                type="date"
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="cell-input"
              />
            </div>
            {mode === 'tem' ? (
              <div className="calc-field">
                <label>PRECIO</label>
                <input
                  type="number"
                  step="0.0001"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="cell-input"
                  autoFocus
                  placeholder="e.g. 95.50"
                />
              </div>
            ) : (
              <div className="calc-field">
                <label>TEM</label>
                <input
                  type="number"
                  step="0.0001"
                  value={tem}
                  onChange={(e) => setTem(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="cell-input"
                  autoFocus
                  placeholder="e.g. 0.035"
                />
              </div>
            )}
          </div>

          <button className="btn btn-primary calc-run-btn" onClick={handleCalc}>
            {mode === 'tem' ? 'CALC TEM' : 'CALC PRECIO'}
          </button>

          {error && <div className="calc-error">{error}</div>}

          {result && (
            <div className="calc-results">
              <div className="calc-results-header">RESULTS</div>
              <div className="calc-results-grid">
                {Object.entries(result).map(([key, val]) => (
                  <div key={key} className="calc-result-row">
                    <span className="calc-result-label">{key}</span>
                    <span className="calc-result-value">{formatValue(key, val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
