# TradingMint PRO v5.2

This version pushes the historical proof engine harder.

## New in v5.2

- Uses max available Yahoo daily history first.
- Falls back automatically to 10y, 5y, then 3y if max data fails.
- Stores actual metadata per symbol:
  - range used
  - first date
  - last date
  - bar count
- Uses max-history daily backtesting instead of fixed 3 years.
- Tightens historical edge requirements:
  - minimum sample size
  - minimum expectancy R
  - minimum profit factor
- Blends confidence with heavier historical edge weighting.
- Adds stronger heatmap interpretation:
  - confidence
  - grade
  - edge
  - move direction
- Trade detail shows available bars and first date.
- Keeps auto paper ON with $5,000.
- Keeps live broker disabled.

## Why max history?

For real money thinking, 3 years is useful but not enough. Max available history gives more market cycles, including rallies, bear markets, high-rate environments, crashes, recoveries, trend regimes and chop. The system still needs walk-forward testing before live money.

## Render

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```
