const cache = new Map();

const DEFAULT_SYMBOLS = [
  "SPY", "QQQ", "DIA", "IWM", "VIX",
  "NVDA", "AVGO", "AMD", "META", "PLTR", "TSLA", "CRWD", "AMZN", "AAPL", "MSFT",
  "GOOGL", "NFLX", "COST", "LLY", "JPM", "SMCI", "MSTR", "COIN", "HOOD",
  "ORCL", "CRM", "ADBE", "PANW", "NOW", "SNOW", "SHOP", "UBER", "MU", "QCOM",
  "COST", "WMT", "HD", "MA", "V", "BAC", "XOM", "CVX", "CAT", "DE"
];

function round(value, decimals = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(decimals)) : null;
}

function percentMove(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

async function yahooBars(symbol, range = "1y", interval = "1d") {
  const clean = String(symbol || "").trim().toUpperCase();
  const key = `${clean}:${range}:${interval}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 180000) return cached.bars;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });
    if (!response.ok) throw new Error(`${clean} HTTP ${response.status}`);
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result?.timestamp || !quote) throw new Error(`${clean} missing chart data`);

    const bars = result.timestamp.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: Number(quote.open?.[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      close: Number(quote.close?.[index]),
      volume: Number(quote.volume?.[index] || 0)
    })).filter(bar =>
      Number.isFinite(bar.open) &&
      Number.isFinite(bar.high) &&
      Number.isFinite(bar.low) &&
      Number.isFinite(bar.close)
    );

    if (bars.length < 40) throw new Error(`${clean} only returned ${bars.length} usable bars`);
    cache.set(key, { time: Date.now(), bars });
    return bars;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUniverse(symbols = DEFAULT_SYMBOLS, limit = 60) {
  const unique = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))].slice(0, limit);
  const barsBySymbol = {};
  const errors = [];
  for (const symbol of unique) {
    try {
      barsBySymbol[symbol] = await yahooBars(symbol);
    } catch (error) {
      errors.push({ symbol, error: error.message });
    }
  }
  return { barsBySymbol, errors, requested: unique };
}

module.exports = { DEFAULT_SYMBOLS, yahooBars, fetchUniverse, round, percentMove };
