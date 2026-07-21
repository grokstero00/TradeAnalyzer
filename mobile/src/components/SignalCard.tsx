import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import { actionColor, colors, radius, spacing } from "../theme/theme";

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function SignalCard({ signal, isSample }: { signal: Signal; isSample?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const color = actionColor(signal.action);
  const pct = Math.round(signal.confidence * 100);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.symbol}>{signal.symbol}</Text>
          <Text style={styles.sub}>
            {signal.exchange.toUpperCase()} · {signal.timeframe}
            {isSample ? " · sample" : ""}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{signal.action}</Text>
        </View>
      </View>

      <Text style={styles.price}>${fmt(signal.price)}</Text>

      <View style={styles.confRow}>
        <Text style={styles.confLabel}>Confidence</Text>
        <Text style={[styles.confValue, { color }]}>{pct}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>

      <Text style={styles.rationale}>{signal.rationale}</Text>

      {signal.risk?.stopLoss !== undefined && (
        <View style={styles.riskRow}>
          <Text style={styles.riskItem}>
            SL <Text style={{ color: colors.sell }}>${fmt(signal.risk.stopLoss)}</Text>
          </Text>
          {signal.risk.takeProfit !== undefined && (
            <Text style={styles.riskItem}>
              TP <Text style={{ color: colors.buy }}>${fmt(signal.risk.takeProfit)}</Text>
            </Text>
          )}
        </View>
      )}

      <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8}>
        <Text style={styles.toggle}>{expanded ? "Hide indicators ▲" : "Show indicators ▼"}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.votes}>
          {signal.votes.map((v) => (
            <View key={v.name} style={styles.voteRow}>
              <View style={[styles.dot, { backgroundColor: actionColor(v.vote) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.voteName}>
                  {v.name} · {v.vote} · w{v.weight.toFixed(2)}
                </Text>
                <Text style={styles.voteReason}>{v.reason}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  symbol: { color: colors.text, fontSize: 18, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm },
  badgeText: { color: "#0B0E11", fontWeight: "800", fontSize: 14 },
  price: { color: colors.text, fontSize: 22, fontWeight: "700", marginTop: spacing.sm },
  confRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  confLabel: { color: colors.textMuted, fontSize: 12 },
  confValue: { fontSize: 12, fontWeight: "700" },
  barTrack: {
    height: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: 3,
    marginTop: spacing.xs,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3 },
  rationale: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  riskRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  riskItem: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  toggle: { color: colors.accent, fontSize: 13, marginTop: spacing.md, fontWeight: "600" },
  votes: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  voteRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  voteName: { color: colors.text, fontSize: 13, fontWeight: "600" },
  voteReason: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
});
