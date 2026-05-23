const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    status: "running",
    app: "TradingMint PRO",
    time: new Date().toISOString()
  });
});

app.get("/api/state", (req, res) => {
  res.json({
    ok: true,
    market: {
      regime: "BULLISH",
      spyTrend: "BULLISH",
      volatility: "LOW",
      breadth: "STRONG",
      sectorLeader: "TECHNOLOGY",
      confidence: 76
    },
    signals: [
      { rank: 1, symbol: "NVDA", setup: "Breakout", confidence: 89, winRate: "63%", expectancy: "1.85R", rr: "2.34:1", trend: "UP", regime: "Bullish", action: "LONG" },
      { rank: 2, symbol: "AVGO", setup: "Breakout", confidence: 86, winRate: "61%", expectancy: "1.72R", rr: "2.18:1", trend: "UP", regime: "Bullish", action: "LONG" },
      { rank: 3, symbol: "AMD", setup: "Pullback", confidence: 82, winRate: "58%", expectancy: "1.48R", rr: "1.92:1", trend: "UP", regime: "Bullish", action: "LONG" },
      { rank: 4, symbol: "META", setup: "Breakout", confidence: 79, winRate: "55%", expectancy: "1.35R", rr: "1.88:1", trend: "UP", regime: "Bullish", action: "LONG" },
      { rank: 5, symbol: "PLTR", setup: "Breakout", confidence: 76, winRate: "57%", expectancy: "1.28R", rr: "1.67:1", trend: "UP", regime: "Bullish", action: "LONG" },
      { rank: 6, symbol: "TSLA", setup: "Pullback", confidence: 72, winRate: "54%", expectancy: "1.19R", rr: "1.58:1", trend: "UP", regime: "Bullish", action: "LONG" },
      { rank: 7, symbol: "CRWD", setup: "Breakout", confidence: 70, winRate: "53%", expectancy: "1.11R", rr: "1.52:1", trend: "NEUTRAL", regime: "Neutral", action: "WATCH" },
      { rank: 8, symbol: "AMZN", setup: "Pullback", confidence: 68, winRate: "52%", expectancy: "1.05R", rr: "1.48:1", trend: "UP", regime: "Bullish", action: "LONG" }
    ],
    systems: [
      "Data Collector",
      "Backtest Engine",
      "Strategy Optimizer",
      "Market Regime Engine",
      "Risk Manager",
      "Alert Engine",
      "Paper Trader",
      "Performance Analytics"
    ],
    updatedAt: new Date().toISOString()
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`TradingMint PRO running on port ${PORT}`);
});
