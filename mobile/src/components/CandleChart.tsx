import React from "react";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { Candle } from "../api/types";
import { colors } from "../theme/theme";

interface Props {
  candles: Candle[];
  width: number;
  height: number;
  /** Simple moving average period to overlay (e.g. 20). 0 to disable. */
  smaPeriod?: number;
}

/** Client-side SMA for the overlay line (leading values are NaN). */
function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/**
 * A dependency-light candlestick chart drawn with SVG. Renders on iOS, Android
 * and web. Green/red bodies, high-low wicks, a few gridlines, right-side price
 * labels, and an optional SMA overlay.
 */
export function CandleChart({ candles, width, height, smaPeriod = 20 }: Props) {
  const rightPad = 46;
  const topPad = 8;
  const bottomPad = 8;
  const plotW = Math.max(0, width - rightPad);
  const plotH = Math.max(0, height - topPad - bottomPad);

  if (candles.length === 0 || plotW <= 0) {
    return <Svg width={width} height={height} />;
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  let max = Math.max(...highs);
  let min = Math.min(...lows);
  const pad = (max - min) * 0.06 || max * 0.01;
  max += pad;
  min -= pad;
  const range = max - min || 1;

  const y = (price: number) => topPad + (1 - (price - min) / range) * plotH;
  const slot = plotW / candles.length;
  const bodyW = Math.max(1, Math.min(slot * 0.62, 14));

  const closes = candles.map((c) => c.close);
  const ma = smaPeriod > 0 ? sma(closes, smaPeriod) : [];
  let maPath = "";
  ma.forEach((v, i) => {
    if (Number.isNaN(v)) return;
    const px = i * slot + slot / 2;
    const py = y(v);
    maPath += maPath === "" ? `M ${px} ${py}` : ` L ${px} ${py}`;
  });

  // Horizontal gridlines + labels at 4 levels.
  const levels = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * range);

  return (
    <Svg width={width} height={height}>
      {/* gridlines */}
      <G>
        {levels.map((lvl, i) => (
          <G key={i}>
            <Line x1={0} y1={y(lvl)} x2={plotW} y2={y(lvl)} stroke={colors.border} strokeWidth={1} />
            <SvgText x={plotW + 4} y={y(lvl) + 4} fill={colors.textMuted} fontSize={10}>
              {fmtPrice(lvl)}
            </SvgText>
          </G>
        ))}
      </G>

      {/* candles */}
      <G>
        {candles.map((c, i) => {
          const cx = i * slot + slot / 2;
          const up = c.close >= c.open;
          const color = up ? colors.buy : colors.sell;
          const yOpen = y(c.open);
          const yClose = y(c.close);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(1, Math.abs(yOpen - yClose));
          return (
            <G key={i}>
              <Line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={color} strokeWidth={1} />
              <Rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
            </G>
          );
        })}
      </G>

      {/* SMA overlay */}
      {maPath !== "" && <Path d={maPath} stroke={colors.accent} strokeWidth={1.5} fill="none" />}
    </Svg>
  );
}
