import { describe, it, expect } from "vitest";
import { BASE_PROVIDERS, mergeProviders, uniqueStations } from "./providers.js";

describe("mergeProviders", () => {
  it("lists a provider once even when spelled with different case or spaces", () => {
    const out = mergeProviders(["sharge ", "Zeekr Charge", "zeekr charge"]);
    expect(out.filter((p) => p.toLowerCase() === "sharge")).toEqual(["SHARGE"]);
    expect(out.filter((p) => p.toLowerCase() === "zeekr charge")).toEqual(["Zeekr Charge"]);
  });
  it("keeps อื่นๆ / Other last", () => {
    expect(mergeProviders(["New Co"]).at(-1)).toBe("อื่นๆ / Other");
  });
  it("includes the newly added base providers", () => {
    expect(BASE_PROVIDERS).toContain("EA Anywhere");
    expect(BASE_PROVIDERS).toContain("SHARGE");
  });
});

describe("uniqueStations", () => {
  it("dedupes case-insensitively and ignores blanks", () => {
    expect(uniqueStations([{ station: "PTT รัชดา" }, { station: "ptt รัชดา " }, { station: "MEA" }, { station: "" }])).toEqual(["PTT รัชดา", "MEA"]);
  });
  it("orders by frequency, most used first", () => {
    expect(uniqueStations([{ station: "A" }, { station: "B" }, { station: "B" }])).toEqual(["B", "A"]);
  });
});
