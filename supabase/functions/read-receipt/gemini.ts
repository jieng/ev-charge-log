// เรียก Gemini พร้อมลองใหม่เมื่อโมเดลยุ่ง (429/5xx/หมดเวลา) และสลับไปโมเดลสำรองเมื่อโมเดลแรกล้มเหลวต่อเนื่อง
type Opts = {
  fetchFn: (url: string, init: any) => Promise<any>;
  key: string;
  body: unknown;
  models: string[];
  attemptsPerModel?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const FATAL = new Set([400, 401, 403]);

export async function callGemini(o: Opts): Promise<string> {
  const attempts = o.attemptsPerModel ?? 2;
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastErr = "no attempt made";
  for (const model of o.models) {
    for (let i = 0; i < attempts; i++) {
      try {
        const r = await o.fetchFn(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${o.key}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(o.body),
            signal: AbortSignal.timeout(o.timeoutMs ?? 12000),
          },
        );
        if (r.ok) {
          const data = await r.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
          if (text) return text;
          lastErr = `Gemini ${model} returned no text`;
        } else {
          const status = r.status as number;
          lastErr = `Gemini ${model} error ${status}`;
          if (FATAL.has(status)) throw new Error(lastErr);
          if (status === 404) break; // โมเดลนี้ใช้ไม่ได้ ไปตัวถัดไป
        }
      } catch (e) {
        if (String(e).includes("Gemini ") && String(e).match(/error (400|401|403)/)) throw e;
        lastErr = `Gemini ${model} failed: ${String(e).slice(0, 120)}`;
      }
      if (i < attempts - 1) await sleep(800 * (i + 1));
    }
  }
  throw new Error(lastErr);
}
