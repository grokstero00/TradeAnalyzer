/**
 * Load a business's own exports and print the summary.
 *
 * This is the tool for the meeting. Ask the owner for whatever they have —
 * usually a client list out of Excel, sometimes a turnstile log — load it in
 * front of them, and show their real members, by name, with the revenue those
 * members represent. A demo built on invented people argues that the idea
 * could work; this shows what it already found in their business.
 *
 *   node src/cli/analyze.ts clients.csv [visits.csv]
 *
 * Options:
 *   --price=400      assumed membership price when the file has no such column
 *   --days=30        assumed membership length
 *   --cost=1000      monthly price of the system, to show its return
 *   --date=2026-09-22  pretend "today" is this date
 */
import { readFileSync } from "node:fs";
import { importClientsFromCsv, importVisitsFromCsv, type ImportReport } from "../ingest/importCsv.ts";
import { renderOwnerSummary } from "../report/render.ts";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** Show what was read, what was not, and why — before showing any conclusions. */
function printImportReport<T>(label: string, r: ImportReport<T>): void {
  console.log(`── ${label} ${"─".repeat(Math.max(0, 62 - label.length))}`);
  console.log(`   Строк в файле:  ${r.totalRows}`);
  console.log(`   Загружено:      ${r.imported}`);

  const mapped = Object.entries(r.columns).filter(([, v]) => v !== null);
  if (mapped.length > 0) {
    console.log(`   Колонки:        ${mapped.map(([k, v]) => `${k}←"${v}"`).join(", ")}`);
  }

  if (r.skipped.length > 0) {
    console.log(`   Пропущено:      ${r.skipped.length}`);
    // A handful of examples is enough to show the pattern without burying it.
    for (const s of r.skipped.slice(0, 5)) {
      console.log(`      строка ${s.row}: ${s.reason}`);
    }
    if (r.skipped.length > 5) console.log(`      … и ещё ${r.skipped.length - 5}`);
  }

  for (const w of r.warnings) console.log(`   ⚠  ${w}`);
  console.log();
}

function main(): void {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("Использование: node src/cli/analyze.ts clients.csv [visits.csv]");
    process.exit(1);
  }

  const asOf = new Date(arg("date", new Date().toISOString().slice(0, 10)));
  const defaultPrice = Number(arg("price", "0"));
  const defaultMembershipDays = Number(arg("days", "30"));
  const systemMonthlyCost = Number(arg("cost", "0"));

  const clientsReport = importClientsFromCsv(readFileSync(files[0], "utf8"), {
    defaultPrice,
    defaultMembershipDays,
    defaultLocationId: "L1",
  });
  printImportReport("КЛИЕНТЫ", clientsReport);

  let visits: ReturnType<typeof importVisitsFromCsv>["items"] = [];
  if (files[1]) {
    const visitsReport = importVisitsFromCsv(readFileSync(files[1], "utf8"), clientsReport.items);
    printImportReport("ПОСЕЩЕНИЯ", visitsReport);
    visits = visitsReport.items;
  }

  console.log(
    renderOwnerSummary(
      { clients: clientsReport.items, visits, outreach: [], asOf },
      { currency: "манат", systemMonthlyCost, locations: clientsReport.locations },
    ),
  );
}

main();
