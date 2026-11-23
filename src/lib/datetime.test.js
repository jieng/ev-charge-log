import { describe, it, expect } from "vitest";
import { normTime, toChargedAt } from "./datetime.js";

describe("normTime", () => {
  it("keeps HH:MM", () => expect(normTime("09:10")).toBe("09:10"));
  it("drops seconds from a receipt time (the 09:10:11 case that broke saving)", () => expect(normTime("09:10:11")).toBe("09:10"));
  it("pads a single-digit hour", () => expect(normTime("9:05")).toBe("09:05"));
  it("drops fractional seconds", () => expect(normTime("21:40:05.123")).toBe("21:40"));
  it("returns empty string for blank or unparseable input", () => {
    expect(normTime("")).toBe("");
    expect(normTime(undefined)).toBe("");
    expect(normTime("abc")).toBe("");
    expect(normTime("25:99")).toBe("");
  });
});

describe("toChargedAt", () => {
  it("builds the wall-clock timestamp the database accepts", () => {
    expect(toChargedAt("2026-11-23", "09:10:11")).toBe("2026-11-23T09:10:00");
    expect(toChargedAt("2026-11-23", "09:10")).toBe("2026-11-23T09:10:00");
  });
  it("uses midnight when the time is missing", () => {
    expect(toChargedAt("2026-11-23", "")).toBe("2026-11-23T00:00:00");
  });
});
