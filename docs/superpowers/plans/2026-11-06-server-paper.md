# Continuous US paper research

User accepted the offered scope: server-side simulated trading, learning and proposals for manual review. Existing Express app and US research rules are retained. No broker connection, credentials or real orders are implemented.

Design: a separate $5,000 server paper portfolio persists under STOCK_DATA_DIR; browser accounts are never imported or rewritten. A serial two-minute worker monitors held stocks and scans the configured US watchlist during regular sessions. Existing verified listing, timestamp, liquidity and price gates apply. Fixed risk is $50, maximum position value 20%, five holdings, three entries per New York day, 10 basis points adverse slippage per side. Stops/targets use observed quotes; gaps between polls remain unobserved. Learning evaluates completed future sessions once per market date outside the regular session. Rule changes require a later reviewed release.

The dashboard shows worker state, last successful cycle, stale/missing data, cash, marked equity, holdings, closed paper trades and expiring entry/exit proposals. Proposals have no execution connection. Start/pause requires a deployment-specific PAPER_ADMIN_TOKEN of at least 24 characters, supplied in memory only by the operator. Same-origin writes use a custom header and constant-time token comparison. The worker remains paused without the token. Public deployment/authentication and persistent storage remain a separate setup step.

Implementation sequence:
1. Add failing engine tests for no broker path, disabled/closed sessions, duplicate ticks, risk/cash limits, worsening held stocks, missing/stale quotes, pause races, persistence and corruption.
2. Implement lib/paper-worker.cjs using the existing atomic array store, serialized network cycles, atomic state transitions and bounded display of history/proposals. Preserve the full history on disk/export; future archival must retain evidence. No asynchronous work inside file transactions.
3. Wire server status/export/control routes and worker scheduling. Add API authorization tests. Keep test imports free of background timers.
4. Add a dashboard panel and standalone browser script; include clear file-opening instructions and a Windows local launcher. Test syntax and actual HTTP responses.
5. Document hosted setup and privacy/history boundaries, run all tests, publish reviewable changes and verify CI. Release the shared handover with exact version and next step.

Acceptance: persisted simulated account resumes across restarts; regular session gates and account limits hold; duplicate requests cannot buy twice; stale quotes cannot create fills; corrupt data blocks changes; authorization blocks anonymous writes; browser closure does not own the worker. Reports do not claim validated profitability or automatic strategy improvement. No existing account migration or hosted deployment occurs without continuity checks.
