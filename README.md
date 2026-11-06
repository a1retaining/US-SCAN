# Stock learner US scanner

US stock research and browser-local paper trading. The active application is `src/server.js` with `public/index.html`. Older root files and `src/engines` are not the running application. There is no demonstrated self-training edge or live broker execution.

Read [the investigation](docs/US-DEEP-REVIEW.md) for findings, measurements and remaining work, and [deployment and recovery](docs/DEPLOYMENT.md) before updating a hosted copy.

## Continuous server paper account

The SERVER PAPER panel controls a separate persistent $5,000 simulated swing portfolio. The server keeps scanning without an open browser. Start/pause requires PAPER_ADMIN_TOKEN (at least 24 characters) configured in the host environment and entered in the panel. It is never saved by the page or included in exports. The worker starts paused on first use and resumes a previously enabled account on restart when a valid operator token is configured.

Fixed v1 paper rules: $50 planned stop risk, 20% maximum position value, five holdings, three entries per New York day, 10 basis points adverse slippage per side, no fixed fee. It scans the existing DEFAULT_SYMBOLS plus held symbols every two minutes during the verified regular session. It exits at an observed stop/target quote or weak score after 24 hours. Quote polling misses intermediate prices. This is a distinct policy from browser and historical proxy trading. Learning evaluates completed-session outcomes outside regular hours; it does not tune rules.

Proposals record simulated entry/exit decisions and expire five minutes after their quote timestamp. They can be downloaded for independent manual review. There is no broker connection or order-submission endpoint. The first proposal per symbol/action/day is retained; a later fill keeps its own quote record. All paper closed trades and proposals are retained in the server export; the panel shows at most 100 proposals and 30 closed trades.

Windows: double-click **Start Stock Learner.cmd**, choose a passphrase and open SERVER PAPER in the launched page. This local copy needs the computer running. Use the launcher rather than opening public/index.html directly.

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
