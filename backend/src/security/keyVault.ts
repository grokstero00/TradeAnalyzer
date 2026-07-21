import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExchangeAccountPublic, ExchangeId } from "@tradeanalyzer/shared";

/**
 * Encrypted-at-rest storage for exchange API credentials.
 *
 * Security posture for the advisory phase:
 *   - Secrets are encrypted with AES-256-GCM under a master key that lives ONLY
 *     in the server environment (VAULT_MASTER_KEY), never in the repo or the app.
 *   - Plaintext secrets are NEVER returned to any client; the app only ever sees
 *     a masked key (last 4 chars) via `ExchangeAccountPublic`.
 *   - `getSecret` is server-internal, used solely to sign exchange requests.
 *
 * This is a pragmatic scaffold, not a hardened secrets manager. For production,
 * graduate to a KMS/HSM (AWS KMS, GCP KMS, Vault) and per-user keys.
 */

interface StoredRecord {
  id: string;
  exchange: ExchangeId;
  label: string;
  canTrade: boolean;
  createdAt: number;
  apiKeyMasked: string;
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
}

export interface AddAccountInput {
  exchange: ExchangeId;
  label: string;
  apiKey: string;
  apiSecret: string;
  /** Advisory phase should keep this false — read-only keys are recommended. */
  canTrade?: boolean;
}

export interface DecryptedSecret {
  apiKey: string;
  apiSecret: string;
}

export class VaultStore {
  private readonly key: Buffer;
  private readonly filePath?: string;
  private records: StoredRecord[] = [];

  constructor(opts: { masterKeyHex: string; filePath?: string }) {
    const key = Buffer.from(opts.masterKeyHex, "hex");
    if (key.length !== 32) {
      throw new Error(
        "VAULT_MASTER_KEY must be 32 bytes as hex (64 hex chars). Generate one with: openssl rand -hex 32",
      );
    }
    this.key = key;
    this.filePath = opts.filePath;
    this.load();
  }

  addAccount(input: AddAccountInput): ExchangeAccountPublic {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = JSON.stringify({ apiKey: input.apiKey, apiSecret: input.apiSecret });
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const record: StoredRecord = {
      id: randomUUID(),
      exchange: input.exchange,
      label: input.label,
      canTrade: input.canTrade ?? false,
      createdAt: Date.now(),
      apiKeyMasked: maskKey(input.apiKey),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    this.records.push(record);
    this.save();
    return toPublic(record);
  }

  listAccounts(): ExchangeAccountPublic[] {
    return this.records.map(toPublic);
  }

  /** Server-internal: decrypt an account's secret to sign an exchange request. */
  getSecret(id: string): DecryptedSecret | undefined {
    const record = this.records.find((r) => r.id === id);
    if (!record) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(record.iv, "base64"));
    decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as DecryptedSecret;
  }

  deleteAccount(id: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    const removed = this.records.length < before;
    if (removed) this.save();
    return removed;
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      this.records = JSON.parse(readFileSync(this.filePath, "utf8")) as StoredRecord[];
    } catch {
      this.records = [];
    }
  }

  private save(): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.records, null, 2), { mode: 0o600 });
  }
}

function maskKey(apiKey: string): string {
  if (apiKey.length <= 4) return "****";
  return `****${apiKey.slice(-4)}`;
}

function toPublic(r: StoredRecord): ExchangeAccountPublic {
  return {
    id: r.id,
    exchange: r.exchange,
    label: r.label,
    apiKeyMasked: r.apiKeyMasked,
    canTrade: r.canTrade,
    createdAt: r.createdAt,
  };
}
