import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Visit } from "./types.ts";
import { assessCaptureHealth } from "./dataQuality.ts";

const DAY = 24 * 60 * 60 * 1000;
/** A Tuesday, so the weekday baseline lands on other Tuesdays. */
const NOW = new Date("2026-09-22T18:00:00Z");

/** `count` visits recorded `weeksBack` weeks before NOW, same weekday. */
function weekBack(weeksBack: number, count: number): Visit[] {
  const day = new Date(NOW.getTime() - weeksBack * 7 * DAY);
  return Array.from({ length: count }, (_, i) => ({
    clientId: `c${weeksBack}-${i}`,
    at: new Date(day.getTime() - i * 60 * 1000),
    source: "turnstile" as const,
  }));
}

function today(count: number): Visit[] {
  return Array.from({ length: count }, (_, i) => ({
    clientId: `t${i}`,
    at: new Date(NOW.getTime() - i * 60 * 1000),
    source: "turnstile" as const,
  }));
}

const BASELINE = [
  ...weekBack(1, 60),
  ...weekBack(2, 58),
  ...weekBack(3, 62),
  ...weekBack(4, 59),
];

describe("assessCaptureHealth", () => {
  it("says ok when today matches the usual weekday volume", () => {
    const h = assessCaptureHealth([...BASELINE, ...today(57)], NOW);
    assert.equal(h.status, "ok");
    assert.equal(h.today, 57);
    assert.ok(h.expected !== null && h.expected > 55);
  });

  it("raises the alarm when nothing was recorded at all", () => {
    // The dangerous case: reception stopped scanning. Without this check the
    // system would report that the entire gym has stopped coming.
    const h = assessCaptureHealth(BASELINE, NOW);
    assert.equal(h.status, "silent");
    assert.equal(h.today, 0);
    assert.match(h.message, /не отмечено/);
  });

  it("flags partial recording", () => {
    const h = assessCaptureHealth([...BASELINE, ...today(20)], NOW);
    assert.equal(h.status, "low");
    assert.ok(h.ratio !== null && h.ratio < 0.5);
  });

  it("admits it cannot judge without enough history", () => {
    const h = assessCaptureHealth([...weekBack(1, 60), ...today(5)], NOW);
    assert.equal(h.status, "unknown");
    assert.equal(h.expected, null);
  });
});
