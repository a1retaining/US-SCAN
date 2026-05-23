const { round, percentMove } = require("../data/marketData");

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
  for (let i = period; i < clean.length; i++) current = clean[i] * k + current * (1 - k);
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

function marketRegimeFromSignals(signals, vix) {
  const breadth = signals.length ? Math.round((signals.filter(signal => signal.trend === "UP").length / signals.length) * 100) : 0;
  const volatility = Number.isFinite(vix) ? (vix < 18 ? "LOW" : vix < 25 ? "MEDIUM" : "HIGH") : "UNKNOWN";
  let regime = "NEUTRAL";
  if (breadth >= 60 && volatility !== "HIGH") regime = "BULLISH";
  if (breadth < 45 || volatility === "HIGH") regime = "BEARISH";
  return { regime, breadth, volatility };
}

function buildSignal(symbol, bars, spyMove21, marketBias, settings = {}) {
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

  if (rrNumber < settings.minRiskReward) warnings.push(`Risk/reward is below ${settings.minRiskReward}.`);
  if (marketBias !== "BULLISH") warnings.push("Market regime is not strongly bullish.");
  if (!trendBull) warnings.push("Trend filter is not fully bullish.");

  let safety = "REJECT";
  if (confidence >= settings.minConfidence && trendBull && marketBias === "BULLISH" && rrNumber >= settings.minRiskReward && !stretched) safety = "TRADE_READY";
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

function scanMarket(barsBySymbol, settings = {}) {
  const spyBars = barsBySymbol.SPY || [];
  const spyCloses = spyBars.map(bar => bar.close);
  const spyMove21 = spyCloses.length > 22
    ? percentMove(spyCloses[spyCloses.length - 1], spyCloses[spyCloses.length - 22])
    : 0;

  const excluded = new Set(["DIA", "IWM", "VIX"]);
  const preliminary = Object.keys(barsBySymbol)
    .filter(symbol => !excluded.has(symbol))
    .map(symbol => buildSignal(symbol, barsBySymbol[symbol], spyMove21, "NEUTRAL", settings));

  const vix = barsBySymbol.VIX?.at(-1)?.close;
  const preRegime = marketRegimeFromSignals(preliminary, vix);

  const signals = Object.keys(barsBySymbol)
    .filter(symbol => !excluded.has(symbol))
    .map(symbol => buildSignal(symbol, barsBySymbol[symbol], spyMove21, preRegime.regime, settings))
    .sort((a, b) => b.confidence - a.confidence)
    .map((signal, index) => ({ rank: index + 1, ...signal }));

  const finalRegime = marketRegimeFromSignals(signals, vix);
  const spySignal = signals.find(signal => signal.symbol === "SPY");
  const qqqSignal = signals.find(signal => signal.symbol === "QQQ");

  const market = {
    regime: finalRegime.regime,
    spyTrend: spySignal?.trend === "UP" ? "BULLISH" : "NEUTRAL",
    qqqTrend: qqqSignal?.trend === "UP" ? "BULLISH" : "NEUTRAL",
    volatility: finalRegime.volatility,
    vix: round(vix),
    breadth: `${finalRegime.breadth}%`,
    breadthScore: finalRegime.breadth,
    sectorLeader: "TECHNOLOGY",
    confidence: Math.round((finalRegime.breadth + (spySignal?.confidence || 50)) / 2)
  };

  return { market, signals };
}

module.exports = { scanMarket, buildSignal, marketRegimeFromSignals, sma, ema, rsi, atr };
