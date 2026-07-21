import { Router } from "express";
import { z } from "zod";
import { fetchCandles } from "../exchanges/exchangeService.ts";
import { computeSignal } from "../signals/signalEngine.ts";
import { runBacktest } from "../backtest/backtester.ts";

export const marketRouter = Router();

const querySchema = z.object({
  exchange: z.enum(["binance", "bybit", "mt5"]).default("binance"),
  symbol: z.string().min(1).default("BTC/USDT"),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1h"),
  limit: z.coerce.number().int().min(60).max(1000).default(300),
});

/** GET /api/candles — raw OHLCV (public data, no keys needed). */
marketRouter.get("/candles", async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const result = await fetchCandles(q);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/signal — advisory Buy/Sell/Hold for a symbol/timeframe. */
marketRouter.get("/signal", async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const { candles, isSample, note } = await fetchCandles(q);
    const signal = computeSignal(candles, { exchange: q.exchange, symbol: q.symbol, timeframe: q.timeframe });
    res.json({
      signal,
      isSample,
      note,
      disclaimer:
        "Advisory only. Not financial advice. Confidence is indicator agreement, not a probability of profit.",
    });
  } catch (err) {
    next(err);
  }
});

const backtestSchema = querySchema.extend({
  feePct: z.coerce.number().min(0).max(0.05).default(0.001),
});

/** GET /api/backtest — walk-forward backtest summary for the default strategy. */
marketRouter.get("/backtest", async (req, res, next) => {
  try {
    const q = backtestSchema.parse(req.query);
    const { candles, isSample, note } = await fetchCandles(q);
    const result = runBacktest(candles, {
      exchange: q.exchange,
      symbol: q.symbol,
      timeframe: q.timeframe,
      feePct: q.feePct,
    });
    res.json({
      result,
      isSample,
      note,
      disclaimer: "Backtests describe the past under simplifying assumptions (no slippage, fixed fees). Past performance does not predict future results.",
    });
  } catch (err) {
    next(err);
  }
});
