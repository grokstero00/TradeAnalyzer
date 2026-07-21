import { Router } from "express";
import { z } from "zod";
import { alertStore, liveSignalProvider } from "../alerts/alertInstance.ts";

export const alertsRouter = Router();

const watchItemSchema = z.object({
  exchange: z.enum(["binance", "bybit", "mt5"]),
  symbol: z.string().min(1),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
});

/** GET /api/alerts — triggered alerts + the watchlist + unseen count. */
alertsRouter.get("/", (_req, res) => {
  res.json({
    alerts: alertStore.getAlerts(),
    watchlist: alertStore.getWatchlist(),
    unseen: alertStore.unseenCount(),
  });
});

/** POST /api/alerts/evaluate — run the engine now; returns newly triggered alerts. */
alertsRouter.post("/evaluate", async (_req, res, next) => {
  try {
    const triggered = await alertStore.evaluate(liveSignalProvider);
    res.json({ triggered, alerts: alertStore.getAlerts(), unseen: alertStore.unseenCount() });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/alerts/watchlist — replace the set of monitored markets. */
alertsRouter.put("/watchlist", (req, res, next) => {
  try {
    const items = z.array(watchItemSchema).min(1).max(50).parse(req.body);
    alertStore.setWatchlist(items);
    res.json({ watchlist: alertStore.getWatchlist() });
  } catch (err) {
    next(err);
  }
});

/** POST /api/alerts/seen — mark all alerts read. */
alertsRouter.post("/seen", (_req, res) => {
  alertStore.markAllSeen();
  res.json({ unseen: 0 });
});

/** POST /api/alerts/clear — delete all triggered alerts. */
alertsRouter.post("/clear", (_req, res) => {
  alertStore.clear();
  res.json({ alerts: [] });
});
