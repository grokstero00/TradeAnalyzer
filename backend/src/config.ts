import "dotenv/config";

/**
 * Central, validated configuration. Reads once at startup so the rest of the
 * app never touches process.env directly.
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  vaultMasterKey: process.env.VAULT_MASTER_KEY ?? "",
  vaultFile: process.env.VAULT_FILE ?? "./data/vault.json",
  /** When false, the backend serves synthetic candles instead of hitting a real exchange. */
  enableLiveExchange: (process.env.ENABLE_LIVE_EXCHANGE ?? "false").toLowerCase() === "true",
} as const;

export type AppConfig = typeof config;
