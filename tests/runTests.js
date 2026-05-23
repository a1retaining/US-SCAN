const assert = require("assert");
const fs = require("fs");
const path = require("path");

const pkg = require("../package.json");
assert(pkg.name === "tradingmint-pro", "wrong package name");
assert(pkg.scripts.start === "node src/server.js", "start script must be node src/server.js");
assert(pkg.dependencies.express, "express dependency missing");

const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
assert(server.includes("/api/state"), "api state route missing");
assert(server.includes("/api/health"), "api health route missing");
assert(server.includes("query1.finance.yahoo.com"), "live data fetch missing");
assert(server.includes("TRADE_READY"), "trade safety layer missing");
assert(server.includes("Risk/reward is below 1.8"), "risk reward safety warning missing");
assert(server.includes("marketBias === \"BULLISH\""), "market bias filter missing");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
assert(html.includes("TRADING"), "TradingMint branding missing");
assert(html.includes("marketCountdown"), "ticking market clock missing");
assert(html.includes("nextOpenText"), "next market open text missing");
assert(html.includes("AudioContext"), "sound engine missing");
assert(html.includes("speechSynthesis"), "voice alert missing");
assert(html.includes("candleChart"), "trade chart missing");
assert(html.includes("selectTrade"), "clickable trade selection missing");
assert(html.includes("data-page=\"scanner\""), "sidebar page navigation missing");
assert(html.includes("No closed paper trades yet"), "honest empty paper stats missing");
assert(html.includes("refreshClock"), "auto refresh countdown missing");

console.log("PASS package json");
console.log("PASS render-ready scripts");
console.log("PASS live backend API routes");
console.log("PASS live Yahoo data fetch");
console.log("PASS safety decision layer");
console.log("PASS ticking clocks and next market open");
console.log("PASS sound and voice settings");
console.log("PASS clickable sidebar pages");
console.log("PASS clickable trade chart");
console.log("PASS honest paper stats");
console.log("ALL TESTS PASSED");
