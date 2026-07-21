import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchBacktest } from "../api/client";
import type { BacktestResponse, Timeframe } from "../api/types";
import { colors, radius, spacing } from "../theme/theme";
import { Disclaimer } from "../components/Disclaimer";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function BacktestScreen() {
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [data, setData] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchBacktest({ exchange: "binance", symbol, timeframe, limit: 500 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed.");
    } finally {
      setLoading(false);
    }
  };

  const r = data?.result;
  const returnColor = r ? (r.totalReturnPct >= 0 ? colors.buy : colors.sell) : undefined;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Symbol</Text>
      <View style={styles.row}>
        {SYMBOLS.map((s) => (
          <Pressable key={s} onPress={() => setSymbol(s)} style={[styles.chip, s === symbol && styles.chipActive]}>
            <Text style={[styles.chipText, s === symbol && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Timeframe</Text>
      <View style={styles.row}>
        {TIMEFRAMES.map((tf) => (
          <Pressable key={tf} onPress={() => setTimeframe(tf)} style={[styles.chip, tf === timeframe && styles.chipActive]}>
            <Text style={[styles.chipText, tf === timeframe && styles.chipTextActive]}>{tf}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={run} style={styles.runBtn} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.runText}>Run backtest</Text>}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {r && (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>
            {r.symbol} · {r.timeframe} {data?.isSample ? "· sample data" : ""}
          </Text>
          <View style={styles.statGrid}>
            <Stat label="Trades" value={String(r.totalTrades)} />
            <Stat label="Win rate" value={`${Math.round(r.winRate * 100)}%`} />
            <Stat label="Wins / Losses" value={`${r.wins} / ${r.losses}`} />
            <Stat label="Total return" value={`${(r.totalReturnPct * 100).toFixed(2)}%`} color={returnColor} />
            <Stat label="Max drawdown" value={`${(r.maxDrawdownPct * 100).toFixed(2)}%`} color={colors.sell} />
          </View>
        </View>
      )}

      <Disclaimer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  label: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
  runBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  runText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  error: { color: colors.sell, marginTop: spacing.md },
  results: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  resultsTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: spacing.md },
  statGrid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "50%", marginBottom: spacing.md },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 2 },
});
