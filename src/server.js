const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    status: "running",
    app: "TradingMint Pro",
    time: new Date().toISOString()
  });
});

app.get("/api/scanner", (req, res) => {
  res.json({
    ok: true,
    market: "Bullish",
    signals: [
      {
        symbol: "NVDA",
        setup: "Breakout",
        confidence: 89,
        action: "LONG"
      },
      {
        symbol: "AMD",
        setup: "Pullback",
        confidence: 82,
        action: "LONG"
      },
      {
        symbol: "META",
        setup: "Momentum",
        confidence: 79,
        action: "WATCH"
      }
    ]
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`TradingMint Pro running on port ${PORT}`);
});
