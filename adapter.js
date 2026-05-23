const { sectorOf } = require("../data/sectorMap");

function returnsFromBars(bars, lookback = 60) {
  const slice = Array.isArray(bars) ? bars.slice(-lookback - 1) : [];
  const returns = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].close;
    const curr = slice[i].close;
    if (Number.isFinite(prev) && Number.isFinite(curr) && prev !== 0) {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 20) return null;
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  const ma = ax.reduce((s, v) => s + v, 0) / n;
  const mb = bx.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = ax[i] - ma;
    const xb = bx[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (!da || !db) return null;
  return num / Math.sqrt(da * db);
}

function correlationToOpen(signal, account, barsBySymbol, threshold = 0.78) {
  const currentReturns = returnsFromBars(barsBySymbol[signal.symbol]);
  const hits = [];
  for (const pos of account.open || []) {
    const corr = correlation(currentReturns, returnsFromBars(barsBySymbol[pos.symbol]));
    if (Number.isFinite(corr) && corr >= threshold) {
      hits.push({ symbol: pos.symbol, correlation: Number(corr.toFixed(2)) });
    }
  }
  return hits;
}

function exposureSummary(account) {
  const bySector = {};
  for (const pos of account.open || []) {
    const sector = sectorOf(pos.symbol);
    bySector[sector] ||= { count: 0, symbols: [] };
    bySector[sector].count += 1;
    bySector[sector].symbols.push(pos.symbol);
  }
  return bySector;
}

function exposureBlocked(signal, account, settings = {}, barsBySymbol = {}) {
  const sector = sectorOf(signal.symbol);
  const maxSector = Number(settings.maxSameSectorOpen || 2);
  const sameSectorCount = (account.open || []).filter(pos => sectorOf(pos.symbol) === sector).length;
  if (sameSectorCount >= maxSector) {
    return { blocked: true, reason: `Sector exposure limit hit for ${sector}.`, sector };
  }

  const maxCorr = Number(settings.maxCorrelation || 0.78);
  const corrHits = correlationToOpen(signal, account, barsBySymbol, maxCorr);
  if (corrHits.length) {
    return { blocked: true, reason: `Correlation limit hit with ${corrHits.map(h => h.symbol + " " + h.correlation).join(", ")}.`, sector, corrHits };
  }

  return { blocked: false, reason: "Exposure clear.", sector };
}

module.exports = { returnsFromBars, correlation, correlationToOpen, exposureSummary, exposureBlocked };
