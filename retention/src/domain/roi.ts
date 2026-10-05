import type { Client, Outreach, Visit } from "./types.ts";
import { monthlyValue } from "./retention.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RoiReport {
  periodFrom: Date;
  periodTo: Date;
  /** Distinct clients contacted in the period. */
  contacted: number;
  /** Of those, how many came back inside the response window. */
  returned: number;
  /** returned / contacted, 0 when nobody was contacted. */
  returnRate: number;
  /** Monthly revenue represented by the clients who came back. */
  revenueRecovered: number;
  /** What the owner pays for the system over the same period. */
  systemCost: number;
  /** revenueRecovered / systemCost, null when the cost is zero. */
  roi: number | null;
}

export interface RoiConfig {
  /** A client counts as recovered if they visit within this many days of contact. */
  responseWindowDays: number;
  /** Monthly price of the system, used to state the return honestly. */
  systemMonthlyCost: number;
}

export const DEFAULT_ROI_CONFIG: RoiConfig = {
  responseWindowDays: 14,
  systemMonthlyCost: 0,
};

/**
 * Measure what the outreach actually achieved.
 *
 * This exists because of how these systems usually die: the software flags
 * drifting members correctly, nobody can see whether contacting them helped,
 * and at renewal time the owner has no reason to keep paying. A tool that
 * prices its own contribution turns that conversation from an argument into
 * an arithmetic check.
 *
 * The measure is deliberately conservative — a client counts as recovered only
 * if they were contacted and then actually walked back in. It makes no claim
 * that the message *caused* the return; see `estimateBaselineReturnRate` for
 * the comparison that keeps the number honest.
 */
export function buildRoiReport(
  clients: Client[],
  outreach: Outreach[],
  visits: Visit[],
  periodFrom: Date,
  periodTo: Date,
  cfg: RoiConfig = DEFAULT_ROI_CONFIG,
): RoiReport {
  const clientsById = new Map(clients.map((c) => [c.id, c]));

  const inPeriod = outreach.filter(
    (o) => o.sentAt >= periodFrom && o.sentAt <= periodTo,
  );

  // One client contacted three times is still one client.
  const firstContact = new Map<string, Date>();
  for (const o of inPeriod) {
    const existing = firstContact.get(o.clientId);
    if (!existing || o.sentAt < existing) firstContact.set(o.clientId, o.sentAt);
  }

  let returned = 0;
  let revenueRecovered = 0;

  for (const [clientId, sentAt] of firstContact) {
    const deadline = new Date(sentAt.getTime() + cfg.responseWindowDays * DAY_MS);
    const cameBack = visits.some(
      (v) => v.clientId === clientId && v.at > sentAt && v.at <= deadline,
    );
    if (!cameBack) continue;

    returned++;
    const client = clientsById.get(clientId);
    if (client) revenueRecovered += monthlyValue(client);
  }

  const contacted = firstContact.size;
  const months = Math.max(
    1,
    (periodTo.getTime() - periodFrom.getTime()) / (30 * DAY_MS),
  );
  const systemCost = cfg.systemMonthlyCost * months;

  return {
    periodFrom,
    periodTo,
    contacted,
    returned,
    returnRate: contacted > 0 ? returned / contacted : 0,
    revenueRecovered,
    systemCost,
    roi: systemCost > 0 ? revenueRecovered / systemCost : null,
  };
}

/**
 * How often lapsed clients drift back on their own, with no message at all.
 *
 * Without this the return rate flatters the system: some people were always
 * coming back. Subtracting the baseline is the difference between "23 people
 * we contacted returned" and "contacting them made a difference".
 *
 * Returns null when there are too few uncontacted lapsers to compare against.
 */
export function estimateBaselineReturnRate(
  lapsedClientIds: string[],
  contactedClientIds: Set<string>,
  visits: Visit[],
  asOf: Date,
  windowDays: number,
  minSample = 10,
): number | null {
  const uncontacted = lapsedClientIds.filter((id) => !contactedClientIds.has(id));
  if (uncontacted.length < minSample) return null;

  const since = new Date(asOf.getTime() - windowDays * DAY_MS);
  const back = uncontacted.filter((id) =>
    visits.some((v) => v.clientId === id && v.at > since && v.at <= asOf),
  ).length;

  return back / uncontacted.length;
}
