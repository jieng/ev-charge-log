import { describe, it, expect } from "vitest";
import { fitSize } from "./image.js";

describe("fitSize", () => {
  it("shrinks a large landscape photo so the long side is the maximum", () => {
    expect(fitSize(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });
  it("shrinks a large portrait photo", () => {
    expect(fitSize(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("never enlarges a small image", () => {
    expect(fitSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it("returns the input for zero or invalid sizes", () => {
    expect(fitSize(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });
});
