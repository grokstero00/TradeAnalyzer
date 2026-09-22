import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Client, Visit } from "./types.ts";
import {
  DEFAULT_RETENTION_CONFIG,
  expiredNotRenewed,
  expiringSoon,
  findAtRisk,
  monthlyValue,
  neverVisited,
  revenueAtRisk,
  typicalGapDays,
} from "./retention.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-22T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY);
}

function client(over: Partial<Client> & { id: string }): Client {
  return {
    locationId: "L1",
    name: `Client ${over.id}`,
    phone: "+99300000000",
    membershipStart: daysAgo(60),
    membershipEnd: new Date(NOW.getTime() + 30 * DAY),
    membershipPrice: 400,
    membershipDays: 30,
    ...over,
  };
}

/** Visits every `every` days, ending `lastDaysAgo` days ago. */
function rhythm(clientId: string, every: number, count: number, lastDaysAgo: number): Visit[] {
  const out: Visit[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ clientId, at: daysAgo(lastDaysAgo + i * every), source: "turnstile" });
  }
  return out;
}

describe("monthlyValue", () => {
  it("normalises different plan lengths to 30 days", () => {
    assert.equal(monthlyValue(client({ id: "a", membershipPrice: 400, membershipDays: 30 })), 400);
    assert.equal(monthlyValue(client({ id: "b", membershipPrice: 1200, membershipDays: 90 })), 400);
  });
});

describe("typicalGapDays", () => {
  it("returns null until the rhythm is known", () => {
    const visits = rhythm("a", 3, 2, 1);
    assert.equal(typicalGapDays(visits, DEFAULT_RETENTION_CONFIG), null);
  });

  it("uses the median so one holiday does not distort the rhythm", () => {
    // Trains every 2 days, then a 40-day holiday, then every 2 days again.
    const visits: Visit[] = [
      { clientId: "a", at: daysAgo(60), source: "turnstile" },
      { clientId: "a", at: daysAgo(58), source: "turnstile" },
      { clientId: "a", at: daysAgo(18), source: "turnstile" }, // 40-day gap
      { clientId: "a", at: daysAgo(16), source: "turnstile" },
      { clientId: "a", at: daysAgo(14), source: "turnstile" },
    ];
    const gap = typicalGapDays(visits, DEFAULT_RETENTION_CONFIG);
    // Mean would be ~11.5 and hide a lapse; the median stays at the real rhythm.
    assert.equal(gap, 2);
  });
});

describe("findAtRisk", () => {
  it("flags a long absence even without a known rhythm", () => {
    const c = client({ id: "a" });
    const visits: Visit[] = [{ clientId: "a", at: daysAgo(20), source: "turnstile" }];
    const risk = findAtRisk([c], visits, NOW);
    assert.equal(risk.length, 1);
    assert.equal(risk[0].daysSinceLastVisit, 20);
  });

  it("catches a frequent visitor BEFORE the flat threshold would", () => {
    // Trains every 2 days, absent 8 days: four times their own rhythm, but
    // still short of the 14-day absolute threshold.
    const c = client({ id: "fast" });
    const visits = rhythm("fast", 2, 10, 8);

    const risk = findAtRisk([c], visits, NOW);
    assert.equal(risk.length, 1, "rhythm-based detection should fire");
    assert.equal(risk[0].daysSinceLastVisit, 8);
    assert.ok(risk[0].overdueRatio !== null && risk[0].overdueRatio >= 2.5);

    // With rhythm detection disabled, the same client is invisible.
    const flatOnly = findAtRisk([c], visits, NOW, {
      ...DEFAULT_RETENTION_CONFIG,
      overdueFactor: Number.POSITIVE_INFINITY,
    });
    assert.equal(flatOnly.length, 0);
  });

  it("leaves an occasional visitor alone when they are on schedule", () => {
    // Comes fortnightly and was here 10 days ago: normal for them.
    const c = client({ id: "slow" });
    const visits = rhythm("slow", 14, 8, 10);
    assert.equal(findAtRisk([c], visits, NOW).length, 0);
  });

  it("ignores clients whose membership already ended", () => {
    const c = client({ id: "gone", membershipEnd: daysAgo(5) });
    const visits: Visit[] = [{ clientId: "gone", at: daysAgo(40), source: "turnstile" }];
    assert.equal(findAtRisk([c], visits, NOW).length, 0);
  });

  it("does not mix in members who never once visited", () => {
    const c = client({ id: "never" });
    assert.equal(findAtRisk([c], [], NOW).length, 0);
    assert.equal(neverVisited([c], [], NOW).length, 1);
  });

  it("orders by monthly value so a half-worked list is the valuable half", () => {
    const cheap = client({ id: "cheap", membershipPrice: 200 });
    const rich = client({ id: "rich", membershipPrice: 900 });
    const visits: Visit[] = [
      { clientId: "cheap", at: daysAgo(30), source: "turnstile" },
      { clientId: "rich", at: daysAgo(20), source: "turnstile" },
    ];
    const risk = findAtRisk([cheap, rich], visits, NOW);
    assert.deepEqual(risk.map((r) => r.client.id), ["rich", "cheap"]);
  });

  it("breaks ties by how far the client is outside their own rhythm", () => {
    // Same plan, same price: the tie-break decides who reception calls first.
    const mild = client({ id: "mild" });
    const severe = client({ id: "severe" });
    const visits = [
      // Fortnightly visitor, absent 16 days — barely off pattern.
      ...rhythm("mild", 14, 6, 16),
      // Every-other-day visitor, absent 16 days — eight times their rhythm.
      ...rhythm("severe", 2, 10, 16),
    ];
    const risk = findAtRisk([mild, severe], visits, NOW);
    assert.deepEqual(risk.map((r) => r.client.id), ["severe", "mild"]);
  });
});

describe("revenueAtRisk", () => {
  it("totals the monthly value of the flagged clients", () => {
    const a = client({ id: "a", membershipPrice: 400, membershipDays: 30 });
    const b = client({ id: "b", membershipPrice: 1200, membershipDays: 90 });
    const visits: Visit[] = [
      { clientId: "a", at: daysAgo(30), source: "turnstile" },
      { clientId: "b", at: daysAgo(30), source: "turnstile" },
    ];
    assert.equal(revenueAtRisk(findAtRisk([a, b], visits, NOW)), 800);
  });
});

describe("expiry windows", () => {
  it("lists memberships ending inside the horizon, soonest first", () => {
    const soon = client({ id: "soon", membershipEnd: new Date(NOW.getTime() + 3 * DAY) });
    const later = client({ id: "later", membershipEnd: new Date(NOW.getTime() + 6 * DAY) });
    const far = client({ id: "far", membershipEnd: new Date(NOW.getTime() + 40 * DAY) });
    const got = expiringSoon([far, later, soon], NOW, 7);
    assert.deepEqual(got.map((c) => c.id), ["soon", "later"]);
  });

  it("lists recently lapsed memberships, most recent first", () => {
    const justGone = client({ id: "just", membershipEnd: daysAgo(2) });
    const older = client({ id: "older", membershipEnd: daysAgo(20) });
    const ancient = client({ id: "ancient", membershipEnd: daysAgo(400) });
    const got = expiredNotRenewed([ancient, older, justGone], NOW, 30);
    assert.deepEqual(got.map((c) => c.id), ["just", "older"]);
  });
});
