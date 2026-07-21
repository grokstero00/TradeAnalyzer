/**
 * API response types for the mobile app.
 *
 * These MIRROR the canonical definitions in `../../shared/src/index.ts`. They
 * are duplicated locally (rather than imported) so the Expo app stays simple to
 * run without monorepo Metro resolution of the built shared package. If you
 * change the shared types, update these to match.
 */

export type ExchangeId = "binance" | "bybit" | "mt5";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type SignalAction = "BUY" | "SELL" | "HOLD";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandlesResponse {
  candles: Candle[];
  isSample: boolean;
  note?: string;
}

export interface IndicatorVote {
  name: string;
  vote: SignalAction;
  weight: number;
  reason: string;
  value?: number | Record<string, number>;
}

export interface RiskSuggestion {
  stopLoss?: number;
  takeProfit?: number;
  atr?: number;
}

export interface Signal {
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
  timestamp: number;
  action: SignalAction;
  confidence: number;
  price: number;
  votes: IndicatorVote[];
  rationale: string;
  risk?: RiskSuggestion;
}

export interface SignalResponse {
  signal: Signal;
  isSample: boolean;
  note?: string;
  disclaimer: string;
}

export interface BacktestResult {
  symbol: string;
  timeframe: Timeframe;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
}

export interface BacktestResponse {
  result: BacktestResult;
  isSample: boolean;
  note?: string;
  disclaimer: string;
}

export interface WatchItem {
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
}

export interface Alert {
  id: string;
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
  previousAction: SignalAction;
  action: SignalAction;
  confidence: number;
  price: number;
  timestamp: number;
  seen: boolean;
}

export interface AlertsResponse {
  alerts: Alert[];
  watchlist: WatchItem[];
  unseen: number;
}

export interface EvaluateResponse {
  triggered: Alert[];
  alerts: Alert[];
  unseen: number;
}

export interface ExchangeAccountPublic {
  id: string;
  exchange: ExchangeId;
  label: string;
  apiKeyMasked: string;
  canTrade: boolean;
  createdAt: number;
}
