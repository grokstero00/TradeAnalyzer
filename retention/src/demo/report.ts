import {
  expiringSoon,
  findAtRisk,
  neverVisited,
  revenueAtRisk,
  revenueExpiring,
} from "../domain/retention.ts";
import { assessCaptureHealth } from "../domain/dataQuality.ts";
import { buildRoiReport, estimateBaselineReturnRate } from "../domain/roi.ts";
import { generateSeedData } from "./seed.ts";

const DAY = 24 * 60 * 60 * 1000;
const CURRENCY = "манат";

function money(n: number): string {
  return `${Math.round(n).toLocaleString("ru-RU")} ${CURRENCY}`;
}

function line(char = "─", width = 66): string {
  return char.repeat(width);
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

/**
 * The screen the owner is actually buying.
 *
 * Everything here is phrased in money rather than counts on purpose: "23
 * inactive members" is a statistic an owner can nod at and forget, while
 * "9,200 per month about to walk out" is a number that provokes a decision.
 */
function main(): void {
  const { locations, clients, visits, outreach, asOf } = generateSeedData();

  const atRisk = findAtRisk(clients, visits, asOf);
  const expiring = expiringSoon(clients, asOf, 7);
  const dormant = neverVisited(clients, visits, asOf);
  const health = assessCaptureHealth(visits, asOf);

  console.log(line("═"));
  console.log(`  СЕТЬ ЗАЛОВ — сводка на ${asOf.toLocaleDateString("ru-RU")}`);
  console.log(line("═"));
  console.log(`  Клиентов активных:        ${clients.length}`);
  console.log(`  Залов:                    ${locations.length}`);
  console.log();

  console.log(`  ⚠  УГАСАЮТ (не ходят по своему ритму)`);
  console.log(`     Человек:               ${atRisk.length}`);
  console.log(`     Выручка под угрозой:   ${money(revenueAtRisk(atRisk))} / мес`);
  console.log();

  console.log(`  ⏳ АБОНЕМЕНТ ИСТЕКАЕТ ЗА 7 ДНЕЙ`);
  console.log(`     Человек:               ${expiring.length}`);
  console.log(`     К продлению:           ${money(revenueExpiring(expiring))} / мес`);
  console.log();

  console.log(`  💤 ОПЛАТИЛИ, НО НИ РАЗУ НЕ ПРИШЛИ`);
  console.log(`     Человек:               ${dormant.length}`);
  console.log();

  const icon = { ok: "✓", low: "⚠", silent: "✗", unknown: "?" }[health.status];
  console.log(`  ${icon}  ПОЛНОТА ОТМЕТОК: ${health.message}`);
  console.log();

  // --- Did last month's outreach pay for itself? ---
  const periodFrom = new Date(asOf.getTime() - 30 * DAY);
  const roi = buildRoiReport(clients, outreach, visits, periodFrom, asOf, {
    responseWindowDays: 14,
    systemMonthlyCost: 1000,
  });
  const baseline = estimateBaselineReturnRate(
    atRisk.map((r) => r.client.id),
    new Set(outreach.map((o) => o.clientId)),
    visits,
    asOf,
    14,
  );

  console.log(line("═"));
  console.log("  ЧТО ДАЛА СИСТЕМА ЗА МЕСЯЦ");
  console.log(line("═"));
  console.log(`  Отправлено сообщений:     ${roi.contacted}`);
  console.log(`  Вернулись:                ${roi.returned}  (${(roi.returnRate * 100).toFixed(0)}%)`);
  if (baseline !== null) {
    console.log(`  Сами по себе вернулись:   ${(baseline * 100).toFixed(0)}%  ← без сообщений`);
    const lift = (roi.returnRate - baseline) * 100;
    console.log(`  Эффект обращения:         ${lift >= 0 ? "+" : ""}${lift.toFixed(0)} п.п.`);
  }
  console.log(`  Возвращено выручки:       ${money(roi.revenueRecovered)} / мес`);
  console.log(`  Стоимость системы:        ${money(roi.systemCost)} / мес`);
  if (roi.roi !== null) {
    console.log(`  Окупаемость:              ${roi.roi.toFixed(1)}x`);
  }
  console.log();

  // --- Per-location breakdown: which gym is leaking? ---
  console.log(line("═"));
  console.log("  ПО ЗАЛАМ");
  console.log(line("═"));
  console.log(`  ${pad("Зал", 12)}${pad("Клиентов", 11)}${pad("Угасают", 10)}Под угрозой`);
  console.log(line());
  for (const loc of locations) {
    const own = clients.filter((c) => c.locationId === loc.id);
    const ownRisk = atRisk.filter((r) => r.client.locationId === loc.id);
    console.log(
      `  ${pad(loc.name, 12)}${pad(String(own.length), 11)}${pad(String(ownRisk.length), 10)}${money(revenueAtRisk(ownRisk))}`,
    );
  }
  console.log();

  // --- The call list itself, most valuable first ---
  console.log(line("═"));
  console.log("  СПИСОК НА ОБЗВОН — топ 10 по ценности");
  console.log(line("═"));
  console.log(`  ${pad("Клиент", 22)}${pad("Не был", 9)}${pad("Ритм", 10)}Ценность`);
  console.log(line());
  for (const r of atRisk.slice(0, 10)) {
    const rhythm =
      r.overdueRatio !== null ? `×${r.overdueRatio.toFixed(1)}` : "—";
    console.log(
      `  ${pad(r.client.name, 22)}${pad(`${r.daysSinceLastVisit} дн`, 9)}${pad(rhythm, 10)}${money(r.monthlyValue)}`,
    );
  }
  console.log(line("═"));
}

main();
