"""
ORB robustness lab.

Replays TradeAnalyzerORB.mq5 on exported bars and asks the questions a forward
test would otherwise take months to answer:

  1. replication  - does the simulator reproduce the tester's numbers?
  2. history      - does the edge hold year by year over the whole history?
  3. plateau      - is the chosen setting a lucky spike, or are its neighbours
                    profitable too?
  4. walk-forward - if we had picked parameters only from the past, every time,
                    would the next period still have made money?
  5. null tests   - does breakout direction matter, or does a random entry with
                    the same stop/target do as well?
  6. costs        - does it survive double spread and slippage?
  7. selection    - after accounting for every configuration we tried, is the
                    best one still significant (deflated Sharpe)?
  8. Monte Carlo  - what drawdowns and losing years to expect from this edge.

Usage:
    python3 orb_lab.py XAUUSD_M5.csv [--from 2015-01-01] [--to 2026-12-31] [--out report.md]

The CSV comes from ExportBars.mq5 (MQL5/Files/XAUUSD_M5.csv). Zipped or
gzipped files are read directly.
"""
from __future__ import annotations

import argparse
import itertools
import math
import sys
from dataclasses import dataclass, replace, asdict
from statistics import NormalDist

import numpy as np
import pandas as pd

DAY = 86400
N01 = NormalDist()


# --------------------------------------------------------------------------
#  Data
# --------------------------------------------------------------------------
@dataclass
class Meta:
    symbol: str = "?"
    point: float = 0.01
    contract: float = 100.0
    gmt_offset_h: int = 3


@dataclass
class Day:
    day: int                 # server-time day number (unix seconds // 86400)
    t: np.ndarray            # bar open times, server seconds
    o: np.ndarray
    h: np.ndarray
    l: np.ndarray
    c: np.ndarray
    spr: np.ndarray          # spread in PRICE units
    atr_prev: float          # D1 ATR as of yesterday's close (EA uses shift 1)


def load(path: str) -> tuple[Meta, pd.DataFrame]:
    meta = Meta()
    opener = open
    if path.endswith(".gz"):
        import gzip
        opener = gzip.open
    if not path.endswith(".zip"):
        with opener(path, "rt", encoding="utf-8", errors="replace") as f:
            first = f.readline().strip()
        if first.startswith("#"):
            kv = dict(p.split("=", 1) for p in first[1:].split(";") if "=" in p)
            meta = Meta(
                symbol=kv.get("symbol", "?"),
                point=float(kv.get("point", 0.01)),
                contract=float(kv.get("contract", 100)),
                gmt_offset_h=int(kv.get("server_gmt_offset_h", 3)),
            )
    df = pd.read_csv(path, comment="#")
    df.columns = [c.strip().lower() for c in df.columns]
    if df["time"].dtype == object:  # tolerate "2024.01.02 07:00" style exports
        df["time"] = (pd.to_datetime(df["time"].str.replace(".", "-", regex=False))
                      .astype("int64") // 10**9)
    df = df.sort_values("time").drop_duplicates("time").reset_index(drop=True)
    if "spread" not in df:
        df["spread"] = 0
    return meta, df


def prepare(meta: Meta, df: pd.DataFrame, atr_period: int = 14) -> list[Day]:
    df = df.copy()
    df["day"] = df["time"] // DAY
    daily = df.groupby("day").agg(h=("high", "max"), l=("low", "min"), c=("close", "last"))
    prev_c = daily["c"].shift(1)
    tr = np.maximum(daily["h"] - daily["l"],
                    np.maximum((daily["h"] - prev_c).abs(), (daily["l"] - prev_c).abs()))
    tr = tr.fillna(daily["h"] - daily["l"])
    # MT5's built-in ATR is a simple average of true range, not Wilder's.
    atr = tr.rolling(atr_period).mean().shift(1)

    days = []
    for d, g in df.groupby("day", sort=True):
        a = atr.get(d, np.nan)
        days.append(Day(
            day=int(d),
            t=g["time"].to_numpy(np.int64),
            o=g["open"].to_numpy(float), h=g["high"].to_numpy(float),
            l=g["low"].to_numpy(float), c=g["close"].to_numpy(float),
            spr=g["spread"].to_numpy(float) * meta.point,
            atr_prev=float(a) if a == a else 0.0,
        ))
    return days


# --------------------------------------------------------------------------
#  Strategy (mirrors TradeAnalyzerORB.mq5 with BE/trailing off, 1 trade/day)
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class Cfg:
    start_h: int = 7
    start_m: int = 0
    minutes: int = 60
    until_h: int = 17
    end_h: int = 20
    buf_pct: float = 1.5
    max_spr_pct: float = 8.0
    min_atr: float = 0.08
    max_atr: float = 0.50
    rr: float = 2.0
    risk_pct: float = 0.5
    lot_per_10k: float = 0.1     # exposure cap from the EA (0 = off)
    spread_mult: float = 1.0     # cost stress: multiply recorded spread
    slip_pts: float = 0.0        # cost stress: adverse slippage per fill, points

    def label(self) -> str:
        return (f"{self.start_h:02d}:{self.start_m:02d}+{self.minutes}m "
                f"RR{self.rr:g} buf{self.buf_pct:g}%")


def _exit(day: Day, i0: int, direction: int, entry: float, sl: float, tp: float,
          end_t: int, spr_mult: float, slip: float) -> tuple[float, int]:
    """Walk bars from the entry bar onward. Bars are BID; a short closes at ASK.
    If stop and target both sit inside one bar, assume the stop came first."""
    n = len(day.t)
    for j in range(i0, n):
        if day.t[j] >= end_t:
            px = day.o[j] + (day.spr[j] * spr_mult if direction < 0 else 0.0)
            return px - direction * slip, j
        s = day.spr[j] * spr_mult if direction < 0 else 0.0
        hi, lo = day.h[j] + s, day.l[j] + s
        if direction > 0:
            if lo <= sl:
                return min(sl, day.o[j] if j > i0 else sl) - slip, j
            if hi >= tp:
                return tp, j
        else:
            if hi >= sl:
                return max(sl, day.o[j] + s if j > i0 else sl) + slip, j
            if lo <= tp:
                return tp, j
    j = n - 1
    s = day.spr[j] * spr_mult if direction < 0 else 0.0
    return day.c[j] + s - direction * slip, j


def simulate_day(day: Day, cfg: Cfg, meta: Meta, force_dir: int = 0,
                 force_entry: int = -1) -> dict | None:
    midnight = day.day * DAY
    rs = midnight + cfg.start_h * 3600 + cfg.start_m * 60
    re = rs + cfg.minutes * 60
    until = midnight + cfg.until_h * 3600
    end_t = midnight + cfg.end_h * 3600

    in_range = (day.t >= rs) & (day.t < re)
    if not in_range.any():
        return None
    hi = day.h[in_range].max()
    lo = day.l[in_range].min()
    size = hi - lo
    if size <= 0:
        return None
    if day.atr_prev > 0:
        frac = size / day.atr_prev
        if frac < cfg.min_atr or frac > cfg.max_atr:
            return None
    buf = size * cfg.buf_pct / 100.0
    slip = cfg.slip_pts * meta.point

    first = int(np.searchsorted(day.t, re))
    direction, ie = 0, -1
    if force_entry >= 0:
        direction, ie = force_dir, force_entry
    else:
        # Decision on bar i's close, fill at bar i+1's open (the EA's first
        # tick of the new bar). Spread filter blocks that bar only.
        for i in range(max(first - 1, 0), len(day.t) - 1):
            if day.t[i] < rs:
                continue
            d = 1 if day.c[i] > hi + buf else (-1 if day.c[i] < lo - buf else 0)
            if d == 0:
                continue
            j = i + 1
            if day.t[j] >= until:
                break
            if day.spr[j] * cfg.spread_mult / size * 100.0 > cfg.max_spr_pct:
                continue
            direction, ie = (force_dir or d), j
            break
    if ie < 0:
        return None

    s = day.spr[ie] * cfg.spread_mult
    if direction > 0:
        entry = day.o[ie] + s + slip
        sl = lo - buf
    else:
        entry = day.o[ie] - slip
        sl = hi + buf
    if force_entry >= 0:  # null tests: same stop distance as the real range
        sl = entry - direction * (size + 2 * buf)
    risk = abs(entry - sl)
    if risk <= 0 or (direction > 0 and sl >= entry) or (direction < 0 and sl <= entry):
        return None
    tp = entry + direction * risk * cfg.rr

    px, _ = _exit(day, ie, direction, entry, sl, tp, end_t, cfg.spread_mult, slip)
    r = direction * (px - entry) / risk

    # The EA sizes to risk_pct but caps lots at lot_per_10k per $10k, which on
    # narrow ranges means risking less than risk_pct.
    risk_frac = cfg.risk_pct / 100.0
    if cfg.lot_per_10k > 0:
        risk_frac = min(risk_frac, cfg.lot_per_10k / 10000.0 * risk * meta.contract)
    return dict(day=day.day, t=int(day.t[ie]), dir=direction, r=r, risk_frac=risk_frac,
                range=size, risk=risk, entry_idx=ie)


def run(days: list[Day], cfg: Cfg, meta: Meta) -> pd.DataFrame:
    rows = [x for d in days if (x := simulate_day(d, cfg, meta)) is not None]
    return pd.DataFrame(rows, columns=["day", "t", "dir", "r", "risk_frac", "range", "risk", "entry_idx"])


# --------------------------------------------------------------------------
#  Statistics
# --------------------------------------------------------------------------
def stats(tr: pd.DataFrame) -> dict:
    if len(tr) == 0:
        return dict(n=0, wr=0, pf=0, exp_r=0, t=0, total_r=0, ret_pct=0, dd_pct=0, sharpe=0)
    r = tr["r"].to_numpy()
    gains, losses = r[r > 0].sum(), -r[r < 0].sum()
    eq = np.cumprod(1 + r * tr["risk_frac"].to_numpy())
    dd = 1 - eq / np.maximum.accumulate(np.concatenate([[1.0], eq]))[1:]
    sd = r.std(ddof=1) if len(r) > 1 else 0
    return dict(
        n=len(r), wr=float((r > 0).mean()),
        pf=float(gains / losses) if losses > 0 else float("inf"),
        exp_r=float(r.mean()),
        t=float(r.mean() / sd * math.sqrt(len(r))) if sd > 0 else 0.0,
        total_r=float(r.sum()),
        ret_pct=float((eq[-1] - 1) * 100), dd_pct=float(dd.max() * 100),
        sharpe=float(r.mean() / sd) if sd > 0 else 0.0,
    )


def fmt(s: dict) -> str:
    return (f"n={s['n']:4d}  PF={s['pf']:.2f}  WR={s['wr']*100:4.1f}%  "
            f"E={s['exp_r']:+.3f}R  t={s['t']:+.2f}  ret={s['ret_pct']:+6.1f}%  DD={s['dd_pct']:4.1f}%")


def deflated_sharpe(sr: float, n_trades: int, skew: float, kurt: float, n_trials: int) -> float:
    """Bailey & Lopez de Prado (2014): probability that a Sharpe is real after
    `n_trials` tries. The benchmark is the best Sharpe we would expect from that
    many strategies with NO edge, whose per-trade Sharpe has sampling variance
    1/T. (Using the cross-sectional variance of the trials instead punishes a
    grid that is genuinely profitable everywhere, which is the opposite of what
    we want.) Per-trade Sharpe, so T = number of trades."""
    N = max(n_trials, 2)
    v = 1.0 / max(n_trades - 1, 1)
    g = 0.5772156649
    sr0 = math.sqrt(max(v, 1e-12)) * ((1 - g) * N01.inv_cdf(1 - 1 / N)
                                      + g * N01.inv_cdf(1 - 1 / (N * math.e)))
    denom = math.sqrt(max(1 - skew * sr + (kurt - 1) / 4 * sr * sr, 1e-12))
    return N01.cdf((sr - sr0) * math.sqrt(max(n_trades - 1, 1)) / denom)


# --------------------------------------------------------------------------
#  Tests
# --------------------------------------------------------------------------
GRID = dict(
    start_h=[4, 5, 6, 7, 8, 9, 10, 11],
    minutes=[30, 60, 90, 120],
    rr=[1.5, 2.0, 2.5, 3.0],
    buf_pct=[0.0, 1.5, 3.0],
)


def grid_configs(base: Cfg) -> list[Cfg]:
    keys = list(GRID)
    return [replace(base, **dict(zip(keys, vals))) for vals in itertools.product(*GRID.values())]


def year_of(day_num: pd.Series) -> pd.Series:
    return pd.to_datetime(day_num * DAY, unit="s").dt.year


def by_year(tr: pd.DataFrame) -> list[tuple[int, dict]]:
    if len(tr) == 0:
        return []
    y = year_of(tr["day"])
    return [(int(k), stats(g)) for k, g in tr.groupby(y)]


def plateau(results: dict[Cfg, pd.DataFrame], base: Cfg) -> tuple[float, list[tuple[Cfg, dict]]]:
    """Neighbours = configs one grid step away in exactly one parameter."""
    keys = list(GRID)
    out = []
    for k in keys:
        vals = GRID[k]
        cur = getattr(base, k)
        if cur not in vals:
            continue
        i = vals.index(cur)
        for j in (i - 1, i + 1):
            if 0 <= j < len(vals):
                c = replace(base, **{k: vals[j]})
                if c in results:
                    out.append((c, stats(results[c])))
    share = np.mean([s["pf"] > 1 for _, s in out]) if out else float("nan")
    return float(share), out


def walk_forward(results: dict[Cfg, pd.DataFrame], days: list[Day],
                 train_months: int = 24, test_months: int = 6, min_trades: int = 40) -> pd.DataFrame:
    """Re-optimise on the trailing window, trade the next window untouched.
    The concatenated test windows are a fully out-of-sample equity curve."""
    t0 = pd.to_datetime(days[0].day * DAY, unit="s")
    t1 = pd.to_datetime(days[-1].day * DAY, unit="s")
    pieces, log = [], []
    start = t0 + pd.DateOffset(months=train_months)
    while start < t1:
        tr_a, tr_b = (start - pd.DateOffset(months=train_months)), start
        te_b = start + pd.DateOffset(months=test_months)
        a, b, e = (int(x.timestamp()) // DAY for x in (tr_a, tr_b, te_b))
        best, best_score = None, -1e9
        for cfg, tr in results.items():
            w = tr[(tr["day"] >= a) & (tr["day"] < b)]
            if len(w) < min_trades:
                continue
            s = stats(w)
            if s["t"] > best_score:
                best, best_score = cfg, s["t"]
        if best is not None:
            tr = results[best]
            oos = tr[(tr["day"] >= b) & (tr["day"] < e)]
            pieces.append(oos)
            log.append((tr_b.date(), te_b.date(), best.label(), best_score, stats(oos)))
        start = te_b
    oos_all = pd.concat(pieces) if pieces else pd.DataFrame(columns=["day", "r", "risk_frac"])
    oos_all.attrs["log"] = log
    return oos_all


def null_tests(days: list[Day], tr: pd.DataFrame, cfg: Cfg, meta: Meta,
               n_perm: int = 2000, seed: int = 7) -> dict:
    """Two null hypotheses, each with the real stop size and target:
      A) direction is irrelevant: same entry bar, coin-flip direction
      B) timing is irrelevant: random bar in the trading window, coin-flip direction
    p = share of random worlds that did at least as well as the strategy."""
    rng = np.random.default_rng(seed)
    by_day = {d.day: d for d in days}
    real = tr["r"].sum()

    # A: precompute long and short outcome at each real entry bar.
    both = []
    for _, row in tr.iterrows():
        d = by_day[int(row["day"])]
        outs = []
        for dirn in (1, -1):
            x = simulate_day(d, cfg, meta, force_dir=dirn, force_entry=int(row["entry_idx"]))
            outs.append(x["r"] if x else 0.0)
        both.append(outs)
    both = np.array(both) if both else np.zeros((0, 2))
    if len(both):
        picks = rng.integers(0, 2, size=(n_perm, len(both)))
        sims_a = np.where(picks == 0, both[:, 0], both[:, 1]).sum(axis=1)
        p_a = float((sims_a >= real).mean())
    else:
        sims_a, p_a = np.array([0.0]), 1.0

    # B: random entry bars on the same days the strategy traded.
    n_b = min(n_perm, 300)
    sims_b = np.zeros(n_b)
    trade_days = [by_day[int(x)] for x in tr["day"]]
    for k in range(n_b):
        tot = 0.0
        for d in trade_days:
            midnight = d.day * DAY
            lo_t = midnight + cfg.start_h * 3600 + cfg.start_m * 60 + cfg.minutes * 60
            hi_t = midnight + cfg.until_h * 3600
            idx = np.nonzero((d.t >= lo_t) & (d.t < hi_t))[0]
            if len(idx) == 0:
                continue
            x = simulate_day(d, cfg, meta, force_dir=int(rng.choice([-1, 1])),
                             force_entry=int(rng.choice(idx)))
            tot += x["r"] if x else 0.0
        sims_b[k] = tot
    p_b = float((sims_b >= real).mean())
    return dict(real=real, p_dir=p_a, mean_dir=float(sims_a.mean()),
                p_time=p_b, mean_time=float(sims_b.mean()))


def monte_carlo(tr: pd.DataFrame, years: float, n: int = 10000, seed: int = 11) -> dict:
    rng = np.random.default_rng(seed)
    r = tr["r"].to_numpy()
    f = tr["risk_frac"].to_numpy()
    per_year = max(int(round(len(r) / max(years, 1e-9))), 1)
    idx = rng.integers(0, len(r), size=(n, per_year))
    eq = np.cumprod(1 + r[idx] * f[idx], axis=1)
    peak = np.maximum.accumulate(np.concatenate([np.ones((n, 1)), eq], axis=1), axis=1)[:, 1:]
    dd = (1 - eq / peak).max(axis=1) * 100
    ret = (eq[:, -1] - 1) * 100
    return dict(
        trades_per_year=per_year,
        ret_p5=float(np.percentile(ret, 5)), ret_p50=float(np.percentile(ret, 50)),
        ret_p95=float(np.percentile(ret, 95)),
        p_losing_year=float((ret < 0).mean()),
        dd_p50=float(np.percentile(dd, 50)), dd_p95=float(np.percentile(dd, 95)),
        p_dd_over_10=float((dd > 10).mean()), p_dd_over_5=float((dd > 5).mean()),
    )


# --------------------------------------------------------------------------
#  Report
# --------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--from", dest="date_from", default=None)
    ap.add_argument("--to", dest="date_to", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--perm", type=int, default=2000)
    args = ap.parse_args(argv)

    meta, df = load(args.csv)
    if args.date_from:
        df = df[df["time"] >= pd.Timestamp(args.date_from).timestamp()]
    if args.date_to:
        df = df[df["time"] < pd.Timestamp(args.date_to).timestamp() + DAY]
    days = prepare(meta, df)
    years = (days[-1].day - days[0].day) / 365.25

    lines: list[str] = []
    def say(s: str = "") -> None:
        print(s)
        lines.append(s)

    span = f"{pd.to_datetime(days[0].day*DAY, unit='s').date()} .. {pd.to_datetime(days[-1].day*DAY, unit='s').date()}"
    say(f"# ORB robustness report — {meta.symbol}")
    say(f"Data: {len(df):,} bars, {len(days)} days, {span} ({years:.1f} y), "
        f"point={meta.point:g}, contract={meta.contract:g}, server GMT{meta.gmt_offset_h:+d}")
    say()

    base = Cfg()
    base_tr = run(days, base, meta)
    s = stats(base_tr)
    say("## 1. Validated configuration (ORB_XAUUSD_forward.set)")
    say(f"    {base.label()}:  {fmt(s)}")
    say()

    say("## 2. Year by year")
    yrs = by_year(base_tr)
    for y, ys in yrs:
        say(f"    {y}: {fmt(ys)}")
    pos_years = sum(1 for _, ys in yrs if ys["total_r"] > 0)
    say(f"    profitable years: {pos_years}/{len(yrs)}")
    say()

    say(f"## 3. Parameter grid ({len(grid_configs(base))} configurations)")
    results = {}
    for cfg in grid_configs(base):
        results[cfg] = run(days, cfg, meta)
    table = sorted(((c, stats(t)) for c, t in results.items()), key=lambda x: -x[1]["t"])
    share_pf = np.mean([st["pf"] > 1 for _, st in table])
    say(f"    share of ALL configs with PF>1: {share_pf*100:.0f}%")
    say("    top 10 by t-stat:")
    for c, st in table[:10]:
        say(f"      {c.label():28s} {fmt(st)}")
    share, neigh = plateau(results, base)
    say(f"    neighbours of the validated config with PF>1: {share*100:.0f}% ({len(neigh)} tested)")
    for c, st in neigh:
        say(f"      {c.label():28s} {fmt(st)}")
    say()

    say("## 4. Walk-forward (24m train -> 6m test, re-picked every window)")
    oos = walk_forward(results, days)
    for a, b, lab, sc, st in oos.attrs["log"]:
        say(f"    {a}..{b}  picked {lab:28s} (train t={sc:+.2f})  test: {fmt(st)}")
    wf = stats(oos) if len(oos) else None
    if wf:
        say(f"    OUT-OF-SAMPLE TOTAL: {fmt(wf)}")
    say()

    say("## 5. Null tests on the validated config")
    nt = null_tests(days, base_tr, base, meta, n_perm=args.perm)
    say(f"    strategy total: {nt['real']:+.1f}R")
    say(f"    A) random direction, same entries: mean {nt['mean_dir']:+.1f}R, p={nt['p_dir']:.3f}")
    say(f"    B) random time & direction, same stop/target: mean {nt['mean_time']:+.1f}R, p={nt['p_time']:.3f}")
    say()

    say("## 6. Cost stress")
    for sm, sl in [(1.5, 0), (2.0, 0), (1.0, 10), (2.0, 20)]:
        c = replace(base, spread_mult=sm, slip_pts=sl)
        say(f"    spread x{sm:g}, slippage {sl:g}pt: {fmt(stats(run(days, c, meta)))}")
    say()

    say("## 7. Selection bias (deflated Sharpe)")
    n_trials = len(table)
    best_c, best_s = table[0]
    r = results[best_c]["r"]
    dsr_best = deflated_sharpe(best_s["sharpe"], best_s["n"], float(r.skew()), float(r.kurt() + 3), n_trials)
    rb = base_tr["r"]
    # The validated config was itself picked after trying many variants by
    # hand; charging it for the whole grid is the honest (strict) assumption.
    dsr_base = deflated_sharpe(s["sharpe"], s["n"], float(rb.skew()), float(rb.kurt() + 3), n_trials) if s["n"] > 3 else 0
    say(f"    trials charged: {n_trials}")
    say(f"    best of grid ({best_c.label()}): P(real edge) = {dsr_best:.2f}")
    say(f"    validated config:              P(real edge) = {dsr_base:.2f}   (>=0.95 is the usual bar)")
    say()

    say("## 8. Monte Carlo, one year of trades (validated config)")
    if s["n"] > 10:
        mc = monte_carlo(base_tr, years)
        say(f"    trades/year ~{mc['trades_per_year']}")
        say(f"    annual return: 5%={mc['ret_p5']:+.1f}%  median={mc['ret_p50']:+.1f}%  95%={mc['ret_p95']:+.1f}%")
        say(f"    P(losing year) = {mc['p_losing_year']*100:.0f}%")
        say(f"    max DD: median {mc['dd_p50']:.1f}%, 95th pct {mc['dd_p95']:.1f}%; "
            f"P(DD>5%)={mc['p_dd_over_5']*100:.0f}%  P(DD>10%)={mc['p_dd_over_10']*100:.0f}%")
    say()

    say("## Verdict")
    checks = [
        ("profitable in most years", len(yrs) > 0 and pos_years / len(yrs) >= 0.7),
        ("t-stat >= 2 on full history", s["t"] >= 2),
        ("neighbours mostly profitable (>=70%)", share >= 0.7),
        ("walk-forward OOS PF > 1.1", bool(wf) and wf["pf"] > 1.1),
        ("beats random direction (p<0.05)", nt["p_dir"] < 0.05),
        ("beats random timing (p<0.05)", nt["p_time"] < 0.05),
        ("survives 2x spread (PF>1)", stats(run(days, replace(base, spread_mult=2.0), meta))["pf"] > 1),
        ("deflated Sharpe >= 0.95", dsr_base >= 0.95),
    ]
    for name, ok in checks:
        say(f"    [{'PASS' if ok else 'FAIL'}] {name}")
    passed = sum(ok for _, ok in checks)
    say(f"    {passed}/{len(checks)} passed")

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
