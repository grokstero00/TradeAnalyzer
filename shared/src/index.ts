/**
 * Shared domain types for TradeAnalyzer.
 *
 * These are imported by both the backend (signal engine, API) and the
 * mobile app so that a "Signal" or a "Candle" means exactly the same thing
 * on both sides of the wire.
 */

/** Supported exchanges. MT5 is planned for a later phase — see docs/ROADMAP.md. */
export type ExchangeId = "binance" | "bybit" | "mt5";

/** Supported candle timeframes. */
export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d";

/**
 * A single OHLCV candle.
 * `timestamp` is epoch milliseconds at the candle's OPEN.
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** The three actions a signal can recommend. Advisory only — never auto-executed in this phase. */
export type SignalAction = "BUY" | "SELL" | "HOLD";

/**
 * One indicator's contribution to a signal decision.
 * `vote` is the direction this indicator leans, `weight` how strongly (0..1).
 */
export interface IndicatorVote {
  /** e.g. "RSI", "MACD", "SMA_CROSS" */
  name: string;
  vote: SignalAction;
  /** 0..1 — how strongly this indicator leans in its voted direction. */
  weight: number;
  /** Human-readable reason, e.g. "RSI 28.4 — oversold". */
  reason: string;
  /** Raw numeric value(s) for display/debugging. */
  value?: number | Record<string, number>;
}

/**
 * A complete advisory signal for one symbol/timeframe at one point in time.
 */
export interface Signal {
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
  /** epoch ms of the candle this signal was computed on. */
  timestamp: number;
  action: SignalAction;
  /** 0..1 aggregate confidence. NOT a probability of profit — see disclaimer. */
  confidence: number;
  /** Price at signal time (last close). */
  price: number;
  /** Per-indicator breakdown that produced the action. */
  votes: IndicatorVote[];
  /** Plain-language summary shown in the app. */
  rationale: string;
  /** Suggested risk management (advisory only). */
  risk?: RiskSuggestion;
}

/** Advisory risk-management suggestion. Not an order. */
export interface RiskSuggestion {
  /** Suggested stop-loss price. */
  stopLoss?: number;
  /** Suggested take-profit price. */
  takeProfit?: number;
  /** ATR-derived volatility used to place the stop, for transparency. */
  atr?: number;
}

/** Result of a single closed backtest trade. */
export interface BacktestTrade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  action: Extract<SignalAction, "BUY" | "SELL">;
  /** Profit/loss in quote currency for 1 unit, before fees. */
  pnl: number;
  /** Return as a fraction, e.g. 0.023 == +2.3%. */
  returnPct: number;
  reason: "signal" | "stop-loss" | "take-profit" | "end-of-data";
}

/** Aggregate stats from a backtest run. */
export interface BacktestResult {
  symbol: string;
  timeframe: Timeframe;
  trades: BacktestTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  /** Simple annualization is intentionally omitted — this is a raw summary. */
}

/** One market the alert engine watches. */
export interface WatchItem {
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
}

/** A triggered alert: the signal action for a watched market changed. */
export interface Alert {
  id: string;
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
  /** The action before this change. */
  previousAction: SignalAction;
  /** The new action that triggered the alert. */
  action: SignalAction;
  confidence: number;
  price: number;
  /** epoch ms when the alert was triggered. */
  timestamp: number;
  /** Whether the user has seen it (for unread badges). */
  seen: boolean;
}

/** Public (non-secret) view of a stored exchange connection. */
export interface ExchangeAccountPublic {
  id: string;
  exchange: ExchangeId;
  label: string;
  /** Last 4 chars of the API key only — the secret is never returned. */
  apiKeyMasked: string;
  /** Whether this key can place trades. Advisory phase keeps this false. */
  canTrade: boolean;
  createdAt: number;
}

/** Standard API error shape. */
export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
