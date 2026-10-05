# ORB robustness lab

Answers in minutes most of what a months-long demo forward test would answer,
by replaying `TradeAnalyzerORB.mq5` over the broker's full history and
attacking the result from eight directions.

## 1. Export history from MT5

1. Copy `ExportBars.mq5` to `MQL5/Scripts/`, compile it in MetaEditor (F7).
2. Open an **XAUUSD** chart, drag the script onto it, keep `M5` and
   `2010.01.01`, press OK. It waits for the server to send the history and
   then shows how many bars it wrote and from which date.
3. File → Open Data Folder → `MQL5/Files/XAUUSD_M5.csv`. Zip it (≈35 MB raw,
   ≈8 MB zipped).

### Or: full history from a third-party feed

Broker history often starts in the late 2010s. For older data:

- **Dukascopy** (gold from the early 2000s), with Node.js installed:
  `npx dukascopy-node -i xauusd -from 2004-01-01 -to 2026-10-01 -t m5 -f csv`
  — writes into `./download/`. Timestamps are UTC.
- **HistData.com** — XAUUSD, "Generic ASCII", 1-minute bars, one zip per year
  from 2009. HistData says its clock is EST without daylight saving, but the
  XAUUSD files open the week at Sun 18:00 and close at Fri 17:00 all year, so
  they are read as New York local time.

Both are moved onto broker time (New York + 7h, i.e. GMT+2/+3) automatically
and resampled to M5. Neither has a spread, so a flat one is charged
(`--spread-points`, default 25 = $0.25); also run with 40 to see how much
the result depends on it. Files from different sources must not be mixed in
one run.

## 2. Run

```bash
pip install numpy pandas
python3 orb_lab.py XAUUSD_M5.csv --out report.md
```

About two minutes for ten years of M5. `--tf 15` (or 1, 30, 60) replays the
EA on another chart timeframe built from the same data.

## What it checks

| # | Test | Question it answers |
|---|---|---|
| 1 | Replication | Does the simulator agree with the MT5 tester on the same period? |
| 2 | Year by year | Was the edge there in most years, or in one lucky stretch? |
| 3 | Parameter plateau | Are neighbouring settings profitable too, or is ours a spike? |
| 4 | Walk-forward | Re-picking settings only from the past 24 months, every 6 months — is the stitched out-of-sample curve profitable? |
| 5 | Null tests | Does a coin-flip direction, or a random entry time, with the same stop and target, do as well? |
| 6 | Cost stress | Does it survive 1.5–2× spread and slippage? |
| 7 | Deflated Sharpe | After charging for all 384 configurations tried, is it still better than the best a no-edge strategy would show? |
| 8 | Monte Carlo | Distribution of one-year returns and drawdowns from the measured trades. |

## Calibration

Run on synthetic gold-like data before trusting it on real data:

| Data | Checks passed |
|---|---|
| Random walk, no edge | 0 / 8 |
| Small planted edge, smaller than costs | 2 / 8 (null tests see it, costs eat it) |
| Clear planted edge | 8 / 8 |

The no-edge run is the instructive one: inside individual walk-forward windows
the optimiser found settings with t ≈ +2.5 on the training data, and they lost
money in every following window but a few. That is what curve-fitting looks
like from the inside.

## What it cannot tell you

Execution on the real account: actual fills, slippage at the London open,
server outages, a restarted terminal. Those are what a short live run at
minimum size is for, not a long demo.

Simulator assumptions: fills at the next bar's open after the breakout bar
closes, as the EA does; if the stop and the target fall inside one bar, the
stop is assumed to have come first (pessimistic); the recorded bar spread
is used for entry and for short exits.

## Strategy survey (`strategy_lab.py`)

Twelve well-known strategy families (trend following, momentum, mean
reversion, volatility breakout, calendar effects, session effects, gap fade,
opening-range breakout at other sessions) — 162 configurations — under a
protocol fixed before running: parameters chosen on 2010–2018 only; a
candidate needs t ≥ 2 after costs, 6/9 profitable years, a profitable
neighbourhood and a deflated Sharpe ≥ 0.90 charged for all 162 trials; only
candidates touch the 2019–2026 hold-out, once.

Calibration: no-edge synthetic data → 0 candidates; planted intraday trend →
found and passes the hold-out. Calibration also caught a look-ahead bug: a
daily-bar Williams breakout that skipped days touching both levels turned a
random walk into Sharpe 6. It is now walked on M5 bars.

**Result on XAUUSD 2010 – Mar 2026: no candidates.** Three near-misses
(Williams breakout k=1 long, long on Fridays, weekend gap fade; dev t ≈ 2.0–2.3,
deflated Sharpe 0.22–0.34) were checked on the hold-out as a secondary,
Bonferroni-adjusted analysis (t ≥ 2.13): t +1.17, +0.99, −0.87 — all fail, and
the two positive ones have no alpha over simply holding gold. Full output:
`survey_xauusd_2010_2026.md`.

## Chart-pattern survey (`pattern_lab.py`)

Engulfing, pin bar, inside-bar breakout, support/resistance bounce and break,
double top/bottom and triangle breakout, each on H1/H4/D1 with targets of
1.5/2/3 R, both sides and long-only — 216 configurations. Same protocol; the
deflated Sharpe is charged for 378 trials (these plus strategy_lab's 162).
Signals at the pattern candle's close, fills and exits walked on M5, swing
points used only once confirmed.

Calibration: random walk → 0 candidates (best t 1.86). A planted intraday
trend shows up as many profitable pattern configurations but none clears the
bar — the protocol is strict and can miss a weak edge; it does not promote
noise.

**Result on XAUUSD 2010 – Mar 2026: no candidates.** The one strong near-miss,
triangle breakout on H4 (dev t +2.56, every neighbour profitable, deflated
Sharpe 0.33), was run once on the hold-out as a pre-declared secondary check:
t −1.35, profitable in 1 of 8 years. Full output:
`survey_patterns_xauusd_2010_2026.md`.
