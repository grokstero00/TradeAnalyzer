import type { Client, Location, Outreach, Visit } from "../domain/types.ts";
import {
  expiringSoon,
  findAtRisk,
  neverVisited,
  revenueAtRisk,
  revenueExpiring,
} from "../domain/retention.ts";
import { assessCaptureHealth } from "../domain/dataQuality.ts";
import { buildRoiReport, estimateBaselineReturnRate } from "../domain/roi.ts";

const DAY = 24 * 60 * 60 * 1000;

export interface RenderOptions {
  currency: string;
  /** Monthly price of the system, so the report can state its own return. */
  systemMonthlyCost: number;
  /** Venue names, when known. Locations are inferred from the data otherwise. */
  locations?: Location[];
}

export const DEFAULT_RENDER: RenderOptions = {
  currency: "манат",
  systemMonthlyCost: 0,
};

export interface SummaryInput {
  clients: Client[];
  visits: Visit[];
  outreach: Outreach[];
  asOf: Date;
}

function line(char = "─", width = 66): string {
  return char.repeat(width);
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

/**
 * The owner-facing summary.
 *
 * Every headline is stated in money rather than headcount, on purpose:
 * "23 inactive members" is a statistic that gets nodded at and forgotten,
 * while "9,200 per month about to walk out" is a number that provokes a
 * decision. The counts are still there, one line down.
 */
export function renderOwnerSummary(
  input: SummaryInput,
  opts: RenderOptions = DEFAULT_RENDER,
): string {
  const { clients, visits, outreach, asOf } = input;
  const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ${opts.currency}`;
  const out: string[] = [];

  const atRisk = findAtRisk(clients, visits, asOf);
  const expiring = expiringSoon(clients, asOf, 7);
  const dormant = neverVisited(clients, visits, asOf);
  const hasVisitData = visits.length > 0;

  out.push(line("═"));
  out.push(`  СВОДКА НА ${asOf.toLocaleDateString("ru-RU")}`);
  out.push(line("═"));
  out.push(`  Клиентов в базе:          ${clients.length}`);
  out.push("");

  if (hasVisitData) {
    out.push("  ⚠  УГАСАЮТ (не ходят по своему ритму)");
    out.push(`     Человек:               ${atRisk.length}`);
    out.push(`     Выручка под угрозой:   ${money(revenueAtRisk(atRisk))} / мес`);
    out.push("");
  } else {
    // Without attendance there is no way to see someone drifting — only to
    // notice, later, that they did not renew. Say so plainly rather than
    // presenting an empty list as good news.
    out.push("  ⚠  ДАННЫХ О ПОСЕЩЕНИЯХ НЕТ");
    out.push("     Угасающих клиентов определить невозможно —");
    out.push("     нужна выгрузка проходов с турникета или отметки на ресепшене.");
    out.push("");
  }

  out.push("  ⏳ АБОНЕМЕНТ ИСТЕКАЕТ ЗА 7 ДНЕЙ");
  out.push(`     Человек:               ${expiring.length}`);
  out.push(`     К продлению:           ${money(revenueExpiring(expiring))} / мес`);
  out.push("");

  if (hasVisitData) {
    out.push("  💤 ОПЛАТИЛИ, НО НИ РАЗУ НЕ ПРИШЛИ");
    out.push(`     Человек:               ${dormant.length}`);
    out.push("");

    const health = assessCaptureHealth(visits, asOf);
    const icon = { ok: "✓", low: "⚠", silent: "✗", unknown: "?" }[health.status];
    out.push(`  ${icon}  ПОЛНОТА ОТМЕТОК: ${health.message}`);
    out.push("");
  }

  // --- Did outreach pay for itself? Only meaningful once messages were sent.
  if (outreach.length > 0) {
    const periodFrom = new Date(asOf.getTime() - 30 * DAY);
    const roi = buildRoiReport(clients, outreach, visits, periodFrom, asOf, {
      responseWindowDays: 14,
      systemMonthlyCost: opts.systemMonthlyCost,
    });
    const baseline = estimateBaselineReturnRate(
      atRisk.map((r) => r.client.id),
      new Set(outreach.map((o) => o.clientId)),
      visits,
      asOf,
      14,
    );

    out.push(line("═"));
    out.push("  ЧТО ДАЛА СИСТЕМА ЗА МЕСЯЦ");
    out.push(line("═"));
    out.push(`  Отправлено сообщений:     ${roi.contacted}`);
    out.push(`  Вернулись:                ${roi.returned}  (${(roi.returnRate * 100).toFixed(0)}%)`);
    if (baseline !== null) {
      out.push(`  Сами по себе вернулись:   ${(baseline * 100).toFixed(0)}%  ← без сообщений`);
      const lift = (roi.returnRate - baseline) * 100;
      out.push(`  Эффект обращения:         ${lift >= 0 ? "+" : ""}${lift.toFixed(0)} п.п.`);
    }
    out.push(`  Возвращено выручки:       ${money(roi.revenueRecovered)} / мес`);
    if (roi.systemCost > 0) {
      out.push(`  Стоимость системы:        ${money(roi.systemCost)} / мес`);
      if (roi.roi !== null) out.push(`  Окупаемость:              ${roi.roi.toFixed(1)}x`);
    }
    out.push("");
  }

  // --- Per venue, when there is more than one ---
  const locationIds = [...new Set(clients.map((c) => c.locationId))];
  if (locationIds.length > 1) {
    const nameOf = new Map((opts.locations ?? []).map((l) => [l.id, l.name]));
    out.push(line("═"));
    out.push("  ПО ЗАЛАМ");
    out.push(line("═"));
    out.push(`  ${pad("Зал", 14)}${pad("Клиентов", 11)}${pad("Угасают", 10)}Под угрозой`);
    out.push(line());
    for (const id of locationIds) {
      const own = clients.filter((c) => c.locationId === id);
      const ownRisk = atRisk.filter((r) => r.client.locationId === id);
      out.push(
        `  ${pad(nameOf.get(id) ?? id, 14)}${pad(String(own.length), 11)}${pad(String(ownRisk.length), 10)}${money(revenueAtRisk(ownRisk))}`,
      );
    }
    out.push("");
  }

  // --- The call list itself ---
  if (atRisk.length > 0) {
    out.push(line("═"));
    out.push(`  СПИСОК НА ОБЗВОН — топ ${Math.min(15, atRisk.length)} по ценности`);
    out.push(line("═"));
    out.push(`  ${pad("Клиент", 24)}${pad("Телефон", 15)}${pad("Не был", 9)}${pad("Ритм", 8)}Ценность`);
    out.push(line());
    for (const r of atRisk.slice(0, 15)) {
      const rhythm = r.overdueRatio !== null ? `×${r.overdueRatio.toFixed(1)}` : "—";
      out.push(
        `  ${pad(r.client.name, 24)}${pad(r.client.phone || "—", 15)}${pad(`${r.daysSinceLastVisit} дн`, 9)}${pad(rhythm, 8)}${money(r.monthlyValue)}`,
      );
    }
    out.push(line("═"));
  }

  return out.join("\n");
}
