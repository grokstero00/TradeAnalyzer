/**
 * Value parsers for spreadsheet data.
 *
 * Every function here exists because of a specific way real exports differ
 * from clean data: Russian-locale dates and decimals, Excel's serial numbers,
 * phone numbers typed a dozen different ways.
 */

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a date from a spreadsheet cell.
 *
 * Handles, in order: Excel serial numbers (what you get when a column was
 * formatted as a date and exported raw), ISO, and the day-first formats used
 * across the region. Day-first is assumed for ambiguous separators because
 * that is the local convention — 03.09.2026 is September 3rd, not March 9th.
 */
export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (s === "") return null;

  // Excel serial: a bare number in a plausible range (1970..2100).
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 25000 && serial < 75000) {
      return new Date(EXCEL_EPOCH + serial * DAY_MS);
    }
  }

  // ISO first: unambiguous, so it wins before any day-first guessing.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    return makeDate(+iso[1], +iso[2], +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0));
  }

  // Day-first with . / or -
  const dmy = s.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (dmy) {
    let year = +dmy[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return makeDate(year, +dmy[2], +dmy[1], +(dmy[4] ?? 0), +(dmy[5] ?? 0), +(dmy[6] ?? 0));
  }

  return null;
}

function makeDate(y: number, m: number, d: number, hh: number, mm: number, ss: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d, hh, mm, ss);
  // Reject roll-over like 31.02 silently becoming March 3rd.
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Parse a money or count cell.
 *
 * Copes with "1 200,50" (space thousands, comma decimal — the local default),
 * "1,200.50", "1200", and stray currency text like "400 манат".
 */
export function parseNumber(raw: string): number | null {
  let s = raw.trim();
  if (s === "") return null;

  // Drop everything that is not a digit, separator or sign.
  s = s.replace(/[^\d.,\-]/g, "");
  if (s === "" || s === "-") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // A lone comma is genuinely ambiguous: "400,50" is a local decimal while
    // "1,200" is an English thousands group. Exactly three digits after it is
    // the tell — local decimals are written with two ("400,50"), never three.
    const after = s.length - lastComma - 1;
    s = after === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reduce a phone number to digits so the same person written as
 * "+993 65 12-34-56" and "99365123456" matches. Keeps the last 8 digits,
 * which is the locally significant part, so a missing country code still links.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.slice(-8);
}

/** Collapse a name for matching: lowercase, single spaces, no punctuation. */
export function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
