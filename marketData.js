const { runPortfolioBacktest, summarizeTrades } = require("./backtest");

function splitPeriods(bars, trainBars = 504, testBars = 126, stepBars = 126) {
  const periods = [];
  if (!Array.isArray(bars) || bars.length < trainBars + testBars + 80) return periods;

  for (let start = 0; start + trainBars + testBars <= bars.length; start += stepBars) {
    periods.push({
      trainStart: start,
      trainEnd: start + trainBars,
      testStart: start + trainBars,
      testEnd: start + trainBars + testBars
    });
  }
  return periods;
}

function runWalkForward(barsBySymbol, options = {}) {
  const symbols = Object.keys(barsBySymbol).filter(symbol => !["SPY", "QQQ", "DIA", "IWM", "VIX"].includes(symbol));
  const allTrades = [];
  const folds = [];

  const reference = barsBySymbol.SPY || barsBySymbol[symbols[0]] || [];
  const periods = splitPeriods(reference, options.trainBars || 504, options.testBars || 126, options.stepBars || 126);

  for (const period of periods) {
    const trainSet = {};
    const testSet = {};
    for (const symbol of symbols) {
      const bars = barsBySymbol[symbol] || [];
      if (bars.length >= period.testEnd) {
        trainSet[symbol] = bars.slice(period.trainStart, period.trainEnd);
        testSet[symbol] = bars.slice(period.testStart, period.testEnd);
      }
    }

    const trainResult = runPortfolioBacktest(trainSet, { ...options, lookback: "walk-forward train" });
    const testResult = runPortfolioBacktest(testSet, { ...options, lookback: "walk-forward test" });

    folds.push({
      trainWindow: {
        start: reference[period.trainStart]?.date,
        end: reference[period.trainEnd - 1]?.date
      },
      testWindow: {
        start: reference[period.testStart]?.date,
        end: reference[period.testEnd - 1]?.date
      },
      trainSummary: trainResult.summary,
      testSummary: testResult.summary
    });

    allTrades.push(...testResult.trades);
  }

  const summary = summarizeTrades(allTrades);
  const passed =
    (summary.trades || 0) >= Number(options.minWalkForwardTrades || 20) &&
    (summary.expectancyR || 0) > Number(options.minHistoricalExpectancyR || 0.1) &&
    (summary.profitFactor || 0) >= Number(options.minHistoricalProfitFactor || 1.1);

  return {
    createdAt: new Date().toISOString(),
    method: "walk-forward",
    trainBars: options.trainBars || 504,
    testBars: options.testBars || 126,
    stepBars: options.stepBars || 126,
    folds,
    summary,
    passed,
    guardrail: passed ? "Walk-forward passed." : "Walk-forward failed or sample too small.",
    trades: allTrades.slice(-1000)
  };
}

module.exports = { splitPeriods, runWalkForward };
