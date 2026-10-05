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
  from 2009. Timestamps are EST without daylight saving.

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

About two minutes for ten years of M5.

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
