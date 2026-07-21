/** Central design tokens for the app. Dark, trading-terminal aesthetic. */
export const colors = {
  bg: "#0B0E11",
  card: "#151A21",
  cardAlt: "#1B2129",
  border: "#232A33",
  text: "#E6E8EA",
  textMuted: "#8B949E",
  buy: "#16C784",
  sell: "#EA3943",
  hold: "#F0B90B",
  accent: "#3B82F6",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/** Map a signal action to its display colour. */
export function actionColor(action: "BUY" | "SELL" | "HOLD"): string {
  if (action === "BUY") return colors.buy;
  if (action === "SELL") return colors.sell;
  return colors.hold;
}
