const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;
const publicPath = path.join(__dirname, "..", "public");

app.use(express.json({ limit: "1mb" }));

const VERSION = "server-live-yahoo-stooq-fallback-2026-01-12";

const DEFAULT_SYMBOLS = [
  "SPY", "QQQ", "NVDA", "TSLA", "AAPL", "MSFT", "META", "AMD",
  "PLTR", "COST", "LLY", "UNH", "JPM", "AVGO"
];

const DISCOVERY_UNIVERSE = [
  "SPY", "QQQ", "DIA", "IWM", "XLK", "XLF", "XLE", "XLV", "XLY", "XLI", "XLC",
  "AAPL", "MSFT", "NVDA", "META", "GOOGL", "GOOG", "AMZN", "TSLA", "AMD", "AVGO", "NFLX",
  "COST", "LLY", "UNH", "JPM", "V", "MA", "HD", "WMT", "ORCL", "CRM", "ADBE",
  "NOW", "INTC", "QCOM", "MU", "AMAT", "MRVL", "PANW", "CRWD", "DDOG", "NET",
  "PLTR", "SMCI", "ARM", "SNOW", "UBER", "ABNB", "SHOP", "COIN", "HOOD", "SQ",
  "BA", "CAT", "DE", "GE", "RTX", "LMT", "NOC", "FDX", "UPS", "GM", "F",
  "XOM", "CVX", "COP", "SLB", "OXY", "MPC", "PSX",
  "JNJ", "PFE", "MRK", "ABBV", "TMO", "DHR", "ISRG", "VRTX", "REGN",
  "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP",
  "PEP", "KO", "MCD", "SBUX", "NKE", "TGT", "LOW",
  "LIN", "APD", "FCX", "NEM", "AA"
];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

function uniqueSymbols(input) {
  const seen = new Set();

  return String(input || "")
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
}

function average(values) {
  const clean = values.filter(v => Number.isFinite(v));

  if (!clean.length) return null;

  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function sma(values, length) {
  if (!Array.isArray(values) || values.length < length) return null;

  return average(values.slice(values.length - length));
}

function ema(values, length) {
  if (!Array.isArray(values) || values.length < length) return null;

  const k = 2 / (length + 1);
  let result = average(values.slice(0, length));

  for (let i = length; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }

  return result;
}

function rsi(values, length = 14) {
  if (!Array.isArray(values) || values.length < length + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = values.length - length; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcAtr(bars, length = 14) {
  if (!Array.isArray(bars) || bars.length < length + 1) return null;

  const values = [];

  for (let i = bars.length - length; i < bars.length; i++) {
    const current = bars[i];
    const previous = bars[i - 1];

    if (!current || !previous) continue;

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    if (Number.isFinite(tr)) values.push(tr);
  }

  return average(values);
}

function safeDate(timestamp) {
  if (!timestamp) return null;

  const d = new Date(timestamp * 1000);

  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 TradingMintScanner/1.0",
        "Accept": "text/plain, application/json, */*"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error("HTTP " + response.status + " from " + url);
    }

    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function yahooChart(symbol, range = "1y", interval = "1d") {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    "?range=" +
    encodeURIComponent(range) +
    "&interval=" +
    encodeURIComponent(interval);

  const text = await fetchText(url);

  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("Yahoo returned non JSON for " + symbol);
  }

  const result =
    data &&
    data.chart &&
    Array.isArray(data.chart.result) &&
    data.chart.result[0];

  if (!result) {
    const err =
      data &&
      data.chart &&
      data.chart.error &&
      data.chart.error.description;

    throw new Error(err || "No Yahoo chart result for " + symbol);
  }

  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote =
    result.indicators &&
    result.indicators.quote &&
    result.indicators.quote[0];

  const adjclose =
    result.indicators &&
    result.indicators.adjclose &&
    result.indicators.adjclose[0] &&
    result.indicators.adjclose[0].adjclose;

  if (!quote || !timestamps.length) {
    throw new Error("No Yahoo quote data for " + symbol);
  }

  const bars = [];

  for (let i = 0; i < timestamps.length; i++) {
    const open = toNumber(quote.open && quote.open[i]);
    const high = toNumber(quote.high && quote.high[i]);
    const low = toNumber(quote.low && quote.low[i]);
    const closeRaw = toNumber(quote.close && quote.close[i]);
    const closeAdj = toNumber(adjclose && adjclose[i]);
    const close = closeRaw || closeAdj;
    const volume = toNumber(quote.volume && quote.volume[i]);

    if (
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close)
    ) {
      bars.push({
        date: safeDate(timestamps[i]),
        open: round(open, 4),
        high: round(high, 4),
        low: round(low, 4),
        close: round(close, 4),
        volume: volume || 0
      });
    }
  }

  if (bars.length < 35) {
    throw new Error("Yahoo returned too few bars for " + symbol);
  }

  return bars;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let quote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      quote = !quote;
    } else if (ch === "," && !quote) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  out.push(current);

  return out.map(x => x.trim());
}

async function stooqChart(symbol) {
  const stooqSymbol = symbol.toLowerCase().replace("-", ".") + ".us";
  const url = "https://stooq.com/q/d/l/?s=" + encodeURIComponent(stooqSymbol) + "&i=d";

  const text = await fetchText(url);

  const lines = String(text)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 40) {
    throw new Error("Stooq returned too few rows for " + symbol);
  }

  const header = parseCsvLine(lines[0]).map(x => x.toLowerCase());

  const dateIndex = header.indexOf("date");
  const openIndex = header.indexOf("open");
  const highIndex = header.indexOf("high");
  const lowIndex = header.indexOf("low");
  const closeIndex = header.indexOf("close");
  const volumeIndex = header.indexOf("volume");

  if (
    dateIndex < 0 ||
    openIndex < 0 ||
    highIndex < 0 ||
    lowIndex < 0 ||
    closeIndex < 0
  ) {
    throw new Error("Stooq CSV missing columns for " + symbol);
  }

  const bars = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);

    const open = toNumber(row[openIndex]);
    const high = toNumber(row[highIndex]);
    const low = toNumber(row[lowIndex]);
    const close = toNumber(row[closeIndex]);
    const volume = volumeIndex >= 0 ? toNumber(row[volumeIndex]) : 0;

    if (
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close)
    ) {
      bars.push({
        date: row[dateIndex],
        open: round(open, 4),
        high: round(high, 4),
        low: round(low, 4),
        close: round(close, 4),
        volume: volume || 0
      });
    }
  }

  if (bars.length < 35) {
    throw new Error("Stooq parsed too few bars for " + symbol);
  }

  return bars.slice(-260);
}

async function getBars(symbol) {
  const errors = [];

  try {
    const bars = await yahooChart(symbol, "1y", "1d");

    return {
      source: "Yahoo",
      bars
    };
  } catch (error) {
    errors.push("Yahoo: " + error.message);
  }

  try {
    const bars = await stooqChart(symbol);

    return {
      source: "Stooq",
      bars
    };
  } catch (error) {
    errors.push("Stooq: " + error.message);
  }

  throw new Error(errors.join(" | "));
}

function analyzeSymbol(symbol, bars, marketContext, source) {
  const closes = bars.map(b => b.close).filter(Number.isFinite);
  const volumes = bars.map(b => b.volume || 0).filter(Number.isFinite);

  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];

  const price = last.close;
  const previousClose = previous ? previous.close : null;

  const ema10 = ema(closes, 10);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = calcAtr(bars, 14);

  const avgVol20 = sma(volumes, 20);
  const volumeRatio = avgVol20 && last.volume ? last.volume / avgVol20 : null;

  const recent20 = bars.slice(-20);
  const high20 = Math.max(...recent20.map(b => b.high));
  const low20 = Math.min(...recent20.map(b => b.low));

  const support = low20;
  const resistance = high20;

  const changePercent =
    Number.isFinite(previousClose) && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null;

  let score = 0;
  const reasons = [];
  const warnings = [];

  if (ema20 && price > ema20) {
    score += 16;
    reasons.push("Price is above EMA20.");
  } else {
    warnings.push("Price is below EMA20 or EMA20 is unavailable.");
  }

  if (ema50 && price > ema50) {
    score += 15;
    reasons.push("Price is above EMA50.");
  }

  if (ema200 && price > ema200) {
    score += 15;
    reasons.push("Price is above the 200 day trend line.");
  }

  if (ema20 && ema50 && ema20 > ema50) {
    score += 12;
    reasons.push("EMA20 is above EMA50.");
  }

  if (ema50 && ema200 && ema50 > ema200) {
    score += 10;
    reasons.push("EMA50 is above EMA200.");
  }

  if (rsi14 && rsi14 >= 42 && rsi14 <= 70) {
    score += 10;
    reasons.push("RSI is in a usable swing zone.");
  } else if (rsi14 && rsi14 > 72) {
    warnings.push("RSI is hot. Do not chase.");
  }

  if (volumeRatio && volumeRatio >= 1.0) {
    score += 8;
    reasons.push("Volume is near or above recent average.");
  }

  if (resistance && price > resistance * 0.97) {
    score += 7;
    reasons.push("Price is near the recent high area.");
  }

  if (marketContext && marketContext.market === "Bullish") {
    score += 5;
    reasons.push("Market regime is supportive.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const atr = atr14 || price * 0.025;

  const buyZoneHigh = Math.min(price, ema10 || price);
  const buyZoneLow = Math.max(price - atr * 0.9, low20);

  let stop = Math.min(buyZoneLow - atr * 0.45, low20 - atr * 0.15);
  let target1 = price + atr * 2.2;
  let target2 = price + atr * 3.2;

  if (!Number.isFinite(stop) || stop <= 0) stop = price * 0.94;
  if (!Number.isFinite(target1) || target1 <= price) target1 = price * 1.08;
  if (!Number.isFinite(target2) || target2 <= price) target2 = price * 1.12;

  const risk = Math.max(0.01, price - stop);
  const reward = target1 - price;
  const riskReward = reward > 0 ? reward / risk : 0;

  let decision = "WATCH";
  let setup = "Watch";

  const inBuyZone =
    price >= buyZoneLow &&
    price <= buyZoneHigh * 1.006;

  if (
    score >= 82 &&
    riskReward >= 1.4 &&
    inBuyZone &&
    price > (ema20 || 0)
  ) {
    decision = "ENTER_NOW";
    setup = "Entry";
  } else if (score >= 70 && price > (ema20 || 0)) {
    decision = "WAIT_FOR_PULLBACK";
    setup = "Pullback";
  } else if (score >= 62 && resistance && price >= resistance * 0.965) {
    decision = "BREAKOUT_WATCH";
    setup = "Breakout";
  } else {
    decision = "WATCH";
    setup = "Watch";
  }

  const summary =
    decision === "ENTER_NOW"
      ? symbol + " has a strong 24h+ swing setup and is close enough to the buy zone for a paper entry."
      : decision === "WAIT_FOR_PULLBACK"
        ? symbol + " is strong but should not be chased. Wait for price to pull back into the buy zone."
        : decision === "BREAKOUT_WATCH"
          ? symbol + " is near a breakout area. Watch for confirmation before entry."
          : symbol + " is a watchlist candidate only.";

  return {
    symbol,
    decision,
    setup,
    score,
    entryScore: score,
    strengthScore: score,
    rankScore: score,
    price: round(price),
    changePercent: round(changePercent, 2),
    buyZoneLow: round(buyZoneLow),
    buyZoneHigh: round(buyZoneHigh),
    stopLoss: round(stop),
    target1: round(target1),
    target2: round(target2),
    riskReward: round(riskReward, 2),
    expectedHold: "24 hours or more",
    support: round(support),
    resistance: round(resistance),
    summary,
    actionPlan:
      decision === "ENTER_NOW"
        ? "Paper entry allowed only if position size and account limits allow it."
        : "Do not chase. Wait for the scanner to improve or for price to enter the buy zone.",
    reasons,
    warnings,
    source,
    indicators: {
      ema10: round(ema10),
      ema20: round(ema20),
      ema50: round(ema50),
      ema200: round(ema200),
      rsi14: round(rsi14),
      atr14: round(atr14),
      volumeRatio: round(volumeRatio, 2)
    },
    bars
  };
}

async function buildMarketContext() {
  try {
    const result = await getBars("SPY");
    const bars = result.bars;
    const closes = bars.map(b => b.close);

    const price = closes[closes.length - 1];
    const ema20Value = ema(closes, 20);
    const ema50Value = ema(closes, 50);
    const ema200Value = ema(closes, 200);

    const bullish =
      price > ema20Value &&
      price > ema50Value &&
      price > ema200Value &&
      ema20Value > ema50Value;

    return {
      market: bullish ? "Bullish" : "Neutral",
      source: result.source,
      spy: {
        price: round(price),
        ema20: round(ema20Value),
        ema50: round(ema50Value),
        ema200: round(ema200Value)
      }
    };
  } catch (error) {
    return {
      market: "Unknown",
      source: "None",
      error: error.message
    };
  }
}

async function scanSymbols(symbolList, risk) {
  const marketContext = await buildMarketContext();

  const signals = [];
  const errors = [];

  for (const symbol of symbolList) {
    try {
      const result = await getBars(symbol);
      const signal = analyzeSymbol(symbol, result.bars, marketContext, result.source);

      signals.push(signal);
    } catch (error) {
      errors.push({
        symbol,
        error: error.message
      });
    }
  }

  signals.sort((a, b) => {
    return Number(b.rankScore || b.score || 0) - Number(a.rankScore || a.score || 0);
  });

  return {
    ok: true,
    version: VERSION,
    market: marketContext.market,
    marketSource: marketContext.source,
    risk: Number(risk || 100),
    count: signals.length,
    signals,
    errors
  };
}

app.get("/api/health", function(req, res) {
  res.json({
    ok: true,
    version: VERSION,
    service: "TradingMint Pro",
    status: "online",
    apiRoutes: [
      "/api/health",
      "/api/keepalive",
      "/api/scan",
      "/api/discover"
    ],
    discoveryCount: DISCOVERY_UNIVERSE.length,
    time: new Date().toISOString()
  });
});

app.get("/api/keepalive", function(req, res) {
  res.json({
    ok: true,
    version: VERSION,
    time: new Date().toISOString()
  });
});

app.get("/api/scan", async function(req, res) {
  try {
    const symbolsInput = req.query.symbols || DEFAULT_SYMBOLS.join(",");
    const symbols = uniqueSymbols(symbolsInput).slice(0, 40);
    const risk = req.query.risk || 100;

    if (!symbols.length) {
      return res.json({
        ok: true,
        version: VERSION,
        market: "Unknown",
        count: 0,
        signals: [],
        errors: [
          {
            error: "No symbols supplied."
          }
        ]
      });
    }

    const result = await scanSymbols(symbols, risk);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      version: VERSION,
      error: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack
    });
  }
});

app.get("/api/discover", async function(req, res) {
  try {
    const risk = req.query.risk || 100;
    const exclude = new Set(uniqueSymbols(req.query.exclude || ""));
    const scanLimit = Math.max(1, Math.min(200, Number(req.query.scanLimit || 100)));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));

    const symbols = DISCOVERY_UNIVERSE
      .filter(symbol => !exclude.has(symbol))
      .slice(0, scanLimit);

    const result = await scanSymbols(symbols, risk);

    result.discoveryUniverse = DISCOVERY_UNIVERSE.length;
    result.discoveryScanned = symbols.length;
    result.signals = result.signals.slice(0, limit);
    result.count = result.signals.length;

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      version: VERSION,
      error: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack
    });
  }
});

app.use(express.static(publicPath));

app.get("*", function(req, res) {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      version: VERSION,
      error: "API route not found",
      path: req.path
    });
  }

  return res.sendFile(path.join(publicPath, "index.html"));
});

app.listen(PORT, function() {
  console.log("TradingMint Pro server running on port " + PORT);
  console.log("Version: " + VERSION);
});
