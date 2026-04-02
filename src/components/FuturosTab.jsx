import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function fmt(value, decimals = 2) {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtVol(value) {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function fmtPct(value) {
  if (value == null || isNaN(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function fmtDiff(value) {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVolDiff(value) {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

// Map WS contract (rx_DDF_DLR_ABR26M) to rofexHis symbol (DLR042026)
const MONTH_MAP = { ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06',
                    JUL: '07', AGO: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12' };

function wsContractToSymbol(contract) {
  const m = contract.match(/^rx_DDF_DLR_([A-Z]{3})(\d{2})M$/);
  if (!m) return null;
  const mm = MONTH_MAP[m[1]];
  if (!mm) return null;
  return `DLR${mm}20${m[2]}`;
}

function diffClass(value) {
  if (value == null || value === 0) return '';
  return value > 0 ? 'futuros-positive' : 'futuros-negative';
}

export default function FuturosTab() {
  const [data, setData] = useState({ contracts: [], connected: false, dlrSpot: null });
  const [curve, setCurve] = useState(null);
  const intervalRef = useRef(null);

  // Poll WS futures prices
  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      try {
        const res = await fetch(`${API_BASE}/marketdata/futures`);
        if (res.ok && mounted) setData(await res.json());
      } catch { /* silent */ }
    }
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);
    return () => { mounted = false; clearInterval(intervalRef.current); };
  }, []);

  // Fetch curve data once
  useEffect(() => {
    async function fetchCurve() {
      try {
        const res = await fetch(`${API_BASE}/marketdata/futures/curve`);
        if (res.ok) setCurve(await res.json());
      } catch { /* silent */ }
    }
    fetchCurve();
  }, []);

  // Build lookup: symbol -> curve row
  const curveBySymbol = {};
  if (curve && curve.rows) {
    for (const row of curve.rows) {
      curveBySymbol[row.symbol] = row;
    }
  }

  const chartData = buildChartData(data.contracts, curve, data.dlrSpot);

  return (
    <div className="futuros-layout">
      <div className="futuros-table-panel">
        <div className="futuros-table-header">
          <span>DLR FUTUROS</span>
          <span className={`status-dot ${data.connected ? 'live' : 'off'}`} />
        </div>
        <table className="futuros-table">
          <thead>
            <tr>
              <th>Contrato</th>
              <th className="num">Último</th>
              <th className="num">Diff</th>
              <th className="num">Vol Act</th>
              <th className="num">Vol Ant</th>
              <th className="num">Vol Diff</th>
              <th className="num">OI Ant</th>
              <th className="num">TNA Ant</th>
              <th className="num">TNA Act</th>
            </tr>
          </thead>
          <tbody>
            {data.contracts.length === 0 ? (
              <tr>
                <td colSpan={9} className="futuros-empty">
                  {data.connected ? 'Esperando datos...' : 'Sin conexión'}
                </td>
              </tr>
            ) : (
              data.contracts.map(c => {
                const symbol = wsContractToSymbol(c.contract);
                const prev = symbol ? curveBySymbol[symbol] : null;
                const priceDiff = (c.last != null && prev?.settlement != null)
                  ? c.last - parseFloat(prev.settlement) : null;
                const volDiff = (c.volume != null && prev?.volume != null)
                  ? c.volume - parseFloat(prev.volume) : null;
                return (
                  <tr key={c.contract}>
                    <td className="futuros-label">{c.label}</td>
                    <td className="futuros-price num">{fmt(c.last)}</td>
                    <td className={`num ${diffClass(priceDiff)}`}>{fmtDiff(priceDiff)}</td>
                    <td className="num">{fmtVol(c.volume)}</td>
                    <td className="num futuros-muted">{prev ? fmtVol(prev.volume) : '—'}</td>
                    <td className={`num ${diffClass(volDiff)}`}>{fmtVolDiff(volDiff)}</td>
                    <td className="num futuros-muted">{c.openInterest != null ? fmtVol(c.openInterest) : '—'}</td>
                    <td className="num futuros-muted">{prev ? fmtPct(parseFloat(prev.impliedRateTNA)) : '—'}</td>
                    <td className="num">{c.tnaLive != null ? fmtPct(c.tnaLive) : '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="futuros-chart-panel">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#b6b6b6', fontSize: 11 }}
                axisLine={{ stroke: '#2a2a2a' }}
                tickLine={{ stroke: '#2a2a2a' }}
              />
              <YAxis
                tick={{ fill: '#b6b6b6', fontSize: 11 }}
                axisLine={{ stroke: '#2a2a2a' }}
                tickLine={{ stroke: '#2a2a2a' }}
                tickFormatter={v => `${(v * 100).toFixed(1)}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ background: '#121212', border: '1px solid #2a2a2a', fontSize: 12 }}
                labelStyle={{ color: '#ff9f1c' }}
                formatter={(value, name) => [`${(value * 100).toFixed(2)}%`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="TNA (ant)"
                stroke="#ff9f1c"
                strokeDasharray="6 3"
                dot={{ r: 3, fill: '#ff9f1c' }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="TEA (ant)"
                stroke="#ffb347"
                dot={{ r: 3, fill: '#ffb347' }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="TNA"
                stroke="#f2f2f2"
                strokeWidth={2}
                dot={{ r: 4, fill: '#f2f2f2', stroke: '#0a0a0a', strokeWidth: 1 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="TEA"
                stroke="#b6b6b6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#b6b6b6', stroke: '#0a0a0a', strokeWidth: 1 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="futuros-chart-placeholder">
            {curve === null ? 'Cargando curva...' : 'Sin datos de curva'}
          </div>
        )}
      </div>
    </div>
  );
}

function buildChartData(contracts, curve, dlrSpot) {
  if (!curve || !curve.rows || curve.rows.length === 0) return [];

  const curveBySymbol = {};
  for (const row of curve.rows) {
    curveBySymbol[row.symbol] = row;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = [];
  for (const c of contracts) {
    const symbol = wsContractToSymbol(c.contract);
    if (!symbol) continue;
    const row = curveBySymbol[symbol];
    if (!row) continue; // no match — month boundary, skip

    const entry = {
      label: c.label,
      pos: row.pos,
      'TNA (ant)': row.impliedRateTNA != null ? parseFloat(row.impliedRateTNA) : null,
      'TEA (ant)': row.impliedRateTEA != null ? parseFloat(row.impliedRateTEA) : null,
      'TNA': null,
      'TEA': null,
    };

    // Calculate live TNA/TEA from last price and DLR_SPOT
    if (c.last != null && dlrSpot != null && dlrSpot > 0 && row.EOM) {
      const eom = new Date(row.EOM);
      const daysToMaturity = Math.round((eom - today) / 86400000);
      if (daysToMaturity > 0) {
        entry['TNA'] = ((c.last / dlrSpot) - 1) * 365 / daysToMaturity;
        entry['TEA'] = Math.pow(c.last / dlrSpot, 365 / daysToMaturity) - 1;
      }
    }

    result.push(entry);
  }

  result.sort((a, b) => a.pos - b.pos);
  return result;
}
