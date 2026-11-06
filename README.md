# Stock learner US scanner

US stock research and browser-local paper trading. The active application is `src/server.js` with `public/index.html`. Older root files and `src/engines` are not the running application. There is no demonstrated self-training edge or live broker execution.

Read [the investigation](docs/US-DEEP-REVIEW.md) for findings, measurements and remaining work, and [deployment and recovery](docs/DEPLOYMENT.md) before updating a hosted copy.

## Run

Use Node 22 or 24:

```sh
npm ci
npm run check
npm test
npm start
```

The default port is 10000. `PORT`, `STOCK_BIND_HOST` and `STOCK_DATA_DIR` override settings. Bind development to `127.0.0.1`; give a hosted instance a persistent private data directory.

Current listing identity, USD, completed-bar cadence and New York regular sessions gate research execution. Calendar coverage is 2026–2028; expiry blocks new entries. Public data delay and spreads remain unknown. ETFs and unclassified products are watch-only.

Browser accounts retain history and reject stale writes. One tab owns writes through Web Locks; other tabs are read-only. Close the owner and reload another tab to claim it. Server learning observations are separate from private browser accounts. Learning is exploratory and does not automatically tune rules.

Historical tests are a daily proxy with chronological accounting, costs and adverse fills; they do not reproduce the whole live policy. `scripts/proxy-study.cjs` runs the fixed-symbol engineering cost experiment; inspect its arguments before running.
