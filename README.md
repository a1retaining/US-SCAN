# TradingMint PRO v4.2

## Changed from v4.1

- Auto paper trading is always ON.
- Starting paper account is fixed at $5,000.
- Dashboard chart is now full-width across the dashboard.
- Trade-ready setups and paper entries trigger sound/voice after sound is enabled.
- Voice reads:
  - symbol
  - action
  - entry
  - buy zone
  - stop
  - targets
  - confidence
  - risk/reward
  - short education lesson
- Selected trade panel also explains the setup.
- Optimizer can now apply best settings to the scanner through `/api/optimizer/apply`.
- Backtest stores evidence in the database.
- Optimizer stores runs and can update scanner thresholds.
- Auto paper cannot be disabled from settings.

## Sound

Browsers block audio until a click. Press **Enable**, then **Test**.

## Render

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```
