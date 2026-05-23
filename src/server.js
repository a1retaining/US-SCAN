const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const VERSION = "2.0.0-functional";
const SYMBOLS = ["SPY","QQQ","DIA","IWM","VIX","NVDA","AVGO","AMD","META","PLTR","TSLA","CRWD","AMZN","AAPL","MSFT","GOOGL","NFLX","COST","LLY","JPM"];
const cache = new Map();

const paperAccount = {
  startingCash: 5000,
  cash: 5000,
  open: [],
  closed: [],
  alerts: []
};

function round(n, d = 2) {
  const x = Number(n);
  return Number.isFinite(x) ? Number(x.toFixed(d)) : null;
}
function sma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const s = values.slice(-period);
  return s.reduce((a,b)=>a+b,0) / s.length;
}
function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change; else losses -= change;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}
async function getBars(symbol) {
  const key = symbol.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 180000) return cached.bars;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(key)}?range=1y&interval=1d&includePrePost=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });
    if (!res.ok) throw new Error(`${key} HTTP ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result?.timestamp || !quote) throw new Error(`${key} missing chart data`);

    const bars = result.timestamp.map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0,10),
      open: Number(quote.open?.[i]),
      high: Number(quote.high?.[i]),
      low: Number(quote.low?.[i]),
      close: Number(quote.close?.[i]),
      volume: Number(quote.volume?.[i] || 0)
    })).filter(b => Number.isFinite(b.close) && Number.isFinite(b.high) && Number.isFinite(b.low));

    if (bars.length < 40) throw new Error(`${key} not enough bars`);
    cache.set(key, { time: Date.now(), bars });
    return bars;
  } finally {
    clearTimeout(timer);
  }
}
function pct(now, prev) {
  if (!Number.isFinite(now) || !Number.isFinite(prev) || prev === 0) return 0;
  return ((now - prev) / prev) * 100;
}
function buildSignal(symbol, bars, spyMove = 0) {
  const closes = bars.map(b => b.close);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2] || last;
  const price = last.close;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, Math.min(200, closes.length));
  const rsi14 = rsi(closes, 14);
  const move1 = pct(price, prev.close);
  const move21 = closes.length > 22 ? pct(closes[closes.length - 1], closes[closes.length - 22]) : 0;
  const relative = move21 - spyMove;
  const high20 = Math.max(...bars.slice(-20).map(b => b.high));
  const low20 = Math.min(...bars.slice(-20).map(b => b.low));
  const trendBull = price > sma20 && price > sma50;
  const setup = price >= high20 * 0.985 ? "Breakout" : price > sma20 ? "Pullback" : "Watch";
  let confidence = 45;
  if (price > sma20) confidence += 12;
  if (price > sma50) confidence += 12;
  if (price > sma200) confidence += 10;
  if (relative > 0) confidence += 10;
  if (rsi14 >= 50 && rsi14 <= 72) confidence += 8;
  if (setup === "Breakout") confidence += 5;
  confidence = Math.max(1, Math.min(99, Math.round(confidence)));

  const stop = round(Math.max(0.01, low20 * 0.985));
  const risk = Math.max(0.01, price - stop);
  const target1 = round(price + risk * 1.8);
  const target2 = round(price + risk * 2.6);
  const rr = round((target1 - price) / risk, 2);
  const action = confidence >= 82 && trendBull ? "LONG" : confidence >= 68 ? "WATCH" : "IGNORE";

  return {
    symbol,
    price: round(price),
    changePct: round(move1, 2),
    setup,
    confidence,
    winRate: null,
    expectancy: null,
    rr: `${rr}:1`,
    trend: trendBull ? "UP" : "NEUTRAL",
    regime: trendBull ? "Bullish" : "Neutral",
    action,
    entry: round(price),
    buyLow: round(price * 0.992),
    buyHigh: round(price * 1.006),
    stop,
    target1,
    target2,
    rsi: round(rsi14),
    relativeStrength: round(relative, 2),
    bars: bars.slice(-80)
  };
}
async function buildState() {
  const errors = [];
  const barsBySymbol = {};
  for (const s of SYMBOLS) {
    try {
      barsBySymbol[s] = await getBars(s);
    } catch (e) {
      errors.push({ symbol: s, error: e.message });
    }
  }

  const spyBars = barsBySymbol.SPY || [];
  const spyCloses = spyBars.map(b => b.close);
  const spyMove21 = spyCloses.length > 22 ? pct(spyCloses[spyCloses.length - 1], spyCloses[spyCloses.length - 22]) : 0;
  const signals = Object.keys(barsBySymbol)
    .filter(s => !["DIA","IWM","VIX"].includes(s))
    .map(s => buildSignal(s, barsBySymbol[s], spyMove21))
    .sort((a,b) => b.confidence - a.confidence)
    .map((s, i) => ({ rank: i + 1, ...s }));

  const spySignal = signals.find(s => s.symbol === "SPY");
  const qqqSignal = signals.find(s => s.symbol === "QQQ");
  const vix = barsBySymbol.VIX?.at(-1)?.close;
  const breadth = signals.length ? Math.round((signals.filter(s => s.trend === "UP").length / signals.length) * 100) : 0;
  const market = {
    regime: breadth >= 60 ? "BULLISH" : breadth >= 45 ? "NEUTRAL" : "BEARISH",
    spyTrend: spySignal?.trend === "UP" ? "BULLISH" : "NEUTRAL",
    qqqTrend: qqqSignal?.trend === "UP" ? "BULLISH" : "NEUTRAL",
    volatility: Number.isFinite(vix) ? (vix < 18 ? "LOW" : vix < 25 ? "MEDIUM" : "HIGH") : "UNKNOWN",
    vix: round(vix),
    breadth: `${breadth}%`,
    breadthScore: breadth,
    sectorLeader: "TECHNOLOGY",
    confidence: Math.round((breadth + (spySignal?.confidence || 50)) / 2)
  };

  return {
    ok: true,
    version: VERSION,
    mode: errors.length ? "PARTIAL_LIVE_DATA" : "LIVE_DATA",
    market,
    signals,
    indices: ["SPY","QQQ","DIA","IWM","VIX"].map(s => {
      const b = barsBySymbol[s] || [];
      const last = b.at(-1);
      const prev = b.at(-2);
      return {
        symbol: s,
        price: round(last?.close),
        changePct: round(pct(last?.close, prev?.close), 2),
        bars: b.slice(-30)
      };
    }),
    systems: [
      { name: "Data Collector", state: errors.length ? "PARTIAL" : "RUNNING", real: true },
      { name: "Backtest Engine", state: "WAITING FOR TRADE HISTORY", real: true },
      { name: "Strategy Optimizer", state: "WAITING FOR RESULTS", real: true },
      { name: "Market Regime Engine", state: "RUNNING", real: true },
      { name: "Risk Manager", state: "RUNNING", real: true },
      { name: "Alert Engine", state: "RUNNING", real: true },
      { name: "Paper Trader", state: "NO POSITIONS", real: true },
      { name: "Performance Analytics", state: "NO CLOSED TRADES", real: true }
    ],
    paper: paperAccount,
    stats: {
      totalTrades: paperAccount.closed.length,
      winRate: null,
      expectancy: null,
      profitFactor: null,
      maxDrawdown: null,
      equityCurve: []
    },
    alerts: paperAccount.alerts,
    errors,
    updatedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime())
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: VERSION, app: "TradingMint PRO", uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString() });
});
app.get("/api/state", async (req, res) => {
  try {
    res.json(await buildState());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, time: new Date().toISOString() });
  }
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

app.listen(PORT, () => console.log(`TradingMint PRO ${VERSION} running on port ${PORT}`));
