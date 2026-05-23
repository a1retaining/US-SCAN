const { applyCosts, canEnter } = require("./risk");
const { addAlert, addJournal } = require("../storage/db");

function enterPaper(db, signal, source = "manual") {
  const check = canEnter(db.paper, signal, db.settings, paperStats(db));
  if (!check.ok) {
    addJournal(db, "ENTRY_REJECTED", signal?.symbol || "-", check.reasons.join(" "), { signal });
    return { ok: false, reasons: check.reasons };
  }

  const entry = applyCosts(signal.entry, "buy", db.settings);
  const shares = check.shares;
  const cost = entry * shares + Number(db.settings.commissionPerTrade || 0);
  if (cost > db.paper.cash) {
    return { ok: false, reasons: ["Not enough paper cash."] };
  }

  const position = {
    id: "POS-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    symbol: signal.symbol,
    setup: signal.setup,
    action: signal.action,
    shares,
    entry: Number(entry.toFixed(4)),
    rawEntry: signal.entry,
    stop: signal.stop,
    target1: signal.target1,
    target2: signal.target2,
    confidence: signal.confidence,
    rrNumber: signal.rrNumber,
    source,
    entryTime: new Date().toISOString(),
    lastPrice: signal.price,
    reasons: signal.reasons,
    warnings: signal.warnings
  };

  db.paper.cash -= cost;
  db.paper.open.push(position);
  addAlert(db, "PAPER_ENTRY", signal.symbol, `${signal.symbol} paper entry`, position);
  addJournal(db, "PAPER_ENTRY", signal.symbol, `${signal.symbol} entered at ${position.entry}`, position);
  return { ok: true, position };
}

function exitPaper(db, positionId, exitPrice, reason = "Manual exit") {
  const index = db.paper.open.findIndex(pos => pos.id === positionId || pos.symbol === positionId);
  if (index === -1) return { ok: false, error: "Position not found." };

  const position = db.paper.open[index];
  const adjustedExit = applyCosts(Number(exitPrice || position.lastPrice || position.entry), "sell", db.settings);
  const proceeds = adjustedExit * position.shares - Number(db.settings.commissionPerTrade || 0);
  const cost = position.entry * position.shares + Number(db.settings.commissionPerTrade || 0);
  const pnl = proceeds - cost;
  const pnlPct = cost ? (pnl / cost) * 100 : 0;

  const closed = {
    ...position,
    exit: Number(adjustedExit.toFixed(4)),
    exitTime: new Date().toISOString(),
    exitReason: reason,
    proceeds: Number(proceeds.toFixed(2)),
    pnl: Number(pnl.toFixed(2)),
    pnlPct: Number(pnlPct.toFixed(2))
  };

  db.paper.open.splice(index, 1);
  db.paper.cash += proceeds;
  db.paper.closed.unshift(closed);
  addAlert(db, "PAPER_EXIT", position.symbol, `${position.symbol} paper exit`, closed);
  addJournal(db, "PAPER_EXIT", position.symbol, `${position.symbol} exited. P/L ${closed.pnl}`, closed);
  return { ok: true, closed };
}

function updateOpenPositions(db, signals) {
  const bySymbol = new Map(signals.map(signal => [signal.symbol, signal]));
  const exits = [];
  for (const position of [...db.paper.open]) {
    const signal = bySymbol.get(position.symbol);
    if (!signal) continue;
    position.lastPrice = signal.price;
    if (signal.price <= position.stop) exits.push(exitPaper(db, position.id, signal.price, "Stop hit"));
    else if (signal.price >= position.target1) exits.push(exitPaper(db, position.id, signal.price, "Target 1 hit"));
    else if (signal.safety === "REJECT") exits.push(exitPaper(db, position.id, signal.price, "Signal rejected"));
  }
  return exits;
}

function paperStats(db) {
  const closed = db.paper.closed || [];
  if (!closed.length) {
    return {
      totalTrades: 0,
      winRate: null,
      expectancy: null,
      profitFactor: null,
      maxDrawdown: null,
      totalReturn: null,
      equityCurve: []
    };
  }

  const wins = closed.filter(t => t.pnl > 0);
  const losses = closed.filter(t => t.pnl <= 0);
  const grossWins = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const totalPnl = closed.reduce((sum, t) => sum + t.pnl, 0);
  const expectancy = totalPnl / closed.length;
  const equityCurve = [];
  let equity = Number(db.settings.startingCash || 5000);
  for (const trade of [...closed].reverse()) {
    equity += Number(trade.pnl || 0);
    equityCurve.push({ time: trade.exitTime, equity: Number(equity.toFixed(2)) });
  }

  let peak = Number(db.settings.startingCash || 5000);
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    const drawdown = peak ? ((peak - point.equity) / peak) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return {
    totalTrades: closed.length,
    winRate: Number(((wins.length / closed.length) * 100).toFixed(1)),
    expectancy: Number(expectancy.toFixed(2)),
    profitFactor: grossLosses ? Number((grossWins / grossLosses).toFixed(2)) : null,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    totalReturn: Number(((totalPnl / Number(db.settings.startingCash || 5000)) * 100).toFixed(2)),
    equityCurve
  };
}

module.exports = { enterPaper, exitPaper, updateOpenPositions, paperStats };
