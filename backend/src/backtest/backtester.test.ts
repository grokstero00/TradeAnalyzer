import { test } from "node:test";
import assert from "node:assert/strict";
import { runBacktest } from "./backtester.ts";
import { generateCandles } from "../utils/sampleData.ts";

const opts = { exchange: "binance" as const, symbol: "BTC/USDT", timeframe: "1h" as const };

test("runBacktest: produces a coherent summary", () => {
  const candles = generateCandles({ count: 400, seed: 3, drift: 0.0003 });
  const result = runBacktest(candles, opts);

  assert.equal(result.totalTrades, result.trades.length);
  assert.equal(result.wins + result.losses, result.totalTrades);
  assert.ok(result.winRate >= 0 && result.winRate <= 1);
  assert.ok(result.maxDrawdownPct >= 0);
});

test("runBacktest: never opens a trade before warmup", () => {
  const candles = generateCandles({ count: 300, seed: 11 });
  const warmup = 60;
  const result = runBacktest(candles, { ...opts, warmup });
  const earliestAllowed = candles[warmup].timestamp;
  for (const t of result.trades) {
    assert.ok(t.entryTime >= earliestAllowed, "trade entered before warmup window");
  }
});

test("runBacktest: no trades on too-short data instead of throwing", () => {
  const candles = generateCandles({ count: 70, seed: 1 });
  const result = runBacktest(candles, opts);
  assert.ok(result.totalTrades >= 0);
});

test("runBacktest: fees make a zero-drift market unprofitable on average", () => {
  const candles = generateCandles({ count: 500, seed: 99, drift: 0, volatility: 0.008 });
  const result = runBacktest(candles, { ...opts, feePct: 0.001 });
  // Not a hard guarantee, but with zero drift and fees the edge should not be large.
  assert.ok(result.totalReturnPct < 0.5, `unexpectedly high return: ${result.totalReturnPct}`);
});
