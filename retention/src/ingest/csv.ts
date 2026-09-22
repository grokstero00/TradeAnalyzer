/**
 * A small CSV reader built for files that come out of somebody's Excel.
 *
 * No dependency, because the failure mode that matters here is not parser
 * sophistication — it is arriving at a meeting, opening the owner's actual
 * export, and having it not load. Real exports arrive semicolon-separated
 * (the default in Russian-locale Excel), with a UTF-8 BOM, CRLF endings and
 * quoted fields containing the delimiter. All of that is handled; exotic CSV
 * dialects are not, and do not occur in this setting.
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

const CANDIDATE_DELIMITERS = [";", ",", "\t", "|"];

/**
 * Guess the delimiter by which one yields the most consistent column count
 * across the first few lines. Counting occurrences alone is fooled by decimal
 * commas in a semicolon-separated file — a very common combination.
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ",";

  let best = ",";
  let bestScore = -1;

  for (const d of CANDIDATE_DELIMITERS) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const first = counts[0];
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length;
    // Prefer consistency, then more columns as a tie-break.
    const score = consistent * 100 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Split one line, respecting double-quoted fields and doubled quotes inside them. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

export function parseCsv(text: string, delimiter?: string): CsvTable {
  // Excel writes a BOM; left in place it becomes part of the first header and
  // silently breaks column detection.
  const clean = text.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(clean);

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], delimiter: d };

  const headers = splitLine(lines[0], d).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => splitLine(l, d).map((c) => c.trim()));

  return { headers, rows, delimiter: d };
}
