// เที่ยว (leg) ของงาน/ทริป: แบ่งบิลของเลขงานเดียวกันเป็นช่วงๆ แล้วคิดระยะทาง/ค่าใช้จ่ายต่อเที่ยว
// วันที่เป็นเวลาไทยตามนาฬิกาเก็บแบบ UTC จึงอ่านจากข้อความตรงๆ ไม่แปลงโซนเวลา
const GAP_MS = 72 * 3600 * 1000;
const wallMs = (iso) => Date.parse(iso.slice(0, 19) + "Z");
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const day = (iso) => iso.slice(0, 10);

function makeLeg(key, rows, extra = {}) {
  const sorted = [...rows].sort(byDate);
  return {
    key,
    startDate: sorted.length ? day(sorted[0].date) : "",
    endDate: sorted.length ? day(sorted.at(-1).date) : "",
    startOdo: 0,
    endOdo: 0,
    rows: sorted,
    source: "auto",
    ...extra,
  };
}

// แบ่งอัตโนมัติ: บิลห่างกันเกิน 72 ชม. = เที่ยวใหม่
export function autoLegs(rows = []) {
  const sorted = [...rows].sort(byDate);
  const groups = [];
  sorted.forEach((e) => {
    const g = groups.at(-1);
    if (g && wallMs(e.date) - wallMs(g.at(-1).date) <= GAP_MS) g.push(e);
    else groups.push([e]);
  });
  return groups.map((g) => makeLeg(`auto-${g[0].date}`, g));
}

// เที่ยวที่ผู้ใช้บันทึกไว้ทับอัตโนมัติ; บิลที่ไม่อยู่ในช่วงใดๆ รวมเป็นกลุ่ม "unassigned"
export function applySavedLegs(rows = [], saved = []) {
  if (!saved.length) return autoLegs(rows);
  const ordered = [...saved].sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
  const left = [...rows];
  const legs = ordered.map((s) => {
    const mine = [];
    for (let i = left.length - 1; i >= 0; i--) {
      const d = day(left[i].date);
      if (d >= s.start_date && d <= s.end_date) mine.push(left.splice(i, 1)[0]);
    }
    return makeLeg(`saved-${s.id}`, mine, {
      id: s.id,
      startDate: s.start_date,
      endDate: s.end_date,
      startOdo: Number(s.start_odo) || 0,
      endOdo: Number(s.end_odo) || 0,
      source: "saved",
    });
  });
  if (left.length) legs.push(makeLeg("unassigned", left, { source: "unassigned" }));
  return legs;
}

// กติกาเดิมของ jobStats: ระยะ = กรอกเอง > (ไมล์จบ-เริ่ม) > ไมล์ต่ำสุด-สูงสุด; ฿/กม. ตัดบิลที่ชาร์จก่อนเริ่มวิ่งเมื่อไม่มีไมล์เริ่ม
export function legStats(leg, roundTripKm = 0) {
  const rows = leg.rows;
  // ไมล์จบไม่มากกว่าไมล์เริ่ม = กรอกผิด ไม่ใช้ทั้งคู่
  const validTrip = leg.startOdo > 0 && leg.endOdo > leg.startOdo;
  const startOdo = validTrip ? leg.startOdo : (leg.endOdo > 0 && leg.startOdo > 0 ? 0 : leg.startOdo);
  const endOdo = validTrip ? leg.endOdo : (leg.endOdo > 0 && leg.startOdo > 0 ? 0 : leg.endOdo);
  const odoRows = rows.filter((e) => e.odo > 0);
  const odos = odoRows.map((e) => e.odo);
  const pts = [...odos, ...(startOdo > 0 ? [startOdo] : []), ...(endOdo > 0 ? [endOdo] : [])];
  const kmAuto = validTrip ? endOdo - startOdo : pts.length >= 2 ? Math.max(...pts) - Math.min(...pts) : 0;
  const km = Math.max(0, roundTripKm > 0 ? roundTripKm : kmAuto);
  const tripOdo = startOdo > 0 || endOdo > 0;
  const kmSource = roundTripKm > 0 ? "manual" : kmAuto > 0 ? (tripOdo ? "trip" : "odo") : "none";

  const minOdo = odos.length ? Math.min(...odos) : 0;
  const firstBill = odoRows.find((e) => e.odo === minOdo);
  const allBills = kmSource === "manual" || kmSource === "none" || validTrip || (startOdo > 0 && startOdo <= minOdo);
  const used = allBills ? rows : rows.filter((e) => firstBill && e.date > firstBill.date);
  const usedAmount = used.reduce((a, e) => a + e.amount, 0);
  const usedKwh = used.reduce((a, e) => a + e.kwh, 0);
  const amount = rows.reduce((a, e) => a + e.amount, 0);
  const kwh = rows.reduce((a, e) => a + e.kwh, 0);
  return {
    km, kmSource, amount, kwh, count: rows.length, usedAmount, usedKwh,
    perKm: km > 0 ? usedAmount / km : 0,
    kwhPer100: km > 0 ? (usedKwh / km) * 100 : 0,
    perCharge: rows.length ? amount / rows.length : 0,
  };
}

// สรุปทั้งงาน: ยอดสะสม + รายเที่ยว + รายเดือน (ระยะของเที่ยวนับในเดือนของบิลแรกของเที่ยวนั้น)
export function jobRollup(legs = [], roundTripKm = 0) {
  const stats = legs.map((l) => ({ leg: l, ...legStats(l, legs.length === 1 ? roundTripKm : 0) }));
  const sum = (f) => stats.reduce((a, s) => a + f(s), 0);
  const km = sum((s) => s.km);
  // เที่ยวที่ไม่มีระยะทาง (km = 0) ไม่นำค่าชาร์จมาหารกับระยะของเที่ยวอื่น
  const usedAmount = stats.reduce((a, s) => a + (s.km > 0 ? s.usedAmount : 0), 0);
  const usedKwh = stats.reduce((a, s) => a + (s.km > 0 ? s.usedKwh : 0), 0);
  const total = {
    km,
    amount: sum((s) => s.amount),
    kwh: sum((s) => s.kwh),
    count: sum((s) => s.count),
    perKm: km > 0 ? usedAmount / km : 0,
    kwhPer100: km > 0 ? (usedKwh / km) * 100 : 0,
  };
  const m = new Map();
  const slot = (key) => {
    if (!m.has(key)) m.set(key, { key, amount: 0, kwh: 0, count: 0, km: 0 });
    return m.get(key);
  };
  stats.forEach((s) => {
    s.leg.rows.forEach((e) => {
      const r = slot(e.date.slice(0, 7));
      r.amount += e.amount; r.kwh += e.kwh; r.count += 1;
    });
    if (s.leg.rows.length) slot(s.leg.rows[0].date.slice(0, 7)).km += s.km;
  });
  const months = [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  return { legs: stats, total, months };
}

// ไมล์ออกเดินทาง/จบทริประดับงาน (ตาราง jobs) ใช้กับเที่ยวอัตโนมัติ "เที่ยวเดียว" ที่มีบิลตกอยู่ในช่วงไมล์นั้นมากที่สุด (เสมอกันเลือกเที่ยวแรก)
export function seedTripOdo(legs, startOdo, endOdo) {
  if (!(startOdo > 0 && endOdo > startOdo)) return legs;
  let best = -1, bestN = 0;
  legs.forEach((l, i) => {
    if (l.source !== "auto") return;
    const n = l.rows.filter((e) => e.odo >= startOdo && e.odo <= endOdo).length;
    if (n > bestN) { best = i; bestN = n; }
  });
  if (best < 0) return legs;
  return legs.map((l, i) => (i === best ? { ...l, startOdo, endOdo } : l));
}
