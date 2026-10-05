"""
Chart-pattern survey for XAUUSD, same pre-registered protocol as strategy_lab.

The patterns a discretionary chart reader looks for, written as exact rules:

  engulfing     a candle whose body swallows the previous opposite candle
  pin bar       a long wick (>= 2/3 of the candle) rejecting a price area
  inside bar    a candle inside the previous one; trade the break of the mother
  S/R bounce    a touch of the recent low/high that closes back inside
  S/R break     a close beyond the recent high/low
  double top/bottom  two swing extremes at the same level, entered on the
                break of the neckline between them
  triangle      falling swing highs + rising swing lows, entered on the break

Stops go where a textbook puts them (beyond the pattern); target = RR x risk;
a trade still open after a time limit is closed. Signals are taken at the
close of the pattern candle and filled at the next M5 open; stops and targets
are walked on M5 bars so their order is known. Swing points are only used
once they are confirmed (k bars later), so nothing peeks ahead.

Every configuration here is charged on top of the 162 already tried in
strategy_lab: the deflated Sharpe uses the running total.

Usage:
    python3 pattern_lab.py DAT_ASCII_XAUUSD_M1_*.csv [--out patterns.md]
"""
from __future__ import annotations

import argparse
import itertools
import sys
from dataclasses import dataclass
from statistics import NormalDist
from typing import Callable

import numpy as np
import pandas as pd

import strategy_lab as SL

N01 = NormalDist()
PRIOR_TRIALS = 162                       # strategy_lab's survey
TF_SEC = {"H1": 3600, "H4": 14400, "D1": 86400}
MAX_HOLD = {"H1": 48 * 3600, "H4": 5 * 86400, "D1": 10 * 86400}
PIVOT_K = 3


# --------------------------------------------------------------------------
#  Bars
# --------------------------------------------------------------------------
@dataclass
class Bars:
    t_close: np.ndarray      # seconds at which the bar is complete
    o: np.ndarray
    h: np.ndarray
    l: np.ndarray
    c: np.ndarray
    atr: np.ndarray


def make_bars(m5: pd.DataFrame, tf: str) -> Bars:
    sec = TF_SEC[tf]
    g = m5.assign(b=m5["time"] // sec * sec).groupby("b")
    b = g.agg(o=("open", "first"), h=("high", "max"), l=("low", "min"), c=("close", "last"),
              last=("time", "max"))
    if tf == "D1":
        b = b[pd.to_datetime(b.index, unit="s").dayofweek < 5]
    prev_c = b["c"].shift(1)
    tr = np.maximum(b["h"] - b["l"], np.maximum((b["h"] - prev_c).abs(), (b["l"] - prev_c).abs()))
    atr = tr.rolling(14).mean()
    # complete when its last M5 bar has closed
    return Bars(t_close=(b["last"] + 300).to_numpy(np.int64), o=b["o"].to_numpy(), h=b["h"].to_numpy(),
                l=b["l"].to_numpy(), c=b["c"].to_numpy(), atr=atr.to_numpy())


# --------------------------------------------------------------------------
#  Signals: list of (bar index, direction, stop price, entry kind, extra)
#  entry kind "mkt": fill at next M5 open; "stop": pending at levels in extra
# --------------------------------------------------------------------------
def sig_engulfing(B: Bars, p: dict):
    o, h, l, c = B.o, B.h, B.l, B.c
    out = []
    for i in range(6, len(c)):
        bull = c[i - 1] < o[i - 1] and c[i] > o[i] and c[i] >= o[i - 1] and o[i] <= c[i - 1]
        bear = c[i - 1] > o[i - 1] and c[i] < o[i] and c[i] <= o[i - 1] and o[i] >= c[i - 1]
        if p["context"] == "after_move":
            bull = bull and c[i - 1] < c[i - 6]
            bear = bear and c[i - 1] > c[i - 6]
        if bull:
            out.append((i, 1, min(l[i], l[i - 1]), "mkt", None))
        elif bear:
            out.append((i, -1, max(h[i], h[i - 1]), "mkt", None))
    return out


def sig_pinbar(B: Bars, p: dict):
    o, h, l, c, a = B.o, B.h, B.l, B.c, B.atr
    out = []
    for i in range(6, len(c)):
        rng = h[i] - l[i]
        if not (rng > 0 and a[i] == a[i] and rng >= 0.75 * a[i]):
            continue
        bull = (min(o[i], c[i]) - l[i]) >= 2 / 3 * rng
        bear = (h[i] - max(o[i], c[i])) >= 2 / 3 * rng
        if p["context"] == "after_move":
            bull = bull and c[i - 1] < c[i - 6]
            bear = bear and c[i - 1] > c[i - 6]
        if bull:
            out.append((i, 1, l[i], "mkt", None))
        elif bear:
            out.append((i, -1, h[i], "mkt", None))
    return out


def sig_insidebar(B: Bars, p: dict):
    h, l = B.h, B.l
    out = []
    for i in range(1, len(h)):
        if h[i] < h[i - 1] and l[i] > l[i - 1]:
            out.append((i, 0, None, "stop", (h[i - 1], l[i - 1])))
    return out


def sig_sr(B: Bars, p: dict):
    h, l, c, a = B.h, B.l, B.c, B.atr
    n = p["n"]
    sup = pd.Series(l).rolling(n).min().shift(1).to_numpy()
    res = pd.Series(h).rolling(n).max().shift(1).to_numpy()
    out = []
    for i in range(n + 1, len(c)):
        if a[i] != a[i] or sup[i] != sup[i]:
            continue
        if p["mode"] == "bounce":
            if l[i] <= sup[i] + 0.1 * a[i] and c[i] > sup[i]:
                out.append((i, 1, l[i] - 0.1 * a[i], "mkt", None))
            elif h[i] >= res[i] - 0.1 * a[i] and c[i] < res[i]:
                out.append((i, -1, h[i] + 0.1 * a[i], "mkt", None))
        else:
            if c[i] > res[i] and c[i - 1] <= res[i - 1]:
                out.append((i, 1, c[i] - a[i], "mkt", None))
            elif c[i] < sup[i] and c[i - 1] >= sup[i - 1]:
                out.append((i, -1, c[i] + a[i], "mkt", None))
    return out


def _pivots(B: Bars):
    """Swing points, each with the bar index at which it becomes known."""
    k = PIVOT_K
    lo = pd.Series(B.l).rolling(2 * k + 1, center=True).min().to_numpy()
    hi = pd.Series(B.h).rolling(2 * k + 1, center=True).max().to_numpy()
    plo = [(j, B.l[j], j + k) for j in range(k, len(B.l) - k) if B.l[j] == lo[j]]
    phi = [(j, B.h[j], j + k) for j in range(k, len(B.h) - k) if B.h[j] == hi[j]]
    return plo, phi


def sig_double(B: Bars, p: dict):
    c, h, l, a = B.c, B.h, B.l, B.atr
    plo, phi = _pivots(B)
    out, used = [], set()
    ilo = ihi = 0
    known_lo, known_hi = [], []
    for i in range(len(c)):
        while ilo < len(plo) and plo[ilo][2] <= i:
            known_lo.append(plo[ilo]); ilo += 1
        while ihi < len(phi) and phi[ihi][2] <= i:
            known_hi.append(phi[ihi]); ihi += 1
        if a[i] != a[i] or i == 0:
            continue
        for known, sign in ((known_lo, 1), (known_hi, -1)):
            if len(known) < 2:
                continue
            (j1, p1, _), (j2, p2, _) = known[-2], known[-1]
            if not (5 <= j2 - j1 <= 40) or i - j2 > 20 or (j1, j2, sign) in used:
                continue
            if abs(p1 - p2) > p["tol"] * a[i]:
                continue
            if sign == 1:
                neck = h[j1:j2 + 1].max()
                if neck < max(p1, p2) + a[i]:
                    continue
                if c[i] > neck >= c[i - 1]:
                    out.append((i, 1, min(p1, p2) - 0.1 * a[i], "mkt", None)); used.add((j1, j2, sign))
            else:
                neck = l[j1:j2 + 1].min()
                if neck > min(p1, p2) - a[i]:
                    continue
                if c[i] < neck <= c[i - 1]:
                    out.append((i, -1, max(p1, p2) + 0.1 * a[i], "mkt", None)); used.add((j1, j2, sign))
    return out


def sig_triangle(B: Bars, p: dict):
    c = B.c
    plo, phi = _pivots(B)
    out, used = [], set()
    ilo = ihi = 0
    known_lo, known_hi = [], []
    for i in range(1, len(c)):
        while ilo < len(plo) and plo[ilo][2] <= i:
            known_lo.append(plo[ilo]); ilo += 1
        while ihi < len(phi) and phi[ihi][2] <= i:
            known_hi.append(phi[ihi]); ihi += 1
        if len(known_lo) < 2 or len(known_hi) < 2:
            continue
        (a1, h1, _), (a2, h2, _) = known_hi[-2], known_hi[-1]
        (b1, l1, _), (b2, l2, _) = known_lo[-2], known_lo[-1]
        if not (h2 < h1 and l2 > l1) or i - min(a1, b1) > 60:
            continue
        key = (a1, a2, b1, b2)
        if key in used:
            continue
        up = lambda x: h1 + (h2 - h1) * (x - a1) / (a2 - a1)
        dn = lambda x: l1 + (l2 - l1) * (x - b1) / (b2 - b1)
        if up(i) <= dn(i):
            continue                              # lines already crossed: no triangle
        if c[i] > up(i) and c[i - 1] <= up(i - 1):
            out.append((i, 1, l2, "mkt", None)); used.add(key)
        elif c[i] < dn(i) and c[i - 1] >= dn(i - 1):
            out.append((i, -1, h2, "mkt", None)); used.add(key)
    return out


# --------------------------------------------------------------------------
#  Execution on M5
# --------------------------------------------------------------------------
def execute(m: SL.Market, B: Bars, tf: str, signals, rr: float, side: str, cm: float):
    T = m.m5["time"].to_numpy(np.int64)
    O, H, L, C = (m.m5[k].to_numpy() for k in ("open", "high", "low", "close"))
    hold = MAX_HOLD[tf]
    busy_until = -1
    trades = {}
    for (i, d, sl, kind, extra) in signals:
        t0 = B.t_close[i]
        if t0 < busy_until:
            continue
        j0 = int(np.searchsorted(T, t0))
        if j0 >= len(T):
            break
        if kind == "stop":                        # inside bar: wait up to 3 bars for a break
            up, dn = extra
            jw = int(np.searchsorted(T, t0 + 3 * TF_SEC[tf]))
            hu = np.nonzero(H[j0:jw] >= up)[0]
            hd = np.nonzero(L[j0:jw] <= dn)[0] if side == "both" else np.array([], int)
            fu = hu[0] if len(hu) else 10**9
            fd = hd[0] if len(hd) else 10**9
            if fu == fd:                          # neither, or both in one M5 bar
                continue
            if fu < fd:
                d, j0, sl = 1, j0 + fu, dn
                entry = max(up, O[j0])
            else:
                d, j0, sl = -1, j0 + fd, up
                entry = min(dn, O[j0])
        else:
            if side == "long" and d < 0:
                continue
            entry = O[j0]
        risk = (entry - sl) * d
        if risk <= 0:
            continue
        tp = entry + d * rr * risk
        j1 = int(np.searchsorted(T, T[j0] + hold))
        j1 = max(j1, j0 + 1)
        hs, ls = H[j0:j1], L[j0:j1]
        if d > 0:
            a = np.nonzero(ls <= sl)[0]; b = np.nonzero(hs >= tp)[0]
        else:
            a = np.nonzero(hs >= sl)[0]; b = np.nonzero(ls <= tp)[0]
        fa = a[0] if len(a) else 10**9
        fb = b[0] if len(b) else 10**9
        if fa == fb == 10**9:
            jx, px = j1 - 1, C[j1 - 1]
        elif fa <= fb:                            # stop first, or both in one M5 bar
            jx = j0 + fa
            px = sl if fa == 0 else (min(sl, O[jx]) if d > 0 else max(sl, O[jx]))
        else:
            jx, px = j0 + fb, tp
        nights = int(T[jx] // 86400 - T[j0] // 86400)
        net = d * (px - entry) / entry - SL.RT_COST * cm / entry - SL.SWAP_PA * cm * nights / 365
        day = pd.Timestamp(int(T[j0]) // 86400 * 86400, unit="s")
        trades[(day, len(trades))] = net
        busy_until = T[jx]
    if not trades:
        return pd.Series(0.0, index=m.d.index), pd.Series(dtype=float, index=pd.DatetimeIndex([]))
    s = pd.Series(trades)
    s.index = pd.DatetimeIndex([k[0] for k in s.index])
    daily = s.groupby(level=0).sum().reindex(m.d.index, fill_value=0.0)
    return daily, s


PATTERNS = {
    "Engulfing": (sig_engulfing, dict(context=["any", "after_move"])),
    "Pin bar": (sig_pinbar, dict(context=["any", "after_move"])),
    "Inside bar breakout": (sig_insidebar, {}),
    "Support/resistance": (sig_sr, dict(n=[20, 50], mode=["bounce", "break"])),
    "Double top/bottom": (sig_double, dict(tol=[0.25, 0.5])),
    "Triangle breakout": (sig_triangle, {}),
}
COMMON = dict(tf=["H1", "H4", "D1"], rr=[1.5, 2.0, 3.0], side=["both", "long"])


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)
    lines = []
    def say(s=""):
        print(s, flush=True); lines.append(s)

    m = SL.load_market(args.files)
    bars = {tf: make_bars(m.m5, tf) for tf in TF_SEC}
    bh = m.d["close"].pct_change().fillna(0)
    say(f"# XAUUSD chart-pattern survey — {m.d.index[0].date()} .. {m.d.index[-1].date()}")
    say(f"Costs: round trip ${SL.RT_COST:.2f}/oz, swap {SL.SWAP_PA*100:.0f}%/yr. "
        f"Dev {SL.DEV[0]}..{SL.DEV[1]}, hold-out {SL.HOLD[0]}..")
    say()

    sig_cache, results = {}, {}
    for name, (fn, own) in PATTERNS.items():
        grid = {**own, **COMMON}
        for vals in itertools.product(*grid.values()):
            p = dict(zip(grid, vals))
            ck = (name, p["tf"], tuple((k, p[k]) for k in own))
            if ck not in sig_cache:
                sig_cache[ck] = fn(bars[p["tf"]], p)
            r, tr = execute(m, bars[p["tf"]], p["tf"], sig_cache[ck], p["rr"], p["side"], 1.0)
            results[(name, SL.key(p))] = (grid, p, r, tr, SL.perf(SL.window(r, SL.DEV), SL.window(tr, SL.DEV)))
    n_trials = PRIOR_TRIALS + len(results)
    say(f"## Development ({len(results)} configurations; deflated Sharpe charged for {n_trials} "
        f"including the {PRIOR_TRIALS} earlier strategies)")

    candidates = []
    for name in PATTERNS:
        rows = [(g, p, s) for (n, _), (g, p, r, tr, s) in results.items() if n == name]
        rows.sort(key=lambda x: -x[2]["t"])
        grid, best_p, best_s = rows[0]
        nb = [results.get((name, SL.key(q))) for q in SL.neighbours(grid, best_p)]
        nb = [x for x in nb if x is not None]
        plateau = np.mean([x[4]["sharpe"] > 0 for x in nb]) if nb else 0.0
        dsr = SL.deflated(best_s["sharpe"], best_s["days"], best_s["skew"], best_s["kurt"], n_trials)
        ok = best_s["t"] >= 2.0 and best_s["years_pos"] >= 6 and plateau >= 0.6 and dsr >= 0.90
        share = np.mean([s["sharpe"] > 0 for _, _, s in rows])
        say(f"### {name}  ({len(rows)} configs, {share*100:.0f}% with Sharpe>0)")
        for g, p, s in rows[:3]:
            say(f"    {str(p):70s} {SL.fmtp(s)}")
        say(f"    best: plateau {plateau*100:.0f}%  deflated Sharpe {dsr:.2f}  -> {'CANDIDATE' if ok else 'rejected'}")
        if ok:
            candidates.append((name, grid, best_p))
    say()

    say(f"## Hold-out ({len(candidates)} candidate(s))")
    if not candidates:
        say("    No configuration met the development bar; the hold-out stays untouched.")
    bar = N01.inv_cdf(1 - 0.05 / max(len(candidates), 1))
    for name, grid, p in candidates:
        fn, own = PATTERNS[name]
        sig = fn(bars[p["tf"]], p)
        r, tr = execute(m, bars[p["tf"]], p["tf"], sig, p["rr"], p["side"], 1.0)
        r2, _ = execute(m, bars[p["tf"]], p["tf"], sig, p["rr"], p["side"], 2.0)
        hr = SL.window(r, SL.HOLD)
        s, s2 = SL.perf(hr, SL.window(tr, SL.HOLD)), SL.perf(SL.window(r2, SL.HOLD))
        at = SL.alpha_t(hr, SL.window(bh, SL.HOLD))
        ok = s["t"] >= bar and s2["sharpe"] > 0 and at >= bar
        say(f"### {name} {p}")
        say(f"      costs x1: {SL.fmtp(s)}")
        say(f"      costs x2: {SL.fmtp(s2)}")
        say(f"      alpha t vs buy&hold {at:+.2f}   bar {bar:.2f}  -> {'PASS' if ok else 'FAIL'}")
    if args.out:
        open(args.out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
