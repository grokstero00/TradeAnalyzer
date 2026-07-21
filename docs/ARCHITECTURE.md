# Architecture

```
┌─────────────────────────┐      HTTPS/JSON      ┌───────────────────────────────┐      ccxt      ┌──────────────┐
│  Mobile app (Expo/RN)    │  ◄──────────────►   │  Backend (Node + TypeScript)   │  ◄─────────►   │  Exchanges   │
│                          │                     │                                │                │  Binance     │
│  • Signals watchlist     │                     │  • exchangeService (candles)   │                │  Bybit       │
│  • Backtest              │                     │  • indicators (pure fns)       │                │  (MT5 later) │
│  • Settings + key mgmt   │                     │  • signalEngine (weighted vote)│                └──────────────┘
│                          │                     │  • backtester (walk-forward)   │
│  Never holds secrets     │                     │  • keyVault (AES-256-GCM)      │
└─────────────────────────┘                     │  • Express REST API            │
                                                └───────────────────────────────┘
                        shared/  ── canonical TypeScript types (Signal, Candle, …) ──┘
```

## Data flow for one signal

1. App calls `GET /api/signal?exchange=&symbol=&timeframe=`.
2. `exchangeService.fetchCandles` returns OHLCV — live via **ccxt** when
   `ENABLE_LIVE_EXCHANGE=true`, otherwise deterministic **sample data**.
3. `signalEngine.computeSignal`:
   - computes RSI, SMA-cross, MACD, Bollinger on the closes;
   - each casts a `BUY/SELL/HOLD` vote with a weight and a reason;
   - a **trend-regime filter** down-weights counter-trend oscillator votes;
   - votes aggregate to a score in [-1, +1] → action + confidence;
   - ATR sets an advisory stop-loss / take-profit.
4. The API returns the `Signal` plus `isSample` and a disclaimer.

## Backend modules

| Path | Responsibility |
|---|---|
| `src/indicators/indicators.ts` | Pure, index-aligned indicator math. No I/O. |
| `src/signals/signalEngine.ts` | Combine indicators into an explainable signal. |
| `src/backtest/backtester.ts` | Long-only walk-forward test; win-rate, return, drawdown. |
| `src/exchanges/exchangeService.ts` | ccxt candle fetch with a sample-data fallback. |
| `src/security/keyVault.ts` | AES-256-GCM encrypted storage of API secrets. |
| `src/routes/*.ts` | Express endpoints + zod validation. |
| `src/utils/sampleData.ts` | Reproducible synthetic candles for dev/tests. |

## Design principles

- **Explainable, not magical.** Every signal carries its per-indicator votes and
  reasons. No hidden model output.
- **Pure core.** Indicators and the signal engine are side-effect-free and
  unit-tested, so they're trustworthy and easy to extend.
- **Secrets stay server-side.** The client sees only masked keys; plaintext never
  leaves the vault except to sign an exchange request server-side.
- **Fail safe.** No master key ⇒ no key storage. No live flag ⇒ sample data. A
  failed live fetch ⇒ sample data with a note, never a crash.
- **Types are shared.** `shared/` is the contract between backend and app.

## Running the tests

```bash
npm run test:backend
```

Covers indicator correctness (rising/falling/flat edge cases), signal shape and
trend behavior, backtest invariants (no look-ahead, fee drag), and vault
round-trip + tamper-resistance.
