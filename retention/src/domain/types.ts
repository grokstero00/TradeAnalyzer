/**
 * Domain types for the retention engine.
 *
 * Deliberately independent of any storage or transport layer: every rule in
 * `retention.ts`, `roi.ts` and `dataQuality.ts` is a pure function over these
 * shapes, so the logic can be unit-tested without a database and reused
 * unchanged across verticals (gyms today, salons and clinics later).
 */

/** One physical venue. A chain has several. */
export interface Location {
  id: string;
  name: string;
}

/** A paying member. */
export interface Client {
  id: string;
  locationId: string;
  name: string;
  phone: string;
  /** Start of the current membership period. */
  membershipStart: Date;
  /** End of the current membership period. */
  membershipEnd: Date;
  /** What the client pays for the current period, in minor-unit-free currency. */
  membershipPrice: number;
  /** Length of the paid period in days — used to express price per month. */
  membershipDays: number;
}

/** Where a visit record came from. Attendance capture is deliberately pluggable. */
export type VisitSource = "turnstile" | "manual" | "qr" | "import";

/** One recorded entry to a venue. */
export interface Visit {
  clientId: string;
  at: Date;
  source: VisitSource;
}

/** Why we contacted a client. */
export type OutreachKind = "lapse" | "expiry" | "winback";

/** One message sent to a client, recorded so the system can price its own value. */
export interface Outreach {
  id: string;
  clientId: string;
  kind: OutreachKind;
  sentAt: Date;
  channel: string;
}

/** A client flagged as drifting away, with the evidence behind the flag. */
export interface AtRiskClient {
  client: Client;
  lastVisit: Date | null;
  daysSinceLastVisit: number;
  /** The client's own typical gap between visits, in days. */
  typicalGapDays: number | null;
  /**
   * How far past their own rhythm they are: 2.0 means twice their usual gap.
   * Null when there is not enough history to know their rhythm.
   */
  overdueRatio: number | null;
  /** Monthly value of this client, used to total the revenue at risk. */
  monthlyValue: number;
}
