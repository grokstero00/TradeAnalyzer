# XAUUSD strategy survey — 2009-03-16 .. 2026-04-01
Costs: round trip $0.50/oz, swap 4%/yr. Dev 2010-01-01..2019-01-01, hold-out 2019-01-01..
Benchmark buy & hold — dev: Sharpe +0.19 (t +0.57)  ann  +2.9%  DD 52.8%  yrs+ 5/9  n    0  PF   - 
                       hold-out: Sharpe +1.13 (t +3.07)  ann +18.9%  DD 22.9%  yrs+ 7/8  n    0  PF   - 

## Development (162 configurations in 12 families)
### MA crossover (trend)  (16 configs, 19% with Sharpe>0)
    best {'fast': 20, 'slow': 50, 'side': 'long'}
      Sharpe +0.12 (t +0.37)  ann  +1.3%  DD 34.9%  yrs+ 4/9  n   25  PF 1.27
      plateau 33%  deflated Sharpe 0.01  -> rejected
### Donchian breakout (turtle)  (6 configs, 17% with Sharpe>0)
    best {'n': 20, 'side': 'long'}
      Sharpe +0.09 (t +0.28)  ann  +0.9%  DD 27.8%  yrs+ 4/9  n   35  PF 1.15
      plateau 0%  deflated Sharpe 0.01  -> rejected
### Time-series momentum  (8 configs, 38% with Sharpe>0)
    best {'look': 126, 'side': 'long'}
      Sharpe +0.22 (t +0.66)  ann  +2.4%  DD 32.3%  yrs+ 5/9  n   38  PF 1.64
      plateau 67%  deflated Sharpe 0.02  -> rejected
### RSI(2) mean reversion  (12 configs, 8% with Sharpe>0)
    best {'x': 10, 'trend': True, 'side': 'long'}
      Sharpe +0.16 (t +0.50)  ann  +0.7%  DD  9.5%  yrs+ 4/9  n   53  PF 1.22
      plateau 0%  deflated Sharpe 0.01  -> rejected
### N-day low/high reversal  (18 configs, 11% with Sharpe>0)
    best {'n': 3, 'hold': 3, 'side': 'long'}
      Sharpe +0.06 (t +0.19)  ann  +0.8%  DD 38.1%  yrs+ 6/9  n  291  PF 1.02
      plateau 25%  deflated Sharpe 0.01  -> rejected
### Volatility breakout (Williams)  (8 configs, 75% with Sharpe>0)
    best {'k': 1.0, 'side': 'long'}
      Sharpe +0.76 (t +2.30)  ann  +3.4%  DD  8.9%  yrs+ 6/9  n  384  PF 1.40
      plateau 100%  deflated Sharpe 0.34  -> rejected
### Day of week  (10 configs, 30% with Sharpe>0)
    best {'dow': 4, 'dir': 1}
      Sharpe +0.67 (t +2.03)  ann  +4.8%  DD 18.2%  yrs+ 8/9  n  464  PF 1.31
      plateau 0%  deflated Sharpe 0.25  -> rejected
### Turn of month  (9 configs, 78% with Sharpe>0)
    best {'before': 1, 'after': 3}
      Sharpe +0.45 (t +1.38)  ann  +3.2%  DD 22.4%  yrs+ 6/9  n  108  PF 1.37
      plateau 100%  deflated Sharpe 0.09  -> rejected
### Session first-hour drive  (10 configs, 0% with Sharpe>0)
    best {'hour': 10, 'mode': 'follow'}
      Sharpe -0.55 (t -1.67)  ann  -6.4%  DD 67.7%  yrs+ 3/9  n 2296  PF 0.91
      plateau 0%  deflated Sharpe 0.00  -> rejected
### Fixed intraday window  (26 configs, 12% with Sharpe>0)
    best {'a': 1, 'b': 9, 'dir': 1}
      Sharpe +0.09 (t +0.26)  ann  +0.5%  DD 15.8%  yrs+ 5/9  n 2321  PF 1.02
      plateau 0%  deflated Sharpe 0.01  -> rejected
### Weekend gap fade  (3 configs, 67% with Sharpe>0)
    best {'min_gap': 0.002}
      Sharpe +0.67 (t +2.04)  ann  +2.0%  DD  4.0%  yrs+ 8/9  n   71  PF 2.05
      plateau 50%  deflated Sharpe 0.22  -> rejected
### Opening-range breakout, other sessions  (36 configs, 0% with Sharpe>0)
    best {'start_h': 9, 'start_m': 30, 'minutes': 60, 'rr': 1.5}
      Sharpe -0.90 (t -2.73)  ann  -4.6%  DD 45.4%  yrs+ 3/9  n 1640  PF 0.86
      plateau 0%  deflated Sharpe 0.00  -> rejected

## Hold-out (0 candidate(s))
    No configuration met the development bar; the hold-out stays untouched.
