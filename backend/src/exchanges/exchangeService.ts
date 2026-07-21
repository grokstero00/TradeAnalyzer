import ccxt from "ccxt";
import type { Candle, ExchangeId, Timeframe } from "@tradeanalyzer/shared";
import { config } from "../config.ts";
import { generateCandles } from "../utils/sampleData.ts";

/**
 * Fetches OHLCV candles for a symbol/timeframe.
 *
 * Public market data does NOT require API keys, so the advisory phase can show
 * signals for any pair with zero credentials. When ENABLE_LIVE_EXCHANGE is off
 * (the default), or when a live call fails (e.g. no network), we transparently
 * fall back to deterministic synthetic candles so the whole app stays usable.
 */

export interface FetchCandlesParams {
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
}

export interface FetchCandlesResult {
  candles: Candle[];
  /** True when candles are synthetic rather than from a live exchange. */
  isSample: boolean;
  note?: string;
}

const SUPPORTED_LIVE: ExchangeId[] = ["binance", "bybit"];

export async function fetchCandles(params: FetchCandlesParams): Promise<FetchCandlesResult> {
  const { exchange, symbol, timeframe, limit = 300 } = params;

  if (!config.enableLiveExchange) {
    return sample(symbol, timeframe, limit, "Live exchange disabled (ENABLE_LIVE_EXCHANGE=false) — using sample data.");
  }

  if (!SUPPORTED_LIVE.includes(exchange)) {
    return sample(
      symbol,
      timeframe,
      limit,
      exchange === "mt5"
        ? "MT5 has no direct cloud API — see docs/ROADMAP.md. Using sample data."
        : `Exchange '${exchange}' not wired for live data yet — using sample data.`,
    );
  }

  try {
    const ExchangeClass = (ccxt as unknown as Record<string, new (cfg: object) => CcxtExchange>)[exchange];
    const client = new ExchangeClass({ enableRateLimit: true });
    const raw = await client.fetchOHLCV(symbol, timeframe, undefined, limit);
    const candles: Candle[] = raw
      .filter((r) => r[0] != null)
      .map((r) => ({
        timestamp: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      }));
    if (candles.length === 0) {
      return sample(symbol, timeframe, limit, "Exchange returned no candles — using sample data.");
    }
    return { candles, isSample: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sample(symbol, timeframe, limit, `Live fetch failed (${message}) — using sample data.`);
  }
}

/** Minimal structural type for the ccxt methods we use. */
interface CcxtExchange {
  fetchOHLCV(
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
  ): Promise<Array<Array<number | undefined>>>;
}

function sample(symbol: string, timeframe: Timeframe, limit: number, note: string): FetchCandlesResult {
  // Seed from the symbol so each pair looks different but stays reproducible.
  const seed = [...symbol].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const startPrice = symbol.startsWith("BTC") ? 45_000 : symbol.startsWith("ETH") ? 2_500 : 100;
  return {
    candles: generateCandles({ count: limit, timeframe, seed, startPrice }),
    isSample: true,
    note,
  };
}
