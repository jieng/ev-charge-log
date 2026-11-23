import { describe, it, expect } from "vitest";
import { autoLegs, applySavedLegs, legStats, jobRollup, seedTripOdo } from "./legs.js";

let id = 0;
const bill = (date, amount, kwh, odo = 0, job = "J") => ({ id: `b${++id}`, date: `${date}:00`, amount, kwh, odo, job });

describe("autoLegs", () => {
  it("splits a job into legs when bills are more than 72h apart", () => {
    const rows = [
      bill("2026-07-17T10:00", 100, 20), bill("2026-07-17T18:00", 50, 10),
      bill("2026-11-18T09:00", 80, 15), bill("2026-11-18T20:00", 60, 12),
    ];
    const legs = autoLegs(rows);
    expect(legs).toHaveLength(2);
    expect(legs[0].rows).toHaveLength(2);
    expect(legs[1].startDate).toBe("2026-11-18");
  });
  it("keeps bills 72h apart or less in one leg and handles unsorted input", () => {
    const legs = autoLegs([bill("2026-10-03T21:10", 1, 1), bill("2026-10-01T21:10", 1, 1)]);
    expect(legs).toHaveLength(1);
    expect(legs[0].rows[0].date < legs[0].rows[1].date).toBe(true);
  });
  it("returns no legs for no bills", () => {
    expect(autoLegs([])).toEqual([]);
  });
});

describe("legStats", () => {
  it("uses end minus start odometer when both are set (S26082 shape)", () => {
    const leg = { startOdo: 128493, endOdo: 129128, rows: [bill("2026-10-07T10:00", 200, 30, 128600), bill("2026-10-08T10:00", 100, 20, 129000)] };
    const s = legStats(leg);
    expect(s.km).toBe(635);
    expect(s.kmSource).toBe("trip");
    expect(s.perKm).toBeCloseTo(300 / 635, 6);
  });
  it("drops the first bill (lowest odometer) from baht-per-km when no trip odometers are set", () => {
    const leg = { startOdo: 0, endOdo: 0, rows: [bill("2026-10-01T10:00", 100, 20, 100), bill("2026-10-02T10:00", 50, 10, 150), bill("2026-10-03T10:00", 50, 10, 200)] };
    const s = legStats(leg);
    expect(s.km).toBe(100);
    expect(s.kmSource).toBe("odo");
    expect(s.perKm).toBeCloseTo(1, 6);
  });
  it("counts a later bill without odometer in baht-per-km", () => {
    const leg = { startOdo: 0, endOdo: 0, rows: [bill("2026-10-01T10:00", 100, 20, 100), bill("2026-10-02T10:00", 50, 10, 200), bill("2026-10-03T10:00", 50, 10, 0)] };
    expect(legStats(leg).perKm).toBeCloseTo(100 / 100, 6);
  });
  it("manual round trip km wins", () => {
    const s = legStats({ startOdo: 0, endOdo: 0, rows: [bill("2026-10-01T10:00", 120, 20)] }, 300);
    expect(s.km).toBe(300);
    expect(s.kmSource).toBe("manual");
    expect(s.perKm).toBeCloseTo(0.4, 6);
  });
  it("a single bill without odometer gives zero km and finite numbers", () => {
    const s = legStats({ startOdo: 0, endOdo: 0, rows: [bill("2026-10-01T10:00", 120, 20)] });
    expect(s.km).toBe(0);
    for (const v of [s.perKm, s.kwhPer100, s.amount, s.kwh]) expect(Number.isFinite(v)).toBe(true);
  });
  it("an end odometer lower than the start is ignored, never negative", () => {
    const s = legStats({ startOdo: 200, endOdo: 100, rows: [bill("2026-10-01T10:00", 120, 20)] });
    expect(s.km).toBe(0);
  });
});

describe("applySavedLegs", () => {
  it("returns automatic legs when nothing is saved", () => {
    const rows = [bill("2026-07-17T10:00", 1, 1), bill("2026-11-18T10:00", 1, 1)];
    expect(applySavedLegs(rows, [])).toHaveLength(2);
  });
  it("puts bills outside every saved leg into an unassigned leg and keeps totals", () => {
    const rows = [bill("2026-07-17T10:00", 100, 20), bill("2026-11-18T10:00", 70, 14)];
    const legs = applySavedLegs(rows, [{ id: "s1", job_code: "J", start_date: "2026-07-01", end_date: "2026-07-31", start_odo: 1000, end_odo: 1100 }]);
    expect(legs).toHaveLength(2);
    expect(legs[0].source).toBe("saved");
    expect(legs[0].startOdo).toBe(1000);
    expect(legs[1].source).toBe("unassigned");
    expect(jobRollup(legs, 0).total.amount).toBe(170);
  });
  it("assigns a bill to the first saved leg when ranges overlap", () => {
    const rows = [bill("2026-07-10T10:00", 10, 1)];
    const legs = applySavedLegs(rows, [
      { id: "a", job_code: "J", start_date: "2026-07-01", end_date: "2026-07-31" },
      { id: "b", job_code: "J", start_date: "2026-07-05", end_date: "2026-07-20" },
    ]);
    expect(legs.find((l) => l.key === "saved-a").rows).toHaveLength(1);
    expect(legs.find((l) => l.key === "saved-b").rows).toHaveLength(0);
  });
});

describe("jobRollup", () => {
  it("sums km and cost across legs and groups by month", () => {
    const rows = [
      bill("2026-07-17T10:00", 100, 20, 1000), bill("2026-07-17T18:00", 50, 10, 1100),
      bill("2026-11-18T09:00", 80, 15, 5000), bill("2026-11-18T20:00", 60, 12, 5090),
    ];
    const r = jobRollup(autoLegs(rows), 0);
    expect(r.legs).toHaveLength(2);
    expect(r.total.km).toBe(190);
    expect(r.total.amount).toBe(290);
    expect(r.months.map((m) => m.key)).toEqual(["2026-07", "2026-11"]);
    expect(r.months[0].km).toBe(100);
    expect(r.months[1].amount).toBe(140);
  });
  it("applies manual round trip km only when there is one leg", () => {
    const rows = [bill("2026-07-17T10:00", 100, 20), bill("2026-11-18T10:00", 80, 15)];
    expect(jobRollup(autoLegs(rows), 300).total.km).toBe(0);
    expect(jobRollup(autoLegs([rows[0]]), 300).total.km).toBe(300);
  });
  it("leaves a leg without distance out of the total baht-per-km (S26109 shape)", () => {
    const rows = [
      bill("2026-07-17T21:58", 90.68, 15.37, 134192),
      bill("2026-11-16T19:15", 157.11, 22.19, 134116), bill("2026-11-16T21:50", 120.52, 20.43, 134132), bill("2026-11-18T17:30", 182.44, 26.44, 134356),
    ];
    const r = jobRollup(autoLegs(rows), 0);
    expect(r.total.km).toBe(240);
    expect(r.total.amount).toBeCloseTo(550.75, 2);
    expect(r.total.perKm).toBeCloseTo((120.52 + 182.44) / 240, 6);
  });
  it("is finite for an empty job", () => {
    const r = jobRollup([], 0);
    expect(r.total).toEqual({ km: 0, amount: 0, kwh: 0, count: 0, perKm: 0, kwhPer100: 0 });
    expect(r.months).toEqual([]);
  });
});

describe("seedTripOdo", () => {
  it("gives the job's start/end odometer to the automatic leg whose bills fit inside it, not to a stray bill (S26042 shape)", () => {
    const stray = bill("2025-10-26T20:40", 168, 28, 130947);
    const trip = [bill("2026-10-14T06:37", 18, 2, 129882), bill("2026-10-15T17:19", 106, 11, 130250), bill("2026-10-25T16:36", 75, 12, 130779)];
    const legs = seedTripOdo(autoLegs([stray, ...trip]), 129882, 130779);
    expect(legs[0].startOdo).toBe(0);
    expect(legs[1].startOdo).toBe(129882);
    expect(legs[1].endOdo).toBe(130779);
    expect(legStats(legs[1]).km).toBe(897);
    expect(legStats(legs[0]).km).toBe(0);
  });
  it("leaves legs unchanged when no bill fits or no trip odometer is set", () => {
    const legs = autoLegs([bill("2026-10-14T06:37", 1, 1, 500)]);
    expect(seedTripOdo(legs, 0, 0)).toEqual(legs);
    expect(seedTripOdo(legs, 900, 1000)[0].startOdo).toBe(0);
  });
  it("does not touch saved legs", () => {
    const legs = applySavedLegs([bill("2026-07-17T10:00", 1, 1, 1050)], [{ id: "s", job_code: "J", start_date: "2026-07-01", end_date: "2026-07-31", start_odo: 1000, end_odo: 1100 }]);
    expect(seedTripOdo(legs, 5, 6)[0].startOdo).toBe(1000);
  });
});
