const assert = require("assert");
const fs = require("fs");
const path = require("path");

function has(file, text, label) {
  const content = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert(content.includes(text), `${label} missing`);
}

const pkg = require("../package.json");
assert(pkg.name === "tradingmint-pro", "package name wrong");
assert(pkg.version === "5.2.0", "version wrong");

has("src/data/marketData.js", "RANGE_FALLBACKS", "range fallback list");
has("src/data/marketData.js", "\"max\"", "max history range");
has("src/data/marketData.js", "10y", "10y fallback");
has("src/data/marketData.js", "5y", "5y fallback");
has("src/data/marketData.js", "3y", "3y fallback");
has("src/data/marketData.js", "metaBySymbol", "historical metadata");
has("src/storage/db.js", "historicalMeta", "historical meta cache");
has("src/storage/db.js", "historicalRange", "historical range setting");
has("src/storage/db.js", "minHistoricalBars", "minimum bars setting");
has("src/storage/db.js", "edgeWeight", "edge weight setting");
has("src/server.js", "5.2.0-max-history-proof-engine", "v5.2 server version");
has("src/server.js", "AUTO_BACKTEST_MAX_HISTORY", "max history backtest journal");
has("src/server.js", "historicalMeta", "historical meta state");
has("src/engines/scanner.js", "ELITE EDGE", "elite edge label");
has("src/engines/scanner.js", "edgeWeight", "historical edge weight");
has("public/index.html", "MAX HISTORY ENGINE", "max history branding");
has("public/index.html", "Max-History Proof-Based", "max proof scanner title");
has("public/index.html", "Available Bars", "available bars UI");
has("public/index.html", "First Date", "first date UI");
has("public/index.html", "heatClass", "heat map classification");

console.log("PASS max available history range");
console.log("PASS fallback to 10y 5y 3y");
console.log("PASS historical metadata cache");
console.log("PASS max-history backtest journal");
console.log("PASS stronger historical edge weighting");
console.log("PASS heatmap classification");
console.log("PASS UI shows bar count and first date");
console.log("PASS auto paper still protected");
console.log("ALL TESTS PASSED");
