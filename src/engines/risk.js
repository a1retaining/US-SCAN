function applyCosts(price, side, settings) {
  const slippage = Number(settings.slippagePct || 0) / 100;
  const spread = Number(settings.spreadPct || 0) / 100;
  if (side === "buy") return price * (1 + slippage + spread / 2);
  if (side === "sell") return price * (1 - slippage - spread / 2);
  return price;
}

function positionSize(account, signal, settings) {
  const equity = account.cash + account.open.reduce((sum, pos) => sum + Number(pos.lastPrice || pos.entry) * Number(pos.shares), 0);
  const maxTradeValue = equity * (Number(settings.maxTradePct || 20) / 100);
  const entryCost = applyCosts(signal.entry, "buy", settings);
  const shares = Math.floor(maxTradeValue / entryCost);
  return Math.max(0, shares);
}

function canEnter(account, signal, settings) {
  const reasons = [];
  if (!signal) reasons.push("No signal.");
  if (signal && signal.safety !== "TRADE_READY") reasons.push("Signal is not TRADE_READY.");
  if (signal && Number(signal.confidence) < Number(settings.minConfidence)) reasons.push("Confidence below minimum.");
  if (signal && Number(signal.rrNumber) < Number(settings.minRiskReward)) reasons.push("Risk/reward below minimum.");
  if (account.open.length >= Number(settings.maxOpenPositions)) reasons.push("Max open positions reached.");
  if (account.open.some(pos => pos.symbol === signal.symbol)) reasons.push("Position already open for symbol.");

  const today = new Date().toISOString().slice(0, 10);
  const entriesToday = account.open.filter(pos => String(pos.entryTime || "").startsWith(today)).length +
    account.closed.filter(pos => String(pos.entryTime || "").startsWith(today)).length;
  if (entriesToday >= Number(settings.maxDailyEntries)) reasons.push("Max daily entries reached.");

  const shares = signal ? positionSize(account, signal, settings) : 0;
  if (shares <= 0) reasons.push("Not enough cash for position size.");

  return { ok: reasons.length === 0, reasons, shares };
}

module.exports = { applyCosts, positionSize, canEnter };
