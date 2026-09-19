// supabase/functions/read-receipt/index.ts
// อ่านรูปใบเสร็จการชาร์จ EV ด้วย Google Gemini vision แล้วแปลงเป็น JSON

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROVIDERS = [
"EV Station PluZ", "PEA VOLTA", "EGAT EleXa", "MEA EV", "Spark EV",
"iGreen+", "EVolt", "OneCharge", "Altervim", "Tesla",
"Reversharger", "Shell Recharge", "Susco EV", "อื่นๆ / Other",
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
if (!geminiKey) return json({ error: "GEMINI_API_KEY not set" }, 500);

const prompt = `Read this Thai EV charging receipt/slip image.
Reply with JSON only, no markdown or explanation:
{
 "provider": "one of: ${PROVIDERS.join(" | ")}",
  "station": "station/branch name",
   "conn": "DC or AC",
    "kwh": energy number,
     "amount": total amount incl VAT,
      "date": "YYYY-MM-DD",
       "time": "HH:MM",
        "receipt_no": "receipt number if any"
        }
        Use null for unreadable values. Do not guess.`;

        const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
        contents: [{
        parts: [
        { text: prompt },
        { inline_data: { mime_type: mediaType ?? "image/jpeg", data: image } },
        ],
        }],
        generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        },
        }),
        },
        );

        if (!r.ok) {
        const errText = await r.text();
        return json({ error: `Gemini API error: ${errText.slice(0, 300)}` }, 502);
        }

        const data = await r.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
        if (!text) return json({ error: "Gemini returned no text" }, 502);

        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        return json(parsed);
        } catch (e) {
        return json({ error: String(e) }, 500);
        }
        });

        function json(body: unknown, status = 200) {
        return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "content-type": "application/json" },
        });
        }
        
