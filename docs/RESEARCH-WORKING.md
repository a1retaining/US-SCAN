# US investigation working evidence

Final third-round summary (6 November): the second independent audit withheld a pass pending empirical cadence checks, central fill eligibility, schema and browser ownership evidence. Third-round code/market exploration exposed monthly/quarterly data labelled daily. The first experiment was preserved and invalidated. Explicit dates and metadata plus actual-cadence validation now yield 3,024 daily records per symbol. New entries recheck reward/risk at their simulated current fill. Corrected four-scenario experiment and all limitations are recorded in US-DEEP-REVIEW.md. No winning variant was applied. Final snapshot SHA-256: bd0429ac47f8755ad10037891f4e76f236589d264d8e45982cfea71757aa457b.

Current validation: syntax checks and 19 tests pass, zero failures (parent outputs/us-tests-final.txt). Real browser evidence confirms owner tab, competing read-only tab, close/reload transfer, raw export and 167 pending observations with zero mature ten-session outcomes; no console errors. Screenshot: parent outputs/us-learning-preview.png. This fresh local origin does not back up hosted accounts. Final fresh third-round audit requested against the bounded engineering result; external CI follows publication. No deployment or live-money execution occurred.

## Round 1 — baseline and boundaries

Two independent explorers reviewed the active runtime and primary market sources. Verified active runtime: `package.json` starts `src/server.js`; browser `public/index.html` owns the actual day/swing accounts. Older modules and README describe unused training functionality.

Reproduced baseline defects with actual functions in Node VM: unreadable browser accounts reset silently; automatic exit is overwritten by the earlier account snapshot; manual duplicate entry debits cash and replaces its holding; day exits use swing prices; filtered day results omit deteriorating holdings and can stop monitoring them. Original historical simulation filled gap stops at the stop and valued next-session entries on an earlier date. Initial six regression tests pass after partial repairs, but execution monitoring and central entry validation still require work.

Market findings: NYSE regular hours are 09:30–16:00 ET, with explicit holidays and 13:00 half-days. Current weekday-only browser clock omits these. A user in Sydney must still count entries by New York date. Regular-session-only source requests must not imply all venues share identical extended hours. Metadata must distinguish price time from HTTP refresh time. USD/timezone/type checks are necessary but insufficient proof of listing; use official symbol directories. Stooq `.us` alone is unverified listing/type information. Source/adjustment consistency, splits and historical universe survival remain unverified.

Strategy findings: US score rules are preserved, not replaced with ASX thresholds. Live policy and historical proxy differ in SPY regime, ranking, scan-price versus next-open execution, score exits and maximum hold. Current historical simulator must be labelled as a proxy until parity is demonstrated. Relative volume rewards do not establish absolute liquidity or spread/participation limits. Per-symbol closed-trade curves must not be called marked drawdown. Dynamic chronological 60/40 diagnostic comparisons must not claim an untouched test set or statistical significance; a frozen study and later unused prospective period are needed for a strategy claim.

Primary sources:
- NYSE 2026–2028 calendar and venue hours: https://www.nyse.com/trade/hours-calendars
- US DST: https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst
- SEC extended-hours bulletin: https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-42
- Nasdaq symbol definitions: https://www.nasdaqtrader.com/Trader.aspx?id=SymbolDirDefs
- Yahoo delay/provider disclosure: https://help.yahoo.com/kb/SLN2352.html
- Yahoo adjusted close: https://help.yahoo.com/kb/SLN28256.html
- Alpaca feed differences: https://docs.alpaca.markets/us/docs/market-data-faq
- Original multiple-testing/overfit research: https://sdm.lbl.gov/oapapers/ssrn-id2507040-bailey.pdf
- US momentum original follow-up: https://www.nber.org/papers/w7159

Unknowns to retain: live deployment/account contents, actual executable feed latency/SLA, earnings/action event feed, Stooq adjustment contract, historical point-in-time universe, a validated profitable US strategy, current legal applicability at a particular broker. Research on current FINRA changes is pending; don't present the $25,000 simulation balance as a universal current requirement.

Round 1 audit requested before further exploration. No profitability inference is justified.

## Round 1 audit — GAPS

Independent verifier found useful breadth but insufficient traceability and unverified execution, corporate-action, historical-universe, account continuity and empirical validation claims. These are not passes. Keep explicit boundaries, save test evidence/hashes and measure historical proxy behavior without calling it a live strategy proof.

## Round 2 — adverse cases and current rules

Independent code audit reproduced stale-snapshot refusal and correct fee-aware sizing, but identified loose account schema, missing outcome provenance, and namespace-only fallback identity. Audited pre-second-change hashes: src/server.js `1690373FF17083A77259B123FB3AF1E155BE8C6E01D4DE64799189282DC2F4EC`, public/index.html `5359909D3C0C5632F31CD80EED3F7AE1F67527EE98B27D0A2F45F06CBF42EB6C`, lib/backtest.cjs `84E65977EBECBED42F0B31F98C89FED76E4D4ACA99F76C2250D38D4080F7EA31`, public/paper-storage.js `76375A73F55DDA3D8AA72A13C21BE27229D3F0419472E84D168A98AC13D2EAC7`. Command `node --test tests-node/*.test.cjs`: 6 passed, 0 failed on that snapshot. This does not validate later edits.

Implemented next: current Nasdaq exchange-listed directory snapshots and hashes; verified USD/type/symbol metadata; regular-session calendar shared between server/browser; source quote time distinct from refresh; explicit five-minute timestamp gate; rejection of ETF execution pending exposure classification; coarse unoptimized $5/200-completed-daily-bar/$20m average daily turnover research restrictions; all-holdings monitoring and no daily-to-intraday fallback; stale-snapshot/shape corruption protection; simulated slippage captured for new paper trades. These are engineering/research scope choices, not optimized strategy parameters.

Primary regulatory correction: FINRA Notice 26-10 (20 April 2026), effective 4 June 2026, permits implementation through 20 October 2027. Approved rule changes replace the PDT count/$25k provisions, but firms may retain prior provisions during transition. Therefore account presets cannot imply universal broker eligibility. https://www.finra.org/rules-guidance/notices/26-10 and https://syndication.finra.org/content/understanding-new-intraday-margin-requirements . SEC approval: https://www.govinfo.gov/content/pkg/FR-2026-04-17/pdf/2026-07485.pdf .

Most relevant broker-dealer securities settlement moved to T+1 on 28 May 2024; cash-account payment restrictions differ from margin. Current paper cash recycles sales immediately and is explicitly a simplified simulation, not a settlement-aware cash ledger. https://www.sec.gov/newsroom/press-releases/2024-62 and https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/updated-9 .

SEC ETF and stop-order sources establish why listing/type are insufficient exposure classification and planned stops cannot guarantee fills. https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-alerts/sec , https://www.investor.gov/statement-single-stock , https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15 . Event/halts/earnings/action coverage remains unverified and must remain visible. No personal broker/account applicability is inferred.

Live official directory HTTP checks on 6 November returned Nasdaq header with 5,611 lines and other-listed header with 7,669 lines, both with source footer `1106202603:02`. This establishes endpoint availability/format at that time, not historical membership or all security classification.

Validation status: existing six tests pass after current session/data/monitoring edits, but more adverse cases, full browser ownership/recovery and empirical proxy/cost tests are still pending. No live trading, deployment, optimality or profitability claim is made. The later 60/40 view is now labelled exploratory, not untouched.
