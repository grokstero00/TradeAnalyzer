import { Router } from "express";
import { z } from "zod";
import { getVault } from "../security/vaultInstance.ts";

export const keysRouter = Router();

const addSchema = z.object({
  exchange: z.enum(["binance", "bybit", "mt5"]),
  label: z.string().min(1).max(64),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  // Advisory phase strongly prefers read-only keys, so trading defaults to off.
  canTrade: z.boolean().default(false),
});

function requireVault(res: import("express").Response) {
  const vault = getVault();
  if (!vault) {
    res.status(503).json({
      error: "vault_unconfigured",
      message:
        "Key storage is disabled. Set VAULT_MASTER_KEY (openssl rand -hex 32) in the backend .env to enable it.",
    });
    return null;
  }
  return vault;
}

/** POST /api/keys — store an exchange API key (encrypted at rest). */
keysRouter.post("/", (req, res, next) => {
  try {
    const vault = requireVault(res);
    if (!vault) return;
    const input = addSchema.parse(req.body);
    const account = vault.addAccount(input);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

/** GET /api/keys — list stored accounts (masked; secrets never returned). */
keysRouter.get("/", (_req, res, next) => {
  try {
    const vault = requireVault(res);
    if (!vault) return;
    res.json(vault.listAccounts());
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/keys/:id — remove a stored account. */
keysRouter.delete("/:id", (req, res, next) => {
  try {
    const vault = requireVault(res);
    if (!vault) return;
    const removed = vault.deleteAccount(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "not_found", message: "No account with that id." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
