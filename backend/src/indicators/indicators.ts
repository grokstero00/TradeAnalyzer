/**
 * Technical indicators, implemented from scratch as pure functions.
 *
 * Conventions:
 *  - Every function that returns a series returns an array the SAME length as
 *    its input. Positions that cannot be computed yet (the "warm-up" period)
 *    hold `NaN`. This keeps every series index-aligned with the candles.
 *  - Nothing here knows about exchanges, HTTP, or app types — just numbers.
 *
 * None of this predicts the future. Indicators summarize the recent past;
 * the signal engine (see ../signals) combines them into an opinion.
 */

/** Simple Moving Average. */
export function sma(values: number[], period: number): number[] {
  if (period <= 0) throw new Error("sma: period must be > 0");
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential Moving Average, seeded with the SMA of the first `period` values. */
export function ema(values: number[], period: number): number[] {
  if (period <= 0) throw new Error("ema: period must be > 0");
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;

  const k = 2 / (period + 1);
  // Seed with SMA of the first `period` values.
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;

  for (let i = period; i < values.length; i++) {
    out[i] = (values[i] - out[i - 1]) * k + out[i - 1];
  }
  return out;
}

/**
 * Relative Strength Index using Wilder's smoothing. Range 0..100.
 * RSI is defined starting at index `period`.
 */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFromAvgs(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAvgs(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAvgs(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

/** Moving Average Convergence Divergence. */
export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const macdLine = values.map((_, i) =>
    Number.isNaN(fast[i]) || Number.isNaN(slow[i]) ? NaN : fast[i] - slow[i],
  );

  // Signal line = EMA of the macd line, computed over its non-NaN tail then
  // re-aligned back into a full-length array.
  const firstValid = macdLine.findIndex((v) => !Number.isNaN(v));
  const signal = new Array<number>(values.length).fill(NaN);
  if (firstValid !== -1) {
    const tail = macdLine.slice(firstValid);
    const tailSignal = ema(tail, signalPeriod);
    for (let i = 0; i < tailSignal.length; i++) {
      signal[firstValid + i] = tailSignal[i];
    }
  }

  const histogram = values.map((_, i) =>
    Number.isNaN(macdLine[i]) || Number.isNaN(signal[i]) ? NaN : macdLine[i] - signal[i],
  );

  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  middle: number[];
  upper: number[];
  lower: number[];
}

/** Bollinger Bands: SMA middle band ± `mult` standard deviations. */
export function bollingerBands(values: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);

  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i];
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - mean;
      variance += d * d;
    }
    const sd = Math.sqrt(variance / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}

/**
 * Average True Range — a volatility measure used to size stop-losses.
 * Needs highs, lows and closes (index-aligned).
 */
export function atr(
  high: number[],
  low: number[],
  close: number[],
  period = 14,
): number[] {
  const n = close.length;
  const out = new Array<number>(n).fill(NaN);
  if (n <= period) return out;

  const tr = new Array<number>(n).fill(NaN);
  tr[0] = high[0] - low[0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1]),
    );
  }

  // First ATR = simple average of the first `period` true ranges.
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  out[period] = sum / period;
  for (let i = period + 1; i < n; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

/** Return the last non-NaN value of a series, or undefined if none. */
export function lastValid(series: number[]): number | undefined {
  for (let i = series.length - 1; i >= 0; i--) {
    if (!Number.isNaN(series[i])) return series[i];
  }
  return undefined;
}
