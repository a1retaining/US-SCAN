const express = require("express");
const path = require("path");
const fs = require("node:fs");
const { createArrayStore } = require("../lib/array-store.cjs");
const learning = require("../lib/learning.cjs");
const usSession = require("../public/market-session.js");
const dataQuality = require("../lib/data-quality.cjs");
const {createWorker,authorized:paperAuthorized}=require("../lib/paper-worker.cjs");
const dataPath = path.resolve(process.env.STOCK_DATA_DIR || path.join(__dirname,"../data"));
const observationStore = createArrayStore(path.join(dataPath,"us-signal-observations.json"), rows => rows.every(row =>
  row && typeof row.id === "string" && typeof row.symbol === "string" && typeof row.strategyVersion === "string" && Number.isFinite(row.score) && row.costModel && row.outcomes));

const app = express();
const PORT = process.env.PORT || 10000;
const publicPath = path.join(__dirname, "..", "public");

app.use(express.json({ limit: "1mb" }));
app.use("/api", (req,res,next) => {res.set("Cache-Control","no-store");next();});

const listingDirectory = require("../lib/us-directory.cjs").createDirectory({fetchText,directoryPath:path.join(dataPath,"listing-snapshots")});

const VERSION = "stock-learner-us-v34-server-paper";

const DEFAULT_SYMBOLS = [
  "SPY", "QQQ", "NVDA", "TSLA", "AAPL", "MSFT", "META", "AMD",
  "PLTR", "COST", "LLY", "UNH", "JPM", "AVGO", "HPE", "UBER",
  "GOOGL", "PANW", "AMAT", "MU", "LRCX", "CAT", "NFLX", "COIN",
  "SMCI", "MSTR", "ARM"
];

const DISCOVERY_UNIVERSE = uniqueArray([
  "SPY", "QQQ", "DIA", "IWM", "VTI", "VOO", "RSP",
  "XLK", "XLF", "XLE", "XLV", "XLY", "XLI", "XLC", "XLP", "XLU", "XLB",
  "SMH", "SOXX", "IBB", "XBI", "ARKK",
  "AAPL", "MSFT", "NVDA", "META", "GOOGL", "GOOG", "AMZN", "TSLA", "AMD", "AVGO", "NFLX",
  "COST", "LLY", "UNH", "JPM", "V", "MA", "HD", "WMT", "ORCL", "CRM", "ADBE",
  "NOW", "INTC", "QCOM", "MU", "AMAT", "LRCX", "KLAC", "MRVL", "PANW", "CRWD",
  "DDOG", "NET", "ZS", "FTNT", "PLTR", "SMCI", "ARM", "SNOW", "UBER", "ABNB",
  "SHOP", "MELI", "COIN", "HOOD", "SQ", "AFRM", "SOFI", "HIMS", "RBLX", "U",
  "HPE", "DELL", "HPQ", "IBM", "ANET", "VRT", "PSTG", "NTNX",
  "MSTR", "MARA", "RIOT", "CLSK", "IREN", "WULF",
  "BA", "CAT", "DE", "GE", "GEV", "RTX", "LMT", "NOC", "GD", "FDX", "UPS",
  "GM", "F", "RIVN", "LCID", "TSM", "ASML", "ON", "NXPI", "ADI", "TXN",
  "XOM", "CVX", "COP", "SLB", "OXY", "MPC", "PSX", "VLO", "EOG", "FANG",
  "KMI", "WMB", "LNG", "HAL", "BKR",
  "JNJ", "PFE", "MRK", "ABBV", "TMO", "DHR", "ISRG", "VRTX", "REGN", "AMGN",
  "GILD", "BMY", "MRNA", "HCA", "CI", "HUM", "ELV", "CVS",
  "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP", "COF", "C", "USB",
  "ICE", "CME", "MCO", "SPGI",
  "PEP", "KO", "MCD", "SBUX", "CMG", "NKE", "TGT", "LOW", "TJX", "LULU",
  "ULTA", "ROST", "DG", "DLTR", "RCL", "CCL", "MAR", "BKNG",
  "LIN", "APD", "SHW", "ECL", "FCX", "NEM", "AA", "NUE", "STLD", "CLF",
  "ALB", "MOS", "CF"
]);

const chartCache = new Map();

function uniqueArray(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const clean = String(value || "").trim().toUpperCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
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

function toNumber(value) {
  if(value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
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
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
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

function safeDate(timestamp, interval) {
  if (!timestamp) return null;
  const d = new Date(timestamp * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const i = String(interval || "");
  if (i.includes("m") || i.includes("h")) return d.toISOString();
  return learning.sessionDate(d);
}

function cacheTtl(interval, range) {
  const i = String(interval || "1d");
  const r = String(range || "");
  if (r === "10y") return 30 * 60 * 1000;
  if (i.includes("m") || i.includes("h")) return 60 * 1000;
  return 4 * 60 * 1000;
}

function getCache(key, ttlMs) {
  const hit = chartCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > ttlMs) {
    chartCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key, value) {
  chartCache.set(key, { time: Date.now(), value });
  if (chartCache.size > 1200) {
    const firstKey = chartCache.keys().next().value;
    chartCache.delete(firstKey);
  }
}

async function fetchText(url, timeoutMs = 16000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 TradingMintScanner/3.1",
        "Accept": "text/plain, application/json, */*"
      }
    });
    const text = await response.text();
    if (!response.ok) throw new Error("HTTP " + response.status + " from " + url);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function yahooChart(symbol, range = "1y", interval = "1d") {
  const urlObject=new URL("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol));
  urlObject.searchParams.set("interval",interval);
  urlObject.searchParams.set("includePrePost","false");
  if(interval==="1d"&&["1y","10y","max"].includes(range)){
    const end=Math.floor(Date.now()/1000);
    urlObject.searchParams.set("period1",String(end-(range==="1y"?366:12*366)*86400));
    urlObject.searchParams.set("period2",String(end));
  }else urlObject.searchParams.set("range",range);
  const url=urlObject.toString();
  const text = await fetchText(url);
  let data;
  try { data = JSON.parse(text); } catch (error) { throw new Error("Yahoo returned non JSON for " + symbol); }
  const result = data && data.chart && Array.isArray(data.chart.result) && data.chart.result[0];
  if (!result) {
    const err = data && data.chart && data.chart.error && data.chart.error.description;
    throw new Error(err || "No Yahoo chart result for " + symbol);
  }
  const meta = result.meta || {};
  if (meta.currency !== "USD" || meta.exchangeTimezoneName !== "America/New_York" ||
      !["EQUITY","ETF"].includes(meta.instrumentType) || String(meta.symbol || "").toUpperCase() !== symbol) {
    const error = new Error("Provider did not verify this symbol as a US stock or ETF in USD");
    error.code = "NON_US_INSTRUMENT"; throw error;
  }
  if(meta.dataGranularity!==interval)throw new Error("Provider granularity "+meta.dataGranularity+" differs from requested interval "+interval);
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  const adjclose = result.indicators && result.indicators.adjclose && result.indicators.adjclose[0] && result.indicators.adjclose[0].adjclose;
  if (!quote || !timestamps.length) throw new Error("No Yahoo quote data for " + symbol);
  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = toNumber(quote.open && quote.open[i]);
    const high = toNumber(quote.high && quote.high[i]);
    const low = toNumber(quote.low && quote.low[i]);
    const closeRaw = toNumber(quote.close && quote.close[i]);
    const closeAdj = toNumber(adjclose && adjclose[i]);
    const close = closeRaw;
    const volume = toNumber(quote.volume && quote.volume[i]);
    if ([open,high,low,close].every(value => Number.isFinite(value) && value > 0) &&
        high >= Math.max(open,close) && low <= Math.min(open,close) && high >= low) {
      bars.push({
        date: safeDate(timestamps[i], interval),
        open: round(open, 4),
        high: round(high, 4),
        low: round(low, 4),
        close: round(close, 4),
        volume: volume || 0
      });
    }
  }
  const minBars = 2;
  if (bars.length < minBars) throw new Error("Yahoo returned too few bars for " + symbol);
  dataQuality.assertCadence(bars,interval);
  bars.requestUrl=url;bars.actualInterval=meta.dataGranularity;bars.retrievedAt=new Date().toISOString();
  bars.instrument = {symbol: meta.symbol,currency:meta.currency,exchange:meta.exchangeName,timeZone:meta.exchangeTimezoneName,type:meta.instrumentType};
  bars.quote = Number.isFinite(meta.regularMarketPrice) && meta.regularMarketTime > 0 ?
    {price:meta.regularMarketPrice,asOf:new Date(meta.regularMarketTime*1000).toISOString(),source:"Yahoo public regular-market quote",delayStatus:"unknown"}:null;
  return bars;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quote = !quote;
    else if (ch === "," && !quote) { out.push(current); current = ""; }
    else current += ch;
  }
  out.push(current);
  return out.map(x => x.trim());
}

async function stooqChart(symbol, limit = 2600) {
  const stooqSymbol = symbol.toLowerCase().replace("-", ".") + ".us";
  const url = "https://stooq.com/q/d/l/?s=" + encodeURIComponent(stooqSymbol) + "&i=d";
  const text = await fetchText(url);
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 40) throw new Error("Stooq returned too few rows for " + symbol);
  const header = parseCsvLine(lines[0]).map(x => x.toLowerCase());
  const dateIndex = header.indexOf("date");
  const openIndex = header.indexOf("open");
  const highIndex = header.indexOf("high");
  const lowIndex = header.indexOf("low");
  const closeIndex = header.indexOf("close");
  const volumeIndex = header.indexOf("volume");
  if (dateIndex < 0 || openIndex < 0 || highIndex < 0 || lowIndex < 0 || closeIndex < 0) throw new Error("Stooq CSV missing columns for " + symbol);
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const open = toNumber(row[openIndex]);
    const high = toNumber(row[highIndex]);
    const low = toNumber(row[lowIndex]);
    const close = toNumber(row[closeIndex]);
    const volume = volumeIndex >= 0 ? toNumber(row[volumeIndex]) : 0;
    if ([open,high,low,close].every(value => Number.isFinite(value) && value > 0) &&
        high >= Math.max(open,close) && low <= Math.min(open,close) && high >= low) {
      bars.push({ date: row[dateIndex], open: round(open, 4), high: round(high, 4), low: round(low, 4), close: round(close, 4), volume: volume || 0 });
    }
  }
  if (bars.length < 35) throw new Error("Stooq parsed too few bars for " + symbol);
  return bars.slice(-limit);
}

async function getBars(symbol, range = "1y", interval = "1d") {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z]{1,6}(?:-[A-Z]{1,2})?$/.test(cleanSymbol)) throw new Error("Only US-listed stock and ETF ticker formats are accepted; use BRK-B for share classes");
  const listing = await listingDirectory.get();
  const identity = listing.items.get(cleanSymbol);
  if(!identity)throw new Error("Symbol is not verified in the current US exchange-listed directory");
  const cleanRange = String(range || "1y");
  const cleanInterval = String(interval || "1d");
  const cacheKey = cleanSymbol + "|" + cleanRange + "|" + cleanInterval;
  const cached = getCache(cacheKey, cacheTtl(cleanInterval, cleanRange));
  if (cached) return cached;
  const errors = [];
  try {
    const bars = await yahooChart(cleanSymbol, cleanRange, cleanInterval);
    if(bars.instrument.type!==identity.type){const error=new Error("US listing and provider instrument types disagree");error.code="NON_US_INSTRUMENT";throw error;}
    const result = { requestUrl:bars.requestUrl,actualInterval:bars.actualInterval,retrievedAt:bars.retrievedAt,source: "Yahoo", symbol: cleanSymbol, currency:"USD",market:"US",instrument:{...bars.instrument,listingVerified:true,directoryHash:listing.hash,directoryRetrievedAt:listing.retrievedAt,directoryType:identity.type,securityName:identity.name,classification:identity.classification,financialStatus:identity.financialStatus},quote:bars.quote,range: cleanRange, interval: cleanInterval, bars };
    setCache(cacheKey, result);
    return result;
  } catch (error) { if(error.code === "NON_US_INSTRUMENT") throw error; errors.push("Yahoo: " + error.message); }
  if (cleanInterval === "1d") {
    try {
      const limit = ["10y","max"].includes(cleanRange) ? 3000 : 260;
      const bars = await stooqChart(cleanSymbol, limit);
      dataQuality.assertCadence(bars,"1d");
      const result = { actualInterval:"1d-cadence-validated",retrievedAt:new Date().toISOString(),source: "Stooq US namespace (daily only)", symbol: cleanSymbol, currency:"USD",market:"US",instrument:{symbol:cleanSymbol,namespace:".us",currency:"USD",timeZone:"America/New_York",listingVerified:true,directoryHash:listing.hash,directoryRetrievedAt:listing.retrievedAt,type:identity.type,securityName:identity.name,classification:identity.classification,financialStatus:identity.financialStatus},quote:null,range: cleanRange, interval: cleanInterval, bars };
      setCache(cacheKey, result);
      return result;
    } catch (error) { errors.push("Stooq: " + error.message); }
  }
  throw new Error(errors.join(" | "));
}

function calcRiskReward(entry, stop, target) {
  entry = Number(entry); stop = Number(stop); target = Number(target);
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) return 0;
  const risk = entry - stop;
  const reward = target - entry;
  if (risk <= 0 || reward <= 0) return 0;
  return reward / risk;
}

function analyzeSymbol(symbol, bars, marketContext = { market: "Unknown" }, source = "unknown") {
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
  const recent10 = bars.slice(-10);
  const high20 = Math.max(...recent20.map(b => b.high));
  const low20 = Math.min(...recent20.map(b => b.low));
  const low10 = Math.min(...recent10.map(b => b.low));
  const support = low20;
  const resistance = high20;
  const changePercent = Number.isFinite(previousClose) && previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : null;
  let score = 0;
  const reasons = [];
  const warnings = [];
  if (ema20 && price > ema20) { score += 16; reasons.push("Price is above EMA20."); } else warnings.push("Price is below EMA20 or EMA20 is unavailable.");
  if (ema50 && price > ema50) { score += 15; reasons.push("Price is above EMA50."); }
  if (ema200 && price > ema200) { score += 15; reasons.push("Price is above the 200 day trend line."); }
  if (ema20 && ema50 && ema20 > ema50) { score += 12; reasons.push("EMA20 is above EMA50."); }
  if (ema50 && ema200 && ema50 > ema200) { score += 10; reasons.push("EMA50 is above EMA200."); }
  if (rsi14 && rsi14 >= 42 && rsi14 <= 70) { score += 10; reasons.push("RSI is in a usable swing zone."); }
  else if (rsi14 && rsi14 > 72) { score += 4; warnings.push("RSI is hot. Do not chase."); }
  else if (rsi14 && rsi14 < 40) warnings.push("RSI is weak.");
  if (volumeRatio && volumeRatio >= 1.2) { score += 8; reasons.push("Volume is above recent average."); }
  else if (volumeRatio && volumeRatio >= 1.0) { score += 5; reasons.push("Volume is near recent average."); }
  if (resistance && price > resistance * 0.97) { score += 7; reasons.push("Price is near the recent high area."); }
  if (changePercent && changePercent > 0) { score += 3; reasons.push("Price is positive versus the prior close."); }
  if (marketContext && marketContext.market === "Bullish") { score += 5; reasons.push("Market regime is supportive."); }
  else if (marketContext && marketContext.market === "Neutral") score += 2;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const atr = atr14 || price * 0.025;
  let buyZoneHigh = Math.min(price * 1.002, Math.max(price - atr * 0.12, ema10 || price - atr * 0.12));
  let buyZoneLow = Math.min(buyZoneHigh, Math.max(price - atr * 0.95, ema20 || price - atr * 0.95));
  if (!Number.isFinite(buyZoneHigh) || buyZoneHigh <= 0) buyZoneHigh = price;
  if (!Number.isFinite(buyZoneLow) || buyZoneLow <= 0) buyZoneLow = price - atr;
  if (buyZoneLow > buyZoneHigh) { const temp = buyZoneLow; buyZoneLow = buyZoneHigh; buyZoneHigh = temp; }
  let stop = Math.min(buyZoneLow - atr * 0.35, low10 - atr * 0.12);
  let target1 = Math.max(resistance + atr * 0.35, price + atr * 2.2);
  let target2 = Math.max(target1 + atr, price + atr * 3.2);
  if (!Number.isFinite(stop) || stop <= 0 || stop >= price) stop = price - atr * 1.8;
  if (!Number.isFinite(target1) || target1 <= price) target1 = price + atr * 2.2;
  if (!Number.isFinite(target2) || target2 <= target1) target2 = price + atr * 3.2;
  const riskReward = calcRiskReward(price, stop, target1);
  const inBuyZone = price >= buyZoneLow && price <= buyZoneHigh * 1.008;
  const distanceToZone = price > buyZoneHigh ? ((price - buyZoneHigh) / buyZoneHigh) * 100 : price < buyZoneLow ? -((buyZoneLow - price) / buyZoneLow) * 100 : 0;
  let decision = "WATCH";
  let setup = "Watch";
  if (score >= 82 && riskReward >= 1.4 && inBuyZone && price > (ema20 || 0)) { decision = "ENTER_NOW"; setup = "Entry"; }
  else if (score >= 70 && price > (ema20 || 0)) { decision = "WAIT_FOR_PULLBACK"; setup = "Pullback"; }
  else if (score >= 62 && resistance && price >= resistance * 0.965) { decision = "BREAKOUT_WATCH"; setup = "Breakout"; }
  const trigger = Math.max(price, buyZoneHigh);
  const tightStop = Math.min(low10, price - atr * 0.75);
  const dayTarget = Math.max(price * 1.006, price + atr * 0.85);
  const dayRiskReward = calcRiskReward(price, tightStop, dayTarget);
  const summary = decision === "ENTER_NOW" ? symbol + " has a strong 24H+ swing setup and is close enough to the buy zone for a paper entry." :
    decision === "WAIT_FOR_PULLBACK" ? symbol + " is strong but should not be chased. Wait for price to pull back into the buy zone." :
    decision === "BREAKOUT_WATCH" ? symbol + " is near a breakout area. Watch for confirmation before entry." : symbol + " is a watchlist candidate only.";
  return {
    symbol, decision, setup, score, entryScore: score, strengthScore: score, rankScore: score,
    price: round(price), priceAsOf:last.date, currency:"USD", market:"US", changePercent: round(changePercent, 2), buyZoneLow: round(buyZoneLow), buyZoneHigh: round(buyZoneHigh),
    stopLoss: round(stop), target1: round(target1), target2: round(target2), riskReward: round(riskReward, 2),
    expectedHold: "24 hours or more", support: round(support), resistance: round(resistance), trigger: round(trigger),
    tightStop: round(tightStop), dayTarget: round(dayTarget), dayRiskReward: round(dayRiskReward, 2), distanceToBuyZonePct: round(distanceToZone, 2),
    summary, actionPlan: decision === "ENTER_NOW" ? "24H+ swing paper entry allowed only if position size and account limits allow it." : "Do not chase. Wait for the scanner to improve or for price to enter the buy zone.",
    reasons, warnings, source,
    indicators: { ema10: round(ema10), ema20: round(ema20), ema50: round(ema50), ema200: round(ema200), rsi14: round(rsi14), atr14: round(atr14), volumeRatio: round(volumeRatio, 2) },
    bars
  };
}

function swingEntryTier(signal) {
  const score = Number(signal.score || 0);
  const rr = Number(signal.riskReward || 0);
  const distance = Number(signal.distanceToBuyZonePct || 0);
  const near = Number.isFinite(distance) && distance <= 1.5 && distance >= -3;
  if (score >= 85 && rr >= 1.5) return "Tier 1";
  if (score >= 75 && rr >= 1.8) return "Tier 2";
  if (score >= 65 && rr >= 2.2 && near) return "Tier 3";
  return "";
}

function analyzeIntradaySymbol(symbol, bars, source) {
  const closes = bars.map(b => b.close).filter(Number.isFinite);
  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const price = last.close;
  const previousClose = previous ? previous.close : null;
  const ema8 = ema(closes, 8);
  const ema21 = ema(closes, 21);
  const rsi14 = rsi(closes, 14);
  const atr14 = calcAtr(bars, 14) || price * 0.006;
  const recent = bars.slice(-12);
  const recentHigh = Math.max(...recent.map(b => b.high));
  const recentLow = Math.min(...recent.map(b => b.low));
  const changePercent = Number.isFinite(previousClose) && previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : null;
  let score = 0;
  const reasons = [];
  const warnings = [];
  if (ema8 && price > ema8) { score += 25; reasons.push("Price is above short EMA."); }
  if (ema8 && ema21 && ema8 > ema21) { score += 20; reasons.push("Short EMA is above medium EMA."); }
  if (rsi14 && rsi14 >= 50 && rsi14 <= 75) { score += 18; reasons.push("RSI supports intraday momentum."); }
  else if (rsi14 && rsi14 > 78) { score += 5; warnings.push("Intraday RSI is hot."); }
  if (price >= recentHigh * 0.995) { score += 20; reasons.push("Price is near intraday breakout area."); }
  if (changePercent && changePercent > 0) { score += 10; reasons.push("Price is moving up this interval."); }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const trigger = Math.max(price, recentHigh);
  const tightStop = Math.min(recentLow, price - atr14 * 0.85);
  const dayTarget = Math.max(price + atr14 * 1.5, trigger + atr14 * 1.1);
  const dayRiskReward = calcRiskReward(price, tightStop, dayTarget);
  const decision = score >= 70 && dayRiskReward >= 1.3 ? "DAY_PAPER_WATCH" : "DAY_WATCH";
  return {
    symbol, decision, setup: "Intraday Momentum", score, entryScore: score, strengthScore: score, rankScore: score,
    price: round(price), priceAsOf:last.date, currency:"USD", market:"US", changePercent: round(changePercent, 2), trigger: round(trigger), tightStop: round(tightStop), stopLoss: round(tightStop),
    dayTarget: round(dayTarget), target1: round(dayTarget), riskReward: round(dayRiskReward, 2), dayRiskReward: round(dayRiskReward, 2),
    summary: decision === "DAY_PAPER_WATCH" ? symbol + " has intraday momentum characteristics for day paper testing." : symbol + " is an intraday watch only.",
    actionPlan: "Day paper test only. Use $25K paper account rules, tight stop, target, max hold, and no averaging down.", reasons, warnings, source, bars
  };
}

async function buildMarketContext() {
  try {
    const result = await getBars("SPY", "1y", "1d");
    const bars = dataQuality.completedDaily(result.bars);
    const closes = bars.map(b => b.close);
    const price = closes[closes.length - 1];
    const ema20Value = ema(closes, 20);
    const ema50Value = ema(closes, 50);
    const ema200Value = ema(closes, 200);
    const bullish = price > ema20Value && price > ema50Value && price > ema200Value && ema20Value > ema50Value;
    return { market: bullish ? "Bullish" : "Neutral", source: result.source, spy: { price: round(price), ema20: round(ema20Value), ema50: round(ema50Value), ema200: round(ema200Value) } };
  } catch (error) { return { market: "Unknown", source: "None", error: error.message }; }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  const count = Math.min(limit, items.length);
  const workers = [];
  for (let i = 0; i < count; i++) workers.push(run());
  await Promise.all(workers);
  return results;
}

const RESEARCH_POLICY = {id:"US-regular-paper-v2",minPrice:5,minAverageDollarVolume20:20000000,maxQuoteAgeMs:300000,maxParticipationPct:1,slippageBps:10,commissionPerSide:0};
function attachExecutionPolicy(signal,result,mode,now=new Date().toISOString()){
  const session=usSession.at(now),quote=result.quote;
  const complete=(result.liquidityBars||result.bars).filter(bar=>bar.date.slice(0,10)<session.sessionDate);
  const dollarVolume=average(complete.slice(-20).map(bar=>bar.close*bar.volume));
  const volume=average(complete.slice(-20).map(bar=>bar.volume));
  const age=quote?Date.parse(now)-Date.parse(quote.asOf):Infinity;
  const fresh=!!quote&&Number.isFinite(age)&&age>=0&&age<=RESEARCH_POLICY.maxQuoteAgeMs&&learning.sessionDate(quote.asOf)===session.sessionDate;
  const reasons=[];
  if(!result.instrument?.listingVerified)reasons.push("US listing is unverified");
  if(!session.regularOpen)reasons.push("Outside this strategy's regular-session schedule");
  if(!fresh)reasons.push("No verified market timestamp within five minutes");
  if(mode==="day"&&!/[mh]/.test(result.interval||""))reasons.push("Intraday source is unavailable");
  if(complete.length<200)reasons.push("Fewer than 200 completed daily sessions");
  if(!(signal.price>=RESEARCH_POLICY.minPrice))reasons.push("Below the unoptimized $5 research floor");
  if(!(dollarVolume>=RESEARCH_POLICY.minAverageDollarVolume20))reasons.push("Below the unoptimized $20m average daily turnover scope");
  if(result.instrument?.type!=="ETF"&&result.instrument?.classification!=="ordinary-stock-or-ADR")reasons.push("Security exposure is unclassified; watch-only");
  if(result.instrument?.financialStatus&&!["N","unknown"].includes(result.instrument.financialStatus))reasons.push("Listing financial status requires review");
  if(result.instrument?.type==="ETF")reasons.push("ETF exposure classification requires review; watch-only in this stock study");
  signal.currency="USD";signal.market="US";signal.instrument=result.instrument;signal.quote=quote;
  signal.dataProvenance={source:result.source,interval:result.interval,retrievedAt:now,marketAsOf:signal.priceAsOf,
    latestBarComplete:signal.priceAsOf?.slice(0,10)<session.sessionDate,adjustmentPolicy:"provider OHLC only; no adjusted-close substitution; corporate actions unverified",delayStatus:"unknown"};
  signal.execution={eligible:reasons.length===0,reasons,mode,policy:RESEARCH_POLICY,session,
    averageDollarVolume20:dollarVolume,averageVolume20:volume,
    eventRiskChecked:false,haltStatus:"unverified",spreadStatus:"unverified",simulatedOnly:true};
}

async function scanSymbols(symbolList, risk) {
  const startedAt = Date.now();
  const marketContext = await buildMarketContext();
  const signals = [];
  const errors = [];
  const results = await mapLimit(symbolList, 6, async symbol => {
    try {
      const result = await getBars(symbol, "1y", "1d");
      const signal = analyzeSymbol(symbol, dataQuality.completedDaily(result.bars), marketContext, result.source);
      signal.marketRegime = marketContext.market;
      signal.instrument = result.instrument;
      attachExecutionPolicy(signal,result,"swing");
      signal.paperRules = {allowed: signal.decision === "ENTER_NOW" && !!swingEntryTier(signal) && signal.execution.eligible};
      return { ok: true, signal };
    } catch (error) { return { ok: false, symbol, error: error.message }; }
  });
  for (const item of results) {
    if (!item) continue;
    if (item.ok) signals.push(item.signal);
    else errors.push({ symbol: item.symbol, error: item.error });
  }
  signals.sort((a, b) => Number(b.rankScore || b.score || 0) - Number(a.rankScore || a.score || 0));
  recordObservations(signals);
  return { ok: true, version: VERSION, currency:"USD",timeZone:"America/New_York",market: marketContext.market, marketSource: marketContext.source, risk: Number(risk || 100), requested: symbolList.length, count: signals.length, elapsedMs: Date.now() - startedAt, updatedAt: new Date().toISOString(), signals, errors };
}

async function dayScanSymbols(symbolList) {
  const startedAt = Date.now();
  const signals = [];
  const errors = [];
  const results = await mapLimit(symbolList, 6, async symbol => {
    try {
      const result = await getBars(symbol, "1d", "15m");
      const minutes=15;const completed=result.bars.filter(bar=>Date.parse(bar.date)+minutes*60000<=Date.now());
      const signal = analyzeIntradaySymbol(symbol, completed, result.source);
      const daily=await getBars(symbol,"1y","1d");
      attachExecutionPolicy(signal,{...result,liquidityBars:daily.bars},"day");
      return { ok: true, signal };
    } catch (error) { return { ok: false, symbol, error: error.message }; }
  });
  for (const item of results) {
    if (!item) continue;
    if (item.ok) signals.push(item.signal);
    else errors.push({ symbol: item.symbol, error: item.error });
  }
  signals.sort((a, b) => Number(b.dayRiskReward || b.riskReward || 0) * Number(b.score || 0) - Number(a.dayRiskReward || a.riskReward || 0) * Number(a.score || 0));
  return { ok: true, version: VERSION, mode: "day-paper-test", requested: symbolList.length, count: signals.length, elapsedMs: Date.now() - startedAt, updatedAt: new Date().toISOString(), signals, errors };
}

function equityStats(equityCurve, trades) {
  const starting = equityCurve.length ? equityCurve[0].equity : 0;
  const ending = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : starting;
  let peak = starting;
  let maxDrawdownPct = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? ((p.equity - peak) / peak) * 100 : 0;
    if (dd < maxDrawdownPct) maxDrawdownPct = dd;
  }
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const avgHoldDays = trades.length ? trades.reduce((s, t) => s + Number(t.holdDays || 0), 0) / trades.length : 0;
  return {
    startingEquity: round(starting), endingEquity: round(ending), netProfit: round(ending - starting), netReturnPct: starting ? round(((ending - starting) / starting) * 100, 2) : 0,
    totalTrades: trades.length, wins: wins.length, losses: losses.length, winRate: trades.length ? round((wins.length / trades.length) * 100, 2) : 0,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null, avgWin: round(avgWin), avgLoss: round(avgLoss),
    maxDrawdownPct: round(maxDrawdownPct, 2), avgHoldDays: round(avgHoldDays, 2)
  };
}

function getBacktestParams(req) {
  const number = (name, fallback, min, max) => {
    const value = Number(req.query[name] ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid backtest parameter: " + name);
    return value;
  };
  const params = {
    accountSize: number("account", 5000, 100, 100000000),
    riskDollars: number("risk", 50, 1, 1000000),
    maxTradePct: number("maxTradePct", 20, 1, 100),
    maxOpenTrades: number("maxOpenTrades", 5, 1, 20),
    maxEntriesPerDay: number("maxEntriesPerDay", 3, 1, 20),
    minHoldDays: number("minHoldDays", 1, 0, 2520),
    maxHoldDays: number("maxHoldDays", 12, 1, 2520),
    years: number("years", 10, 1, 10),
    minTradeValue: number("minTradeValue", 1, 1, 100000000),
    maxTradeValue: number("maxTradeValue", 100000000, 1, 100000000),
    entryBrokerFee: number("entryBrokerFee", 0, 0, 10000),
    exitBrokerFee: number("exitBrokerFee", 0, 0, 10000),
    slippageBps: number("slippageBps", 10, 0, 500)
  };
  if (params.minHoldDays > params.maxHoldDays || params.minTradeValue > params.maxTradeValue) throw new Error("Backtest minimum exceeds maximum");
  for (const key of ["maxOpenTrades", "maxEntriesPerDay", "minHoldDays", "maxHoldDays"]) {
    if (!Number.isInteger(params[key])) throw new Error("Backtest parameter must be an integer: " + key);
  }
  return params;
}

function calculateBacktestPositionSize({ entry, stop, cash, currentEquity, params }) {
  const riskPerShare = Number(entry) - Number(stop) * (1 - (params.slippageBps || 0) / 10000);

  if (!Number.isFinite(entry) || entry <= 0) return null;
  if (!Number.isFinite(stop) || stop <= 0 || stop >= entry) return null;
  if (!Number.isFinite(riskPerShare) || riskPerShare <= 0) return null;

  const cashAfterEntryBrokerage = cash - params.entryBrokerFee;
  if (cashAfterEntryBrokerage <= 0) return null;

  const maxByRule = params.maxTradeValue;
  const maxByEquityPct = currentEquity * (params.maxTradePct / 100);
  const maxByCash = cashAfterEntryBrokerage;

  const maxAllowedTradeValue = Math.min(maxByRule, maxByEquityPct, maxByCash);
  const minRequiredTradeValue = params.minTradeValue;

  if (maxAllowedTradeValue < minRequiredTradeValue) return null;

  const minSharesByValue = Math.ceil(minRequiredTradeValue / entry);
  const maxSharesByValue = Math.floor(maxAllowedTradeValue / entry);
  const maxSharesByRisk = Math.floor(Math.max(0, params.riskDollars - params.entryBrokerFee - params.exitBrokerFee) / riskPerShare);

  const shares = Math.max(0, Math.min(maxSharesByValue, maxSharesByRisk));

  if (shares < minSharesByValue) return null;

  const tradeValue = shares * entry;

  if (tradeValue < params.minTradeValue) return null;
  if (tradeValue > params.maxTradeValue) return null;
  if (tradeValue + params.entryBrokerFee > cash) return null;

  return {
    shares,
    tradeValue,
    entryBrokerFee: params.entryBrokerFee,
    estimatedExitBrokerFee: params.exitBrokerFee,
    cashCommitted: tradeValue + params.entryBrokerFee,
    grossRisk: riskPerShare * shares,
    riskAfterFees: riskPerShare * shares + params.entryBrokerFee + params.exitBrokerFee
  };
}

function recordObservations(signals, observedAt = new Date().toISOString()) {
  if (!signals.length) return 0;
  return observationStore.update(rows => {
    const existing = new Set(rows.map(row => row.id));
    let recorded = 0;
    for (const signal of signals) {
      const item = learning.makeObservation(signal, VERSION, observedAt, {
        budget: 1000, entryFee: 0, exitFee: 0, slippageBps: 10
      });
      if (!item || existing.has(item.id)) continue;
      item.ruleSnapshot = {...RESEARCH_POLICY};
      item.instrument=signal.instrument;item.dataProvenance=signal.dataProvenance;
      rows.push(item);
      existing.add(item.id);
      recorded++;
    }
    return recorded;
  });
}

function learningReport() {
  return learning.buildReport(observationStore.read(), VERSION);
}

let evaluationPromise = null;
async function evaluateObservations(asOf = new Date().toISOString()) {
  if (evaluationPromise) return evaluationPromise;
  evaluationPromise = (async () => {
    const today = learning.sessionDate(asOf);
    const observations = observationStore.read().filter(row => row.strategyVersion === VERSION && !row.outcomes[20] && row.cutoffDate < today);
    const symbols = uniqueArray(observations.map(row => row.symbol));
    const settlements = new Map();
    const errors = [];
    await mapLimit(symbols, 4, async symbol => {
      try {
        const result = await getBars(symbol, "10y", "1d");
        for (const row of observations.filter(row => row.symbol === symbol)) {
          const outcomes=learning.settleObservation(row, result.bars, asOf);
          for(const outcome of Object.values(outcomes))outcome.provenance={source:result.source,interval:result.interval,directoryHash:result.instrument?.directoryHash||null,adjustmentStatus:"unverified",snapshotSha256:require("node:crypto").createHash("sha256").update(JSON.stringify(result.bars)).digest("hex")};
          settlements.set(row.id,outcomes);
        }
      } catch (error) { errors.push({symbol, error: error.message}); }
    });
    if (settlements.size) observationStore.update(rows => {
      for (const row of rows) {
        const updates = settlements.get(row.id);
        if (!updates) continue;
        for (const [horizon, outcome] of Object.entries(updates)) if (!row.outcomes[horizon]) row.outcomes[horizon] = outcome;
      }
    });
    return {...learningReport(), errors, evaluatedAt: asOf};
  })();
  try { return await evaluationPromise; }
  finally { evaluationPromise = null; }
}

async function backtestSymbols(symbolList,params){
  const startedAt=Date.now();
  const results=await mapLimit(symbolList,4,async symbol=>{
    try{const result=await getBars(symbol,"max","1d");return {symbol,source:result.source,bars:dataQuality.completedDaily(result.bars).slice(-(Math.floor(params.years*252)+230))};}
    catch(error){return {symbol,error:error.message};}
  });
  const loaded=results.filter(item=>!item.error),errors=results.filter(item=>item.error);
  params.analysisStartDate=loaded.map(item=>item.bars[Math.max(0,item.bars.length-Math.floor(params.years*252))]?.date).filter(Boolean).sort()[0]||null;
  const simulation=require("../lib/backtest.cjs").simulatePortfolio(loaded,params,{
    analyze:(symbol,bars,context,source)=>{const signal=analyzeSymbol(symbol,bars,context,source);signal.paperRules={allowed:signal.decision==="ENTER_NOW"};return signal;},
    qualifies:swingEntryTier,sizePosition:calculateBacktestPositionSize,minRiskReward:1.3
  });
  const trades=simulation.trades.map(trade=>({...trade,cost:round(trade.cashCommitted),proceeds:round(trade.netProceeds)}));
  const perSymbol=loaded.map(item=>{
    const items=trades.filter(trade=>trade.symbol===item.symbol);
    let value=params.accountSize;
    const curve=[{date:"start",equity:value},...items.map(trade=>({date:trade.exitDate,equity:value+=trade.pnl}))];
    return {symbol:item.symbol,source:item.source,bars:item.bars.length,...equityStats(curve,items)};
  }).sort((a,b)=>b.netProfit-a.netProfit);
  return {ok:loaded.length>0,version:VERSION,market:"US",currency:"USD",timeZone:"America/New_York",mode:"US-daily-historical-proxy-NOT-live-policy-validation",
    params,requested:symbolList.length,loaded:loaded.length,errors,stats:equityStats(simulation.equityCurve,trades),perSymbol,
    trades:trades.slice(-250).reverse(),equityCurve:simulation.equityCurve,skipped:simulation.skipped.slice(-80),updatedAt:new Date().toISOString(),elapsedMs:Date.now()-startedAt,
    notes:["Historical proxy differs from live policy: neutral market, raw-score priority, next-open entries, no score exits, maximum holding period and modelled costs. Per-symbol drawdown uses closed P/L only.","US-listed shares and ETFs, USD, New York session dates. Public data may be delayed.",
      "Signals at session close, entries next session open, gap stops at opening price, same-candle ambiguity assumes stop first.",
      "Brokerage is configurable (default zero, not a broker fee claim); adverse slippage defaults to 10 basis points per side.",
      "Positions close at each symbol's final available date. This assumes an executable exit and does not resolve suspensions or delistings.",
      "Targets wait the configured minimum sessions; entry-day stops remain active. Warm-up data precedes the requested test window.",
      "Neutral market context; no survivorship or complete corporate-action correction. Historical results are not proof of an edge."]};
}

const paperWorker=createWorker({directory:dataPath,adminToken:process.env.PAPER_ADMIN_TOKEN||"",
  scan:held=>scanSymbols(uniqueArray([...DEFAULT_SYMBOLS,...held]),50),
  evaluate:evaluateObservations,entryTier:swingEntryTier});
app.get("/api/paper/status",(req,res)=>{try{res.json({ok:true,...paperWorker.status()});}catch(error){res.status(503).json({ok:false,error:error.message});}});
app.get("/api/paper/export",(req,res)=>{try{res.set("Content-Disposition",'attachment; filename="us-server-paper.json"');res.json(paperWorker.export());}catch(error){res.status(503).json({ok:false,error:error.message});}});
app.post("/api/paper/control",(req,res)=>{
  const token=req.get("X-Paper-Token");
  if(!paperAuthorized(process.env.PAPER_ADMIN_TOKEN||"",token))return res.status(403).json({ok:false,error:"Operator token required"});
  if(typeof req.body.enabled!=="boolean")return res.status(400).json({ok:false,error:"enabled must be true or false"});
  try{
    res.json({ok:true,...paperWorker.control(req.body.enabled,token)});
    if(req.body.enabled)paperWorker.tick().catch(error=>console.error('US paper worker: '+error.message));
  }catch(error){res.status(503).json({ok:false,error:error.message});}
});
app.get("/api/session",(req,res)=>res.json({ok:true,...usSession.at(),policy:RESEARCH_POLICY}));
app.get("/api/learning",(req,res)=>{try{res.json({ok:true,...learningReport()});}catch(error){res.status(503).json({ok:false,error:error.message});}});
app.post("/api/learning/evaluate",async(req,res)=>{try{res.json({ok:true,...await evaluateObservations()});}catch(error){res.status(503).json({ok:false,error:error.message});}});
app.get("/api/learning/export",(req,res)=>{try{res.set("Content-Disposition",'attachment; filename="us-observations.json"');res.json({version:VERSION,exportedAt:new Date().toISOString(),policy:RESEARCH_POLICY,observations:observationStore.read()});}catch(error){res.status(503).json({ok:false,error:error.message});}});

app.get(["/api/health","/health"], function(req, res) {
  res.json({ ok: true, version: VERSION, service: "TradingMint Pro", status: "online", market:"US",currency:"USD",timeZone:"America/New_York",storage:{configuredDirectory:!!process.env.STOCK_DATA_DIR,persistenceVerified:false,paperAccounts:"browser-local; export from each browser"},apiRoutes: ["/api/health", "/api/keepalive", "/api/scan", "/api/discover", "/api/bars", "/api/day-scan", "/api/backtest"], discoveryCount: DISCOVERY_UNIVERSE.length, cacheSize: chartCache.size, time: new Date().toISOString() });
});

app.get("/api/keepalive", function(req, res) { res.json({ ok: true, version: VERSION, time: new Date().toISOString() }); });

app.get("/api/bars", async function(req, res) {
  try {
    const symbol = String(req.query.symbol || "SPY").trim().toUpperCase();
    const range = String(req.query.range || "1y");
    const interval = String(req.query.interval || "1d");
    const result = await getBars(symbol, range, interval);
    res.json({ ok: true, version: VERSION, symbol, range, interval, source: result.source, count: result.bars.length, bars: result.bars, updatedAt: new Date().toISOString() });
  } catch (error) { res.status(500).json({ ok: false, version: VERSION, error: error.message }); }
});

app.get("/api/scan", async function(req, res) {
  try {
    const symbolsInput = req.query.symbols || DEFAULT_SYMBOLS.join(",");
    const symbols = uniqueSymbols(symbolsInput).slice(0, 80);
    const risk = req.query.risk || 100;
    if (!symbols.length) return res.json({ ok: true, version: VERSION, market: "Unknown", count: 0, signals: [], errors: [{ error: "No symbols supplied." }] });
    const result = await scanSymbols(symbols, risk);
    res.json(result);
  } catch (error) { res.status(500).json({ ok: false, version: VERSION, error: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack }); }
});

app.get("/api/discover", async function(req, res) {
  try {
    const risk = req.query.risk || 100;
    const exclude = new Set(uniqueSymbols(req.query.exclude || ""));
    const scanLimit = Math.max(1, Math.min(260, Number(req.query.scanLimit || 140)));
    const limit = Math.max(1, Math.min(80, Number(req.query.limit || 30)));
    const symbols = DISCOVERY_UNIVERSE.filter(symbol => !exclude.has(symbol)).slice(0, scanLimit);
    const result = await scanSymbols(symbols, risk);
    result.discoveryUniverse = DISCOVERY_UNIVERSE.length;
    result.discoveryScanned = symbols.length;
    result.signals = result.signals.slice(0, limit);
    result.count = result.signals.length;
    res.json(result);
  } catch (error) { res.status(500).json({ ok: false, version: VERSION, error: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack }); }
});

app.get("/api/day-scan", async function(req, res) {
  try {
    const symbolsInput = req.query.symbols || DEFAULT_SYMBOLS.join(",");
    const symbols = uniqueSymbols(symbolsInput).slice(0, 80);
    const result = await dayScanSymbols(symbols);
    res.json(result);
  } catch (error) { res.status(500).json({ ok: false, version: VERSION, error: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack }); }
});

app.get("/api/backtest", async function(req, res) {
  try {
    const symbolsInput = req.query.symbols || DEFAULT_SYMBOLS.join(",");
    const symbols = uniqueSymbols(symbolsInput).slice(0, 35);
    const params = getBacktestParams(req);
    const result = await backtestSymbols(symbols, params);
    res.json(result);
  } catch (error) { res.status(500).json({ ok: false, version: VERSION, error: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack }); }
});

app.use(express.static(publicPath));

app.use(function(req, res) {
  if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, version: VERSION, error: "API route not found", path: req.path });
  return res.sendFile(path.join(publicPath, "index.html"));
});

app.listen(PORT,process.env.STOCK_BIND_HOST || "0.0.0.0",function() {
  console.log("TradingMint Pro server running on port " + PORT);
  console.log("Version: " + VERSION);
  paperWorker.start();
});
