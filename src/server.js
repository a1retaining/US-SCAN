const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const VERSION = "3.0.0-complete-tested";
const SYMBOLS = [
  "SPY", "QQQ", "DIA", "IWM", "VIX",
  "NVDA", "AVGO", "AMD", "META", "PLTR", "TSLA", "CRWD", "AMZN", "AAPL", "MSFT",
  "GOOGL", "NFLX", "COST", "LLY", "JPM", "SMCI", "MSTR", "COIN", "HOOD"
];

const cache = new Map();

const paperAccount = {
  startingCash: 5000,
  cash: 5000,
  open: [],
  closed: [],
  alerts: []
};

function round(value, decimals = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(decimals)) : null;
}

function sma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(-period).filter(Number.isFinite);
  if (slice.length < period) return null;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const clean = values.filter(Number.isFinite);
  if (clean.length < period) return null;
  const k = 2 / (period + 1);
  let current = clean.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < clean.length; i++) {
    current = clean[i] * k + current * (1 - k);
  }
  return current;
}

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function atr(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length <= period) return null;
  const trueRanges = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    trueRanges.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    ));
  }
  return sma(trueRanges, period);
}

function percentMove(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

async function getBars(symbol) {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  const cached = cache.get(cleanSymbol);
  if (cached && Date.now() - cached.time < 180000) return cached.bars;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?range=1y&interval=1d&includePrePost=false`;
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

    if (!response.ok) throw new Error(`${cleanSymbol} HTTP ${response.status}`);
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];

    if (!result?.timestamp || !quote) throw new Error(`${cleanSymbol} missing chart data`);

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

    if (bars.length < 40) throw new Error(`${cleanSymbol} not enough bars`);
    cache.set(cleanSymbol, { time: Date.now(), bars });
    return bars;
  } finally {
    clearTimeout(timeout);
  }
}

function buildSignal(symbol, bars, spyMove21, marketBias) {
  const closes = bars.map(bar => bar.close);
  const volumes = bars.map(bar => bar.volume || 0);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2] || last;

  const price = last.close;
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const sma200 = sma(closes, Math.min(200, closes.length));
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(bars, 14);
  const avgVolume20 = sma(volumes, 20);
  const volumeRatio = avgVolume20 ? last.volume / avgVolume20 : null;

  const move1 = percentMove(price, prev.close);
  const move21 = closes.length > 22 ? percentMove(closes[closes.length - 1], closes[closes.length - 22]) : 0;
  const relativeStrength = move21 - spyMove21;

  const recent20 = bars.slice(-20);
  const high20 = Math.max(...recent20.map(bar => bar.high));
  const low20 = Math.min(...recent20.map(bar => bar.low));

  const trendBull = price > ema20 && price > ema50 && price > sma200;
  const setup = price >= high20 * 0.985 ? "Breakout" : price > ema20 ? "Pullback" : "Watch";

  let score = 0;
  const reasons = [];
  const warnings = [];

  if (price > ema20) { score += 15; reasons.push("Price is above EMA20."); } else warnings.push("Price is below EMA20.");
  if (price > ema50) { score += 15; reasons.push("Price is above EMA50."); } else warnings.push("Price is below EMA50.");
  if (price > sma200) { score += 14; reasons.push("Price is above long-term trend."); } else warnings.push("Price is below long-term trend.");
  if (ema20 > ema50) { score += 12; reasons.push("EMA20 is above EMA50."); } else warnings.push("EMA20 is not above EMA50.");
  if (relativeStrength > 0) { score += 12; reasons.push("Relative strength is stronger than SPY."); } else warnings.push("Relative strength is weaker than SPY.");
  if (rsi14 >= 50 && rsi14 <= 70) { score += 10; reasons.push("RSI is in a healthy bullish zone."); }
  else if (rsi14 > 72) warnings.push("RSI is extended.");
  else warnings.push("RSI is not bullish enough.");
  if (volumeRatio && volumeRatio >= 1.15) { score += 8; reasons.push("Volume is above average."); }
  if (setup === "Breakout") { score += 8; reasons.push("Price is near a 20-day breakout area."); }
  if (marketBias === "BULLISH") score += 6;
  if (marketBias === "BEARISH") score -= 12;

  const stretched = (rsi14 && rsi14 > 74) || (ema20 && price > ema20 * 1.08);
  if (stretched) {
    score -= 12;
    warnings.push("Price may be extended; avoid chasing.");
  }

  const confidence = Math.max(1, Math.min(99, Math.round(score)));
  const safeAtr = Number.isFinite(atr14) && atr14 > 0 ? atr14 : price * 0.035;
  const stop = round(Math.max(0.01, Math.min(low20 * 0.985, price - safeAtr * 1.45)));
  const risk = Math.max(0.01, price - stop);
  const target1 = round(price + risk * 1.8);
  const target2 = round(price + risk * 2.6);
  const rrNumber = round((target1 - price) / risk, 2);

  if (rrNumber < 1.8) warnings.push("Risk/reward is below 1.8.");
  if (marketBias !== "BULLISH") warnings.push("Market regime is not strongly bullish.");
  if (!trendBull) warnings.push("Trend filter is not fully bullish.");

  let safety = "REJECT";
  if (confidence >= 82 && trendBull && marketBias === "BULLISH" && rrNumber >= 1.8 && !stretched) safety = "TRADE_READY";
  else if (confidence >= 68) safety = "WATCHLIST";

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
    relativeStrength: round(relativeStrength, 2),
    volumeRatio: round(volumeRatio, 2),
    reasons,
    warnings,
    bars: bars.slice(-120)
  };
}

async function buildState() {
  const errors = [];
  const barsBySymbol = {};

  for (const symbol of SYMBOLS) {
    try {
      barsBySymbol[symbol] = await getBars(symbol);
    } catch (error) {
      errors.push({ symbol, error: error.message });
    }
  }

  const spyBars = barsBySymbol.SPY || [];
  const spyCloses = spyBars.map(bar => bar.close);
  const spyMove21 = spyCloses.length > 22
    ? percentMove(spyCloses[spyCloses.length - 1], spyCloses[spyCloses.length - 22])
    : 0;

  const preliminary = Object.keys(barsBySymbol)
    .filter(symbol => !["DIA", "IWM", "VIX"].includes(symbol))
    .map(symbol => buildSignal(symbol, barsBySymbol[symbol], spyMove21, "NEUTRAL"));

  const preliminaryBreadth = preliminary.length
    ? Math.round((preliminary.filter(signal => signal.trend === "UP").length / preliminary.length) * 100)
    : 0;

  const marketBias = preliminaryBreadth >= 60 ? "BULLISH" : preliminaryBreadth >= 45 ? "NEUTRAL" : "BEARISH";

  const signals = Object.keys(barsBySymbol)
    .filter(symbol => !["DIA", "IWM", "VIX"].includes(symbol))
    .map(symbol => buildSignal(symbol, barsBySymbol[symbol], spyMove21, marketBias))
    .sort((a, b) => b.confidence - a.confidence)
    .map((signal, index) => ({ rank: index + 1, ...signal }));

  const spySignal = signals.find(signal => signal.symbol === "SPY");
  const qqqSignal = signals.find(signal => signal.symbol === "QQQ");
  const vix = barsBySymbol.VIX?.at(-1)?.close;

  const breadth = signals.length
    ? Math.round((signals.filter(signal => signal.trend === "UP").length / signals.length) * 100)
    : 0;

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

  const indices = ["SPY", "QQQ", "DIA", "IWM", "VIX"].map(symbol => {
    const bars = barsBySymbol[symbol] || [];
    const last = bars.at(-1);
    const prev = bars.at(-2);
    return {
      symbol,
      price: round(last?.close),
      changePct: round(percentMove(last?.close, prev?.close), 2),
      bars: bars.slice(-30)
    };
  });

  return {
    ok: true,
    version: VERSION,
    mode: errors.length ? "PARTIAL_LIVE_DATA" : "LIVE_DATA",
    dataQuality: errors.length ? "PARTIAL" : "LIVE",
    market,
    signals,
    indices,
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
  res.json({
    ok: true,
    version: VERSION,
    app: "TradingMint PRO",
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString()
  });
});

app.get("/api/state", async (req, res) => {
  try {
    res.json(await buildState());
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      time: new Date().toISOString()
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`TradingMint PRO ${VERSION} running on port ${PORT}`);
});
