// supabase/functions/read-receipt/index.ts
// อ่านรูปใบเสร็จการชาร์จ EV ด้วย Google Gemini vision (free tier) แล้วแปลงเป็น JSON

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGemini } from "./gemini.ts";

const PROVIDERS = [
  "EV Station PluZ", "PEA VOLTA", "EGAT EleXa", "MEA EV", "Spark EV",
  "iGreen+", "EVolt", "OneCharge", "Altervim", "Tesla",
  "Reversharger", "Shell Recharge", "Susco EV", "EA Anywhere", "SHARGE", "อื่นๆ / Other",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { image, mediaType } = await req.json();
    if (!image) return json({ error: "missing image" }, 400);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ error: "GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน Supabase secrets" }, 500);

    const prompt = `อ่านใบเสร็จ/สลิปการชาร์จรถไฟฟ้าในประเทศไทยใบนี้อย่างละเอียด

กติกาเรื่องวันที่ (สำคัญมาก ใบเสร็จแต่ละค่ายเขียนไม่เหมือนกัน):
- ถ้าเห็นเลขปี 4 หลักที่มากกว่า 2400 ให้ถือว่าเป็นปี พ.ศ. ต้องลบ 543 ก่อนตอบ (เช่น 2569 = ค.ศ. 2026)
- ถ้าเลขปีมี 2 หลัก ให้ตีความเป็นปีที่ใกล้เคียงปัจจุบัน (ค.ศ. 2026) มากที่สุด
- ใบเสร็จไทยส่วนใหญ่เรียงแบบ วัน/เดือน/ปี ไม่ใช่ เดือน/วัน/ปี แบบสากล ให้ยึดแบบไทยเป็นหลัก เว้นแต่ตัวเลขแรกเกิน 12 (แสดงว่าต้องเป็นวัน)
- ถ้าตัวเลขวันที่เลือนหรือไม่มั่นใจจริงๆ ให้ตอบ null ห้ามเดาปีหรือเดือนมั่ว
- ตอบ "date" เป็น ค.ศ. (YYYY-MM-DD) เสมอ
- ถ้าวันที่เขียนเป็นเลข 2 หลักสามชุด เช่น 03/10/26 ให้ถือว่าเป็น วัน/เดือน/ปี (3 ต.ค. 2026) ชุดสุดท้ายคือปี ห้ามตีความชุดแรกเป็นปี
- ก่อนตอบ ให้ตรวจทานอีกครั้งว่าปีที่ตอบอยู่ในช่วง 2025-2026 เท่านั้น (ใบเสร็จชาร์จรถไฟฟ้าจะไม่มีทางเก่ากว่านี้) ถ้าตรวจแล้วปีไม่อยู่ในช่วงนี้ ให้ตอบ null แทนการเดา

กติกาเรื่องชื่อสถานี:
- อ่านชื่อสั้นกระชับตามที่เห็นจริงเท่านั้น ห้ามเขียนคำหรือวลีซ้ำกันหลายรอบเด็ดขาด (เช่น ห้ามตอบ "สถานี A สถานี A สถานี A")
- ถ้าไม่มั่นใจชื่อเต็ม ให้ตอบเท่าที่อ่านได้ชัดสั้นๆ ดีกว่าเดาแล้ววนซ้ำ

ตอบเป็น JSON อย่างเดียว ห้ามมี markdown หรือคำอธิบายใดๆ:
{
 "provider": "เลือกจาก: ${PROVIDERS.join(" | ")}",
 "station": "ชื่อสาขา/สถานี",
 "conn": "DC หรือ AC",
 "kwh": ตัวเลขหน่วยไฟ,
 "amount": ยอดเงินสุทธิรวม VAT,
 "date": "YYYY-MM-DD (ค.ศ. เท่านั้น ต้องอยู่ปี 2025-2026)",
 "time": "HH:MM",
 "receipt_no": "เลขที่ใบเสร็จถ้ามี"
}
ค่าที่อ่านไม่ได้หรือไม่มั่นใจให้เป็น null ห้ามเดา`;

    // Gemini 3.5 Flash-Lite — โควต้าสูงกว่า (500/วัน) ลองใหม่เมื่อยุ่ง/หมดเวลา แล้วสำรองด้วย Mistral
    const text = await callGeminiThenMistral(prompt, image, mediaType ?? "image/jpeg", geminiKey);
    if (!text) {
      return json({ error: "อ่านรูปไม่ได้ผลลัพธ์ ระบบ AI ขัดข้องชั่วคราว ลองใหม่อีกครั้ง" }, 502);
    }

    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    // เช็คความสมเหตุสมผลของวันที่อีกชั้นที่โค้ด ไม่พึ่ง AI อย่างเดียว
    parsed.date = recoverDate(parsed.date);
    if (parsed.date) {
      const y = Number(String(parsed.date).slice(0, 4));
      const nowY = new Date().getFullYear();
      if (!y || y < nowY - 1 || y > nowY + 1) {
        console.error("rejected implausible date from OCR", parsed.date);
        parsed.date = null;
        parsed.time = null;
      }
    }

    return json(parsed);
  } catch (e) {
    console.error("unhandled error", e);
    return json({ error: String(e) }, 500);
  }
});

async function callGeminiThenMistral(prompt: string, base64: string, mediaType: string, geminiKey: string) {
  try {
    return await callGemini({
      fetchFn: fetch,
      key: geminiKey,
      models: ["gemini-3.5-flash-lite"],
      attemptsPerModel: 2,
      timeoutMs: 12000,
      body: {
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mediaType, data: base64 } }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      },
    });
  } catch (e) {
    console.error("Gemini failed", String(e));
  }

  // Gemini ใช้ไม่ได้ -> สำรองด้วย Mistral
  const mistralKey = Deno.env.get("MISTRAL_API_KEY");
  if (!mistralKey) return "";

  let mRes: Response;
  try {
    mRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${mistralKey}`,
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: "pixtral-12b-2409",
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: `data:${mediaType};base64,${base64}` },
          ],
        }],
      }),
    });
  } catch (e) {
    console.error("Mistral request failed", String(e));
    return "";
  }

  if (!mRes.ok) {
    console.error("Mistral API failed", mRes.status, await mRes.text());
    return "";
  }
  const mData = await mRes.json();
  return mData?.choices?.[0]?.message?.content ?? "";
}

// กู้วันที่ที่ AI อ่านสลับ ปี/วัน เช่น 03/10/26 ถูกอ่านเป็น 2003-10-26 -> ควรเป็น 2026-10-03
function recoverDate(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date ?? null;
  const nowY = new Date().getFullYear();
  const y = Number(date.slice(0, 4));
  if (y >= nowY - 1 && y <= nowY + 1) return date;
  const yy = Number(date.slice(2, 4));        // เช่น 03
  const mm = date.slice(5, 7);
  const lastYY = Number(date.slice(8, 10));   // เช่น 26
  const full = 2000 + lastYY;
  if (y === 2000 + yy && full >= nowY - 1 && full <= nowY + 1) {
    return `${full}-${mm}-${String(yy).padStart(2, "0")}`;
  }
  return date;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
