const assert = require("assert");
const fs = require("fs");
const path = require("path");

assert(fs.existsSync(path.join(__dirname, "../package.json")), "package.json missing");
assert(fs.existsSync(path.join(__dirname, "../src/server.js")), "server.js missing");
assert(fs.existsSync(path.join(__dirname, "../public/index.html")), "index.html missing");

const pkg = require("../package.json");
assert(pkg.scripts.start === "node src/server.js", "start script incorrect");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
assert(html.includes("TRADING"), "TradingMint branding missing");
assert(html.includes("data-page=\"scanner\""), "clickable scanner page missing");
assert(html.includes("addEventListener(\"click\""), "sidebar click handler missing");

console.log("PASS package json");
console.log("PASS backend server");
console.log("PASS frontend");
console.log("PASS clickable sidebar pages");
console.log("ALL TESTS PASSED");
