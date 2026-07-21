import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { VaultStore } from "./keyVault.ts";

const masterKeyHex = randomBytes(32).toString("hex");

test("VaultStore: round-trips a secret and never leaks it in the public view", () => {
  const vault = new VaultStore({ masterKeyHex });
  const pub = vault.addAccount({
    exchange: "bybit",
    label: "My Bybit",
    apiKey: "AKIA1234567890",
    apiSecret: "super-secret-value",
    canTrade: false,
  });

  // Public view is masked and carries no secret.
  assert.equal(pub.apiKeyMasked, "****7890");
  assert.equal(pub.canTrade, false);
  assert.ok(!JSON.stringify(pub).includes("super-secret-value"));

  // Server-internal decrypt returns the real values.
  const secret = vault.getSecret(pub.id);
  assert.equal(secret?.apiKey, "AKIA1234567890");
  assert.equal(secret?.apiSecret, "super-secret-value");
});

test("VaultStore: listAccounts returns masked records only", () => {
  const vault = new VaultStore({ masterKeyHex });
  vault.addAccount({ exchange: "binance", label: "A", apiKey: "key-aaaa", apiSecret: "s1" });
  vault.addAccount({ exchange: "bybit", label: "B", apiKey: "key-bbbb", apiSecret: "s2" });
  const list = vault.listAccounts();
  assert.equal(list.length, 2);
  assert.ok(!JSON.stringify(list).includes("s1"));
  assert.ok(!JSON.stringify(list).includes("s2"));
});

test("VaultStore: delete removes the account", () => {
  const vault = new VaultStore({ masterKeyHex });
  const pub = vault.addAccount({ exchange: "binance", label: "X", apiKey: "key-xxxx", apiSecret: "s" });
  assert.equal(vault.deleteAccount(pub.id), true);
  assert.equal(vault.listAccounts().length, 0);
  assert.equal(vault.getSecret(pub.id), undefined);
});

test("VaultStore: a wrong master key cannot decrypt", () => {
  const vault = new VaultStore({ masterKeyHex });
  const pub = vault.addAccount({ exchange: "bybit", label: "X", apiKey: "key-1234", apiSecret: "s" });

  // Rebuild a vault with a different key over the same (in-memory copied) record.
  const other = new VaultStore({ masterKeyHex: randomBytes(32).toString("hex") });
  // @ts-expect-error — reach into private for the test to simulate a stolen file.
  other.records = [
    // @ts-expect-error — same reason.
    ...vault.records,
  ];
  assert.throws(() => other.getSecret(pub.id));
});

test("VaultStore: rejects an invalid master key length", () => {
  assert.throws(() => new VaultStore({ masterKeyHex: "abcd" }));
});
