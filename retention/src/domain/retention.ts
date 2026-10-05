import type { AtRiskClient, Client, Visit } from "./types.ts";

export interface RetentionConfig {
  /**
   * Flag anyone who has not been seen for this many days, whatever their
   * rhythm. This is the safety net that eventually catches everybody.
   */
  absoluteLapseDays: number;
  /**
   * Flag a client once they are this many times past their OWN typical gap.
   * A member who trains four times a week and has been absent ten days is in
   * more danger than one who comes fortnightly — a single flat threshold
   * treats them identically and notices the frequent visitor far too late.
   */
  overdueFactor: number;
  /** Minimum visits needed before a client's rhythm is considered known. */
  minVisitsForRhythm: number;
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  absoluteLapseDays: 14,
  overdueFactor: 2.5,
  minVisitsForRhythm: 4,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two instants (never negative). */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

/** What the client is worth per 30 days, so clients on different plans compare. */
export function monthlyValue(client: Client): number {
  if (client.membershipDays <= 0) return 0;
  return (client.membershipPrice / client.membershipDays) * 30;
}

/** Visits for one client, oldest first. */
export function visitsOf(clientId: string, visits: Visit[]): Visit[] {
  return visits
    .filter((v) => v.clientId === clientId)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The client's usual gap between visits, in days.
 *
 * Uses the median rather than the mean: a single holiday or illness produces
 * one huge gap that would drag an average upwards and make the client look
 * like a rare visitor, hiding a genuine lapse behind their own outlier.
 */
export function typicalGapDays(clientVisits: Visit[], cfg: RetentionConfig): number | null {
  if (clientVisits.length < cfg.minVisitsForRhythm) return null;

  const gaps: number[] = [];
  for (let i = 1; i < clientVisits.length; i++) {
    const gap = (clientVisits[i].at.getTime() - clientVisits[i - 1].at.getTime()) / DAY_MS;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;

  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
  return median > 0 ? median : null;
}

/** True while the client has paid-up time left. */
export function isMembershipActive(client: Client, asOf: Date): boolean {
  return client.membershipEnd.getTime() >= asOf.getTime();
}

/**
 * Clients who are drifting away while they still have membership left — the
 * ones worth a message, because they can still be brought back before they
 * decide not to renew. Someone whose membership already lapsed is a different
 * (and harder) conversation; see `expiredNotRenewed`.
 */
export function findAtRisk(
  clients: Client[],
  visits: Visit[],
  asOf: Date,
  cfg: RetentionConfig = DEFAULT_RETENTION_CONFIG,
): AtRiskClient[] {
  const out: AtRiskClient[] = [];

  for (const client of clients) {
    if (!isMembershipActive(client, asOf)) continue;

    const mine = visitsOf(client.id, visits);
    const lastVisit = mine.length > 0 ? mine[mine.length - 1].at : null;

    // Never visited at all: they paid and never started. Real, but a separate
    // problem from a member who is slipping away, so it is not mixed in here.
    if (lastVisit === null) continue;

    const daysSince = daysBetween(lastVisit, asOf);
    const gap = typicalGapDays(mine, cfg);
    const ratio = gap !== null ? daysSince / gap : null;

    const lapsedByClock = daysSince >= cfg.absoluteLapseDays;
    const lapsedByRhythm = ratio !== null && ratio >= cfg.overdueFactor;
    if (!lapsedByClock && !lapsedByRhythm) continue;

    out.push({
      client,
      lastVisit,
      daysSinceLastVisit: daysSince,
      typicalGapDays: gap,
      overdueRatio: ratio,
      monthlyValue: monthlyValue(client),
    });
  }

  // Most valuable first: if staff only get through half the list, it should be
  // the half that matters. Among clients worth the same — and on a single
  // standard plan that is most of them — the one furthest outside their own
  // rhythm goes first, because they are the furthest along towards leaving.
  return out.sort((a, b) => {
    if (b.monthlyValue !== a.monthlyValue) return b.monthlyValue - a.monthlyValue;
    const ra = a.overdueRatio ?? a.daysSinceLastVisit / DEFAULT_RETENTION_CONFIG.absoluteLapseDays;
    const rb = b.overdueRatio ?? b.daysSinceLastVisit / DEFAULT_RETENTION_CONFIG.absoluteLapseDays;
    return rb - ra;
  });
}

/** Members who paid but never once turned up — a distinct, very early warning. */
export function neverVisited(clients: Client[], visits: Visit[], asOf: Date): Client[] {
  const seen = new Set(visits.map((v) => v.clientId));
  return clients.filter((c) => isMembershipActive(c, asOf) && !seen.has(c.id));
}

/** Memberships running out within `days` — the renewal call list. */
export function expiringSoon(clients: Client[], asOf: Date, days: number): Client[] {
  const horizon = new Date(asOf.getTime() + days * DAY_MS);
  return clients
    .filter((c) => c.membershipEnd >= asOf && c.membershipEnd <= horizon)
    .sort((a, b) => a.membershipEnd.getTime() - b.membershipEnd.getTime());
}

/** Memberships that ran out within the last `days` and were not renewed. */
export function expiredNotRenewed(clients: Client[], asOf: Date, days: number): Client[] {
  const cutoff = new Date(asOf.getTime() - days * DAY_MS);
  return clients
    .filter((c) => c.membershipEnd < asOf && c.membershipEnd >= cutoff)
    .sort((a, b) => b.membershipEnd.getTime() - a.membershipEnd.getTime());
}

/**
 * Monthly revenue represented by a set of clients.
 *
 * This is the number the owner actually reacts to. "23 inactive members" is a
 * statistic; "9,200 per month about to walk out" is a decision.
 */
export function revenueAtRisk(atRisk: AtRiskClient[]): number {
  return atRisk.reduce((sum, r) => sum + r.monthlyValue, 0);
}

/** Monthly revenue tied up in memberships about to expire. */
export function revenueExpiring(clients: Client[]): number {
  return clients.reduce((sum, c) => sum + monthlyValue(c), 0);
}
