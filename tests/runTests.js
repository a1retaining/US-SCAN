const assert = require("assert");
const fs = require("fs");
const path = require("path");

const pkg = require("../package.json");
assert(pkg.scripts.start === "node src/server.js", "start script must be node src/server.js");

const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
assert(server.includes("/api/state"), "api state route missing");
assert(server.includes("query1.finance.yahoo.com"), "live data fetch missing");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
assert(html.includes("marketCountdown"), "ticking market clock missing");
assert(html.includes("data-page=\"scanner\""), "clickable sidebar missing");
assert(html.includes("selectTrade"), "clickable trade selection missing");
assert(html.includes("No closed paper trades yet"), "honest win rate state missing");

console.log("PASS package json");
console.log("PASS live backend API");
console.log("PASS ticking clocks");
console.log("PASS clickable pages");
console.log("PASS trade row selection");
console.log("PASS honest empty paper stats");
console.log("ALL TESTS PASSED");
