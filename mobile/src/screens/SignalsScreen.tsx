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
import { SignalCard } from "../components/SignalCard";
import { Disclaimer } from "../components/Disclaimer";
import { fetchSignal } from "../api/client";
import type { SignalResponse, Timeframe } from "../api/types";
import { colors, radius, spacing } from "../theme/theme";

const WATCHLIST = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

export function SignalsScreen() {
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [data, setData] = useState<Record<string, SignalResponse>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        WATCHLIST.map((symbol) => fetchSignal({ exchange: "binance", symbol, timeframe })),
      );
      const next: Record<string, SignalResponse> = {};
      WATCHLIST.forEach((symbol, i) => (next[symbol] = results[i]));
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load signals.");
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} />}
    >
      <View style={styles.tfRow}>
        {TIMEFRAMES.map((tf) => (
          <Pressable
            key={tf}
            onPress={() => setTimeframe(tf)}
            style={[styles.tfChip, tf === timeframe && styles.tfChipActive]}
          >
            <Text style={[styles.tfText, tf === timeframe && styles.tfTextActive]}>{tf}</Text>
          </Pressable>
        ))}
      </View>

      <Disclaimer compact />

      {error && <Text style={styles.error}>{error}</Text>}

      {loading && Object.keys(data).length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : (
        WATCHLIST.map((symbol) => {
          const res = data[symbol];
          if (!res) return null;
          return <SignalCard key={symbol} signal={res.signal} isSample={res.isSample} />;
        })
      )}

      {data[WATCHLIST[0]]?.isSample && (
        <Text style={styles.sampleNote}>
          Showing sample data. Start the backend with ENABLE_LIVE_EXCHANGE=true for live prices.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  tfRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  tfChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tfChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tfText: { color: colors.textMuted, fontWeight: "600" },
  tfTextActive: { color: "#fff" },
  error: { color: colors.sell, marginVertical: spacing.md },
  sampleNote: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm, textAlign: "center" },
});
