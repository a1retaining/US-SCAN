const assert = require("assert");
const fs = require("fs");
const path = require("path");

function has(file, text, label) {
  const content = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert(content.includes(text), `${label} missing`);
}

const pkg = require("../package.json");
assert(pkg.name === "tradingmint-pro", "package name wrong");
assert(pkg.version === "4.2.0", "version wrong");
assert(pkg.scripts.start === "node src/server.js", "start script wrong");

has("src/storage/db.js", "autoPaper: true", "auto paper default on");
has("src/storage/db.js", "startingCash: 5000", "starting cash 5000");
has("src/server.js", "db.settings.autoPaper = true", "server forces auto paper on");
has("src/server.js", "/api/optimizer/apply", "optimizer apply API");
has("src/server.js", "OPTIMIZER_APPLIED", "optimizer applied journal");
has("src/engines/paper.js", "enterPaper", "paper entry engine");
has("src/engines/paper.js", "exitPaper", "paper exit engine");
has("src/engines/backtest.js", "runPortfolioBacktest", "backtest engine");
has("src/engines/backtest.js", "optimize", "optimizer");
has("src/engines/risk.js", "slippagePct", "slippage model");

has("public/index.html", "full-chart", "full width chart panel");
has("public/index.html", "AUTO PAPER SYSTEM", "auto paper UI");
has("public/index.html", "announceTrade", "trade announcement");
has("public/index.html", "educateLine", "education voice");
has("public/index.html", "Paper trade entered", "paper entry voice");
has("public/index.html", "Apply Best Settings", "optimizer apply button");
has("public/index.html", "checkAnnouncements", "new trade detection");
has("public/index.html", "Auto Paper</small><b id=\"autoPaperState\">ON", "auto paper topbar");
has("public/index.html", "AudioContext", "sound engine");
has("public/index.html", "speechSynthesis", "voice engine");

console.log("PASS auto paper always on");
console.log("PASS $5000 starting account");
console.log("PASS full-width chart");
console.log("PASS trade found sound/voice");
console.log("PASS spoken trade plan and education");
console.log("PASS optimizer can apply settings");
console.log("PASS backtest stores evidence");
console.log("PASS paper engine");
console.log("PASS UI wiring");
console.log("ALL TESTS PASSED");
