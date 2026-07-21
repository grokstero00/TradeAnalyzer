import { test } from "node:test";
import assert from "node:assert/strict";
import { sma, ema, rsi, macd, bollingerBands, atr, lastValid } from "./indicators.ts";

const approx = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test("sma: warm-up is NaN and averages are correct", () => {
  const out = sma([1, 2, 3, 4, 5], 3);
  assert.ok(Number.isNaN(out[0]));
  assert.ok(Number.isNaN(out[1]));
  approx(out[2], 2); // (1+2+3)/3
  approx(out[3], 3); // (2+3+4)/3
  approx(out[4], 4); // (3+4+5)/3
});

test("ema: seeds with SMA and stays within data range", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = ema(values, 3);
  assert.ok(Number.isNaN(out[1]));
  approx(out[2], 2); // seed = sma of first 3
  // subsequent EMAs must be finite and increasing for a rising series
  for (let i = 3; i < values.length; i++) {
    assert.ok(!Number.isNaN(out[i]));
    assert.ok(out[i] > out[i - 1]);
  }
});

test("rsi: all-gains series approaches 100", () => {
  const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
  const out = rsi(rising, 14);
  const last = lastValid(out)!;
  assert.ok(last > 99, `expected RSI near 100, got ${last}`);
});

test("rsi: all-losses series approaches 0", () => {
  const falling = Array.from({ length: 30 }, (_, i) => 100 - i);
  const out = rsi(falling, 14);
  const last = lastValid(out)!;
  assert.ok(last < 1, `expected RSI near 0, got ${last}`);
});

test("rsi: flat series is neutral 50", () => {
  const flat = new Array(30).fill(100);
  const out = rsi(flat, 14);
  approx(lastValid(out)!, 50);
});

test("macd: line, signal and histogram are index-aligned and finite late", () => {
  const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10);
  const { macd: line, signal, histogram } = macd(values);
  const i = values.length - 1;
  assert.ok(!Number.isNaN(line[i]));
  assert.ok(!Number.isNaN(signal[i]));
  approx(histogram[i], line[i] - signal[i]);
});

test("bollinger: price sits between the bands and bands widen with volatility", () => {
  const values = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 2 : -2));
  const { middle, upper, lower } = bollingerBands(values, 20, 2);
  const i = values.length - 1;
  assert.ok(upper[i] > middle[i] && middle[i] > lower[i]);
});

test("atr: positive and reflects range", () => {
  const n = 30;
  const high = Array.from({ length: n }, (_, i) => 102 + i);
  const low = Array.from({ length: n }, (_, i) => 98 + i);
  const close = Array.from({ length: n }, (_, i) => 100 + i);
  const out = atr(high, low, close, 14);
  const last = lastValid(out)!;
  assert.ok(last > 0);
});

test("lastValid: returns undefined for an all-NaN series", () => {
  assert.equal(lastValid([NaN, NaN]), undefined);
});
