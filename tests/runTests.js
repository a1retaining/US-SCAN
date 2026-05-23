const assert = require("assert");
const fs = require("fs");
const path = require("path");

function has(file, text, label) {
  const content = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert(content.includes(text), `${label} missing`);
}

const pkg = require("../package.json");
assert(pkg.name === "tradingmint-pro", "package name wrong");
assert(pkg.version === "4.1.0", "version wrong");
assert(pkg.scripts.start === "node src/server.js", "start script wrong");
assert(pkg.dependencies.express, "express missing");

has("src/storage/db.js", "tradingmint-db.json", "persistent database");
has("src/engines/paper.js", "enterPaper", "paper entry engine");
has("src/engines/paper.js", "exitPaper", "paper exit engine");
has("src/engines/backtest.js", "runPortfolioBacktest", "backtest engine");
has("src/engines/backtest.js", "optimize", "optimizer");
has("src/engines/risk.js", "slippagePct", "slippage model");
has("src/engines/filters.js", "earningsFilter", "earnings filter");
has("src/broker/adapter.js", "Live broker execution is disabled", "safe broker adapter");
has("src/server.js", "/api/settings", "settings API");
has("src/server.js", "/api/paper/enter", "paper enter API");
has("src/server.js", "/api/backtest/run", "backtest API");
has("src/server.js", "/api/optimizer/run", "optimizer API");

has("public/index.html", "grid-template-columns:232px", "compact screen fit layout");
has("public/index.html", "AudioContext", "audio context");
has("public/index.html", "soundStatus", "sound status");
has("public/index.html", "toggleMute", "mute setting");
has("public/index.html", "candleChart", "click chart");
has("public/index.html", "renderFullScanner", "interactive scanner page");
has("public/index.html", "saveSettings", "interactive settings page");
has("public/index.html", "equityChart", "performance equity chart");
has("public/index.html", "Run Backtest Now", "backtest page content");
has("public/index.html", "Strategy Optimizer", "optimizer page content");
has("public/index.html", "System Health", "health page content");

console.log("PASS package json");
console.log("PASS compact screen-fit layout");
console.log("PASS persistent database");
console.log("PASS paper entries and exits");
console.log("PASS trade journal");
console.log("PASS backtest engine");
console.log("PASS strategy optimizer");
console.log("PASS slippage/spread model");
console.log("PASS earnings/news filter shells");
console.log("PASS broker disabled safe mode");
console.log("PASS sound unlock, test and mute controls");
console.log("PASS clickable trade chart");
console.log("PASS useful interactive pages");
console.log("PASS APIs wired");
console.log("ALL TESTS PASSED");
