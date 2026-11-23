// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { THEMES, DEFAULT_THEME, loadTheme, applyTheme } from "./theme.js";

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("style"); });

describe("loadTheme", () => {
  it("falls back to swiss when nothing is saved", () => {
    expect(loadTheme()).toBe("swiss");
    expect(DEFAULT_THEME).toBe("swiss");
  });
  it("falls back to swiss for an unknown saved value", () => {
    localStorage.setItem("ev-theme", "nope");
    expect(loadTheme()).toBe("swiss");
  });
  it("falls back to swiss when storage throws", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    try { expect(loadTheme()).toBe("swiss"); } finally { Storage.prototype.getItem = orig; }
  });
  it("returns a saved valid theme", () => {
    localStorage.setItem("ev-theme", "dark");
    expect(loadTheme()).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("sets css variables and saves the choice", () => {
    applyTheme("dark");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(THEMES.dark.vars["--bg"]);
    expect(localStorage.getItem("ev-theme")).toBe("dark");
  });
  it("does not throw when storage is unavailable", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("blocked"); };
    try { expect(() => applyTheme("bento")).not.toThrow(); } finally { Storage.prototype.setItem = orig; }
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(THEMES.bento.vars["--bg"]);
  });
  it("ignores an unknown theme id and applies the default", () => {
    applyTheme("nope");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(THEMES.swiss.vars["--bg"]);
  });
});

describe("palettes", () => {
  for (const id of ["swiss", "bento", "dark"]) {
    it(`${id}: text colors reach 4.5:1 on their surfaces`, () => {
      const v = THEMES[id].vars;
      for (const surface of ["--bg", "--card"]) {
        for (const fg of ["--ink", "--muted", "--accent-text", "--green", "--red"]) {
          expect(contrast(v[fg], v[surface]), `${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(v["--accent-text"], v["--accent-soft"]), "accent-text on accent-soft").toBeGreaterThanOrEqual(4.5);
      expect(contrast("#FFFFFF", v["--accent"]), "white on accent").toBeGreaterThanOrEqual(4.5);
      expect(contrast("#FFFFFF", v["--strong"]), "white on strong").toBeGreaterThanOrEqual(4.5);
      expect(contrast(v["--green"], v["--green-soft"]), "green on green-soft").toBeGreaterThanOrEqual(4.5);
      expect(contrast(v["--red"], v["--red-soft"]), "red on red-soft").toBeGreaterThanOrEqual(4.5);
      expect(contrast(v["--amber-text"], v["--amber-soft"]), "amber-text on amber-soft").toBeGreaterThanOrEqual(4.5);
      expect(contrast(v["--ink"], v["--line"]), "ink on line").toBeGreaterThanOrEqual(4.5);
      expect(v["--bar2"]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  }
});
