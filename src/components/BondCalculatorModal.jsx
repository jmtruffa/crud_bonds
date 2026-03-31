import React, { useState, useCallback } from 'react';
import { calcYield, calcPrice } from '../api/calculator';

function getSettlementDate() {
  const now = new Date();
  const day = now.getDay();
  // If Friday (5), Saturday (6), or Sunday (0) → next Monday
  // Otherwise → next business day (tomorrow), unless today is already a weekday
  let d = new Date(now);
  if (day === 5) d.setDate(d.getDate() + 3);
  else if (day === 6) d.setDate(d.getDate() + 2);
  else d.setDate(d.getDate() + 1);
  // If the +1 lands on Saturday or Sunday, push to Monday
  const nd = d.getDay();
  if (nd === 0) d.setDate(d.getDate() + 1);
  else if (nd === 6) d.setDate(d.getDate() + 2);
  return d.toISOString().split('T')[0];
}

const RESULT_LABELS = {
  Yield: 'YTM',
  Price: 'Price',
  MDuration: 'Mod Duration',
  AccrualDays: 'Accrual Days',
  CurrentCoupon: 'Current Coupon',
  Residual: 'Residual',
  AccruedInterest: 'Accrued Interest',
  TechnicalValue: 'Technical Value',
  Parity: 'Parity',
  LastCoupon: 'Last Coupon',
  LastAmort: 'Last Amort',
  Maturity: 'Maturity',
  CERUsed: 'CER Used',
  UsedCER: 'CER Used',
};

function formatValue(key, val) {
  if (val == null || val === '') return '—';
  if (typeof val === 'number') {
    if (['Yield', 'CurrentCoupon', 'Parity', 'AccruedInterest', 'Price'].includes(key))
      return val.toFixed(6);
    if (['MDuration'].includes(key)) return val.toFixed(4);
    if (['AccrualDays'].includes(key)) return val.toFixed(0);
    return val.toFixed(6);
  }
  return String(val);
}

export default function BondCalculatorModal({ bond, onClose }) {
  const [mode, setMode] = useState('yield');
  const [settlementDate, setSettlementDate] = useState(getSettlementDate);
  const [price, setPrice] = useState('');
  const [rate, setRate] = useState('');
  const [initialFee, setInitialFee] = useState('0');
  const [endingFee, setEndingFee] = useState('0');
  const [extendIndex, setExtendIndex] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCalc = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      let data;
      if (mode === 'yield') {
        if (!price) { setError('Price is required'); setLoading(false); return; }
        data = await calcYield({
          ticker: bond.ticker,
          settlementDate,
          price,
          initialFee: initialFee || undefined,
          endingFee: endingFee || undefined,
          extendIndex: extendIndex || undefined,
        });
      } else {
        if (!rate) { setError('Rate is required'); setLoading(false); return; }
        data = await calcPrice({
          ticker: bond.ticker,
          settlementDate,
          rate,
          initialFee: initialFee || undefined,
          endingFee: endingFee || undefined,
          extendIndex: extendIndex || undefined,
        });
      }
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [mode, bond.ticker, settlementDate, price, rate, initialFee, endingFee, extendIndex]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCalc();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel calc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>CALC &gt; {bond.ticker}</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>ESC</button>
        </div>

        <div className="modal-body">
          {/* Mode toggle */}
          <div className="calc-mode-toggle">
            <button
              className={`calc-mode-btn ${mode === 'yield' ? 'active' : ''}`}
              onClick={() => { setMode('yield'); setResult(null); setError(null); }}
            >
              YIELD
            </button>
            <button
              className={`calc-mode-btn ${mode === 'price' ? 'active' : ''}`}
              onClick={() => { setMode('price'); setResult(null); setError(null); }}
            >
              PRICE
            </button>
          </div>

          {/* Inputs */}
          <div className="calc-inputs">
            <div className="calc-field">
              <label>TICKER</label>
              <input type="text" value={bond.ticker} readOnly className="cell-input" />
            </div>
            <div className="calc-field">
              <label>SETTLE DATE</label>
              <input
                type="date"
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="cell-input"
              />
            </div>
            {mode === 'yield' ? (
              <div className="calc-field">
                <label>PRICE</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="cell-input"
                  autoFocus
                  placeholder="e.g. 95.50"
                />
              </div>
            ) : (
              <div className="calc-field">
                <label>RATE</label>
                <input
                  type="number"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="cell-input"
                  autoFocus
                  placeholder="e.g. 0.08"
                />
              </div>
            )}
            <div className="calc-field">
              <label>INIT FEE</label>
              <input
                type="number"
                step="0.01"
                value={initialFee}
                onChange={(e) => setInitialFee(e.target.value)}
                onKeyDown={handleKeyDown}
                className="cell-input"
              />
            </div>
            <div className="calc-field">
              <label>END FEE</label>
              <input
                type="number"
                step="0.01"
                value={endingFee}
                onChange={(e) => setEndingFee(e.target.value)}
                onKeyDown={handleKeyDown}
                className="cell-input"
              />
            </div>
            <div className="calc-field">
              <label>EXTEND IDX</label>
              <input
                type="number"
                step="0.01"
                value={extendIndex}
                onChange={(e) => setExtendIndex(e.target.value)}
                onKeyDown={handleKeyDown}
                className="cell-input"
                placeholder="annual rate"
              />
            </div>
          </div>

          <button
            className="btn btn-primary calc-run-btn"
            onClick={handleCalc}
            disabled={loading}
          >
            {loading ? 'CALCULATING...' : mode === 'yield' ? 'CALC YIELD' : 'CALC PRICE'}
          </button>

          {error && <div className="calc-error">{error}</div>}

          {result && (
            <div className="calc-results">
              <div className="calc-results-header">RESULTS</div>
              <div className="calc-results-grid">
                {Object.entries(result).map(([key, val]) => (
                  <div key={key} className="calc-result-row">
                    <span className="calc-result-label">{RESULT_LABELS[key] || key}</span>
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
