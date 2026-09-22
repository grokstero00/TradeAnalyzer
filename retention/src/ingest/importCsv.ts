import type { Client, Location, Visit } from "../domain/types.ts";
import { parseCsv } from "./csv.ts";
import { normaliseName, normalisePhone, parseDate, parseNumber } from "./values.ts";
import {
  type ClientField,
  detectClientColumns,
  detectVisitColumns,
} from "./mapping.ts";

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ImportReport<T> {
  items: T[];
  totalRows: number;
  imported: number;
  skipped: SkippedRow[];
  /** Which spreadsheet column was used for each field. */
  columns: Record<string, string | null>;
  warnings: string[];
  /** Venues discovered in the file, so the report can name them as the owner does. */
  locations: Location[];
}

export interface ClientImportOptions {
  /** Fallback when the file has no membership-length column. */
  defaultMembershipDays: number;
  /** Fallback when the file has no price column. */
  defaultPrice: number;
  /** Used when the file covers a single venue and says so nowhere. */
  defaultLocationId: string;
}

export const DEFAULT_CLIENT_IMPORT: ClientImportOptions = {
  defaultMembershipDays: 30,
  defaultPrice: 0,
  defaultLocationId: "L1",
};

/**
 * Turn an owner's client export into `Client` records.
 *
 * The contract is deliberately forgiving: a row is imported if it has a name
 * and an end date, because that is the minimum the retention logic needs.
 * Everything else falls back to a default and is noted in the report. A strict
 * importer that rejects the file is useless in the room where it matters; one
 * that quietly invents data is worse. So it imports what it can and says
 * exactly what it did.
 */
export function importClientsFromCsv(
  text: string,
  opts: ClientImportOptions = DEFAULT_CLIENT_IMPORT,
): ImportReport<Client> {
  const table = parseCsv(text);
  const columns = detectClientColumns(table.headers);
  const warnings: string[] = [];
  const skipped: SkippedRow[] = [];
  const items: Client[] = [];

  const idx = (field: ClientField): number => {
    const header = columns[field];
    return header === null ? -1 : table.headers.indexOf(header);
  };

  const iName = idx("name");
  const iEnd = idx("membershipEnd");
  const iStart = idx("membershipStart");
  const iPhone = idx("phone");
  const iPrice = idx("price");
  const iDays = idx("membershipDays");
  const iLoc = idx("location");
  const iId = idx("id");

  if (iName < 0) warnings.push("Не найдена колонка с именем клиента.");
  if (iEnd < 0) {
    warnings.push(
      "Не найдена колонка с датой окончания абонемента — без неё нельзя определить, кто активен.",
    );
  }
  if (iPrice < 0) {
    warnings.push(
      `Не найдена колонка со стоимостью — выручка под угрозой будет нулевой. Задайте цену вручную.`,
    );
  }

  const cell = (row: string[], i: number): string => (i >= 0 && i < row.length ? row[i] : "");
  const locationIds = new Map<string, string>();
  const originalLocationNames = new Map<string, string>();

  table.rows.forEach((row, n) => {
    const rowNo = n + 2; // +1 for the header, +1 because humans count from one

    const name = cell(row, iName).trim();
    if (name === "") {
      skipped.push({ row: rowNo, reason: "пустое имя" });
      return;
    }

    const membershipEnd = parseDate(cell(row, iEnd));
    if (membershipEnd === null) {
      skipped.push({ row: rowNo, reason: "не разобрана дата окончания" });
      return;
    }

    const days = parseNumber(cell(row, iDays)) ?? opts.defaultMembershipDays;
    const membershipStart =
      parseDate(cell(row, iStart)) ??
      new Date(membershipEnd.getTime() - days * 24 * 60 * 60 * 1000);

    // Venue names are free text; map each distinct one to a stable id.
    const locName = cell(row, iLoc).trim();
    let locationId = opts.defaultLocationId;
    if (locName !== "") {
      const key = normaliseName(locName);
      if (!locationIds.has(key)) {
        const newId = `L${locationIds.size + 1}`;
        locationIds.set(key, newId);
        originalLocationNames.set(newId, locName);
      }
      locationId = locationIds.get(key)!;
    }

    items.push({
      id: cell(row, iId).trim() || `R${rowNo}`,
      locationId,
      name,
      phone: cell(row, iPhone).trim(),
      membershipStart,
      membershipEnd,
      membershipPrice: parseNumber(cell(row, iPrice)) ?? opts.defaultPrice,
      membershipDays: days > 0 ? days : opts.defaultMembershipDays,
    });
  });

  if (locationIds.size > 1) {
    warnings.push(`Распознано залов: ${locationIds.size}.`);
  }

  return {
    items,
    totalRows: table.rows.length,
    imported: items.length,
    skipped,
    columns,
    warnings,
    locations: [...locationIds.entries()].map(([label, id]) => ({
      id,
      name: originalLocationNames.get(id) ?? label,
    })),
  };
}

/**
 * Turn a visit log into `Visit` records, linking each row to a known client.
 *
 * Visit exports rarely carry the same client key as the member list — one is
 * by id, the other by phone or by name. So every client is indexed three ways
 * and the row is matched on whichever the file happens to use.
 */
export function importVisitsFromCsv(text: string, clients: Client[]): ImportReport<Visit> {
  const table = parseCsv(text);
  const columns = detectVisitColumns(table.headers);
  const warnings: string[] = [];
  const skipped: SkippedRow[] = [];
  const items: Visit[] = [];

  const iRef = columns.clientRef ? table.headers.indexOf(columns.clientRef) : -1;
  const iAt = columns.at ? table.headers.indexOf(columns.at) : -1;

  if (iRef < 0) warnings.push("Не найдена колонка, по которой опознать клиента.");
  if (iAt < 0) warnings.push("Не найдена колонка с датой посещения.");

  const byId = new Map(clients.map((c) => [c.id.toLowerCase(), c.id]));
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of clients) {
    const p = normalisePhone(c.phone);
    if (p) byPhone.set(p, c.id);
    byName.set(normaliseName(c.name), c.id);
  }

  const cell = (row: string[], i: number): string => (i >= 0 && i < row.length ? row[i] : "");
  let unmatched = 0;

  table.rows.forEach((row, n) => {
    const rowNo = n + 2;
    const ref = cell(row, iRef).trim();
    const at = parseDate(cell(row, iAt));

    if (at === null) {
      skipped.push({ row: rowNo, reason: "не разобрана дата посещения" });
      return;
    }

    const clientId =
      byId.get(ref.toLowerCase()) ??
      (normalisePhone(ref) ? byPhone.get(normalisePhone(ref)!) : undefined) ??
      byName.get(normaliseName(ref));

    if (clientId === undefined) {
      unmatched++;
      skipped.push({ row: rowNo, reason: `клиент не найден: ${ref || "(пусто)"}` });
      return;
    }

    items.push({ clientId, at, source: "import" });
  });

  if (unmatched > 0) {
    const pct = Math.round((unmatched / Math.max(1, table.rows.length)) * 100);
    warnings.push(
      `Не удалось сопоставить ${unmatched} записей (${pct}%) — проверьте, совпадают ли идентификаторы в двух файлах.`,
    );
  }

  items.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    items,
    totalRows: table.rows.length,
    imported: items.length,
    skipped,
    columns,
    warnings,
    locations: [],
  };
}
