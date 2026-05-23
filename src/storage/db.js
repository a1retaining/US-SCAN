const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../../data/tradingmint-db.json");

const defaultDb = {
  version: 4,
  createdAt: new Date().toISOString(),
  settings: {
    startingCash: 5000,
    autoPaper: true,
    maxOpenPositions: 5,
    maxDailyEntries: 3,
    maxTradePct: 20,
    minConfidence: 82,
    minRiskReward: 1.8,
    slippagePct: 0.05,
    spreadPct: 0.03,
    commissionPerTrade: 0,
    blockUnknownEarnings: false,
    earningsBlockDays: 3,
    brokerMode: "disabled"
  },
  paper: {
    cash: 5000,
    open: [],
    closed: []
  },
  journal: [],
  alerts: [],
  backtests: [],
  optimizerRuns: [],
  historicalSnapshots: []
};

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2));
  }
}

function readDb() {
  ensureDb();
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    return mergeDefaults(parsed);
  } catch (error) {
    const backup = DB_PATH + ".broken-" + Date.now();
    if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, backup);
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2));
    return structuredClone(defaultDb);
  }
}

function mergeDefaults(db) {
  const merged = structuredClone(defaultDb);
  return {
    ...merged,
    ...db,
    settings: { ...merged.settings, ...(db.settings || {}), autoPaper: true, startingCash: 5000 },
    paper: { ...merged.paper, ...(db.paper || {}) },
    journal: Array.isArray(db.journal) ? db.journal : [],
    alerts: Array.isArray(db.alerts) ? db.alerts : [],
    backtests: Array.isArray(db.backtests) ? db.backtests : [],
    optimizerRuns: Array.isArray(db.optimizerRuns) ? db.optimizerRuns : [],
    historicalSnapshots: Array.isArray(db.historicalSnapshots) ? db.historicalSnapshots : []
  };
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  return db;
}

function resetDb() {
  const fresh = structuredClone(defaultDb);
  fresh.createdAt = new Date().toISOString();
  writeDb(fresh);
  return fresh;
}

function addAlert(db, type, symbol, message, details = {}) {
  const alert = {
    id: "ALERT-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    time: new Date().toISOString(),
    type,
    symbol,
    message,
    details
  };
  db.alerts.unshift(alert);
  db.alerts = db.alerts.slice(0, 200);
  return alert;
}

function addJournal(db, eventType, symbol, note, details = {}) {
  const entry = {
    id: "JOURNAL-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    time: new Date().toISOString(),
    eventType,
    symbol,
    note,
    details
  };
  db.journal.unshift(entry);
  db.journal = db.journal.slice(0, 1000);
  return entry;
}

module.exports = { readDb, writeDb, resetDb, addAlert, addJournal, DB_PATH };
