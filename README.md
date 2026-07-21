# TradeAnalyzer

A cross-platform (iOS + Android) **decision-support** app that reads market data
from crypto exchanges, computes technical indicators, and produces advisory
**Buy / Sell / Hold** signals with a confidence score, a written rationale, and
suggested risk levels — plus a backtester so you can measure a strategy on
history before trusting it.

> ⚠️ **Advisory only. Not financial advice.** This app does **not** predict the
> future. No app reliably does. It summarizes what technical indicators say about
> recent price action to help *your* decision-making. Trading is risky and you can
> lose money. Always do your own research and manage risk.

---

## What it is (and isn't)

| It **is** | It **is not** |
|---|---|
| A transparent, indicator-based signal engine | A crystal ball / guaranteed-profit bot |
| A backtesting tool to check strategies honestly | A promise that past results repeat |
| A secure place to connect exchange data | An auto-trader (this phase places **no** orders) |
| Decision support you stay in control of | Financial advice |

## Monorepo layout

```
TradeAnalyzer/
├── shared/     TypeScript domain types shared across the stack
├── backend/    The "brain": candles → indicators → signals + backtest + key vault + REST API
├── mobile/     Expo / React Native app (iOS + Android): Signals, Backtest, Settings
└── docs/       ROADMAP and ARCHITECTURE
```

- **backend/** — Node + TypeScript. Pure-function indicator library (SMA, EMA,
  RSI, MACD, Bollinger, ATR), a weighted-vote **signal engine** with a
  trend-regime filter, a walk-forward **backtester**, an AES-256-GCM **key
  vault**, and an Express API. Fully unit-tested.
- **mobile/** — Expo app with three tabs: **Signals** (watchlist), **Backtest**,
  and **Settings** (backend URL + encrypted API-key management).
- **shared/** — the single source of truth for types like `Signal` and `Candle`.

## Quick start

### 1. Backend (the brain)

```bash
npm install                 # installs all workspaces
npm run build:shared        # build shared types once
cp backend/.env.example backend/.env
npm run dev:backend         # starts on http://localhost:4000
```

By default it runs on **sample data** (no API keys, no network, zero risk). Try:

```bash
curl "http://localhost:4000/api/signal?symbol=BTC/USDT&timeframe=1h"
curl "http://localhost:4000/api/backtest?symbol=ETH/USDT&timeframe=4h&limit=500"
```

Run the test suite:

```bash
npm run test:backend        # 23 unit tests across indicators, signals, backtest, vault
```

**Go live** (public market data — still no keys needed): set
`ENABLE_LIVE_EXCHANGE=true` in `backend/.env` and restart. Bybit and Binance are
wired up; MT5 is a later phase (see `docs/ROADMAP.md`).

**Enable the key vault** (only if you want to store exchange keys):

```bash
# generate a 32-byte master key
openssl rand -hex 32
# put it in backend/.env as VAULT_MASTER_KEY=...
```

### 2. Mobile app

```bash
cd mobile
npm install
npx expo start              # scan the QR with Expo Go, or press i / a for simulators
```

In the app's **Settings** tab, set the backend URL:
- iOS simulator: `http://localhost:4000`
- Android emulator: `http://10.0.2.2:4000`
- Physical phone: `http://<your-computer-LAN-IP>:4000`

## 🔐 Security posture

- **Exchange secret keys never live in the phone app.** They go to the backend,
  encrypted at rest with AES-256-GCM under `VAULT_MASTER_KEY` (which lives only in
  your server environment). The app only ever sees a masked key.
- **Use read-only / trade-only keys with withdrawals DISABLED.** The advisory
  build places no orders and does not need trade permissions.
- `.env`, `data/`, and all key material are gitignored. Never commit secrets.
- This is a pragmatic scaffold, not a hardened secrets manager. For production,
  move to a managed KMS/HSM and per-user encryption.

## How a signal is built

Each indicator casts a **BUY / SELL / HOLD** vote with a weight (0..1) and a
plain-language reason. A **trend-regime filter** down-weights counter-trend
mean-reversion votes (so the tool doesn't scream "buy!" into a crash). Votes are
aggregated into a score in [-1, +1] that maps to the action and a confidence.
**Confidence is indicator agreement — not a probability of profit.** Every signal
shows its full breakdown so nothing is a black box.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for details and what's next.
