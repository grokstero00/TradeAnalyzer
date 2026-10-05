# XAUUSD chart-pattern survey — 2009-03-16 .. 2026-04-01
Costs: round trip $0.50/oz, swap 4%/yr. Dev 2010-01-01..2019-01-01, hold-out 2019-01-01..

## Development (216 configurations; deflated Sharpe charged for 378 including the 162 earlier strategies)
### Engulfing  (36 configs, 14% with Sharpe>0)
    {'context': 'after_move', 'tf': 'H4', 'rr': 3.0, 'side': 'long'}       Sharpe +0.15 (t +0.45)  ann  +1.1%  DD 16.3%  yrs+ 6/9  n  416  PF 1.06
    {'context': 'any', 'tf': 'D1', 'rr': 2.0, 'side': 'long'}              Sharpe +0.13 (t +0.38)  ann  +0.8%  DD 17.6%  yrs+ 5/9  n  118  PF 1.09
    {'context': 'any', 'tf': 'D1', 'rr': 2.0, 'side': 'both'}              Sharpe +0.09 (t +0.28)  ann  +0.9%  DD 23.6%  yrs+ 4/9  n  223  PF 1.05
    best: plateau 20%  deflated Sharpe 0.01  -> rejected
### Pin bar  (36 configs, 58% with Sharpe>0)
    {'context': 'after_move', 'tf': 'D1', 'rr': 2.0, 'side': 'long'}       Sharpe +0.45 (t +1.38)  ann  +1.6%  DD  8.7%  yrs+ 5/9  n   32  PF 1.84
    {'context': 'after_move', 'tf': 'D1', 'rr': 1.5, 'side': 'long'}       Sharpe +0.38 (t +1.15)  ann  +1.2%  DD  9.1%  yrs+ 5/9  n   32  PF 1.64
    {'context': 'after_move', 'tf': 'D1', 'rr': 2.0, 'side': 'both'}       Sharpe +0.36 (t +1.10)  ann  +1.6%  DD 12.5%  yrs+ 6/9  n   55  PF 1.42
    best: plateau 100%  deflated Sharpe 0.03  -> rejected
### Inside bar breakout  (18 configs, 33% with Sharpe>0)
    {'tf': 'D1', 'rr': 1.5, 'side': 'long'}                                Sharpe +0.23 (t +0.69)  ann  +1.6%  DD 25.0%  yrs+ 5/9  n  151  PF 1.13
    {'tf': 'D1', 'rr': 2.0, 'side': 'long'}                                Sharpe +0.21 (t +0.65)  ann  +1.6%  DD 25.2%  yrs+ 4/9  n  147  PF 1.13
    {'tf': 'D1', 'rr': 2.0, 'side': 'both'}                                Sharpe +0.18 (t +0.54)  ann  +1.6%  DD 17.1%  yrs+ 6/9  n  202  PF 1.09
    best: plateau 67%  deflated Sharpe 0.01  -> rejected
### Support/resistance  (72 configs, 18% with Sharpe>0)
    {'n': 50, 'mode': 'bounce', 'tf': 'D1', 'rr': 2.0, 'side': 'long'}     Sharpe +0.41 (t +1.23)  ann  +2.0%  DD 13.8%  yrs+ 6/9  n   78  PF 1.48
    {'n': 50, 'mode': 'bounce', 'tf': 'D1', 'rr': 1.5, 'side': 'long'}     Sharpe +0.34 (t +1.03)  ann  +1.4%  DD 15.0%  yrs+ 6/9  n   79  PF 1.36
    {'n': 20, 'mode': 'bounce', 'tf': 'D1', 'rr': 2.0, 'side': 'long'}     Sharpe +0.30 (t +0.90)  ann  +1.7%  DD 13.1%  yrs+ 6/9  n  131  PF 1.23
    best: plateau 83%  deflated Sharpe 0.02  -> rejected
### Double top/bottom  (36 configs, 67% with Sharpe>0)
    {'tol': 0.5, 'tf': 'H4', 'rr': 2.0, 'side': 'long'}                    Sharpe +0.44 (t +1.33)  ann  +2.1%  DD  6.7%  yrs+ 7/9  n   91  PF 1.39
    {'tol': 0.25, 'tf': 'D1', 'rr': 1.5, 'side': 'both'}                   Sharpe +0.42 (t +1.28)  ann  +1.5%  DD  5.1%  yrs+ 4/9  n   13  PF 2.71
    {'tol': 0.5, 'tf': 'H4', 'rr': 1.5, 'side': 'long'}                    Sharpe +0.41 (t +1.25)  ann  +1.9%  DD  6.7%  yrs+ 7/9  n   92  PF 1.35
    best: plateau 100%  deflated Sharpe 0.04  -> rejected
### Triangle breakout  (18 configs, 83% with Sharpe>0)
    {'tf': 'H4', 'rr': 1.5, 'side': 'both'}                                Sharpe +0.84 (t +2.56)  ann  +5.3%  DD 11.4%  yrs+ 6/9  n  221  PF 1.52
    {'tf': 'H4', 'rr': 2.0, 'side': 'both'}                                Sharpe +0.79 (t +2.42)  ann  +5.1%  DD 11.4%  yrs+ 6/9  n  218  PF 1.50
    {'tf': 'H4', 'rr': 3.0, 'side': 'both'}                                Sharpe +0.65 (t +1.96)  ann  +4.4%  DD 14.3%  yrs+ 6/9  n  216  PF 1.41
    best: plateau 100%  deflated Sharpe 0.33  -> rejected

## Hold-out (0 candidate(s))
    No configuration met the development bar; the hold-out stays untouched.
