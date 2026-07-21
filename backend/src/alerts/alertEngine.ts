import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Alert, Signal, SignalAction, WatchItem } from "@tradeanalyzer/shared";

/**
 * Action-change alert engine.
 *
 * The rule (chosen for signal-to-noise): fire an alert only when a watched
 * market's action *changes* from a previously observed action — e.g. HOLD→BUY,
 * BUY→SELL, BUY→HOLD. The very first observation of a market never alerts (there
 * is nothing to compare against yet).
 */

export function watchKey(item: WatchItem): string {
  return `${item.exchange}:${item.symbol}:${item.timeframe}`;
}

/** Pure decision: does moving from `prev` to `next` warrant an alert? */
export function shouldAlert(prev: SignalAction | undefined, next: SignalAction): boolean {
  return prev !== undefined && prev !== next;
}

interface PersistedState {
  watchlist: WatchItem[];
  lastActions: Record<string, SignalAction>;
  alerts: Alert[];
}

const DEFAULT_WATCHLIST: WatchItem[] = [
  { exchange: "binance", symbol: "BTC/USDT", timeframe: "1h" },
  { exchange: "binance", symbol: "ETH/USDT", timeframe: "1h" },
  { exchange: "binance", symbol: "SOL/USDT", timeframe: "1h" },
];

const MAX_ALERTS = 100;

/** Provider that turns a watched market into its current signal. */
export type SignalProvider = (item: WatchItem) => Promise<Signal>;

export class AlertStore {
  private state: PersistedState;
  private readonly filePath?: string;

  constructor(opts: { filePath?: string } = {}) {
    this.filePath = opts.filePath;
    this.state = { watchlist: DEFAULT_WATCHLIST, lastActions: {}, alerts: [] };
    this.load();
  }

  getWatchlist(): WatchItem[] {
    return this.state.watchlist;
  }

  setWatchlist(items: WatchItem[]): void {
    this.state.watchlist = items;
    this.save();
  }

  getAlerts(): Alert[] {
    return this.state.alerts;
  }

  unseenCount(): number {
    return this.state.alerts.filter((a) => !a.seen).length;
  }

  markAllSeen(): void {
    for (const a of this.state.alerts) a.seen = true;
    this.save();
  }

  clear(): void {
    this.state.alerts = [];
    this.save();
  }

  /** Test/seed helper: set the last known action for a market. */
  seedLastAction(item: WatchItem, action: SignalAction): void {
    this.state.lastActions[watchKey(item)] = action;
    this.save();
  }

  /**
   * Evaluate every watched market, appending an Alert wherever the action
   * changed. Returns the alerts newly triggered by this pass.
   */
  async evaluate(getSignal: SignalProvider): Promise<Alert[]> {
    const triggered: Alert[] = [];
    for (const item of this.state.watchlist) {
      let signal: Signal;
      try {
        signal = await getSignal(item);
      } catch {
        continue; // skip markets we couldn't price this round
      }
      const key = watchKey(item);
      const prev = this.state.lastActions[key];
      if (shouldAlert(prev, signal.action)) {
        const alert: Alert = {
          id: randomUUID(),
          exchange: item.exchange,
          symbol: item.symbol,
          timeframe: item.timeframe,
          previousAction: prev as SignalAction,
          action: signal.action,
          confidence: signal.confidence,
          price: signal.price,
          timestamp: Date.now(),
          seen: false,
        };
        triggered.push(alert);
      }
      this.state.lastActions[key] = signal.action;
    }

    if (triggered.length > 0) {
      // newest first, capped
      this.state.alerts = [...triggered, ...this.state.alerts].slice(0, MAX_ALERTS);
      this.save();
    }
    return triggered;
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<PersistedState>;
      this.state = {
        watchlist: parsed.watchlist ?? DEFAULT_WATCHLIST,
        lastActions: parsed.lastActions ?? {},
        alerts: parsed.alerts ?? [],
      };
    } catch {
      /* keep defaults */
    }
  }

  private save(): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }
}
