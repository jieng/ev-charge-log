import { describe, it, expect } from "vitest";
import { callGemini } from "./gemini.ts";

const ok = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }), text: async () => "" });
const fail = (status) => ({ ok: false, status, json: async () => ({}), text: async () => `err ${status}` });
const run = (responses, opts = {}) => {
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); const r = responses.shift(); if (r instanceof Error) throw r; return r; };
  return { calls, p: callGemini({ fetchFn, key: "k", body: {}, models: ["m1", "m2"], attemptsPerModel: 2, sleep: async () => {}, ...opts }) };
};

describe("callGemini", () => {
  it("retries a 503 on the same model and returns the later success", async () => {
    const { calls, p } = run([fail(503), ok("{}")]);
    expect(await p).toBe("{}");
    expect(calls).toHaveLength(2);
    expect(calls.every((u) => u.includes("m1"))).toBe(true);
  });
  it("falls back to the next model after the first model keeps failing", async () => {
    const { calls, p } = run([fail(503), fail(503), ok("{\"a\":1}")]);
    expect(await p).toBe("{\"a\":1}");
    expect(calls[2]).toContain("m2");
  });
  it("does not retry a client error such as 400", async () => {
    const { calls, p } = run([fail(400), ok("{}")]);
    await expect(p).rejects.toThrow(/400/);
    expect(calls).toHaveLength(1);
  });
  it("retries when the request times out or the network throws", async () => {
    const { p } = run([new Error("timeout"), ok("{}")]);
    expect(await p).toBe("{}");
  });
  it("throws with the last status when every attempt fails", async () => {
    const { calls, p } = run([fail(503), fail(503), fail(429), fail(503)]);
    await expect(p).rejects.toThrow(/503/);
    expect(calls).toHaveLength(4);
  });
  it("treats an empty answer as a failure to retry", async () => {
    const { p } = run([ok(""), ok("{}")]);
    expect(await p).toBe("{}");
  });
});
