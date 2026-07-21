import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { CandleChart } from "../components/CandleChart";
import { Disclaimer } from "../components/Disclaimer";
import { fetchCandles, fetchSignal } from "../api/client";
import type { Candle, Signal, Timeframe } from "../api/types";
import { actionColor, colors, radius, spacing } from "../theme/theme";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];
const SMA_PERIOD = 20;

export function ChartScreen() {
  const { width } = useWindowDimensions();
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [candleRes, signalRes] = await Promise.all([
        fetchCandles({ exchange: "binance", symbol, timeframe, limit: 90 }),
        fetchSignal({ exchange: "binance", symbol, timeframe }),
      ]);
      setCandles(candleRes.candles);
      setSignal(signalRes.signal);
      setIsSample(candleRes.isSample);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart.");
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    load();
  }, [load]);

  const chartWidth = width - spacing.lg * 2 - spacing.lg * 2; // screen padding + card padding
  const action = signal?.action ?? "HOLD";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} />}
    >
      <View style={styles.row}>
        {SYMBOLS.map((s) => (
          <Pressable key={s} onPress={() => setSymbol(s)} style={[styles.chip, s === symbol && styles.chipActive]}>
            <Text style={[styles.chipText, s === symbol && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {TIMEFRAMES.map((tf) => (
          <Pressable key={tf} onPress={() => setTimeframe(tf)} style={[styles.chip, tf === timeframe && styles.chipActive]}>
            <Text style={[styles.chipText, tf === timeframe && styles.chipTextActive]}>{tf}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.symbol}>{symbol}</Text>
            <Text style={styles.sub}>
              {timeframe} · {candles.length} candles{isSample ? " · sample" : ""}
            </Text>
          </View>
          {signal && (
            <View style={[styles.badge, { backgroundColor: actionColor(action) }]}>
              <Text style={styles.badgeText}>{action}</Text>
            </View>
          )}
        </View>

        {loading && candles.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.xl }} />
        ) : (
          <CandleChart candles={candles} width={chartWidth} height={240} smaPeriod={SMA_PERIOD} />
        )}

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors.buy }]} />
            <Text style={styles.legendText}>Up</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors.sell }]} />
            <Text style={styles.legendText}>Down</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors.accent }]} />
            <Text style={styles.legendText}>SMA {SMA_PERIOD}</Text>
          </View>
        </View>

        {signal && (
          <Text style={styles.rationale}>{signal.rationale}</Text>
        )}
      </View>

      <Disclaimer compact />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
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
  error: { color: colors.sell, marginVertical: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.md },
  symbol: { color: colors.text, fontSize: 18, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm },
  badgeText: { color: "#0B0E11", fontWeight: "800", fontSize: 14 },
  legend: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: colors.textMuted, fontSize: 12 },
  rationale: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
});
