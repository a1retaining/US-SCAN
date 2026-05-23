const { applyCosts } = require("./risk");

function runSignalBacktest(symbol, bars, options = {}) {
  const settings = {
    minConfidence: options.minConfidence || 76,
    minRiskReward: options.minRiskReward || 1.6,
    slippagePct: options.slippagePct ?? 0.05,
    spreadPct: options.spreadPct ?? 0.03,
    holdDays: options.holdDays || 10
  };

  const trades = [];
  if (!Array.isArray(bars) || bars.length < 80) {
    return { symbol, trades: [], summary: emptySummary() };
  }

  for (let i = 60; i < bars.length - settings.holdDays - 1; i++) {
    const recent = bars.slice(0, i + 1);
    const close = recent.at(-1).close;
    const high20 = Math.max(...recent.slice(-20).map(b => b.high));
    const low20 = Math.min(...recent.slice(-20).map(b => b.low));
    const highBreak = close >= high20 * 0.985;
    const trend = close > average(recent.slice(-20).map(b => b.close)) && close > average(recent.slice(-50).map(b => b.close));
    if (!highBreak || !trend) continue;

    const stop = Math.min(low20 * 0.985, close * 0.94);
    const risk = close - stop;
    if (risk <= 0) continue;

    const target = close + risk * 1.8;
    const entry = applyCosts(close, "buy", settings);

    let exit = null;
    let exitReason = "Timed exit";
    for (let j = i + 1; j <= i + settings.holdDays && j < bars.length; j++) {
      if (bars[j].low <= stop) {
        exit = applyCosts(stop, "sell", settings);
        exitReason = "Stop hit";
        break;
      }
      if (bars[j].high >= target) {
        exit = applyCosts(target, "sell", settings);
        exitReason = "Target hit";
        break;
      }
    }
    if (exit === null) exit = applyCosts(bars[Math.min(i + settings.holdDays, bars.length - 1)].close, "sell", settings);

    const pnlR = (exit - entry) / risk;
    trades.push({
      symbol,
      entryDate: bars[i].date,
      exitDate: bars[Math.min(i + settings.holdDays, bars.length - 1)].date,
      entry: Number(entry.toFixed(4)),
      exit: Number(exit.toFixed(4)),
      stop: Number(stop.toFixed(4)),
      target: Number(target.toFixed(4)),
      pnlR: Number(pnlR.toFixed(2)),
      exitReason
    });

    i += Math.max(2, Math.floor(settings.holdDays / 2));
  }

  return { symbol, trades, summary: summarizeTrades(trades) };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function emptySummary() {
  return {
    trades: 0,
    winRate: null,
    expectancyR: null,
    profitFactor: null,
    avgWinR: null,
    avgLossR: null
  };
}

function summarizeTrades(trades) {
  if (!trades.length) return emptySummary();
  const wins = trades.filter(t => t.pnlR > 0);
  const losses = trades.filter(t => t.pnlR <= 0);
  const grossWins = wins.reduce((sum, t) => sum + t.pnlR, 0);
  const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnlR, 0));
  const expectancy = trades.reduce((sum, t) => sum + t.pnlR, 0) / trades.length;
  return {
    trades: trades.length,
    winRate: Number(((wins.length / trades.length) * 100).toFixed(1)),
    expectancyR: Number(expectancy.toFixed(2)),
    profitFactor: grossLosses ? Number((grossWins / grossLosses).toFixed(2)) : null,
    avgWinR: wins.length ? Number((grossWins / wins.length).toFixed(2)) : null,
    avgLossR: losses.length ? Number((-grossLosses / losses.length).toFixed(2)) : null
  };
}

function runPortfolioBacktest(barsBySymbol, options = {}) {
  const results = Object.entries(barsBySymbol)
    .filter(([symbol]) => !["SPY", "QQQ", "DIA", "IWM", "VIX"].includes(symbol))
    .map(([symbol, bars]) => runSignalBacktest(symbol, bars, options));

  const allTrades = results.flatMap(result => result.trades);
  return {
    options,
    createdAt: new Date().toISOString(),
    perSymbol: results,
    summary: summarizeTrades(allTrades),
    trades: allTrades.slice(-500)
  };
}

function optimize(barsBySymbol, baseOptions = {}) {
  const confidenceValues = [70, 76, 82];
  const rrValues = [1.4, 1.6, 1.8];
  const holdValues = [5, 10, 15];
  const runs = [];

  for (const minConfidence of confidenceValues) {
    for (const minRiskReward of rrValues) {
      for (const holdDays of holdValues) {
        const run = runPortfolioBacktest(barsBySymbol, {
          ...baseOptions,
          minConfidence,
          minRiskReward,
          holdDays
        });
        runs.push(run);
      }
    }
  }

  runs.sort((a, b) => {
    const ae = a.summary.expectancyR ?? -999;
    const be = b.summary.expectancyR ?? -999;
    return be - ae || (b.summary.profitFactor ?? 0) - (a.summary.profitFactor ?? 0);
  });

  return {
    createdAt: new Date().toISOString(),
    best: runs[0] || null,
    runs: runs.slice(0, 20)
  };
}

module.exports = { runSignalBacktest, runPortfolioBacktest, optimize, summarizeTrades };
