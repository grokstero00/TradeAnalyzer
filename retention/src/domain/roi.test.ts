import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Client, Outreach, Visit } from "./types.ts";
import { buildRoiReport, estimateBaselineReturnRate } from "./roi.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-22T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function client(id: string, price = 400): Client {
  return {
    id,
    locationId: "L1",
    name: `Client ${id}`,
    phone: "+99300000000",
    membershipStart: daysAgo(60),
    membershipEnd: new Date(NOW.getTime() + 30 * DAY),
    membershipPrice: price,
    membershipDays: 30,
  };
}

function sent(clientId: string, daysBack: number, id = `o-${clientId}-${daysBack}`): Outreach {
  return { id, clientId, kind: "lapse", sentAt: daysAgo(daysBack), channel: "sms" };
}

const PERIOD_FROM = daysAgo(30);
const PERIOD_TO = NOW;

describe("buildRoiReport", () => {
  it("counts a client who returned inside the window", () => {
    const clients = [client("a")];
    const outreach = [sent("a", 20)];
    const visits: Visit[] = [{ clientId: "a", at: daysAgo(15), source: "turnstile" }];

    const r = buildRoiReport(clients, outreach, visits, PERIOD_FROM, PERIOD_TO);
    assert.equal(r.contacted, 1);
    assert.equal(r.returned, 1);
    assert.equal(r.revenueRecovered, 400);
  });

  it("does not count a visit that arrived after the response window", () => {
    const clients = [client("a")];
    const outreach = [sent("a", 30)];
    // Window is 14 days; this visit is 20 days after contact.
    const visits: Visit[] = [{ clientId: "a", at: daysAgo(10), source: "turnstile" }];

    const r = buildRoiReport(clients, outreach, visits, PERIOD_FROM, PERIOD_TO);
    assert.equal(r.returned, 0);
    assert.equal(r.revenueRecovered, 0);
  });

  it("ignores visits that happened before the message was sent", () => {
    const clients = [client("a")];
    const outreach = [sent("a", 10)];
    const visits: Visit[] = [{ clientId: "a", at: daysAgo(12), source: "turnstile" }];

    const r = buildRoiReport(clients, outreach, visits, PERIOD_FROM, PERIOD_TO);
    assert.equal(r.returned, 0);
  });

  it("counts a client contacted three times only once", () => {
    const clients = [client("a")];
    const outreach = [sent("a", 20, "o1"), sent("a", 18, "o2"), sent("a", 16, "o3")];
    const visits: Visit[] = [{ clientId: "a", at: daysAgo(15), source: "turnstile" }];

    const r = buildRoiReport(clients, outreach, visits, PERIOD_FROM, PERIOD_TO);
    assert.equal(r.contacted, 1);
    assert.equal(r.returned, 1);
  });

  it("reports the return against what the owner pays", () => {
    const clients = [client("a", 400), client("b", 600)];
    const outreach = [sent("a", 20), sent("b", 20)];
    const visits: Visit[] = [
      { clientId: "a", at: daysAgo(15), source: "turnstile" },
      { clientId: "b", at: daysAgo(14), source: "turnstile" },
    ];

    const r = buildRoiReport(clients, outreach, visits, PERIOD_FROM, PERIOD_TO, {
      responseWindowDays: 14,
      systemMonthlyCost: 1000,
    });
    assert.equal(r.revenueRecovered, 1000);
    assert.equal(r.systemCost, 1000);
    assert.equal(r.roi, 1);
  });

  it("reports zero cleanly when nobody was contacted", () => {
    const r = buildRoiReport([client("a")], [], [], PERIOD_FROM, PERIOD_TO);
    assert.equal(r.contacted, 0);
    assert.equal(r.returnRate, 0);
    assert.equal(r.roi, null);
  });
});

describe("estimateBaselineReturnRate", () => {
  it("measures how many lapsers drift back with no message at all", () => {
    // 12 uncontacted lapsers, 3 of whom returned on their own.
    const lapsed = Array.from({ length: 12 }, (_, i) => `u${i}`);
    const visits: Visit[] = [0, 1, 2].map((i) => ({
      clientId: `u${i}`,
      at: daysAgo(5),
      source: "turnstile" as const,
    }));

    const rate = estimateBaselineReturnRate(lapsed, new Set(), visits, NOW, 14);
    assert.equal(rate, 0.25);
  });

  it("refuses to guess from too small a sample", () => {
    const rate = estimateBaselineReturnRate(["a", "b"], new Set(), [], NOW, 14);
    assert.equal(rate, null);
  });

  it("excludes clients who were contacted", () => {
    // 15 lapsers, 3 of them contacted, leaving 12 untouched — above the
    // minimum sample. The only three who returned were all contacted, so the
    // untouched baseline is genuinely zero.
    const lapsed = Array.from({ length: 15 }, (_, i) => `u${i}`);
    const contacted = new Set(["u0", "u1", "u2"]);
    const visits: Visit[] = [0, 1, 2].map((i) => ({
      clientId: `u${i}`,
      at: daysAgo(5),
      source: "turnstile" as const,
    }));

    const rate = estimateBaselineReturnRate(lapsed, contacted, visits, NOW, 14);
    assert.equal(rate, 0);
  });
});
