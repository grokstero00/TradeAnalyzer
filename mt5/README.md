# TradeAnalyzer EA (MT5) — XAUUSD day-trading

An Expert Advisor that ports TradeAnalyzer's transparent **weighted-vote signal
engine** (RSI + SMA-cross + MACD + Bollinger, with a trend-regime filter) into
MetaTrader 5 and wraps it in a strict **risk-management** shell. Tuned for
**XAUUSD (gold)**, intraday.

> ⚠️ **Not financial advice.** This places real orders when enabled. It does
> **not** predict the market. Test on a **DEMO** account first. `DryRun` is
> **ON by default** — it computes and logs signals but places no orders until
> you turn it off yourself.

---

## How it decides (same logic as the backend "brain")

Each bar close, four indicators cast a **BUY / SELL / HOLD** vote with a weight:

| Indicator | Role | Notes |
|---|---|---|
| RSI | mean-reversion | oversold → buy, overbought → sell |
| SMA cross (20/50) | trend/momentum | golden/death cross gets the highest weight |
| MACD histogram | momentum | zero-line cross = strong, sign = weak |
| Bollinger bands | mean-reversion | touch of band → fade back to mean |

A **trend-regime filter** damps counter-trend mean-reversion votes (RSI,
Bollinger) to 25% so the EA doesn't fight a strong trend ("no catching falling
knives"). Votes aggregate into a `score` in `[-1, +1]`; `|score|` below
`HoldThreshold` is **HOLD**. Entries fire only on a **closed bar**.

## Risk management (the point of "low risk")

- **Position sizing** — lot is computed from `RiskPercent` of balance across the
  ATR stop distance (universal `TICK_VALUE`/`TICK_SIZE` math; correct for gold).
- **ATR stop & target** — `SL = ATR × AtrStopMult`, `TP = SL × RewardRisk`.
- **Daily loss cap** — halts new trades for the day after `DailyLossCapPct`
  equity drawdown.
- **Max trades/day** and **max simultaneous positions**.
- **Spread filter** — skips entries when the gold spread is too wide.
- **Session filter** — trade only inside a time window (default 07:00–20:00
  server time ≈ London + NY); optional **flatten at session end** and
  **no-Friday**.
- **Break-even** and **ATR trailing** to protect open profit.

## Install

1. Open MT5 → **File → Open Data Folder**.
2. Copy `TradeAnalyzerEA.mq5` into `MQL5/Experts/`.
3. In **MetaEditor**, open the file and press **Compile** (F7). No external
   dependencies — it uses the standard `Trade` library.
4. In MT5, open an **XAUUSD** chart (M5 or M15 recommended), drag the EA on,
   allow **Algo Trading**.

## First run (safe path)

1. Keep **`InpDryRun = true`**. Watch the **Experts** log — it prints the
   signal, score, and reasoning each bar, plus why any entry was blocked.
2. Run it in the **Strategy Tester** over a few months of XAUUSD history
   (visual mode helps). Tune inputs, confirm the risk logic behaves.
3. Move to a **DEMO** account, set `InpDryRun = false`, and let it trade for a
   while.
4. Only after you're satisfied should you consider a live account — with a small
   `RiskPercent`.

## Key inputs

| Input | Default | Meaning |
|---|---|---|
| `InpDryRun` | `true` | No orders; log-only. Turn off to trade. |
| `InpRiskPercent` | `0.5` | Risk per trade, % of balance. |
| `InpAtrStopMult` | `1.5` | Stop = ATR × this. |
| `InpRewardRisk` | `2.0` | Take-profit = risk × this. |
| `InpDailyLossCapPct` | `3.0` | Stop for the day at this % equity loss. |
| `InpMaxTradesPerDay` | `5` | New trades cap per day. |
| `InpMaxSpreadPoints` | `60` | Skip entries above this spread (points). |
| `InpSessionStartH/EndH` | `7 / 20` | Trading window, **server** time. |
| `InpHoldThreshold` | `0.15` | `|score|` below this = HOLD. |

> **Tune `SessionStartH/EndH` to your broker's server time** and
> `MaxSpreadPoints` to your broker's typical gold spread before going live.

## Notes & limitations

- This is a **test/starter** EA, not a turnkey profitable system. "Profitable"
  depends on market regime, broker costs, and your tuning — **backtest and
  forward-test** honestly.
- Signal evaluation is on bar close (`InpTradeOnNewBar = true`) for stable,
  reproducible tester behavior.
- One symbol per chart instance. Uses a `Magic` number to isolate its own
  trades from manual ones.
