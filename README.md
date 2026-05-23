# TradingMint PRO Functional

This version fixes the fake-dashboard problem.

## Fixed

- Clocks tick down live.
- Sidebar pages are clickable.
- Live Scanner has a full page view.
- Dashboard scanner rows are clickable.
- Selected trade panel updates from clicked row.
- Equity curve is honest and blank until paper trades exist.
- Win rate is blank until closed paper trades exist.
- Alert count is honest and starts at 0.
- System status shows real application state.
- Backend fetches live Yahoo chart data where available.
- Render-safe package.json.

## Render

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

## Local

```bash
npm install
npm test
npm start
```
