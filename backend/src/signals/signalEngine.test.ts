import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSignal, DEFAULT_CONFIG } from "./signalEngine.ts";
import { generateCandles } from "../utils/sampleData.ts";
import type { Candle } from "@tradeanalyzer/shared";

const meta = { exchange: "binance" as const, symbol: "BTC/USDT", timeframe: "1h" as const };

test("computeSignal: returns a well-formed signal", () => {
  const candles = generateCandles({ count: 200, seed: 7 });
  const sig = computeSignal(candles, meta);

  assert.ok(["BUY", "SELL", "HOLD"].includes(sig.action));
  assert.ok(sig.confidence >= 0 && sig.confidence <= 1);
  assert.equal(sig.votes.length, 4);
  assert.equal(sig.price, candles[candles.length - 1].close);
  assert.ok(sig.rationale.length > 0);
});

test("computeSignal: strong uptrend leans BUY, not SELL", () => {
  // Steady rising series → short SMA above long SMA, positive MACD.
  const candles: Candle[] = Array.from({ length: 120 }, (_, i) => {
    const price = 100 + i; // monotonic uptrend
    return { timestamp: i * 3600_000, open: price, high: price + 0.5, low: price - 0.5, close: price, volume: 100 };
  });
  const sig = computeSignal(candles, meta);
  assert.notEqual(sig.action, "SELL");
});

test("computeSignal: steady downtrend leans SELL, not BUY", () => {
  const candles: Candle[] = Array.from({ length: 120 }, (_, i) => {
    const price = 300 - i;
    return { timestamp: i * 3600_000, open: price, high: price + 0.5, low: price - 0.5, close: price, volume: 100 };
  });
  const sig = computeSignal(candles, meta);
  assert.notEqual(sig.action, "BUY");
});

test("computeSignal: BUY produces a stop-loss below price and take-profit above", () => {
  const candles: Candle[] = Array.from({ length: 120 }, (_, i) => {
    const price = 100 + i;
    return { timestamp: i * 3600_000, open: price, high: price + 1, low: price - 1, close: price, volume: 100 };
  });
  const sig = computeSignal(candles, meta);
  if (sig.action === "BUY" && sig.risk?.stopLoss !== undefined) {
    assert.ok(sig.risk.stopLoss < sig.price);
    assert.ok((sig.risk.takeProfit ?? 0) > sig.price);
  }
});

test("computeSignal: throws when given too few candles", () => {
  const candles = generateCandles({ count: 10 });
  assert.throws(() => computeSignal(candles, meta, DEFAULT_CONFIG));
});
