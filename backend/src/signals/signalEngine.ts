import type {
  Candle,
  ExchangeId,
  IndicatorVote,
  Signal,
  SignalAction,
  Timeframe,
} from "@tradeanalyzer/shared";
import { atr, bollingerBands, lastValid, macd, rsi, sma } from "../indicators/indicators.ts";

export interface SignalConfig {
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  smaShort: number;
  smaLong: number;
  bbPeriod: number;
  bbMult: number;
  atrPeriod: number;
  /** ATR multiple used for the advisory stop-loss distance. */
  atrStopMult: number;
  /** Reward-to-risk ratio used for the advisory take-profit. */
  rewardRisk: number;
  /** Aggregate |score| below this is reported as HOLD. Range 0..1. */
  holdThreshold: number;
}

export const DEFAULT_CONFIG: SignalConfig = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  smaShort: 20,
  smaLong: 50,
  bbPeriod: 20,
  bbMult: 2,
  atrPeriod: 14,
  atrStopMult: 1.5,
  rewardRisk: 2,
  holdThreshold: 0.15,
};

/**
 * Compute an advisory signal from a series of candles.
 *
 * The approach is a transparent weighted vote: each indicator casts a
 * BUY/SELL/HOLD vote with a weight in 0..1. Votes are summed into a score in
 * [-1, +1] (negative = sell-leaning), which maps to the final action and a
 * confidence. Every vote carries a human-readable `reason` so the app can show
 * *why*, never a black box.
 *
 * IMPORTANT: This is decision-support, not a prediction and not financial
 * advice. Confidence is agreement among indicators, NOT a probability of profit.
 */
export function computeSignal(
  candles: Candle[],
  meta: { exchange: ExchangeId; symbol: string; timeframe: Timeframe },
  cfg: SignalConfig = DEFAULT_CONFIG,
): Signal {
  if (candles.length < cfg.smaLong + 5) {
    throw new Error(
      `Not enough candles: need at least ${cfg.smaLong + 5}, got ${candles.length}`,
    );
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const price = closes[closes.length - 1];

  const votes: IndicatorVote[] = [
    rsiVote(closes, cfg),
    smaCrossVote(closes, cfg),
    macdVote(closes),
    bollingerVote(closes, cfg),
  ];

  // Trend regime filter: "trade with the trend". Oscillators (RSI, Bollinger)
  // are mean-reversion tools — on their own they yell "oversold, buy!" in a
  // crash. We down-weight any oscillator vote that fights the prevailing SMA
  // trend, so the tool stops trying to catch falling knives.
  const trendDir = trendDirection(closes, cfg);
  applyTrendFilter(votes, trendDir);

  // Aggregate into a directional score in [-1, +1] (+ is buy).
  let weighted = 0;
  let totalWeight = 0;
  for (const v of votes) {
    const dir = v.vote === "BUY" ? 1 : v.vote === "SELL" ? -1 : 0;
    weighted += dir * v.weight;
    totalWeight += v.weight;
  }
  const score = totalWeight > 0 ? weighted / totalWeight : 0;

  let action: SignalAction = "HOLD";
  if (score > cfg.holdThreshold) action = "BUY";
  else if (score < -cfg.holdThreshold) action = "SELL";

  const confidence = clamp01(Math.abs(score));

  const atrSeries = atr(highs, lows, closes, cfg.atrPeriod);
  const atrVal = lastValid(atrSeries);
  const risk = buildRisk(action, price, atrVal, cfg);

  return {
    exchange: meta.exchange,
    symbol: meta.symbol,
    timeframe: meta.timeframe,
    timestamp: candles[candles.length - 1].timestamp,
    action,
    confidence,
    price,
    votes,
    rationale: buildRationale(action, confidence, votes),
    risk,
  };
}

// --- Trend regime filter -------------------------------------------------------

/** +1 up, -1 down, 0 flat/unknown — based on short vs long SMA at the last bar. */
function trendDirection(closes: number[], cfg: SignalConfig): number {
  const s = lastValid(sma(closes, cfg.smaShort));
  const l = lastValid(sma(closes, cfg.smaLong));
  if (s === undefined || l === undefined) return 0;
  if (s > l) return 1;
  if (s < l) return -1;
  return 0;
}

/**
 * Down-weight counter-trend votes from the mean-reversion indicators
 * (RSI, Bollinger). Trend/momentum indicators (SMA_CROSS, MACD) are left alone
 * because they define the trend.
 */
function applyTrendFilter(votes: IndicatorVote[], trendDir: number): void {
  if (trendDir === 0) return;
  const COUNTER_TREND_DAMPING = 0.25;
  const meanReversion = new Set(["RSI", "BOLLINGER"]);
  for (const v of votes) {
    if (!meanReversion.has(v.name) || v.vote === "HOLD") continue;
    const voteDir = v.vote === "BUY" ? 1 : -1;
    if (voteDir !== trendDir) {
      v.weight = v.weight * COUNTER_TREND_DAMPING;
      v.reason += " (counter-trend — down-weighted)";
    }
  }
}

// --- Individual indicator votes ------------------------------------------------

function rsiVote(closes: number[], cfg: SignalConfig): IndicatorVote {
  const value = lastValid(rsi(closes, cfg.rsiPeriod)) ?? 50;
  if (value <= cfg.rsiOversold) {
    // Deeper oversold => stronger buy.
    const weight = clamp01((cfg.rsiOversold - value) / cfg.rsiOversold + 0.4);
    return { name: "RSI", vote: "BUY", weight, reason: `RSI ${value.toFixed(1)} — oversold`, value };
  }
  if (value >= cfg.rsiOverbought) {
    const weight = clamp01((value - cfg.rsiOverbought) / (100 - cfg.rsiOverbought) + 0.4);
    return { name: "RSI", vote: "SELL", weight, reason: `RSI ${value.toFixed(1)} — overbought`, value };
  }
  return { name: "RSI", vote: "HOLD", weight: 0.1, reason: `RSI ${value.toFixed(1)} — neutral`, value };
}

function smaCrossVote(closes: number[], cfg: SignalConfig): IndicatorVote {
  const shortMa = sma(closes, cfg.smaShort);
  const longMa = sma(closes, cfg.smaLong);
  const i = closes.length - 1;
  const s = shortMa[i];
  const l = longMa[i];
  const sPrev = shortMa[i - 1];
  const lPrev = longMa[i - 1];

  if ([s, l, sPrev, lPrev].some(Number.isNaN)) {
    return { name: "SMA_CROSS", vote: "HOLD", weight: 0.1, reason: "SMA cross — warming up" };
  }

  const crossedUp = sPrev <= lPrev && s > l;
  const crossedDown = sPrev >= lPrev && s < l;
  const value = { short: s, long: l };

  if (crossedUp) {
    return { name: "SMA_CROSS", vote: "BUY", weight: 0.9, reason: `Golden cross: SMA${cfg.smaShort} crossed above SMA${cfg.smaLong}`, value };
  }
  if (crossedDown) {
    return { name: "SMA_CROSS", vote: "SELL", weight: 0.9, reason: `Death cross: SMA${cfg.smaShort} crossed below SMA${cfg.smaLong}`, value };
  }
  // No fresh cross — lean gently in the direction of the current trend.
  if (s > l) return { name: "SMA_CROSS", vote: "BUY", weight: 0.35, reason: `Uptrend: SMA${cfg.smaShort} above SMA${cfg.smaLong}`, value };
  if (s < l) return { name: "SMA_CROSS", vote: "SELL", weight: 0.35, reason: `Downtrend: SMA${cfg.smaShort} below SMA${cfg.smaLong}`, value };
  return { name: "SMA_CROSS", vote: "HOLD", weight: 0.1, reason: "SMAs flat", value };
}

function macdVote(closes: number[]): IndicatorVote {
  const { histogram } = macd(closes);
  const i = closes.length - 1;
  const h = histogram[i];
  const hPrev = histogram[i - 1];
  if (Number.isNaN(h) || Number.isNaN(hPrev)) {
    return { name: "MACD", vote: "HOLD", weight: 0.1, reason: "MACD — warming up" };
  }
  const crossedUp = hPrev <= 0 && h > 0;
  const crossedDown = hPrev >= 0 && h < 0;
  if (crossedUp) return { name: "MACD", vote: "BUY", weight: 0.8, reason: "MACD histogram crossed above zero", value: h };
  if (crossedDown) return { name: "MACD", vote: "SELL", weight: 0.8, reason: "MACD histogram crossed below zero", value: h };
  if (h > 0) return { name: "MACD", vote: "BUY", weight: 0.3, reason: "MACD histogram positive", value: h };
  if (h < 0) return { name: "MACD", vote: "SELL", weight: 0.3, reason: "MACD histogram negative", value: h };
  return { name: "MACD", vote: "HOLD", weight: 0.1, reason: "MACD flat", value: h };
}

function bollingerVote(closes: number[], cfg: SignalConfig): IndicatorVote {
  const { upper, lower, middle } = bollingerBands(closes, cfg.bbPeriod, cfg.bbMult);
  const i = closes.length - 1;
  const price = closes[i];
  if (Number.isNaN(upper[i]) || Number.isNaN(lower[i])) {
    return { name: "BOLLINGER", vote: "HOLD", weight: 0.1, reason: "Bollinger — warming up" };
  }
  if (price <= lower[i]) {
    return { name: "BOLLINGER", vote: "BUY", weight: 0.6, reason: "Price at/below lower band — possible mean reversion up", value: { price, lower: lower[i] } };
  }
  if (price >= upper[i]) {
    return { name: "BOLLINGER", vote: "SELL", weight: 0.6, reason: "Price at/above upper band — possible mean reversion down", value: { price, upper: upper[i] } };
  }
  return { name: "BOLLINGER", vote: "HOLD", weight: 0.1, reason: "Price inside bands", value: { price, middle: middle[i] } };
}

// --- Helpers -------------------------------------------------------------------

function buildRisk(
  action: SignalAction,
  price: number,
  atrVal: number | undefined,
  cfg: SignalConfig,
): Signal["risk"] {
  if (action === "HOLD" || atrVal === undefined) return { atr: atrVal };
  const dist = atrVal * cfg.atrStopMult;
  if (action === "BUY") {
    return { atr: atrVal, stopLoss: price - dist, takeProfit: price + dist * cfg.rewardRisk };
  }
  // SELL (short)
  return { atr: atrVal, stopLoss: price + dist, takeProfit: price - dist * cfg.rewardRisk };
}

function buildRationale(action: SignalAction, confidence: number, votes: IndicatorVote[]): string {
  const agreeing = votes.filter((v) => v.vote === action);
  const pct = Math.round(confidence * 100);
  if (action === "HOLD") {
    return `Indicators are mixed or neutral (confidence ${pct}%). No clear edge — staying flat is reasonable.`;
  }
  const reasons = agreeing.map((v) => v.reason).join("; ");
  return `${action} leaning at ${pct}% confidence. Supporting: ${reasons || "trend bias"}. Not financial advice — confirm with your own analysis and risk limits.`;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
