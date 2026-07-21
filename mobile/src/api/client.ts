import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  BacktestResponse,
  CandlesResponse,
  ExchangeAccountPublic,
  ExchangeId,
  SignalResponse,
  Timeframe,
} from "./types";

const BASE_URL_KEY = "tradeanalyzer.baseUrl";

/**
 * Default backend URL.
 *
 * NOTE: on a physical device, "localhost" points at the phone, not your
 * computer. Set the base URL in Settings to your machine's LAN IP, e.g.
 * http://192.168.1.42:4000. The Android emulator can use http://10.0.2.2:4000.
 */
export const DEFAULT_BASE_URL = "http://localhost:4000";

export async function getBaseUrl(): Promise<string> {
  return (await AsyncStorage.getItem(BASE_URL_KEY)) ?? DEFAULT_BASE_URL;
}

export async function setBaseUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(BASE_URL_KEY, url.replace(/\/+$/, ""));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface SignalQuery {
  exchange: ExchangeId;
  symbol: string;
  timeframe: Timeframe;
}

export function fetchSignal(q: SignalQuery): Promise<SignalResponse> {
  const params = new URLSearchParams({ exchange: q.exchange, symbol: q.symbol, timeframe: q.timeframe });
  return request<SignalResponse>(`/api/signal?${params.toString()}`);
}

export function fetchCandles(q: SignalQuery & { limit?: number }): Promise<CandlesResponse> {
  const params = new URLSearchParams({
    exchange: q.exchange,
    symbol: q.symbol,
    timeframe: q.timeframe,
    limit: String(q.limit ?? 120),
  });
  return request<CandlesResponse>(`/api/candles?${params.toString()}`);
}

export function fetchBacktest(q: SignalQuery & { limit?: number }): Promise<BacktestResponse> {
  const params = new URLSearchParams({
    exchange: q.exchange,
    symbol: q.symbol,
    timeframe: q.timeframe,
    limit: String(q.limit ?? 500),
  });
  return request<BacktestResponse>(`/api/backtest?${params.toString()}`);
}

export function listKeys(): Promise<ExchangeAccountPublic[]> {
  return request<ExchangeAccountPublic[]>("/api/keys");
}

export function addKey(input: {
  exchange: ExchangeId;
  label: string;
  apiKey: string;
  apiSecret: string;
  canTrade?: boolean;
}): Promise<ExchangeAccountPublic> {
  return request<ExchangeAccountPublic>("/api/keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteKey(id: string): Promise<void> {
  return request<void>(`/api/keys/${id}`, { method: "DELETE" });
}

export async function healthCheck(): Promise<boolean> {
  try {
    await request("/health");
    return true;
  } catch {
    return false;
  }
}
