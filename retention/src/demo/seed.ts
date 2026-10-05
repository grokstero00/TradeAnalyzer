import type { Client, Location, Outreach, Visit } from "../domain/types.ts";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Deterministic pseudo-random generator.
 *
 * The demo has to look identical every time it is shown: a sales meeting is
 * no place to discover that today's random draw produced three at-risk members
 * instead of forty.
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface SeedOptions {
  asOf: Date;
  locations: number;
  clients: number;
  historyDays: number;
  seed: number;
}

export const DEFAULT_SEED: SeedOptions = {
  asOf: new Date("2026-09-22T20:00:00Z"),
  locations: 8,
  clients: 1500,
  historyDays: 120,
  seed: 42,
};

export interface SeedData {
  locations: Location[];
  clients: Client[];
  visits: Visit[];
  outreach: Outreach[];
  asOf: Date;
}

/** Behavioural archetypes, with the share of members who follow each. */
const ARCHETYPES = [
  { name: "regular", share: 0.30, gapDays: 2.5, lapsing: false },
  { name: "weekly", share: 0.25, gapDays: 7, lapsing: false },
  { name: "occasional", share: 0.20, gapDays: 14, lapsing: false },
  { name: "drifting", share: 0.15, gapDays: 4, lapsing: true },
  { name: "never", share: 0.10, gapDays: 0, lapsing: false },
] as const;

const NAMES = [
  "Аман", "Мerjen", "Serdar", "Огулджан", "Батыр", "Гözel", "Мурад", "Айна",
  "Дöwlet", "Şirin", "Rustem", "Jemal", "Kerim", "Maýa", "Begench", "Leýla",
];
const SURNAMES = [
  "Аннаев", "Мyradow", "Хожаев", "Berdiýew", "Сапаров", "Gurbanow", "Ýazow",
  "Reýimow", "Nurыev", "Оразов",
];

export function generateSeedData(opts: SeedOptions = DEFAULT_SEED): SeedData {
  const rng = makeRng(opts.seed);
  const { asOf, historyDays } = opts;

  const locations: Location[] = Array.from({ length: opts.locations }, (_, i) => ({
    id: `L${i + 1}`,
    name: `Зал №${i + 1}`,
  }));

  const clients: Client[] = [];
  const visits: Visit[] = [];
  const outreach: Outreach[] = [];

  // Cumulative shares, so one draw picks an archetype.
  const cumulative: { name: string; upTo: number; gapDays: number; lapsing: boolean }[] = [];
  let acc = 0;
  for (const a of ARCHETYPES) {
    acc += a.share;
    cumulative.push({ name: a.name, upTo: acc, gapDays: a.gapDays, lapsing: a.lapsing });
  }

  for (let i = 0; i < opts.clients; i++) {
    const id = `C${String(i + 1).padStart(4, "0")}`;
    const location = locations[Math.floor(rng() * locations.length)];

    // Most buy monthly; a minority take a discounted quarter.
    const quarterly = rng() < 0.2;
    const membershipDays = quarterly ? 90 : 30;
    const membershipPrice = quarterly ? 1000 : 400;

    // Memberships are spread out so renewals do not all land on one day.
    const startedDaysAgo = Math.floor(rng() * membershipDays);
    const membershipStart = new Date(asOf.getTime() - startedDaysAgo * DAY);
    const membershipEnd = new Date(membershipStart.getTime() + membershipDays * DAY);

    clients.push({
      id,
      locationId: location.id,
      name: `${NAMES[Math.floor(rng() * NAMES.length)]} ${SURNAMES[Math.floor(rng() * SURNAMES.length)]}`,
      phone: `+9936${String(Math.floor(rng() * 9000000) + 1000000)}`,
      membershipStart,
      membershipEnd,
      membershipPrice,
      membershipDays,
    });

    const draw = rng();
    const archetype = cumulative.find((c) => draw <= c.upTo) ?? cumulative[cumulative.length - 1];
    if (archetype.name === "never") continue;

    // A drifting member trained normally, then stopped somewhere in the past
    // few weeks. Everyone else keeps going right up to today.
    const stoppedDaysAgo = archetype.lapsing ? 8 + Math.floor(rng() * 32) : 0;

    for (let d = historyDays; d > stoppedDaysAgo; d -= archetype.gapDays * (0.7 + rng() * 0.6)) {
      // Real attendance is not perfectly regular: skip the odd session.
      if (rng() < 0.12) continue;
      const hour = 7 + Math.floor(rng() * 14);
      const at = new Date(asOf.getTime() - d * DAY);
      at.setHours(hour, Math.floor(rng() * 60), 0, 0);
      if (at > asOf) continue;
      visits.push({ clientId: id, at, source: "turnstile" });
    }

    // Some drifting members were already contacted last month, so the ROI
    // report has something real to measure.
    if (archetype.lapsing && rng() < 0.45) {
      const sentAt = new Date(asOf.getTime() - (12 + Math.floor(rng() * 14)) * DAY);
      outreach.push({
        id: `O-${id}`,
        clientId: id,
        kind: "lapse",
        sentAt,
        channel: "sms",
      });
      // A third of those contacted actually came back.
      if (rng() < 0.33) {
        const back = new Date(sentAt.getTime() + (1 + Math.floor(rng() * 10)) * DAY);
        if (back <= asOf) visits.push({ clientId: id, at: back, source: "turnstile" });
      }
    }
  }

  visits.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { locations, clients, visits, outreach, asOf };
}
