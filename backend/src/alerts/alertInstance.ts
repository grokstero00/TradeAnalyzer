import type { Signal, WatchItem } from "@tradeanalyzer/shared";
import { config } from "../config.ts";
import { fetchCandles } from "../exchanges/exchangeService.ts";
import { computeSignal } from "../signals/signalEngine.ts";
import { AlertStore } from "./alertEngine.ts";

/** The single, file-backed alert store for the process. */
export const alertStore = new AlertStore({ filePath: config.alertsFile });

/** Turns a watched market into its current signal (candles → signal engine). */
export async function liveSignalProvider(item: WatchItem): Promise<Signal> {
  const { candles } = await fetchCandles({
    exchange: item.exchange,
    symbol: item.symbol,
    timeframe: item.timeframe,
    limit: 300,
  });
  return computeSignal(candles, item);
}
