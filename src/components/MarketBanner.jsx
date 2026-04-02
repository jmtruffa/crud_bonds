import { useState, useEffect, useRef } from 'react';
import { request } from '../api/client';

function formatNumber(value) {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MarketBanner() {
  const [data, setData] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || ''}/marketdata`
        );
        if (res.ok && mounted) {
          setData(await res.json());
        }
      } catch {
        // silent - banner is non-critical
      }
    }

    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);

    return () => {
      mounted = false;
      clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="market-banner">
      <div className="market-banner-status">
        <span className={`status-dot ${data?.connected ? 'live' : 'off'}`} />
        {data?.connected ? 'LIVE' : 'OFF'}
      </div>
      <div className="market-banner-items">
        <div className="market-banner-item">
          <span className="market-banner-label">{data?.a3500?.label || 'A3500'}</span>
          <span className="market-banner-value">{formatNumber(data?.a3500?.value)}</span>
        </div>
        <div className="market-banner-item">
          <span className="market-banner-label">{data?.dlrSpot?.label || 'DLR SPOT'}</span>
          <span className="market-banner-value">{formatNumber(data?.dlrSpot?.value)}</span>
        </div>
        <div className="market-banner-item">
          <span className="market-banner-label">{data?.merv?.label || 'CAUCHO'}</span>
          <span className="market-banner-value">{formatNumber(data?.merv?.value)}</span>
        </div>
      </div>
    </div>
  );
}
