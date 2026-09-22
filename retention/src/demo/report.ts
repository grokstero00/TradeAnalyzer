/** Owner summary over generated data — the version to show when you have no real file yet. */
import { generateSeedData } from "./seed.ts";
import { renderOwnerSummary } from "../report/render.ts";

const { locations, clients, visits, outreach, asOf } = generateSeedData();

console.log(
  renderOwnerSummary(
    { clients, visits, outreach, asOf },
    { currency: "манат", systemMonthlyCost: 1000, locations },
  ),
);
