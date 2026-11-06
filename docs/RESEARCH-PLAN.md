# US scanner investigation

Date: 6 November 2026. Core question: what makes this US-listed stock/ETF scanner, its paper accounts and its validation evidence dependable, without pretending that an ASX strategy or attractive backtest proves a US edge?

Minimum exploration rounds: 3, adjusted to this single application. Each round has parallel code/data/market exploration, merged evidence and a fresh independent audit. The user requested autonomous deep investigation and implementation. Save source-backed findings here and the final report under this project's docs.

Dimensions:
1. Active runtime versus stale documentation and unused implementations.
2. US symbol identity, USD, US session dates, regular/extended sessions, holidays and half-days.
3. Daily versus intraday data, freshness, corporate actions, universe/selection bias and failed-provider behaviour.
4. Actual strategy/risk definition, opening gaps, realistic fills/costs, portfolio cash/position chronology and earnings exposure.
5. Browser account integrity, ownership, history export and server observation persistence.
6. Validation: live/backtest differences, independent baselines, chronological partitions, overlap purging, sample sizes and overfitting.
7. Reviewable implementation, deterministic tests, current public-data smoke tests, CI and deployment preservation.

Completion criteria: critical active-code defects reproduced and repaired; market/data claims tied to primary sources; dimensions covered by independent angles; no automatic tuning or live-money execution; clean tests and external CI; explicit unverified items and actionable next stage; final verifier pass after the minimum rounds. A profitable or universally best strategy is outside what the available history can establish. Existing live account data must not be migrated, reset or deployed over without a verified export and storage check.

Initial evidence: the live package entry points to src/server.js, while README describes an older unused training runtime. Current browser accounts already mark positions to stored prices but silently reset unreadable histories; automatic exits can be overwritten by stale snapshots. Both original US and ASX historical simulators used future entries in earlier equity bookkeeping. Current working branch addresses these with separate US thresholds/timezone. Official NYSE 2026–2028 calendar confirms regular sessions, holidays and half-days: https://www.nyse.com/trade/hours-calendars .

Research connection note: the dedicated deep-research connector required OAuth and returned no research result; direct primary-source browsing and independent explorers are used instead. No duplicate billable research retry was made.
