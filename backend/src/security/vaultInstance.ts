import { config } from "../config.ts";
import { VaultStore } from "./keyVault.ts";

/**
 * Lazily builds the single VaultStore from config. Returns null when no
 * VAULT_MASTER_KEY is set — the safe default that refuses to store real keys.
 */
let vault: VaultStore | null = null;
let attempted = false;

export function getVault(): VaultStore | null {
  if (attempted) return vault;
  attempted = true;
  if (!config.vaultMasterKey) return null;
  try {
    vault = new VaultStore({ masterKeyHex: config.vaultMasterKey, filePath: config.vaultFile });
  } catch {
    vault = null;
  }
  return vault;
}
