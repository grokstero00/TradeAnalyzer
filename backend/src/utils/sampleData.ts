import type { Candle, Timeframe } from "@tradeanalyzer/shared";

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

/** Deterministic pseudo-random generator so demo data is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate synthetic OHLCV candles via a gentle random walk with drift.
 * Lets the whole app be developed and demoed without any exchange keys.
 */
export function generateCandles(opts: {
  count?: number;
  timeframe?: Timeframe;
  startPrice?: number;
  seed?: number;
  /** Per-candle upward drift as a fraction (e.g. 0.0005). */
  drift?: number;
  /** Per-candle volatility as a fraction. */
  volatility?: number;
} = {}): Candle[] {
  const {
    count = 300,
    timeframe = "1h",
    startPrice = 30_000,
    seed = 42,
    drift = 0.0002,
    volatility = 0.01,
  } = opts;

  const rand = mulberry32(seed);
  const stepMs = TIMEFRAME_MS[timeframe];
  const now = Date.now();
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i) * stepMs;
    const open = price;
    // Random shock ~ N(0, volatility) approximated from two uniforms.
    const shock = (rand() + rand() - 1) * volatility;
    const change = drift + shock;
    const close = Math.max(0.01, open * (1 + change));
    const wick = Math.abs(shock) * open + open * volatility * 0.3;
    const high = Math.max(open, close) + rand() * wick;
    const low = Math.min(open, close) - rand() * wick;
    const volume = 100 + rand() * 900;
    candles.push({ timestamp, open, high, low, close, volume });
    price = close;
  }
  return candles;
}
