# Retention engine

Finds the members a business is quietly losing, contacts them, and measures
whether that was worth paying for. Built for gym chains first; the same engine
covers salons, clinics and studios, which have the identical shape of problem:

```
clients → visits → drifting away → outreach → some come back
```

## Why this and not a booking app

A gym's economics are dominated by churn, not acquisition. A member who stops
coming keeps paying only until their current period runs out, and replacing
them costs more than keeping them. Yet almost no small chain can answer "who
stopped coming this month, and what are they worth" — that data exists in the
turnstile and nowhere else.

So the product is not a nicer appointment book. It is that one answer,
delivered before the member decides not to renew.

## What makes the detection non-trivial

**A flat "14 days absent" threshold is wrong for most members.** Someone who
trains four times a week and disappears for ten days is in real danger; someone
who comes fortnightly and was last seen ten days ago is simply on schedule. One
threshold treats them identically and notices the frequent visitor far too late.

`findAtRisk` therefore measures each member against **their own rhythm** — the
median gap between their past visits — and flags them once they are past it by
`overdueFactor`. The absolute threshold stays as a safety net that eventually
catches everyone. The median matters: one holiday produces a single huge gap
that an average would smear across the member's whole history, hiding the lapse
behind their own outlier.

## The two things that kill systems like this

Both are addressed in code rather than hoped away.

**1. Reception stops recording attendance.** Every number here derives from
visit records. If scanning stops for a week the system does not go blank — it
cheerfully reports that half the gym has quit, the owner acts on nonsense, and
trust is gone. `assessCaptureHealth` compares today against the same weekday
over recent weeks and says plainly when recording looks incomplete.

**2. Nobody acts on the list, so the owner sees no reason to renew.**
`buildRoiReport` prices the system's own contribution: who was contacted, who
came back, what that revenue is worth against what the system costs. And
`estimateBaselineReturnRate` keeps that honest by measuring how many lapsed
members drift back with no message at all — without it the report takes credit
for people who were always returning.

## Layout

```
src/domain/     pure functions, no database, fully unit-tested
  types.ts        Client, Visit, Outreach, AtRiskClient
  retention.ts    rhythm-based lapse detection, expiry windows, revenue at risk
  roi.ts          did the outreach pay for itself, against a no-contact baseline
  dataQuality.ts  is attendance still being recorded properly
src/demo/       deterministic fake chain (8 venues, 1500 members) + owner report
```

Attendance capture is deliberately pluggable: `Visit.source` is one of
`turnstile | manual | qr | import`. Whether a venue already has card-based
turnstiles decides the whole integration, and it is the first question to ask —
where turnstiles exist, the system needs no daily human input at all.

## Running it

Requires Node 22.18+ (TypeScript runs natively, no build step, no dependencies).

```bash
npm test     # 26 unit tests across detection, ROI and data quality
npm run demo # prints the owner-facing summary from generated data
```

## Status

Domain engine and demo report are done and tested. Not yet built: storage,
ingestion adapters, web UI, automated messaging. Those follow the first
conversations with an owner — the demo exists to start that conversation, not
to be the product.
