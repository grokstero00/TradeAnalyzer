import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { config } from "./config.ts";
import { marketRouter } from "./routes/market.ts";
import { keysRouter } from "./routes/keys.ts";
import { getVault } from "./security/vaultInstance.ts";

const app = express();
app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "tradeanalyzer-backend",
    liveExchange: config.enableLiveExchange,
    vaultConfigured: getVault() !== null,
    time: new Date().toISOString(),
  });
});

app.use("/api", marketRouter);
app.use("/api/keys", keysRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "not_found", message: "Unknown endpoint." });
});

// Central error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "bad_request", message: "Invalid parameters.", details: err.issues });
    return;
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  res.status(500).json({ error: "internal_error", message });
});

app.listen(config.port, () => {
  console.log(`TradeAnalyzer backend listening on http://localhost:${config.port}`);
  console.log(`  live exchange: ${config.enableLiveExchange ? "ON" : "OFF (sample data)"}`);
  console.log(`  key vault: ${getVault() ? "configured" : "disabled (set VAULT_MASTER_KEY to enable)"}`);
  console.log("  Advisory only — not financial advice.");
});
