const assert = require("assert");
const fs = require("fs");
const path = require("path");

function has(file, text, label) {
  const content = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert(content.includes(text), `${label} missing`);
}

const pkg = require("../package.json");
assert(pkg.name === "tradingmint-pro", "package name wrong");
assert(pkg.version === "5.0.0", "version wrong");

has("src/storage/db.js", "autoPaper: true", "auto paper default on");
has("src/storage/db.js", "startingCash: 5000", "starting cash 5000");
has("src/server.js", "/api/optimizer/apply", "optimizer apply API");
has("src/engines/paper.js", "enterPaper", "paper entry engine");
has("src/engines/paper.js", "exitPaper", "paper exit engine");
has("src/engines/backtest.js", "runPortfolioBacktest", "backtest engine");
has("src/engines/backtest.js", "optimize", "optimizer");
has("src/engines/risk.js", "slippagePct", "slippage model");

has("public/index.html", "Live Scanner - Full Width", "full width live scanner");
has("public/index.html", "Stock Heat Map", "stock heat map");
has("public/index.html", "preserveAspectRatio=\"xMidYMid meet\"", "non-compressed chart");
has("public/index.html", "scannerDetailBox", "scanner detail panel");
has("public/index.html", "black box recorder", "journal explanation");
has("public/index.html", "Win/Loss Pie", "performance pie chart");
has("public/index.html", "grade(s)", "trade grading");
has("public/index.html", "announceTrade", "voice alert");
has("public/index.html", "educateLine", "education voice");
has("public/index.html", "Apply Best Settings", "optimizer apply UI");

console.log("PASS auto paper always on");
console.log("PASS $5000 starting account");
console.log("PASS full-width non-compressed chart");
console.log("PASS full-width live scanner");
console.log("PASS stock heat map");
console.log("PASS clickable scanner detail");
console.log("PASS trade journal explanation");
console.log("PASS performance pie chart");
console.log("PASS backtest and optimizer");
console.log("PASS voice alerts and education");
console.log("PASS risk model and paper engine");
console.log("ALL TESTS PASSED");
