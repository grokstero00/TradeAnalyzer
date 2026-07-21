import type {
  BacktestResult,
  BacktestTrade,
  Candle,
  ExchangeId,
  Timeframe,
} from "@tradeanalyzer/shared";
import { computeSignal, DEFAULT_CONFIG, type SignalConfig } from "../signals/signalEngine.ts";

export interface BacktestOptions {
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
  cfg?: SignalConfig;
  /** Trading fee per side as a fraction (e.g. 0.001 = 0.1%). */
  feePct?: number;
  /** How many candles to feed the engine before the first trade may open. */
  warmup?: number;
}

/**
 * A simple long-only walk-forward backtest.
 *
 * At each step we recompute the signal on all candles seen SO FAR (no
 * look-ahead), then:
 *   - if flat and the signal is BUY, we enter long at that candle's close;
 *   - if long, we exit on a SELL signal, or when the advisory stop-loss /
 *     take-profit from the signal is hit intrabar.
 *
 * It is intentionally conservative and honest about its limits: no leverage,
 * no shorting, fees applied on both sides. Real markets have slippage and
 * partial fills this does not model.
 */
export function runBacktest(candles: Candle[], opts: BacktestOptions): BacktestResult {
  const cfg = opts.cfg ?? DEFAULT_CONFIG;
  const feePct = opts.feePct ?? 0.001;
  const warmup = opts.warmup ?? cfg.smaLong + 5;

  const trades: BacktestTrade[] = [];
  let inPosition = false;
  let entryPrice = 0;
  let entryTime = 0;
  let stopLoss: number | undefined;
  let takeProfit: number | undefined;

  for (let i = warmup; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const candle = candles[i];

    if (inPosition) {
      // Check stop / target against this candle's range first.
      let exitPrice: number | undefined;
      let reason: BacktestTrade["reason"] | undefined;
      if (stopLoss !== undefined && candle.low <= stopLoss) {
        exitPrice = stopLoss;
        reason = "stop-loss";
      } else if (takeProfit !== undefined && candle.high >= takeProfit) {
        exitPrice = takeProfit;
        reason = "take-profit";
      }

      if (exitPrice === undefined) {
        const sig = safeSignal(window, opts, cfg);
        if (sig?.action === "SELL") {
          exitPrice = candle.close;
          reason = "signal";
        }
      }

      if (exitPrice !== undefined && reason !== undefined) {
        trades.push(closeTrade(entryTime, entryPrice, candle.timestamp, exitPrice, feePct, reason));
        inPosition = false;
        stopLoss = takeProfit = undefined;
      }
      continue;
    }

    // Flat: look for an entry.
    const sig = safeSignal(window, opts, cfg);
    if (sig?.action === "BUY") {
      inPosition = true;
      entryPrice = candle.close;
      entryTime = candle.timestamp;
      stopLoss = sig.risk?.stopLoss;
      takeProfit = sig.risk?.takeProfit;
    }
  }

  // Close any open position at the final candle.
  if (inPosition) {
    const last = candles[candles.length - 1];
    trades.push(closeTrade(entryTime, entryPrice, last.timestamp, last.close, feePct, "end-of-data"));
  }

  return summarize(trades, opts);
}

function safeSignal(window: Candle[], opts: BacktestOptions, cfg: SignalConfig) {
  try {
    return computeSignal(window, { exchange: opts.exchange, symbol: opts.symbol, timeframe: opts.timeframe }, cfg);
  } catch {
    return undefined;
  }
}

function closeTrade(
  entryTime: number,
  entryPrice: number,
  exitTime: number,
  exitPrice: number,
  feePct: number,
  reason: BacktestTrade["reason"],
): BacktestTrade {
  const grossPnl = exitPrice - entryPrice;
  const fees = (entryPrice + exitPrice) * feePct;
  const pnl = grossPnl - fees;
  const returnPct = pnl / entryPrice;
  return { entryTime, entryPrice, exitTime, exitPrice, action: "BUY", pnl, returnPct, reason };
}

function summarize(trades: BacktestTrade[], opts: BacktestOptions): BacktestResult {
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;

  // Compound the per-trade returns to get total return and track drawdown.
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity *= 1 + t.returnPct;
    peak = Math.max(peak, equity);
    const dd = (peak - equity) / peak;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  return {
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    trades,
    totalTrades: trades.length,
    wins,
    losses,
    winRate: trades.length ? wins / trades.length : 0,
    totalReturnPct: equity - 1,
    maxDrawdownPct: maxDrawdown,
  };
}
