const cache = new Map();

const DEFAULT_SYMBOLS = [
  "SPY", "QQQ", "DIA", "IWM", "VIX",
  "NVDA", "AVGO", "AMD", "META", "PLTR", "TSLA", "CRWD", "AMZN", "AAPL", "MSFT",
  "GOOGL", "NFLX", "COST", "LLY", "JPM", "SMCI", "MSTR", "COIN", "HOOD",
  "ORCL", "CRM", "ADBE", "PANW", "NOW", "SNOW", "SHOP", "UBER", "MU", "QCOM",
  "WMT", "HD", "MA", "V", "BAC", "XOM", "CVX", "CAT", "DE", "GE",
  "LRCX", "KLAC", "AMAT", "INTC", "MRVL", "ARM", "NET", "DDOG", "ZS",
  "MELI", "ABNB", "DASH", "RBLX", "ROKU", "SQ", "PYPL", "SOFI",
  "XLE", "XLK", "XLF", "XLV", "XLY", "XLI", "XLP", "XLU", "XLB", "XLRE"
];

const RANGE_FALLBACKS = ["max", "10y", "5y", "3y"];

function round(value, decimals = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(decimals)) : null;
}

function percentMove(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

async function yahooBarsRaw(symbol, range = "max", interval = "1d") {
  const clean = String(symbol || "").trim().toUpperCase();
  const key = `${clean}:${range}:${interval}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 180000) return cached;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

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

    if (bars.length < 300) throw new Error(`${clean} only returned ${bars.length} usable bars`);
    const out = { bars, usedRange: range, interval, firstDate: bars[0]?.date, lastDate: bars.at(-1)?.date, barCount: bars.length };
    cache.set(key, { time: Date.now(), ...out });
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

async function yahooBars(symbol, range = "max", interval = "1d") {
  const result = await yahooBarsWithFallback(symbol, range, interval);
  return result.bars;
}

async function yahooBarsWithFallback(symbol, preferredRange = "max", interval = "1d") {
  const ranges = preferredRange === "max"
    ? RANGE_FALLBACKS
    : [preferredRange, ...RANGE_FALLBACKS.filter(r => r !== preferredRange)];

  const errors = [];
  for (const range of ranges) {
    try {
      return await yahooBarsRaw(symbol, range, interval);
    } catch (error) {
      errors.push(`${range}: ${error.message}`);
    }
  }

  throw new Error(`${symbol} failed all ranges: ${errors.join(" | ")}`);
}

async function fetchUniverse(symbols = DEFAULT_SYMBOLS, limit = 80, range = "max") {
  const unique = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))].slice(0, limit);
  const barsBySymbol = {};
  const metaBySymbol = {};
  const errors = [];

  for (const symbol of unique) {
    try {
      const result = await yahooBarsWithFallback(symbol, range, "1d");
      barsBySymbol[symbol] = result.bars;
      metaBySymbol[symbol] = {
        usedRange: result.usedRange,
        interval: result.interval,
        firstDate: result.firstDate,
        lastDate: result.lastDate,
        barCount: result.barCount
      };
    } catch (error) {
      errors.push({ symbol, error: error.message });
    }
  }

  return { barsBySymbol, metaBySymbol, errors, requested: unique, range, interval: "1d", rangeFallbacks: RANGE_FALLBACKS };
}

module.exports = { DEFAULT_SYMBOLS, RANGE_FALLBACKS, yahooBars, yahooBarsWithFallback, fetchUniverse, round, percentMove };
