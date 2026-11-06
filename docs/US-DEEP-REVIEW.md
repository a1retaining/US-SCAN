# US scanner: investigation and improvements

Reviewed 6 November 2026. The strongest result is a more dependable US research and paper-trading application. Available evidence does **not** establish an optimal or profitable US strategy.

## Consequential findings

The old Yahoo `range=max&interval=1d` request returned monthly or quarterly history for the test symbols. The app treated those records as daily bars, affecting moving averages, holding periods and future-session learning. Revised requests use explicit bounded dates and verify both provider metadata and actual cadence before caching or analysis. Six live requests each returned 3,024 actual daily records. Today's unfinished daily bar is excluded until the known close plus a 15-minute buffer.

The first experiment used the bad cadence. It was invalidated, preserved and superseded; none of its returns support this report.

Reproduced account defects included automatic sales overwritten by stale snapshots, duplicate manual buys spending cash while replacing holdings, and day positions managed using swing prices. Candidate filters could stop monitoring weakening holdings. These paths now preserve current accounts, reject duplicate/stale writes and monitor held symbols independently of displayed candidates. Unreadable history is retained instead of silently reset.

The historical simulator included future entries in earlier equity and filled opening gaps at planned stops. The replacement processes events chronologically, uses adverse gap fills, checks entry-day stops, charges configured costs and values open holdings. Paper entry rechecks reward/risk at its simulated current fill before spending cash.

## US-specific behaviour

Current listing identity comes from official Nasdaq directories with dated, hashed snapshots. Provider symbol, USD, type and timezone must agree. This is not a historical constituent database or complete exposure classification. ETFs and unclassified products remain watch-only. [Nasdaq definitions](https://www.nasdaqtrader.com/Trader.aspx?id=SymbolDirDefs).

The shared calendar uses New York dates/DST, 09:30–16:00 regular sessions, holidays and 13:00 early closes for 2026–2028. Calendar expiry blocks new entries. It does not detect unscheduled halts or represent every venue's overnight sessions. [NYSE calendars](https://www.nyse.com/trade/hours-calendars), [NIST DST](https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst).

New simulated entries require a regular session and a quote timestamp within five minutes on the correct market date. HTTP refresh time is not quote time. Public-feed delay and executable spreads remain unknown; five minutes is a research gate, not an execution-quality guarantee. Daily fallback cannot masquerade as intraday data. [Yahoo feed disclosure](https://help.yahoo.com/kb/SLN2352.html), [Alpaca feed distinctions](https://docs.alpaca.markets/us/docs/market-data-faq), [SEC extended-hours risks](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-42).

Coarse research restrictions are a $5 feature-price floor, 200 completed daily bars, $20 million average daily turnover and 1% daily-volume participation. They are unoptimized scope choices and do not establish low spreads or safe fills. Stops can gap and do not guarantee execution prices. [SEC stop-order explanation](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15).

The $25,000 preset is simulation money, not broker eligibility. FINRA's new intraday-margin rule became effective 4 June 2026, with implementation permitted through 20 October 2027; older PDT provisions may remain during transition. Check the actual broker. [FINRA Notice 26-10](https://www.finra.org/rules-guidance/notices/26-10).

Most relevant securities transactions moved to T+1 settlement in May 2024. This paper ledger immediately recycles proceeds and does not implement settled-cash, margin or broker buying-power rules. [SEC T+1 notice](https://www.sec.gov/newsroom/press-releases/2024-62), [cash-account bulletin](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/updated-9).

## Corrected empirical study

Fixed examples: AAPL, MSFT, NVDA, JPM and COST; SPY as a price-only reference. Daily window: 27 October 2016–5 November 2026; initial $5,000; zero fixed fees; four prespecified adverse slippage assumptions per side. No winning parameter was selected or applied.

| Slippage per side | Trades | Proxy total return | Marked max drawdown | Mean gross exposure | SPY price-only return |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 basis points | 282 | +43.22% | -4.27% | 10.12% | +239.12% |
| 10 basis points | 274 | +26.29% | -5.07% | 9.63% | +238.69% |
| 25 basis points | 258 | +8.66% | -7.66% | 8.95% | +238.03% |
| 50 basis points | 220 | -14.83% | -18.39% | 7.11% | +236.95% |

Costs change trade eligibility and outcomes. The low-exposure proxy and invested SPY reference are not matched-risk alternatives. Five selected survivors introduce selection/survivorship bias. Dividends are excluded; provider OHLC corporate-action treatment is not independently reconciled. Current listing checks do not establish historical tradability. Final-bar liquidation assumes an available close and can be unrealistic around suspensions/delistings.

The daily proxy differs from live policy in SPY regime, ranking, scan-quote versus next-open entry, score exits, maximum holding period and time-based management. It does not reproduce the newly restricted execution universe. These results diagnose costs and simulator behaviour; they do not validate live policy or forecast returns.

Local evidence is outside this repository, in the parent Stock learner workspace: `outputs/us-research-final/us-proxy-cost-study.json` and its referenced market snapshot. Snapshot SHA-256: `bd0429ac47f8755ad10037891f4e76f236589d264d8e45982cfea71757aa457b`. The first study has a separate `INVALIDATION-FIRST-STUDY.json`. Raw market data and private histories are not published in Git.

## Verification and limits

Nineteen deterministic tests pass, including account integrity, duplicate buys, exit persistence, held-symbol monitoring, New York sessions/holidays, execution gates, chronology, gap fills, costs, cadence rejection and moved-quote reward/risk refusal. Syntax checks cover the active runtime and inline browser scripts. Real browser checks confirmed single-tab ownership, competing-tab read-only behaviour, close/reload ownership transfer, raw export and pending outcomes without console errors. The test used a fresh local origin; it does not establish hosted-account continuity.

Learning preserves first-seen daily observations and evaluates completed future sessions. Its chronological 60/40 comparison purges overlapping outcome windows but remains exploratory as it changes over time. There are no mature ten-session observations in the new collection. Rule scores are not calibrated probabilities. Rules do not automatically tune themselves. Repeated historical searches can overfit. [Original backtest-overfitting research](https://sdm.lbl.gov/oapapers/ssrn-id2507040-bailey.pdf).

Earnings, halts, corporate actions, spread/depth and historical constituents remain unverified. Settlement, taxes, FX, broker margin and real execution are not modelled. Calendar coverage needs maintenance. Verify hosted exports and durable storage before deployment; see [deployment steps](DEPLOYMENT.md).

## Best next stage supported by the evidence

Freeze a documented US policy before collecting new outcomes: universe/classification, entries/exits, timestamps, limits, costs, event exclusions and benchmarks. Make the simulator and paper policy agree. Obtain documented US quote/event data and a point-in-time universe before historical strategy claims. Reserve a later prospective period unused for changes, compare against cash and exposure-matched baselines, and report every attempted variant and cost assumption. No fixed trade count alone certifies an edge. Promote strategy settings only after that evidence; more indicators would not resolve today's uncertainties.
