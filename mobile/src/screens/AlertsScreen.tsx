import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { clearAlerts, evaluateAlerts, fetchAlerts, markAlertsSeen } from "../api/client";
import { ensureNotificationPermission, notifyLocal } from "../api/notify";
import { WatchlistEditor } from "../components/WatchlistEditor";
import type { Alert, WatchItem } from "../api/types";
import { actionColor, colors, radius, spacing } from "../theme/theme";

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AlertsScreen() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async (markSeen = true) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAlerts();
      setAlerts(res.alerts);
      setWatchlist(res.watchlist);
      if (markSeen && res.unseen > 0) await markAlertsSeen();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ensureNotificationPermission();
    load();
  }, [load]);

  const checkNow = async () => {
    setChecking(true);
    setError(null);
    setBanner(null);
    try {
      const res = await evaluateAlerts();
      setAlerts(res.alerts);
      if (res.triggered.length > 0) {
        setBanner(`${res.triggered.length} new signal change${res.triggered.length > 1 ? "s" : ""}!`);
        for (const a of res.triggered) {
          await notifyLocal(
            `${a.symbol} → ${a.action}`,
            `${a.previousAction} → ${a.action} at ${Math.round(a.confidence * 100)}% confidence`,
          );
        }
      } else {
        setBanner("No changes since last check.");
      }
      await markAlertsSeen();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setChecking(false);
    }
  };

  const onClear = async () => {
    try {
      await clearAlerts();
      setAlerts([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed.");
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={colors.text} />}
    >
      <View style={styles.actions}>
        <Pressable onPress={checkNow} style={[styles.btn, styles.btnPrimary]} disabled={checking}>
          {checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Check now</Text>}
        </Pressable>
        <Pressable onPress={onClear} style={styles.btn} disabled={alerts.length === 0}>
          <Text style={styles.btnText}>Clear</Text>
        </Pressable>
      </View>

      <WatchlistEditor
        watchlist={watchlist}
        onSaved={(items) => {
          setWatchlist(items);
          setBanner(`Watchlist updated — monitoring ${items.length} market${items.length === 1 ? "" : "s"}.`);
        }}
      />

      {banner && <Text style={styles.banner}>{banner}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {alerts.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyText}>No alerts yet.</Text>
          <Text style={styles.emptySub}>
            Signal flips are infrequent by design. Tap “Check now” to run the engine, or leave the backend’s
            timer on to evaluate automatically.
          </Text>
        </View>
      ) : (
        alerts.map((a) => (
          <View key={a.id} style={[styles.alert, !a.seen && styles.alertUnseen]}>
            <View style={styles.alertHeader}>
              <Text style={styles.alertSymbol}>{a.symbol}</Text>
              <Text style={styles.alertTime}>{timeAgo(a.timestamp)}</Text>
            </View>
            <View style={styles.transition}>
              <Text style={[styles.tag, { color: actionColor(a.previousAction) }]}>{a.previousAction}</Text>
              <Text style={styles.arrow}>→</Text>
              <Text style={[styles.tagStrong, { backgroundColor: actionColor(a.action) }]}>{a.action}</Text>
              <Text style={styles.conf}>{Math.round(a.confidence * 100)}%</Text>
            </View>
            <Text style={styles.alertSub}>
              {a.exchange.toUpperCase()} · {a.timeframe} · ${a.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  actions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
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
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent, flex: 2 },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  banner: {
    color: colors.accent,
    backgroundColor: "rgba(59,130,246,0.12)",
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontWeight: "600",
  },
  error: { color: colors.sell, marginBottom: spacing.md },
  empty: { alignItems: "center", paddingVertical: spacing.xl * 1.5 },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: spacing.sm, lineHeight: 19 },
  alert: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  alertUnseen: { borderColor: colors.accent },
  alertHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  alertSymbol: { color: colors.text, fontSize: 16, fontWeight: "700" },
  alertTime: { color: colors.textMuted, fontSize: 12 },
  transition: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  tag: { fontWeight: "700", fontSize: 14 },
  arrow: { color: colors.textMuted, fontSize: 16 },
  tagStrong: {
    color: "#0B0E11",
    fontWeight: "800",
    fontSize: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  conf: { color: colors.textMuted, fontSize: 13, marginLeft: "auto" },
  alertSub: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
});
