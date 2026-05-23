const express = require("express");
const path = require("path");

const { readDb, writeDb, resetDb, addJournal } = require("./storage/db");
const { DEFAULT_SYMBOLS, fetchUniverse, round, percentMove } = require("./data/marketData");
const { scanMarket } = require("./engines/scanner");
const { applyTradeFilters } = require("./engines/filters");
const { enterPaper, exitPaper, updateOpenPositions, paperStats } = require("./engines/paper");
const { runPortfolioBacktest, optimize } = require("./engines/backtest");
const { brokerStatus, placeOrder } = require("./broker/adapter");

const app = express();
const PORT = process.env.PORT || 10000;
const VERSION = "4.0.0-stateful";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

let lastUniverse = null;
let lastUniverseTime = 0;

async function getUniverse(force = false) {
  if (!force && lastUniverse && Date.now() - lastUniverseTime < 180000) return lastUniverse;
  const db = readDb();
  const universe = await fetchUniverse(DEFAULT_SYMBOLS, 70);
  lastUniverse = universe;
  lastUniverseTime = Date.now();

  db.historicalSnapshots.unshift({
    time: new Date().toISOString(),
    symbols: Object.keys(universe.barsBySymbol),
    errorCount: universe.errors.length
  });
  db.historicalSnapshots = db.historicalSnapshots.slice(0, 500);
  writeDb(db);

  return universe;
}

async function buildState(force = false) {
  const db = readDb();
  db.settings.autoPaper = true;
  db.settings.startingCash = 5000;
  if (!Number.isFinite(Number(db.paper.cash))) db.paper.cash = 5000;
  const universe = await getUniverse(force);
  const scanned = scanMarket(universe.barsBySymbol, db.settings);

  let signals = scanned.signals.map(signal => applyTradeFilters(signal, db.settings, {}));
  updateOpenPositions(db, signals);

  if (db.settings.autoPaper) {
    for (const signal of signals.slice(0, 5)) {
      if (signal.safety === "TRADE_READY") enterPaper(db, signal, "auto");
    }
  }

  const stats = paperStats(db);

  const indices = ["SPY", "QQQ", "DIA", "IWM", "VIX"].map(symbol => {
    const bars = universe.barsBySymbol[symbol] || [];
    const last = bars.at(-1);
    const prev = bars.at(-2);
    return {
      symbol,
      price: round(last?.close),
      changePct: round(percentMove(last?.close, prev?.close), 2),
      bars: bars.slice(-30)
    };
  });

  writeDb(db);

  return {
    ok: true,
    version: VERSION,
    mode: universe.errors.length ? "PARTIAL_LIVE_DATA" : "LIVE_DATA",
    dataQuality: universe.errors.length ? "PARTIAL" : "LIVE",
    market: scanned.market,
    signals,
    indices,
    systems: [
      { name: "Data Collector", state: universe.errors.length ? "PARTIAL" : "RUNNING", detail: universe.errors.length ? `${universe.errors.length} symbols failed` : "Live Yahoo chart data" },
      { name: "Persistent Database", state: "RUNNING", detail: "JSON database active" },
      { name: "Paper Trader", state: db.paper.open.length ? "ACTIVE" : "READY", detail: `${db.paper.open.length} open, ${db.paper.closed.length} closed` },
      { name: "Trade Journal", state: "RUNNING", detail: `${db.journal.length} journal records` },
      { name: "Backtest Engine", state: db.backtests.length ? "READY" : "WAITING", detail: `${db.backtests.length} saved backtests` },
      { name: "Strategy Optimizer", state: db.optimizerRuns.length ? "READY" : "WAITING", detail: `${db.optimizerRuns.length} optimizer runs` },
      { name: "Slippage/Spread Model", state: "RUNNING", detail: `${db.settings.slippagePct}% slippage, ${db.settings.spreadPct}% spread` },
      { name: "Earnings/News Filters", state: "PARTIAL", detail: "Earnings/news adapter shells active, live data source not connected" },
      { name: "Broker Adapter", state: "DISABLED", detail: "Safe mode only, no live orders" }
    ],
    paper: db.paper,
    stats,
    alerts: db.alerts,
    journal: db.journal.slice(0, 50),
    backtests: db.backtests.slice(0, 5),
    optimizerRuns: db.optimizerRuns.slice(0, 3),
    broker: brokerStatus(db.settings),
    settings: db.settings,
    errors: universe.errors,
    updatedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime())
  };
}

app.get("/api/health", (req, res) => {
  const db = readDb();
  res.json({
    ok: true,
    version: VERSION,
    app: "TradingMint PRO",
    broker: brokerStatus(db.settings),
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString()
  });
});

app.get("/api/state", async (req, res) => {
  try {
    res.json(await buildState(req.query.force === "1"));
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message, time: new Date().toISOString() });
  }
});

app.post("/api/settings", (req, res) => {
  const db = readDb();
  db.settings = { ...db.settings, ...(req.body || {}), autoPaper: true, startingCash: 5000 };
  addJournal(db, "SETTINGS_UPDATED", "-", "Settings updated", db.settings);
  writeDb(db);
  res.json({ ok: true, settings: db.settings });
});

app.post("/api/paper/enter", async (req, res) => {
  try {
    const db = readDb();
    const state = await buildState(false);
    const symbol = String(req.body.symbol || "").toUpperCase();
    const signal = state.signals.find(item => item.symbol === symbol);
    const result = enterPaper(db, signal, "manual");
    writeDb(db);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/paper/exit", (req, res) => {
  const db = readDb();
  const result = exitPaper(db, req.body.positionId || req.body.symbol, req.body.exitPrice, req.body.reason || "Manual exit");
  writeDb(db);
  res.json(result);
});

app.get("/api/journal", (req, res) => {
  const db = readDb();
  res.json({ ok: true, journal: db.journal });
});

app.post("/api/backtest/run", async (req, res) => {
  try {
    const db = readDb();
    const universe = await getUniverse(req.query.force === "1");
    const result = runPortfolioBacktest(universe.barsBySymbol, {
      ...db.settings,
      ...(req.body || {})
    });
    db.backtests.unshift(result);
    db.backtests = db.backtests.slice(0, 20);
    addJournal(db, "BACKTEST_RUN", "-", "Backtest completed", result.summary);
    writeDb(db);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/optimizer/run", async (req, res) => {
  try {
    const db = readDb();
    const universe = await getUniverse(req.query.force === "1");
    const result = optimize(universe.barsBySymbol, {
      ...db.settings,
      ...(req.body || {})
    });
    db.optimizerRuns.unshift(result);
    db.optimizerRuns = db.optimizerRuns.slice(0, 20);
    addJournal(db, "OPTIMIZER_RUN", "-", "Optimizer completed", result.best?.summary || {});
    writeDb(db);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});


app.post("/api/optimizer/apply", (req, res) => {
  const db = readDb();
  const latest = db.optimizerRuns[0];
  if (!latest || !latest.best || !latest.best.options) {
    return res.status(400).json({ ok: false, error: "No optimizer result available to apply." });
  }

  const options = latest.best.options;
  db.settings.minConfidence = Number(options.minConfidence || db.settings.minConfidence);
  db.settings.minRiskReward = Number(options.minRiskReward || db.settings.minRiskReward);
  db.settings.autoPaper = true;
  addJournal(db, "OPTIMIZER_APPLIED", "-", "Optimizer best settings applied to scanner", db.settings);
  writeDb(db);
  res.json({ ok: true, settings: db.settings, applied: options });
});

app.post("/api/broker/order", (req, res) => {
  res.status(403).json(placeOrder(req.body));
});

app.post("/api/reset", (req, res) => {
  const db = resetDb();
  res.json({ ok: true, db });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`TradingMint PRO ${VERSION} running on port ${PORT}`);
});
