import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addKey,
  deleteKey,
  DEFAULT_BASE_URL,
  getBaseUrl,
  healthCheck,
  listKeys,
  setBaseUrl,
} from "../api/client";
import type { ExchangeAccountPublic, ExchangeId } from "../api/types";
import { colors, radius, spacing } from "../theme/theme";

const EXCHANGES: ExchangeId[] = ["binance", "bybit", "mt5"];

export function SettingsScreen() {
  const [baseUrl, setUrl] = useState(DEFAULT_BASE_URL);
  const [status, setStatus] = useState<"unknown" | "ok" | "down">("unknown");
  const [checking, setChecking] = useState(false);

  const [accounts, setAccounts] = useState<ExchangeAccountPublic[]>([]);
  const [exchange, setExchange] = useState<ExchangeId>("bybit");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [canTrade, setCanTrade] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBaseUrl().then(setUrl);
    refreshKeys();
  }, []);

  const refreshKeys = async () => {
    try {
      setAccounts(await listKeys());
    } catch {
      setAccounts([]);
    }
  };

  const saveUrl = async () => {
    await setBaseUrl(baseUrl);
    await testConnection();
  };

  const testConnection = async () => {
    setChecking(true);
    const ok = await healthCheck();
    setStatus(ok ? "ok" : "down");
    setChecking(false);
  };

  const submitKey = async () => {
    if (!label || !apiKey || !apiSecret) {
      Alert.alert("Missing fields", "Label, API key and secret are all required.");
      return;
    }
    setSaving(true);
    try {
      await addKey({ exchange, label, apiKey, apiSecret, canTrade });
      setLabel("");
      setApiKey("");
      setApiSecret("");
      setCanTrade(false);
      await refreshKeys();
      Alert.alert("Saved", "Key stored (encrypted on the backend).");
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const removeKey = (acc: ExchangeAccountPublic) => {
    Alert.alert("Delete key", `Remove "${acc.label}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteKey(acc.id);
            await refreshKeys();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Backend connection */}
      <Text style={styles.section}>Backend</Text>
      <Text style={styles.help}>
        URL of your TradeAnalyzer backend. On a real phone, use your computer's LAN IP (e.g.
        http://192.168.1.x:4000), not localhost.
      </Text>
      <TextInput
        value={baseUrl}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder={DEFAULT_BASE_URL}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <View style={styles.rowBtns}>
        <Pressable onPress={saveUrl} style={[styles.btn, styles.btnPrimary]}>
          <Text style={styles.btnPrimaryText}>Save & test</Text>
        </Pressable>
        <Pressable onPress={testConnection} style={styles.btn}>
          {checking ? <ActivityIndicator color={colors.text} /> : <Text style={styles.btnText}>Test</Text>}
        </Pressable>
      </View>
      {status !== "unknown" && (
        <Text style={{ color: status === "ok" ? colors.buy : colors.sell, marginTop: spacing.sm }}>
          {status === "ok" ? "● Connected" : "● Cannot reach backend"}
        </Text>
      )}

      {/* Security notice */}
      <View style={styles.warn}>
        <Text style={styles.warnTitle}>🔐 Before adding exchange keys</Text>
        <Text style={styles.warnText}>
          • Create keys that are READ-ONLY (or trade-only) and DISABLE withdrawals.{"\n"}
          • Never share your keys. They are encrypted on the backend and never shown again.{"\n"}
          • This advisory build does not place trades. Keep "Allow trading" OFF.
        </Text>
      </View>

      {/* Existing accounts */}
      <Text style={styles.section}>Connected accounts</Text>
      {accounts.length === 0 ? (
        <Text style={styles.help}>None yet.</Text>
      ) : (
        accounts.map((a) => (
          <View key={a.id} style={styles.accountRow}>
            <View>
              <Text style={styles.accountLabel}>{a.label}</Text>
              <Text style={styles.accountSub}>
                {a.exchange.toUpperCase()} · {a.apiKeyMasked} · {a.canTrade ? "trading" : "read-only"}
              </Text>
            </View>
            <Pressable onPress={() => removeKey(a)} hitSlop={8}>
              <Text style={{ color: colors.sell, fontWeight: "600" }}>Delete</Text>
            </Pressable>
          </View>
        ))
      )}

      {/* Add account */}
      <Text style={styles.section}>Add a key</Text>
      <View style={styles.row}>
        {EXCHANGES.map((ex) => (
          <Pressable key={ex} onPress={() => setExchange(ex)} style={[styles.chip, ex === exchange && styles.chipActive]}>
            <Text style={[styles.chipText, ex === exchange && styles.chipTextActive]}>{ex}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={label} onChangeText={setLabel} placeholder="Label (e.g. My Bybit)" placeholderTextColor={colors.textMuted} style={styles.input} />
      <TextInput value={apiKey} onChangeText={setApiKey} placeholder="API key" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={styles.input} />
      <TextInput value={apiSecret} onChangeText={setApiSecret} placeholder="API secret" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} secureTextEntry style={styles.input} />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Allow trading (not used in advisory build)</Text>
        <Switch value={canTrade} onValueChange={setCanTrade} />
      </View>
      <Pressable onPress={submitKey} style={[styles.btn, styles.btnPrimary]} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Save key</Text>}
      </Pressable>

      <Text style={styles.footer}>TradeAnalyzer v0.1 · Advisory only · Not financial advice</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  section: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: spacing.xl, marginBottom: spacing.sm },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  rowBtns: { flexDirection: "row", gap: spacing.sm },
  btn: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  btnText: { color: colors.text, fontWeight: "600" },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  warn: {
    backgroundColor: "rgba(234,57,67,0.10)",
    borderColor: colors.sell,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  warnTitle: { color: colors.sell, fontWeight: "700", marginBottom: spacing.xs },
  warnText: { color: colors.text, fontSize: 12, lineHeight: 19 },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  accountLabel: { color: colors.text, fontWeight: "600" },
  accountSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: spacing.sm },
  switchLabel: { color: colors.textMuted, fontSize: 13, flex: 1, paddingRight: spacing.md },
  footer: { color: colors.textMuted, fontSize: 11, textAlign: "center", marginTop: spacing.xl },
});
