import { test } from "node:test";
import assert from "node:assert/strict";
import { AlertStore, shouldAlert, watchKey } from "./alertEngine.ts";
import type { Signal, SignalAction, WatchItem } from "@tradeanalyzer/shared";

const item: WatchItem = { exchange: "binance", symbol: "BTC/USDT", timeframe: "1h" };

function signalWith(action: SignalAction): Signal {
  return {
    exchange: item.exchange,
    symbol: item.symbol,
    timeframe: item.timeframe,
    timestamp: Date.now(),
    action,
    confidence: 0.5,
    price: 100,
    votes: [],
    rationale: "test",
  };
}

/** Returns a provider that yields a scripted action sequence across calls. */
function scripted(actions: SignalAction[]) {
  let i = 0;
  return async () => signalWith(actions[Math.min(i++, actions.length - 1)]);
}

test("shouldAlert: pure rule", () => {
  assert.equal(shouldAlert(undefined, "BUY"), false); // first observation
  assert.equal(shouldAlert("HOLD", "BUY"), true); // flip
  assert.equal(shouldAlert("BUY", "BUY"), false); // unchanged
  assert.equal(shouldAlert("BUY", "HOLD"), true); // exit
});

test("evaluate: first pass records baseline but never alerts", async () => {
  const store = new AlertStore();
  store.setWatchlist([item]);
  const triggered = await store.evaluate(scripted(["BUY"]));
  assert.equal(triggered.length, 0);
  assert.equal(store.getAlerts().length, 0);
});

test("evaluate: alerts when the action changes", async () => {
  const store = new AlertStore();
  store.setWatchlist([item]);
  const provider = scripted(["HOLD", "BUY", "BUY", "SELL"]);

  assert.equal((await store.evaluate(provider)).length, 0); // baseline HOLD
  const first = await store.evaluate(provider); // HOLD -> BUY
  assert.equal(first.length, 1);
  assert.equal(first[0].previousAction, "HOLD");
  assert.equal(first[0].action, "BUY");

  assert.equal((await store.evaluate(provider)).length, 0); // BUY -> BUY (no change)

  const third = await store.evaluate(provider); // BUY -> SELL
  assert.equal(third.length, 1);
  assert.equal(third[0].action, "SELL");

  assert.equal(store.getAlerts().length, 2); // newest first
  assert.equal(store.getAlerts()[0].action, "SELL");
});

test("seedLastAction: lets a single evaluate detect a change immediately", async () => {
  const store = new AlertStore();
  store.setWatchlist([item]);
  store.seedLastAction(item, "HOLD");
  const triggered = await store.evaluate(scripted(["BUY"]));
  assert.equal(triggered.length, 1);
  assert.equal(triggered[0].previousAction, "HOLD");
});

test("unseen count and markAllSeen", async () => {
  const store = new AlertStore();
  store.setWatchlist([item]);
  store.seedLastAction(item, "HOLD");
  await store.evaluate(scripted(["BUY"]));
  assert.equal(store.unseenCount(), 1);
  store.markAllSeen();
  assert.equal(store.unseenCount(), 0);
});

test("evaluate: a failing provider is skipped, not fatal", async () => {
  const store = new AlertStore();
  store.setWatchlist([item]);
  const triggered = await store.evaluate(async () => {
    throw new Error("no price");
  });
  assert.equal(triggered.length, 0);
});

test("watchKey: stable composite key", () => {
  assert.equal(watchKey(item), "binance:BTC/USDT:1h");
});
