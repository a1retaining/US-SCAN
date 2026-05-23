const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const VERSION = "2.1.0-tested";
const SYMBOLS = ["SPY","QQQ","DIA","IWM","VIX","NVDA","AVGO","AMD","META","PLTR","TSLA","CRWD","AMZN","AAPL","MSFT","GOOGL","NFLX","COST","LLY","JPM","AVXL","SMCI","MSTR","COIN","HOOD"];
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
function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const clean = values.filter(Number.isFinite);
  if (clean.length < period) return null;
  const k = 2 / (period + 1);
  let current = clean.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < clean.length; i++) current = clean[i] * k + current * (1 - k);
  return current;
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
function atr(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length <= period) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i-1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return sma(trs, period);
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
function buildSignal(symbol, bars, spyMove = 0, marketBias = "NEUTRAL") {
  const closes = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume || 0);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2] || last;
  const price = last.close;
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const sma200 = sma(closes, Math.min(200, closes.length));
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(bars, 14);
  const avgVol20 = sma(volumes, 20);
  const volumeRatio = avgVol20 ? last.volume / avgVol20 : null;
  const move1 = pct(price, prev.close);
  const move21 = closes.length > 22 ? pct(closes[closes.length - 1], closes[closes.length - 22]) : 0;
  const relative = move21 - spyMove;
  const high20 = Math.max(...bars.slice(-20).map(b => b.high));
  const low20 = Math.min(...bars.slice(-20).map(b => b.low));
  const trendBull = price > ema20 && price > ema50 && price > sma200;
  const setup = price >= high20 * 0.985 ? "Breakout" : price > ema20 ? "Pullback" : "Watch";

  let strength = 0;
  if (price > ema20) strength += 15;
  if (price > ema50) strength += 15;
  if (price > sma200) strength += 14;
  if (ema20 > ema50) strength += 12;
  if (relative > 0) strength += 12;
  if (rsi14 >= 50 && rsi14 <= 70) strength += 10;
  if (volumeRatio && volumeRatio >= 1.15) strength += 8;
  if (setup === "Breakout") strength += 8;
  if (marketBias === "BULLISH") strength += 6;
  if (marketBias === "BEARISH") strength -= 12;

  const stretched = rsi14 > 74 || (ema20 && price > ema20 * 1.08);
  if (stretched) strength -= 12;
  const confidence = Math.max(1, Math.min(99, Math.round(strength)));

  const safeAtr = Number.isFinite(atr14) && atr14 > 0 ? atr14 : price * 0.035;
  const stop = round(Math.max(0.01, Math.min(low20 * 0.985, price - safeAtr * 1.45)));
  const risk = Math.max(0.01, price - stop);
  const target1 = round(price + risk * 1.8);
  const target2 = round(price + risk * 2.6);
  const rrNumber = round((target1 - price) / risk, 2);

  let safety = "WAIT";
  const reasons = [];
  const warnings = [];
  if (!trendBull) warnings.push("Trend filter is not fully bullish.");
  if (marketBias !== "BULLISH") warnings.push("Market regime is not strongly bullish.");
  if (stretched) warnings.push("Price may be extended; avoid chasing.");
  if (rrNumber < 1.8) warnings.push("Risk/reward is below 1.8.");
  if (confidence >= 82 && trendBull && marketBias === "BULLISH" && rrNumber >= 1.8 && !stretched) safety = "TRADE_READY";
  else if (confidence >= 68) safety = "WATCHLIST";
  else safety = "REJECT";

  if (price > ema20) reasons.push("Price is above EMA20.");
  if (price > ema50) reasons.push("Price is above EMA50.");
  if (price > sma200) reasons.push("Price is above long-term trend.");
  if (relative > 0) reasons.push("Relative strength is better than SPY.");
  if (setup === "Breakout") reasons.push("Price is near a 20-day breakout area.");

  return {
    symbol,
    price: round(price),
    changePct: round(move1, 2),
    setup,
    confidence,
    winRate: null,
    expectancy: null,
    rr: `${rrNumber}:1`,
    rrNumber,
    trend: trendBull ? "UP" : "NEUTRAL",
    regime: trendBull ? "Bullish" : "Neutral",
    action: safety === "TRADE_READY" ? "LONG" : safety === "WATCHLIST" ? "WATCH" : "IGNORE",
    safety,
    entry: round(price),
    buyLow: round(price * 0.992),
    buyHigh: round(price * 1.006),
    stop,
    target1,
    target2,
    rsi: round(rsi14),
    relativeStrength: round(relative, 2),
    volumeRatio: round(volumeRatio, 2),
    reasons,
    warnings,
    bars: bars.slice(-120)
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

  let provisional = Object.keys(barsBySymbol)
    .filter(s => !["DIA","IWM","VIX"].includes(s))
    .map(s => buildSignal(s, barsBySymbol[s], spyMove21, "NEUTRAL"));
  const breadth0 = provisional.length ? Math.round((provisional.filter(s => s.trend === "UP").length / provisional.length) * 100) : 0;
  const marketBias = breadth0 >= 60 ? "BULLISH" : breadth0 >= 45 ? "NEUTRAL" : "BEARISH";

  const signals = Object.keys(barsBySymbol)
    .filter(s => !["DIA","IWM","VIX"].includes(s))
    .map(s => buildSignal(s, barsBySymbol[s], spyMove21, marketBias))
    .sort((a,b) => b.confidence - a.confidence)
    .map((s, i) => ({ rank: i + 1, ...s }));

  const spySignal = signals.find(s => s.symbol === "SPY");
  const qqqSignal = signals.find(s => s.symbol === "QQQ");
  const vix = barsBySymbol.VIX?.at(-1)?.close;
  const breadth = signals.length ? Math.round((signals.filter(s => s.trend === "UP").length / signals.length) * 100) : 0;
  const market = {
    regime: marketBias,
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
    dataQuality: errors.length ? "PARTIAL" : "LIVE",
    market,
    signals,
    indices: ["SPY","QQQ","DIA","IWM","VIX"].map(s => {
      const b = barsBySymbol[s] || [];
      const last = b.at(-1);
      const prev = b.at(-2);
      return { symbol: s, price: round(last?.close), changePct: round(pct(last?.close, prev?.close), 2), bars: b.slice(-30) };
    }),
    systems: [
      { name: "Data Collector", state: errors.length ? "PARTIAL" : "RUNNING", detail: errors.length ? `${errors.length} symbols failed` : "Live Yahoo chart data" },
      { name: "Backtest Engine", state: "WAITING", detail: "Needs paper/history module" },
      { name: "Strategy Optimizer", state: "WAITING", detail: "Needs backtest results" },
      { name: "Market Regime Engine", state: "RUNNING", detail: "Live breadth and SPY filters" },
      { name: "Risk Manager", state: "RUNNING", detail: "Stops/targets calculated" },
      { name: "Alert Engine", state: "READY", detail: "Audio unlocked by user click" },
      { name: "Paper Trader", state: "NO POSITIONS", detail: "No paper entries yet" },
      { name: "Performance Analytics", state: "NO CLOSED TRADES", detail: "No fake win rate shown" }
    ],
    paper: paperAccount,
    stats: { totalTrades: paperAccount.closed.length, winRate: null, expectancy: null, profitFactor: null, maxDrawdown: null, equityCurve: [] },
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
  try { res.json(await buildState()); } catch (e) { res.status(500).json({ ok: false, error: e.message, time: new Date().toISOString() }); }
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

app.listen(PORT, () => console.log(`TradingMint PRO ${VERSION} running on port ${PORT}`));
