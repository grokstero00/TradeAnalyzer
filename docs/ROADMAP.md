# Roadmap

This scaffold is **Phase 0–1**: a working backend brain + a runnable mobile app,
on sample/public data, advisory-only. Below is the honest path from here to a
product you'd trust with real decisions (and, eventually, real orders).

## Phase 1 — Foundations ✅ (this scaffold)
- [x] Monorepo (shared / backend / mobile)
- [x] Indicator library: SMA, EMA, RSI, MACD, Bollinger, ATR (unit-tested)
- [x] Weighted-vote signal engine with trend-regime filter
- [x] Walk-forward backtester with fees, win-rate, drawdown
- [x] AES-256-GCM API-key vault (encrypted at rest)
- [x] REST API: `/api/candles`, `/api/signal`, `/api/backtest`, `/api/keys`
- [x] Expo app: Signals watchlist, Backtest, Settings
- [x] Live public data via ccxt (Binance, Bybit) behind a flag

## Phase 2 — Real data & charts
- [ ] Candlestick charts in the app (e.g. `react-native-wagmi-charts`) with
      indicator overlays
- [ ] WebSocket live price streaming instead of polling
- [ ] Persist a user-editable watchlist
- [ ] Caching / rate-limit handling for exchange calls

## Phase 3 — Alerts & accounts
- [ ] Push notifications (Expo Notifications) when a signal crosses a threshold
- [ ] User accounts + auth so keys/watchlists are per-user
- [ ] Move the vault to a managed KMS; per-user encryption keys
- [ ] Read account balances/positions (read-only keys)

## Phase 4 — MT5 support
MT5 has **no simple cloud REST API**. Options, roughly in order of effort:
- [ ] A bridge service running the official **MetaTrader5 Python** package on a
      Windows host/VM, exposed to the backend over an internal API
- [ ] A broker that offers a REST/FIX gateway
- [ ] MetaApi (third-party MT5 cloud API) as a managed shortcut
Until then, `exchange: "mt5"` returns sample data with a note.

## Phase 5 — Strategy depth & honesty
- [ ] More indicators (Stochastic, ADX, VWAP, volume profile)
- [ ] Configurable strategies + per-strategy backtests
- [ ] Walk-forward optimization with **out-of-sample** validation to avoid
      curve-fitting
- [ ] Portfolio-level backtesting and position sizing (Kelly / fixed-fractional)
- [ ] Optional ML models — clearly labeled, always backtested, never trusted blindly

## Phase 6 — Execution (high risk, opt-in, much later)
- [ ] Auto-execution behind hard safeguards: explicit opt-in, position/loss caps,
      kill-switch, paper-trading mode first
- [ ] Trade-enabled keys only when the user knowingly enables them
- [ ] Full audit log of every order

## Non-negotiables throughout
- Advisory-first; execution is always opt-in and gated.
- "Not financial advice" stays visible.
- Every signal remains explainable (no black boxes).
- Secrets never touch the client or the repo.
