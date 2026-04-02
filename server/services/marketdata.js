const WebSocket = require('ws');

const WS_URL = 'wss://mtr.primary.ventures/ws?session_id=&conn_id=';

const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

// Server clock from WS heartbeat, or fallback to local time with tz offset
let serverNow = null; // last clock timestamp from WS
let tzOffsetHours = -3; // fallback offset if no clock received yet

function getNow() {
  if (serverNow) return new Date(serverNow);
  // Fallback: apply manual offset to local UTC
  const utc = new Date();
  return new Date(utc.getTime() + tzOffsetHours * 3600000);
}

function setTimezone(offsetHours) {
  tzOffsetHours = offsetHours;
}

function getTimezone() {
  return tzOffsetHours;
}

const BANNER_TOPICS = [
  'md.bm_MERV_PESOS_1D',
  'md.bm_MERV_PESOS_2D',
  'md.bm_MERV_PESOS_3D',
  'md.bm_MERV_PESOS_4D',
  'md.bm_MERV_PESOS_5D',
  'md.bm_MERV_PESOS_6D',
  'md.bm_MERV_PESOS_7D',
  'md.rx_DDF_BCRA_A3500',
  'md.rx_DDF_DLR_SPOT',
];

// Generate 12 rolling DLR futures topics starting from current month (in configured tz)
function buildFuturesTopics() {
  const now = getNow();
  const startMonth = now.getUTCMonth();
  const startYear = now.getUTCFullYear() % 100;
  const topics = [];
  for (let i = 0; i < 12; i++) {
    const moIdx = (startMonth + i) % 12;
    const yr = startYear + Math.floor((startMonth + i) / 12);
    topics.push(`md.rx_DDF_DLR_${MONTHS[moIdx]}${String(yr).padStart(2, '0')}M`);
  }
  return topics;
}

// Regex to identify a valid DLR futures contract (no spreads, no multi-leg)
const FUTURES_RE = /^rx_DDF_DLR_([A-Z]{3})(\d{2})M$/;

// Cache: topic -> { value, updatedAt }
const cache = {};
const futuresCache = {}; // contract -> { last, volume, tnaLive, openInterest, updatedAt }
let connected = false;
let ws = null;
let reconnectDelay = 1000;
let reconnectTimer = null;

function subscribe() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const futuresTopics = buildFuturesTopics();
  const allTopics = [...BANNER_TOPICS, ...futuresTopics];
  const msg = JSON.stringify({
    _req: 'S',
    topicType: 'md',
    topics: allTopics,
    replace: false,
  });
  ws.send(msg);
  console.log('[MarketData] Subscribed to', allTopics.length, 'topics (' + BANNER_TOPICS.length + ' banner + ' + futuresTopics.length + ' futures)');
  console.log('[MarketData] Futures:', futuresTopics.map(t => t.replace('md.rx_DDF_DLR_', '')).join(', '));
}

function extractLine(raw) {
  let line = raw;
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (arr.length > 0) line = arr[0];
    } catch { /* use raw */ }
  }
  if (typeof line !== 'string' || !line.startsWith('M:')) return null;
  const content = line.slice(2); // remove "M:"
  return content.split('|');
}

function parseMarketMessage(raw) {
  const parts = extractLine(raw);
  if (!parts) return null;

  const topicRaw = parts[0];

  // Check if it's a futures contract
  // Observed layout (0-indexed):
  //   0: topic | 1: ? | 2-8: empty | 9: vol_act | 10: tna_act |
  //   11-13: empty | 14: open_interest_ant | 15: last | 16: last_date | ...
  const futuresMatch = topicRaw.match(FUTURES_RE);
  if (futuresMatch) {
    const parseIdx = (i) => parts.length > i && parts[i] !== '' && !isNaN(parseFloat(parts[i]))
      ? parseFloat(parts[i]) : null;
    return {
      type: 'futures',
      contract: topicRaw,
      last: parseIdx(15),
      volume: parseIdx(9),
      tnaLive: parseIdx(10),
      openInterest: parseIdx(14),
    };
  }

  // Banner topics
  const topic = BANNER_TOPICS.find(t => t === `md.${topicRaw}`);
  if (!topic) return null;

  let price = null;
  if (parts.length > 10 && parts[10] && !isNaN(parseFloat(parts[10]))) {
    price = parseFloat(parts[10]);
  } else {
    for (let i = 1; i < parts.length; i++) {
      const val = parseFloat(parts[i]);
      if (!isNaN(val) && val > 0) {
        price = val;
        break;
      }
    }
  }

  return { type: 'banner', topic, price };
}

function handleMessage(data) {
  const raw = data.toString();

  // Heartbeat / clock
  if (raw.startsWith('X:')) {
    try {
      const payload = JSON.parse(raw.slice(2));
      if (payload.t === 'clock' && payload.d && payload.d.now) {
        serverNow = payload.d.now;
      }
    } catch { /* ignore malformed heartbeat */ }
    return;
  }

  // Keepalive
  if (raw === 'ping') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send('pong');
    }
    return;
  }

  // Market data
  const parsed = parseMarketMessage(raw);
  if (!parsed) return;

  const now = new Date().toISOString();
  if (parsed.type === 'banner' && parsed.price !== null) {
    cache[parsed.topic] = { value: parsed.price, updatedAt: now };
  } else if (parsed.type === 'futures') {
    const prev = futuresCache[parsed.contract] || {};
    futuresCache[parsed.contract] = {
      last: parsed.last ?? prev.last ?? null,
      volume: parsed.volume ?? prev.volume ?? null,
      tnaLive: parsed.tnaLive ?? prev.tnaLive ?? null,
      openInterest: parsed.openInterest ?? prev.openInterest ?? null,
      updatedAt: now,
    };
  }
}

function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  console.log('[MarketData] Connecting to Primary WS...');
  ws = new WebSocket(WS_URL, {
    rejectUnauthorized: false,
  });

  ws.on('open', () => {
    console.log('[MarketData] Connected');
    connected = true;
    reconnectDelay = 1000;
    subscribe();
  });

  ws.on('message', handleMessage);

  ws.on('close', (code, reason) => {
    console.log('[MarketData] Disconnected:', code, reason.toString());
    connected = false;
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[MarketData] Error:', err.message);
    connected = false;
  });

  ws.on('ping', () => {
    if (ws.readyState === WebSocket.OPEN) ws.pong();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log(`[MarketData] Reconnecting in ${reconnectDelay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    connect();
  }, reconnectDelay);
}

function getMarketData() {
  // BM: find lowest nD with data
  let merv = null;
  for (let n = 1; n <= 7; n++) {
    const topic = `md.bm_MERV_PESOS_${n}D`;
    const entry = cache[topic];
    if (entry && entry.value != null && entry.value > 0) {
      merv = { value: entry.value, label: `CAUCHO ${n}D`, nD: n, updatedAt: entry.updatedAt };
      break;
    }
  }

  const a3500 = cache['md.rx_DDF_BCRA_A3500'];
  const dlrSpot = cache['md.rx_DDF_DLR_SPOT'];

  return {
    merv: merv || { value: null, label: 'CAUCHO', nD: null, updatedAt: null },
    a3500: a3500 ? { value: a3500.value, label: 'A3500', updatedAt: a3500.updatedAt } : { value: null, label: 'A3500', updatedAt: null },
    dlrSpot: dlrSpot ? { value: dlrSpot.value, label: 'DLR SPOT', updatedAt: dlrSpot.updatedAt } : { value: null, label: 'DLR SPOT', updatedAt: null },
    connected,
  };
}

function getFuturesData() {
  // Always return all 12 subscribed contracts, even if no data yet
  const futuresTopics = buildFuturesTopics();
  return futuresTopics.map(topic => {
    const contract = topic.replace('md.', ''); // rx_DDF_DLR_ABR26M
    const m = contract.match(FUTURES_RE);
    const label = m ? `DLR ${m[1]}${m[2]}` : contract;
    const data = futuresCache[contract];
    return {
      contract,
      label,
      last: data ? data.last : null,
      volume: data ? data.volume : null,
      tnaLive: data ? data.tnaLive : null,
      openInterest: data ? data.openInterest : null,
      updatedAt: data ? data.updatedAt : null,
    };
  });
}

function start() {
  connect();
}

module.exports = { start, getMarketData, getFuturesData, getTimezone, setTimezone };
