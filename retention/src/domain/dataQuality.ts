import type { Visit } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CaptureHealth {
  /** Visits recorded on the day being judged. */
  today: number;
  /** Median of the same weekday over the baseline window. */
  expected: number | null;
  /** today / expected, null when there is no baseline yet. */
  ratio: number | null;
  status: "ok" | "low" | "silent" | "unknown";
  message: string;
}

export interface CaptureHealthConfig {
  /** How many weeks of history to build the expectation from. */
  baselineWeeks: number;
  /** Below this share of the expected count, recording looks incomplete. */
  lowRatio: number;
}

export const DEFAULT_CAPTURE_CONFIG: CaptureHealthConfig = {
  baselineWeeks: 6,
  lowRatio: 0.5,
};

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function countOnDay(visits: Visit[], day: Date): number {
  const from = startOfDay(day).getTime();
  const to = from + DAY_MS;
  return visits.filter((v) => v.at.getTime() >= from && v.at.getTime() < to).length;
}

/**
 * Judge whether attendance is still being recorded properly.
 *
 * This is the failure that quietly destroys the whole product. Every number
 * the owner sees — who is drifting, what revenue is at risk — is derived from
 * visit records. If reception stops scanning people in for a week, the system
 * does not go blank; it cheerfully reports that half the gym has stopped
 * coming. The owner acts on nonsense, loses trust, and cancels.
 *
 * So the data quality is surfaced as a first-class number rather than assumed.
 * Compare today against the same weekday recently: gyms are strongly weekly,
 * and a Sunday is not a fair benchmark for a Monday.
 */
export function assessCaptureHealth(
  visits: Visit[],
  asOf: Date,
  cfg: CaptureHealthConfig = DEFAULT_CAPTURE_CONFIG,
): CaptureHealth {
  const today = countOnDay(visits, asOf);

  const sameWeekdayCounts: number[] = [];
  for (let w = 1; w <= cfg.baselineWeeks; w++) {
    const day = new Date(asOf.getTime() - w * 7 * DAY_MS);
    sameWeekdayCounts.push(countOnDay(visits, day));
  }

  const nonEmpty = sameWeekdayCounts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nonEmpty.length < 3) {
    return {
      today,
      expected: null,
      ratio: null,
      status: "unknown",
      message: "Недостаточно истории, чтобы судить о полноте отметок.",
    };
  }

  const mid = Math.floor(nonEmpty.length / 2);
  const expected =
    nonEmpty.length % 2 === 0 ? (nonEmpty[mid - 1] + nonEmpty[mid]) / 2 : nonEmpty[mid];

  const ratio = expected > 0 ? today / expected : null;

  if (today === 0) {
    return {
      today,
      expected,
      ratio: 0,
      status: "silent",
      message: `Сегодня не отмечено ни одного визита (обычно ${Math.round(expected)}). Проверьте, работает ли отметка на входе.`,
    };
  }

  if (ratio !== null && ratio < cfg.lowRatio) {
    return {
      today,
      expected,
      ratio,
      status: "low",
      message: `Отмечено ${today} визитов вместо обычных ${Math.round(expected)}. Возможно, часть посещений не фиксируется.`,
    };
  }

  return {
    today,
    expected,
    ratio,
    status: "ok",
    message: `Отметки в норме: ${today} визитов (обычно ${Math.round(expected)}).`,
  };
}
