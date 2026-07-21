import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme/theme";

/** Persistent, unmissable reminder that this is not financial advice. */
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        {compact
          ? "⚠️ Advisory only — not financial advice."
          : "⚠️ Advisory only. This app does not predict the future and is not financial advice. Signals summarize technical indicators; markets are risky and you can lose money. Always do your own research and manage risk."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "rgba(240,185,11,0.10)",
    borderColor: colors.hold,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  text: { color: colors.hold, fontSize: 12, lineHeight: 17 },
});
