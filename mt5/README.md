# TradeAnalyzer EAs (MT5) — XAUUSD day-trading

Two Expert Advisors that share one **risk-management engine** but use different
entry logic:

| File | Entry idea | Status |
|---|---|---|
| `TradeAnalyzerEA.mq5` | Weighted vote of RSI + SMA-cross + MACD + Bollinger | **No edge** — reference only |
| `TradeAnalyzerORB.mq5` | Opening Range Breakout (session range) | Positive in backtest, **not yet forward-tested** |
| `TradeAnalyzerScalper.mq5` | M1 mean-reversion fade of an EMA extension | **Conclusively negative** — see below |

> **`TradeAnalyzerScalper`** on XAUUSD M1, 2025-05-27 → 2026-08-28 (100% tick
> quality), 5931 trades: profit factor **0.88**, net **−49.9%**, max drawdown
> **51%**. Expectancy −$0.84 per trade with a per-trade standard deviation of
> $13.57, so **t = −4.74** — unlike the other two results this one is
> statistically conclusive, which is the one thing high trade counts buy you.
>
> Two things went wrong, and the second matters more. Costs: break-even needed
> a 54.4% win rate against the 51.35% achieved. And the signal itself was worse
> than nothing — with a 1.0 ATR target against a 1.2 ATR stop, a coin-flip entry
> wins 1.2/2.2 = 54.5% of the time in a driftless walk, so the fade *subtracted*
> value. On a one-minute scale gold continues after an extension more often than
> it reverts; the strategy was fading live momentum.

> **`TradeAnalyzerEA`** on XAUUSD M15, 2024-01 → 2026-08 (511 trades): profit
> factor **0.72**, net **−21%**, max drawdown **25%**. A shorter 7-month window
> looked marginally positive (PF 1.07) but did not hold up. Keep it as a
> reference implementation of the risk shell, not a strategy to trade.

## The ORB EA (`TradeAnalyzerORB.mq5`)

Marks the high/low of the first N minutes of the session, then trades the
**first clean breakout** of that range:

- **Stop** sits on the far side of the range — if price travels all the way
  back through it, the breakout has failed. Risk is the range size, not a guess.
- **Take-profit** is `RewardRisk` × that risk.
- **Range quality filter** against the *daily* ATR: skip the day if the range is
  unusually small (noise) or unusually large (stop would be huge).
- One breakout trade per day.

### Measured configuration

XAUUSD **M5**, 2025-05-27 → 2026-08-06 (100% tick-history quality, random
execution delay), 246 trades:

| Metric | Value |
|---|---|
| Profit factor | **1.18** |
| Net | +10.0% |
| Max drawdown | **5.45%** |
| Win rate | 37.8% (break-even needs 34.0%) |
| Avg win / avg loss | 1.94 |

Split-sample check — both halves profitable:

| Period | Trades | PF | Drawdown |
|---|---|---|---|
| 2025-05-27 → 2025-12-31 | 132 | 1.11 | 5.51% |
| 2026-01-01 → 2026-08-06 | 115 | 1.43 | 2.67% |

Settings used: `RangeStartHour=7`, `RangeMinutes=60`, `TradeUntilHour=17`,
`SessionEndHour=20`, `MaxTradesPerDay=1`, `UseTrailing=false`,
`UseBreakEven=false`, `RiskPercent=0.5`, `RewardRisk=2.0`.

**`RangeStartHour` is in broker server time.** On a GMT+3 server, 07:00 covers
04:00–05:00 GMT — the quiet end of the Asian session. The narrow range gives a
tight stop, and the breakout runs into the London open. Testing the London open
range itself (11:00 server) was clearly worse: PF 0.92 over the same period. The
EA prints the server offset and the London/NY opens in server hours at startup —
attach it to a live chart and read the log before choosing the hour.

### Cross-instrument check: the edge did not generalize

The same rules, unchanged, over the same period (relative thresholds on,
exposure cap off so position sizing is undistorted):

| Symbol | PF | Avg win / avg loss | Break-even WR | Actual WR |
|---|---|---|---|---|
| **XAUUSD** | **1.28** | 1.96 | 33.7% | **39.4%** |
| XAGUSD | 0.92 | 1.53 | 39.6% | 37.5% |
| EURUSD | 0.82 | 1.28 | 43.9% | 38.9% |
| USDJPY | 0.83 | 1.53 | 39.5% | 35.3% |

One instrument out of four. Win rates are similar everywhere (35–39%); the
whole difference is the win/loss ratio — after a breakout gold travels further
relative to its stop, while the FX majors revert sooner. That is a plausible
description of a real property of gold *and* an equally plausible description
of having fitted to gold. A backtest cannot separate the two, which is exactly
what this check was meant to settle.

Treat the gold figures accordingly: an unconfirmed, single-instrument result.

### What this result is, and is not

The numbers above are honest — clean tick data, execution delay, and both halves
of the sample profitable. But three settings (trailing off, hour 7, one trade
per day) were each chosen by looking at this same 14-month window, so the split
test measures *stability*, not true out-of-sample performance. With 246 trades
the confidence interval around a 37.8% win rate is several points wide.

**The next step is a forward test on a demo account**, left untouched for a
month or more. History always knows a little too much; a live demo does not.

---

## Shared risk engine

Both EAs use the same money management, which has been verified against the
tester journal (`risk=$… (0.50% of equity)` on every entry).

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
- **Exposure cap** (`MaxLotPer10k`) — bounds lot to a fraction of equity so a
  low-ATR (tight-stop) entry can't produce an oversized position whose loss
  balloons if it ever exits away from its stop. **This is what keeps the planned
  %-risk honest.**
- **Conviction entry** (`RequireFreshCross`) — enters only on an actual SMA
  cross, not a weak "trend lean", so the EA isn't permanently in the market
  churning spread. A **cooldown** blocks immediate re-entry into chop.
- **Higher-timeframe trend filter** (`UseHtfFilter`) — a pure entry gate: it
  only *blocks* trades that fight the H1 trend (price vs H1 SMA200) and touches
  nothing else. Toggle it off to get the exact pre-filter behavior back.

> **Small accounts & gold:** sizing is % of balance, so risk scales with the
> account — but the broker's **minimum lot** (0.01) risks ~$10-20 on gold at a
> typical stop. If 0.5% of your balance is smaller than that, the EA **skips**
> the trade (it never over-risks) and logs a "balance too small" note. In
> practice XAUUSD at 0.5% risk needs roughly **$3-5k+**; on very small accounts
> most trades won't open.
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
| `InpRiskPercent` | `0.5` | Risk per trade, % of balance. **Never optimize this** — fix it. |
| `InpMaxLotPer10k` | `0.10` | Max lot per $10k equity (exposure cap; `0` = off). |
| `InpRequireFreshCross` | `true` | Enter only on a fresh SMA cross. |
| `InpCooldownBars` | `2` | Bars to wait after an exit before re-entering. |
| `InpUseHtfFilter` | `true` | Only trade with the higher-timeframe trend. |
| `InpHtfTimeframe` | `H1` | Higher timeframe for the trend gate. |
| `InpHtfMaPeriod` | `200` | SMA period on the higher timeframe. |
| `InpCloseOnOpposite` | `false` | Market-close on signal flip (can exceed planned risk — off by default). |
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
