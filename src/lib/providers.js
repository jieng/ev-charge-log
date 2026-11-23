const OTHER = "อื่นๆ / Other";

export const BASE_PROVIDERS = [
  "EV Station PluZ", "PEA VOLTA", "EGAT EleXa", "MEA EV", "Spark EV",
  "iGreen+", "EVolt", "OneCharge", "Altervim", "Tesla",
  "Reversharger", "Shell Recharge", "Susco EV", "EA Anywhere", "SHARGE", OTHER,
];

const norm = (s) => (s || "").trim().toLowerCase();

// รายชื่อค่ายสำหรับ dropdown: รายการหลัก + ชื่อที่เคยใช้ในบิล (ไม่ซ้ำ ไม่สนตัวพิมพ์/ช่องว่าง), "อื่นๆ" อยู่ท้ายสุด
export function mergeProviders(used = []) {
  const list = BASE_PROVIDERS.filter((p) => p !== OTHER);
  const seen = new Set(list.map(norm));
  for (const u of used) {
    const t = (u || "").trim();
    if (!t || norm(t) === norm(OTHER) || seen.has(norm(t))) continue;
    seen.add(norm(t));
    list.push(t);
  }
  return [...list, OTHER];
}

// ชื่อสถานีที่เคยพิมพ์ เรียงจากใช้บ่อยไปน้อย
export function uniqueStations(entries = []) {
  const m = new Map();
  for (const e of entries) {
    const t = (e.station || "").trim();
    if (!t) continue;
    const k = norm(t);
    const cur = m.get(k);
    if (cur) cur.n += 1; else m.set(k, { name: t, n: 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n).map((x) => x.name);
}
