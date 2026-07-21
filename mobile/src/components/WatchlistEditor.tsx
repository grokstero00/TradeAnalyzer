import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { setWatchlist as saveWatchlist } from "../api/client";
import type { ExchangeId, Timeframe, WatchItem } from "../api/types";
import { colors, radius, spacing } from "../theme/theme";

const EXCHANGES: ExchangeId[] = ["binance", "bybit"];
const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

function keyOf(w: WatchItem): string {
  return `${w.exchange}:${w.symbol}:${w.timeframe}`;
}

/**
 * Inline editor for the alert watchlist. Add/remove monitored markets and
 * persist them to the backend. Calls onSaved with the saved list so the parent
 * can refresh.
 */
export function WatchlistEditor({
  watchlist,
  onSaved,
}: {
  watchlist: WatchItem[];
  onSaved: (items: WatchItem[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<WatchItem[]>(watchlist);
  const [exchange, setExchange] = useState<ExchangeId>("binance");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [symbol, setSymbol] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the draft in sync when the parent's watchlist changes (e.g. reload).
  useEffect(() => {
    if (!editing) setItems(watchlist);
  }, [watchlist, editing]);

  const addItem = () => {
    setError(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym.includes("/")) {
      setError('Use the form BASE/QUOTE, e.g. "SOL/USDT".');
      return;
    }
    const candidate: WatchItem = { exchange, symbol: sym, timeframe };
    if (items.some((i) => keyOf(i) === keyOf(candidate))) {
      setError("That market is already in the watchlist.");
      return;
    }
    setItems([...items, candidate]);
    setSymbol("");
  };

  const removeItem = (w: WatchItem) => {
    setItems(items.filter((i) => keyOf(i) !== keyOf(w)));
  };

  const save = async () => {
    if (items.length === 0) {
      setError("Keep at least one market.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveWatchlist(items);
      onSaved(res.watchlist);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setItems(watchlist);
    setSymbol("");
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <View style={styles.summaryRow}>
        <Text style={styles.summary}>
          Monitoring {watchlist.length} market{watchlist.length === 1 ? "" : "s"}:{" "}
          {watchlist.map((w) => w.symbol).join(", ")} · alerts fire when the action changes.
        </Text>
        <Pressable onPress={() => setEditing(true)} hitSlop={8}>
          <Text style={styles.edit}>Edit</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.editor}>
      <Text style={styles.title}>Edit watchlist</Text>

      {items.map((w) => (
        <View key={keyOf(w)} style={styles.itemRow}>
          <Text style={styles.itemText}>
            {w.symbol} · {w.exchange} · {w.timeframe}
          </Text>
          <Pressable onPress={() => removeItem(w)} hitSlop={8}>
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.divider} />

      <View style={styles.chipRow}>
        {EXCHANGES.map((ex) => (
          <Pressable key={ex} onPress={() => setExchange(ex)} style={[styles.chip, ex === exchange && styles.chipActive]}>
            <Text style={[styles.chipText, ex === exchange && styles.chipTextActive]}>{ex}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chipRow}>
        {TIMEFRAMES.map((tf) => (
          <Pressable key={tf} onPress={() => setTimeframe(tf)} style={[styles.chip, tf === timeframe && styles.chipActive]}>
            <Text style={[styles.chipText, tf === timeframe && styles.chipTextActive]}>{tf}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.addRow}>
        <TextInput
          value={symbol}
          onChangeText={setSymbol}
          placeholder="SYMBOL e.g. SOL/USDT"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          onSubmitEditing={addItem}
        />
        <Pressable onPress={addItem} style={styles.addBtn}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        <Pressable onPress={cancel} style={[styles.btn]}>
          <Text style={styles.btnText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} style={[styles.btn, styles.btnPrimary]} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Save</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.md },
  summary: { color: colors.textMuted, fontSize: 12, lineHeight: 18, flex: 1, paddingRight: spacing.sm },
  edit: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  editor: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: spacing.md },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  itemText: { color: colors.text, fontSize: 14 },
  remove: { color: colors.sell, fontSize: 16, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  addRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  input: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addBtn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
  addBtnText: { color: colors.accent, fontWeight: "700" },
  error: { color: colors.sell, fontSize: 12, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  btnText: { color: colors.text, fontWeight: "600" },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
});
