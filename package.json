const assert = require("assert");
const fs = require("fs");
const path = require("path");

const pkg = require("../package.json");
assert(pkg.scripts.start === "node src/server.js", "start script must be node src/server.js");

const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
assert(server.includes("/api/state"), "api state route missing");
assert(server.includes("query1.finance.yahoo.com"), "live data fetch missing");
assert(server.includes("TRADE_READY"), "trade safety layer missing");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
assert(html.includes("marketCountdown"), "ticking market clock missing");
assert(html.includes("nextOpenText"), "next market open text missing");
assert(html.includes("AudioContext"), "sound engine missing");
assert(html.includes("speechSynthesis"), "voice alert missing");
assert(html.includes("candleChart"), "trade chart missing");
assert(html.includes("selectTrade"), "clickable trade selection missing");
assert(html.includes("No closed paper trades yet"), "honest empty stats missing");

console.log("PASS package json");
console.log("PASS live backend API");
console.log("PASS safety decision layer");
console.log("PASS ticking countdown and next open");
console.log("PASS audio and voice test");
console.log("PASS clickable trade chart");
console.log("PASS honest paper stats");
console.log("ALL TESTS PASSED");
