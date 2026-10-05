"""
Strategy survey for XAUUSD under a pre-registered protocol.

Many well-known strategy families, each with a small parameter grid declared
up front, are judged on the same rules:

  DEVELOPMENT  2010-01-01 .. 2018-12-31   parameters may be chosen here
  HOLD-OUT     2019-01-01 .. data end     touched once, only by candidates

A configuration becomes a candidate only if, on development data and AFTER
costs, it shows
  - annualised Sharpe t-stat >= 2.0
  - at least 6 of 9 years profitable
  - a plateau: at least 60% of its grid neighbours also profitable
  - a deflated Sharpe >= 0.90, charged for EVERY configuration tried in
    every family (the more we try, the higher the bar)
Each family sends at most one candidate (its best). A candidate passes the
hold-out if its Sharpe t-stat there clears a Bonferroni-adjusted one-sided 5%
bar for the number of candidates, it stays profitable at double costs, and
its return is not explained by simply being long gold (alpha t-stat vs
buy-and-hold clears the same bar).

Costs: round trip $0.50 per ounce (spread + slippage); swap 4% a year of
notional for any position held over the daily close, long or short.

Usage:
    python3 strategy_lab.py DAT_ASCII_XAUUSD_M1_*.csv [--out survey.md]
"""
from __future__ import annotations

import argparse
import itertools
import math
import sys
from dataclasses import dataclass, field
from statistics import NormalDist
from typing import Callable

import numpy as np
import pandas as pd

from orb_lab import Cfg as OrbCfg, DAY, load, prepare, run as orb_run

N01 = NormalDist()
DEV = ("2010-01-01", "2019-01-01")
HOLD = ("2019-01-01", "2100-01-01")
RT_COST = 0.50          # $ per ounce, round trip
SWAP_PA = 0.04          # financing per year, fraction of notional


# --------------------------------------------------------------------------
#  Data
# --------------------------------------------------------------------------
@dataclass
class Market:
    d: pd.DataFrame      # daily bars on the broker clock: open high low close
    h: pd.DataFrame      # hourly bars: day, hour, open high low close
    ho: pd.DataFrame     # hourly OPEN pivot: rows day, columns hour
    hc: pd.DataFrame     # hourly CLOSE pivot
    orb_days: list       # orb_lab Day objects (M5) for the session-breakout family
    orb_meta: object


def load_market(files: list[str]) -> Market:
    meta, m5 = load(files, spread_points=0.0, tf_minutes=5)
    t = pd.to_datetime(m5["time"], unit="s")
    m5 = m5.assign(day=t.dt.normalize(), hour=t.dt.hour)
    agg = dict(open=("open", "first"), high=("high", "max"), low=("low", "min"), close=("close", "last"))
    h = m5.groupby(["day", "hour"], as_index=False).agg(**agg)
    d = m5.groupby("day").agg(**agg)
    d = d[d.index.dayofweek < 5]          # broker Mon-Fri
    ho = h.pivot(index="day", columns="hour", values="open").reindex(d.index)
    hc = h.pivot(index="day", columns="hour", values="close").reindex(d.index)
    return Market(d=d, h=h, ho=ho, hc=hc, orb_days=prepare(meta, m5), orb_meta=meta)


# --------------------------------------------------------------------------
#  Engines. Every engine returns a daily P&L series (fraction of notional,
#  unlevered) indexed by date, plus per-trade returns.
# --------------------------------------------------------------------------
def from_positions(d: pd.DataFrame, pos: np.ndarray, cost_mult: float = 1.0):
    """pos[t] decided at day t's close, held to t+1's close. Returns the daily
    P&L series and per-trade P&L (indexed by entry date)."""
    c = d["close"].to_numpy()
    p = np.nan_to_num(np.asarray(pos, float))
    turn = np.abs(np.diff(np.concatenate([[0.0], p])))
    # P&L attributed to the bar where the position was decided
    attrib = np.zeros(len(c))
    attrib[:-1] = p[:-1] * (c[1:] - c[:-1]) / c[:-1] - np.abs(p[:-1]) * SWAP_PA / 252 * cost_mult
    attrib -= turn * (RT_COST / 2 * cost_mult) / c
    ret = pd.Series(np.concatenate([[0.0], attrib[:-1]]), index=d.index)
    # trades: runs of identical non-zero position
    change = np.concatenate([[True], p[1:] != p[:-1]])
    run_id = np.cumsum(change)
    df = pd.DataFrame({"run": run_id, "p": p, "a": attrib}, index=d.index)
    df = df[df.p != 0]
    if len(df) == 0:
        return ret, pd.Series(dtype=float)
    g = df.groupby("run")
    # closing cost is charged on the bar after the run; add it to the trade
    trades = g["a"].sum() - (RT_COST / 2 * cost_mult) / g.apply(lambda x: c[min(d.index.get_loc(x.index[-1]) + 1, len(c) - 1)])
    trades.index = g.apply(lambda x: x.index[0])
    return ret, trades


def from_trades(index: pd.Index, day_pnl: dict, cost_mult: float = 1.0):
    """day_pnl: date -> (gross return, price) for intraday round trips."""
    r = pd.Series(0.0, index=index)
    tr = {}
    for k, (g, px) in day_pnl.items():
        if k not in r.index or px != px or px <= 0:
            continue
        net = g - RT_COST * cost_mult / px
        r[k] += net
        tr[k] = net
    return r, pd.Series(tr, dtype=float)


# --------------------------------------------------------------------------
#  Strategy families. Each: name, grid (dict of lists), fn(market, params, cost_mult)
# --------------------------------------------------------------------------
def sma(x, n): return pd.Series(x).rolling(n).mean().to_numpy()


def ma_cross(m, p, cm):
    c = m.d["close"].to_numpy()
    if p["fast"] >= p["slow"]:
        return None
    pos = np.where(sma(c, p["fast"]) > sma(c, p["slow"]), 1, -1).astype(float)
    pos[np.isnan(sma(c, p["slow"]))] = 0
    if p["side"] == "long":
        pos = np.maximum(pos, 0)
    return from_positions(m.d, pos, cm)


def donchian(m, p, cm):
    d = m.d
    hi = d["high"].rolling(p["n"]).max().shift(1).to_numpy()
    lo = d["low"].rolling(p["n"]).min().shift(1).to_numpy()
    xh = d["high"].rolling(max(p["n"] // 2, 2)).max().shift(1).to_numpy()
    xl = d["low"].rolling(max(p["n"] // 2, 2)).min().shift(1).to_numpy()
    c = d["close"].to_numpy()
    pos = np.zeros(len(c)); cur = 0
    for i in range(len(c)):
        if np.isnan(hi[i]):
            continue
        if cur == 1 and c[i] < xl[i]: cur = 0
        if cur == -1 and c[i] > xh[i]: cur = 0
        if c[i] > hi[i]: cur = 1
        elif c[i] < lo[i] and p["side"] == "both": cur = -1
        pos[i] = cur
    return from_positions(d, pos, cm)


def tsmom(m, p, cm):
    c = m.d["close"]
    pos = np.sign((c / c.shift(p["look"]) - 1).to_numpy())
    pos = np.nan_to_num(pos)
    if p["side"] == "long":
        pos = np.maximum(pos, 0)
    return from_positions(m.d, pos, cm)


def rsi(c: pd.Series, n: int) -> np.ndarray:
    dlt = c.diff()
    up = dlt.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-dlt.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return (100 - 100 / (1 + up / dn)).to_numpy()


def rsi2(m, p, cm):
    c = m.d["close"]
    r = rsi(c, 2)
    trend = (c > c.rolling(200).mean()).to_numpy() if p["trend"] else np.ones(len(c), bool)
    pos = np.zeros(len(c)); cur = 0; held = 0
    for i in range(len(c)):
        if cur != 0:
            held += 1
            if (cur == 1 and r[i] > 50) or (cur == -1 and r[i] < 50) or held >= 5:
                cur = 0
        if cur == 0:
            if r[i] < p["x"] and trend[i]:
                cur, held = 1, 0
            elif r[i] > 100 - p["x"] and p["side"] == "both" and not (p["trend"] and trend[i]):
                cur, held = -1, 0
        pos[i] = cur
    return from_positions(m.d, pos, cm)


def nday_reversal(m, p, cm):
    c = m.d["close"]
    low = (c <= c.rolling(p["n"]).min()).to_numpy()
    high = (c >= c.rolling(p["n"]).max()).to_numpy()
    pos = np.zeros(len(c)); left = 0; cur = 0
    for i in range(len(c)):
        if left > 0:
            left -= 1
            if left == 0: cur = 0
        if cur == 0:
            if low[i]: cur, left = 1, p["hold"]
            elif high[i] and p["side"] == "both": cur, left = -1, p["hold"]
        pos[i] = cur
    return from_positions(m.d, pos, cm)


def vol_breakout(m, p, cm):
    """Larry Williams: stop orders at open +/- k * yesterday's range, exit at the
    close. Walked on M5 bars so the first level touched is known; deciding it
    from the daily bar (e.g. skipping days that touched both) peeks at the
    future and turns a random walk into a Sharpe of 6."""
    prev_rng = (m.d["high"] - m.d["low"]).shift(1)
    out = {}
    for day in m.orb_days:
        k = pd.Timestamp(day.day * DAY, unit="s")
        rg = prev_rng.get(k)
        if rg is None or rg != rg or len(day.o) < 2:
            continue
        op = day.o[0]
        up, dn = op + p["k"] * rg, op - p["k"] * rg
        iu = np.argmax(day.h >= up) if (day.h >= up).any() else 10**9
        idn = np.argmax(day.l <= dn) if (p["side"] == "both" and (day.l <= dn).any()) else 10**9
        if iu == idn == 10**9 or iu == idn:
            continue                         # untouched, or both inside one M5 bar
        cl = day.c[-1]
        if iu < idn:
            fill = max(up, day.o[iu])        # gap through the level fills at the open
            out[k] = ((cl - fill) / fill, fill)
        else:
            fill = min(dn, day.o[idn])
            out[k] = ((fill - cl) / fill, fill)
    return from_trades(m.d.index, out, cm)


def weekday(m, p, cm):
    """Hold one weekday (open to close), long or short."""
    d = m.d
    out = {k: (p["dir"] * (r.close - r.open) / r.open, r.open)
           for k, r in d.iterrows() if k.dayofweek == p["dow"]}
    return from_trades(d.index, out, cm)


def turn_of_month(m, p, cm):
    """Long over the turn of the month: from the close `before`+1 trading days
    before month end to the close of trading day `after` of the next month."""
    d = m.d
    month = pd.Series(d.index.to_period("M"), index=d.index)
    from_start = month.groupby(month).cumcount().to_numpy() + 1
    from_end = month.groupby(month).cumcount(ascending=False).to_numpy() + 1
    on = (from_end <= p["before"] + 1) | (from_start < p["after"])
    return from_positions(d, on.astype(float), cm)


def session_drive(m, p, cm):
    """Direction of one hour's candle, entered at its close and held to 20:00."""
    o, c, ex = m.ho.get(p["hour"]), m.hc.get(p["hour"]), m.ho.get(20)
    if o is None or ex is None:
        return None
    drn = np.sign(c - o) * (-1 if p["mode"] == "fade" else 1)
    g = drn * (ex - c) / c
    out = {k: (g[k], c[k]) for k in m.d.index if g[k] == g[k] and drn[k] != 0}
    return from_trades(m.d.index, out, cm)


def overnight(m, p, cm):
    """Hold a fixed intraday window every day: from hour a's open to hour b's open."""
    if p["a"] >= p["b"]:
        return None
    a, b = m.ho.get(p["a"]), m.ho.get(p["b"])
    if a is None or b is None:
        return None
    g = p["dir"] * (b - a) / a
    out = {k: (g[k], a[k]) for k in m.d.index if g[k] == g[k]}
    return from_trades(m.d.index, out, cm)


def weekend_gap_fade(m, p, cm):
    d = m.d
    out = {}
    prev_close = d["close"].shift(1)
    for k, r in d.iterrows():
        if k.dayofweek != 0 or prev_close.get(k) != prev_close.get(k):
            continue
        gap = (r.open - prev_close[k]) / prev_close[k]
        if abs(gap) < p["min_gap"]:
            continue
        drn = -np.sign(gap)
        out[k] = (drn * (r.close - r.open) / r.open, r.open)
    return from_trades(d.index, out, cm)


def ny_orb(m, p, cm):
    """The ORB EA moved to the New York open (and other hours). Uses orb_lab's
    exact replay; R-multiples are converted to notional returns via the stop."""
    cfg = OrbCfg(start_h=p["start_h"], start_m=p["start_m"], minutes=p["minutes"],
                 until_h=min(p["start_h"] + 3, 22), end_h=23, rr=p["rr"],
                 max_spr_pct=100.0, spread_mult=0.0, lot_per_10k=0)
    tr = orb_run(m.orb_days, cfg, m.orb_meta)
    out = {}
    for _, x in tr.iterrows():
        day = pd.Timestamp(x["day"] * DAY, unit="s")
        out[day] = (x["r"] * x["risk"] / x["entry"], x["entry"])
    return from_trades(m.d.index, out, cm)


@dataclass
class Family:
    name: str
    fn: Callable
    grid: dict
    kind: str = ""


FAMILIES = [
    Family("MA crossover (trend)", ma_cross,
           dict(fast=[10, 20, 50], slow=[50, 100, 200], side=["both", "long"])),
    Family("Donchian breakout (turtle)", donchian,
           dict(n=[20, 55, 100], side=["both", "long"])),
    Family("Time-series momentum", tsmom,
           dict(look=[21, 63, 126, 252], side=["both", "long"])),
    Family("RSI(2) mean reversion", rsi2,
           dict(x=[5, 10, 20], trend=[False, True], side=["both", "long"])),
    Family("N-day low/high reversal", nday_reversal,
           dict(n=[3, 5, 10], hold=[1, 3, 5], side=["both", "long"])),
    Family("Volatility breakout (Williams)", vol_breakout,
           dict(k=[0.3, 0.5, 0.7, 1.0], side=["both", "long"])),
    Family("Day of week", weekday,
           dict(dow=[0, 1, 2, 3, 4], dir=[1, -1])),
    Family("Turn of month", turn_of_month,
           dict(before=[1, 2, 3], after=[1, 3, 5])),
    Family("Session first-hour drive", session_drive,
           dict(hour=[3, 9, 10, 15, 16], mode=["follow", "fade"])),
    Family("Fixed intraday window", overnight,
           dict(a=[1, 3, 9, 15], b=[9, 15, 20, 23], dir=[1, -1])),
    Family("Weekend gap fade", weekend_gap_fade,
           dict(min_gap=[0.0, 0.002, 0.005])),
    Family("Opening-range breakout, other sessions", ny_orb,
           dict(start_h=[9, 15, 16], start_m=[0, 30], minutes=[15, 30, 60], rr=[1.5, 2.0])),
]


# --------------------------------------------------------------------------
#  Statistics
# --------------------------------------------------------------------------
def window(s: pd.Series, w) -> pd.Series:
    if len(s) == 0:
        return s
    return s[(s.index >= pd.Timestamp(w[0])) & (s.index < pd.Timestamp(w[1]))]


def perf(r: pd.Series, trades: pd.Series | None = None) -> dict:
    r = r.fillna(0)
    years = max(len(r) / 252, 1e-9)
    sd = r.std(ddof=1)
    sh = r.mean() / sd * math.sqrt(252) if sd > 0 else 0.0
    eq = r.cumsum()
    dd = float((eq.cummax() - eq).max())
    yr = r.groupby(r.index.year).sum()
    out = dict(sharpe=sh, t=sh * math.sqrt(years), ann=r.mean() * 252, dd=dd,
               years_pos=int((yr > 0).sum()), years=len(yr), n=0, pf=float("nan"),
               skew=float(r.skew()), kurt=float(r.kurt() + 3), days=len(r))
    if trades is not None and len(trades):
        trades = trades.to_numpy()
        g, l = trades[trades > 0].sum(), -trades[trades < 0].sum()
        out.update(n=len(trades), pf=g / l if l > 0 else float("inf"))
    return out


def alpha_t(r: pd.Series, bench: pd.Series) -> float:
    x, y = bench.reindex(r.index).fillna(0).to_numpy(), r.fillna(0).to_numpy()
    X = np.column_stack([np.ones_like(x), x])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    s2 = resid.var(ddof=2)
    cov = s2 * np.linalg.inv(X.T @ X)
    return float(beta[0] / math.sqrt(cov[0, 0])) if cov[0, 0] > 0 else 0.0


def deflated(sh_ann: float, days: int, skew: float, kurt: float, n_trials: int) -> float:
    sr = sh_ann / math.sqrt(252)                       # per-day Sharpe
    T = max(days, 2)
    g = 0.5772156649
    N = max(n_trials, 2)
    sr0 = math.sqrt(1 / (T - 1)) * ((1 - g) * N01.inv_cdf(1 - 1 / N) + g * N01.inv_cdf(1 - 1 / (N * math.e)))
    den = math.sqrt(max(1 - skew * sr + (kurt - 1) / 4 * sr * sr, 1e-12))
    return N01.cdf((sr - sr0) * math.sqrt(T - 1) / den)


def neighbours(grid: dict, params: dict) -> list[dict]:
    out = []
    for k, vals in grid.items():
        i = vals.index(params[k])
        for j in (i - 1, i + 1):
            if 0 <= j < len(vals):
                q = dict(params); q[k] = vals[j]; out.append(q)
    return out


def key(p: dict) -> tuple:
    return tuple(sorted(p.items()))


def fmtp(s: dict) -> str:
    pf = f"{s['pf']:.2f}" if s["pf"] == s["pf"] else "  - "
    return (f"Sharpe {s['sharpe']:+.2f} (t {s['t']:+.2f})  ann {s['ann']*100:+5.1f}%  "
            f"DD {s['dd']*100:4.1f}%  yrs+ {s['years_pos']}/{s['years']}  n {s['n']:4d}  PF {pf}")


# --------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    lines = []
    def say(s=""):
        print(s, flush=True); lines.append(s)

    m = load_market(args.files)
    bh = m.d["close"].pct_change().fillna(0)
    say(f"# XAUUSD strategy survey — {m.d.index[0].date()} .. {m.d.index[-1].date()}")
    say(f"Costs: round trip ${RT_COST:.2f}/oz, swap {SWAP_PA*100:.0f}%/yr. Dev {DEV[0]}..{DEV[1]}, hold-out {HOLD[0]}..")
    say(f"Benchmark buy & hold — dev: {fmtp(perf(window(bh, DEV)))}")
    say(f"                       hold-out: {fmtp(perf(window(bh, HOLD)))}")
    say()

    # ---- development: run every configuration -------------------------
    results = {}
    for fam in FAMILIES:
        for vals in itertools.product(*fam.grid.values()):
            p = dict(zip(fam.grid, vals))
            out = fam.fn(m, p, 1.0)
            if out is None:
                continue
            r, tr = out
            results[(fam.name, key(p))] = (fam, p, r, tr, perf(window(r, DEV), window(tr, DEV)))
    n_trials = len(results)
    say(f"## Development ({n_trials} configurations in {len(FAMILIES)} families)")

    candidates = []
    for fam in FAMILIES:
        rows = [(p, s) for (fn, _), (f, p, r, tr, s) in results.items() if fn == fam.name]
        rows.sort(key=lambda x: -x[1]["t"])
        best_p, best_s = rows[0]
        nb = [results.get((fam.name, key(q))) for q in neighbours(fam.grid, best_p)]
        nb = [x for x in nb if x is not None]
        plateau = np.mean([x[4]["sharpe"] > 0 for x in nb]) if nb else 0.0
        dsr = deflated(best_s["sharpe"], best_s["days"], best_s["skew"], best_s["kurt"], n_trials)
        ok = (best_s["t"] >= 2.0 and best_s["years_pos"] >= 6 and plateau >= 0.6 and dsr >= 0.90)
        share_pos = np.mean([s["sharpe"] > 0 for _, s in rows])
        say(f"### {fam.name}  ({len(rows)} configs, {share_pos*100:.0f}% with Sharpe>0)")
        say(f"    best {best_p}")
        say(f"      {fmtp(best_s)}")
        say(f"      plateau {plateau*100:.0f}%  deflated Sharpe {dsr:.2f}  -> {'CANDIDATE' if ok else 'rejected'}")
        if ok:
            candidates.append((fam, best_p))
    say()

    # ---- hold-out: each candidate once ---------------------------------
    say(f"## Hold-out ({len(candidates)} candidate(s))")
    if not candidates:
        say("    No configuration met the development bar; the hold-out stays untouched.")
    bar = N01.inv_cdf(1 - 0.05 / max(len(candidates), 1))
    for fam, p in candidates:
        r, tr = fam.fn(m, p, 1.0)
        r2, _ = fam.fn(m, p, 2.0)
        hr, hr2 = window(r, HOLD), window(r2, HOLD)
        s, s2 = perf(hr, window(tr, HOLD)), perf(hr2)
        at = alpha_t(hr, window(bh, HOLD))
        passed = s["t"] >= bar and s2["sharpe"] > 0 and at >= bar
        say(f"### {fam.name} {p}")
        say(f"      costs x1: {fmtp(s)}")
        say(f"      costs x2: {fmtp(s2)}")
        say(f"      alpha t vs buy&hold {at:+.2f}   bar {bar:.2f}  -> {'PASS' if passed else 'FAIL'}")
    if args.out:
        open(args.out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
