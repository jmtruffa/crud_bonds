import { useState, useEffect, useCallback } from 'react';
import { getTamarRates } from '../api';

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
  return Math.round((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function days360(d1Str, d2Str) {
  const d1 = new Date(d1Str);
  const d2 = new Date(d2Str);
  let y1 = d1.getFullYear(), m1 = d1.getMonth() + 1, dd1 = d1.getDate();
  let y2 = d2.getFullYear(), m2 = d2.getMonth() + 1, dd2 = d2.getDate();
  if (dd1 === 31) dd1 = 30;
  if (dd1 === 30 && dd2 === 31) dd2 = 30;
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1);
}

function addBizDays(dateStr, n) {
  const d = new Date(dateStr);
  let remaining = Math.abs(n);
  const dir = n >= 0 ? 1 : -1;
  while (remaining > 0) {
    d.setDate(d.getDate() + dir);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d.toISOString().split('T')[0];
}

function calcTamarMetrics(tamar, settlementDate, price, tamarRates) {
  const date_liq = tamar.date_liq.split('T')[0];
  const date_vto = tamar.date_vto.split('T')[0];
  const tasa = Number(tamar.tasa);

  // Average TAMAR TNA in window: [date_liq - 10 biz days, today - 9 biz days]
  const today = new Date().toISOString().split('T')[0];
  const dateStart = addBizDays(date_liq, -10);
  const dateEnd = addBizDays(today, -9);

  const ratesInWindow = tamarRates.filter(r => r.date >= dateStart && r.date <= dateEnd);
  const tamarPromTna = ratesInWindow.length > 0
    ? ratesInWindow.reduce((s, r) => s + r.valor / 100, 0) / ratesInWindow.length
    : 0;

  // TAMAR TEM: ((1 + (tamar_prom_tna + tasa) * 32/365)^(365/32))^(1/12) - 1
  const tamarTem = Math.pow(Math.pow(1 + (tamarPromTna + tasa) * 32 / 365, 365 / 32), 1 / 12) - 1;

  // VPV: 100 * (1 + tamar_tem)^((days360(date_liq, date_vto)/360) * 12)
  const d360LiqVto = days360(date_liq, date_vto);
  const vpv = 100 * Math.pow(1 + tamarTem, (d360LiqVto / 360) * 12);

  // From settlement
  const d360 = days360(settlementDate, date_vto);
  const dias = daysBetween(settlementDate, date_vto);
  const tdirecta = vpv / price - 1;
  const tna = tdirecta * 365 / dias;
  const tea = Math.pow(1 + tdirecta, 365 / dias) - 1;
  const tem = Math.pow(1 + tdirecta, 30 / dias) - 1;
  const tna360 = tdirecta * 360 / d360;
  const tea360 = Math.pow(1 + tdirecta, 360 / d360) - 1;
  const tem360 = Math.pow(1 + tdirecta, 30 / d360) - 1;
  const mduration = dias / (1 + tea);

  return {
    Precio: price,
    VPV: vpv,
    'TAMAR Prom TNA': tamarPromTna,
    'TAMAR TEM': tamarTem,
    'Días (settle→vto)': dias,
    'Días 360': d360,
    'Tasa Directa': tdirecta,
    TNA: tna,
    TEA: tea,
    TEM: tem,
    'TNA 360': tna360,
    'TEA 360': tea360,
    'TEM 360': tem360,
    'Modified Duration': mduration,
  };
}

function calcTamarFromTEM(tamar, settlementDate, temInput, tamarRates) {
  const date_liq = tamar.date_liq.split('T')[0];
  const date_vto = tamar.date_vto.split('T')[0];
  const tasa = Number(tamar.tasa);

  const today = new Date().toISOString().split('T')[0];
  const dateStart = addBizDays(date_liq, -10);
  const dateEnd = addBizDays(today, -9);

  const ratesInWindow = tamarRates.filter(r => r.date >= dateStart && r.date <= dateEnd);
  const tamarPromTna = ratesInWindow.length > 0
    ? ratesInWindow.reduce((s, r) => s + r.valor / 100, 0) / ratesInWindow.length
    : 0;

  const tamarTem = Math.pow(Math.pow(1 + (tamarPromTna + tasa) * 32 / 365, 365 / 32), 1 / 12) - 1;
  const d360LiqVto = days360(date_liq, date_vto);
  const vpv = 100 * Math.pow(1 + tamarTem, (d360LiqVto / 360) * 12);

  const temDecimal = temInput / 100;
  const d360 = days360(settlementDate, date_vto);
  const dias = daysBetween(settlementDate, date_vto);
  const price = vpv / Math.pow(1 + temDecimal, (d360 / 360) * 12);

  const tdirecta = vpv / price - 1;
  const tna = tdirecta * 365 / dias;
  const tea = Math.pow(1 + tdirecta, 365 / dias) - 1;
  const tem = Math.pow(1 + tdirecta, 30 / dias) - 1;
  const tna360 = tdirecta * 360 / d360;
  const tea360 = Math.pow(1 + tdirecta, 360 / d360) - 1;
  const tem360 = Math.pow(1 + tdirecta, 30 / d360) - 1;
  const mduration = dias / (1 + tea);

  return {
    Precio: price,
    VPV: vpv,
    'TAMAR Prom TNA': tamarPromTna,
    'TAMAR TEM': tamarTem,
    'Días (settle→vto)': dias,
    'Días 360': d360,
    'Tasa Directa': tdirecta,
    TNA: tna,
    TEA: tea,
    TEM: tem,
    'TNA 360': tna360,
    'TEA 360': tea360,
    'TEM 360': tem360,
    'Modified Duration': mduration,
  };
}

function formatValue(key, val) {
  if (val == null || val === '') return '—';
  if (typeof val === 'number') {
    if (['Días (settle→vto)', 'Días 360'].includes(key)) return val.toFixed(0);
    if (['Precio', 'VPV', 'Modified Duration'].includes(key)) return val.toFixed(4);
    return (val * 100).toFixed(4) + '%';
  }
  return String(val);
}

export default function TamarCalcModal({ tamar, onClose }) {
  const [mode, setMode] = useState('tem'); // 'tem' = price→TEM, 'price' = TEM→price
  const [settlementDate, setSettlementDate] = useState(getDefaultSettlement);
  const [precio, setPrecio] = useState('');
  const [tem, setTem] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [tamarRates, setTamarRates] = useState([]);
  const [loadingRates, setLoadingRates] = useState(true);

  useEffect(() => {
    getTamarRates()
      .then(data => setTamarRates(data || []))
      .catch(err => setError('Error cargando tasas TAMAR: ' + err.message))
      .finally(() => setLoadingRates(false));
  }, []);

  const handleCalc = useCallback(() => {
    setError(null);
    setResult(null);
    try {
      if (mode === 'tem') {
        if (!precio) { setError('Precio es requerido'); return; }
        setResult(calcTamarMetrics(tamar, settlementDate, Number(precio), tamarRates));
      } else {
        if (!tem) { setError('TEM es requerida'); return; }
        setResult(calcTamarFromTEM(tamar, settlementDate, Number(tem), tamarRates));
      }
    } catch (e) {
      setError(e.message);
    }
  }, [mode, tamar, settlementDate, precio, tem, tamarRates]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCalc();
  };

  const fmtDate = (d) => (typeof d === 'string' ? d.split('T')[0] : d) || '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel calc-modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>CALC &gt; {tamar.ticker}</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>ESC</button>
        </div>

        <div className="modal-body">
          {loadingRates && <div className="loading">Cargando tasas TAMAR del BCRA...</div>}

          {/* Info */}
          <div className="calc-inputs" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="calc-field">
              <label>TICKER</label>
              <input type="text" value={tamar.ticker} readOnly className="cell-input" />
            </div>
            <div className="calc-field">
              <label>FECHA LIQ</label>
              <input type="text" value={fmtDate(tamar.date_liq)} readOnly className="cell-input" />
            </div>
            <div className="calc-field">
              <label>FECHA VTO</label>
              <input type="text" value={fmtDate(tamar.date_vto)} readOnly className="cell-input" />
            </div>
            <div className="calc-field">
              <label>SPREAD (%)</label>
              <input type="text" value={(Number(tamar.tasa) * 100).toFixed(2)} readOnly className="cell-input" />
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
                  placeholder="e.g. 105.50"
                />
              </div>
            ) : (
              <div className="calc-field">
                <label>TEM (%)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={tem}
                  onChange={(e) => setTem(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="cell-input"
                  autoFocus
                  placeholder="e.g. 3.5 para 3.5%"
                />
              </div>
            )}
          </div>

          <button
            className="btn btn-primary calc-run-btn"
            onClick={handleCalc}
            disabled={loadingRates}
          >
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
