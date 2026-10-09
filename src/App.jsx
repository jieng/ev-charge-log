import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Plus, X, Home, Zap, Calendar, List, Camera, Loader2, Briefcase, User,
  Gauge, TrendingDown, TrendingUp, Trash2, Settings as SettingsIcon, Pencil,
  Download, CheckCircle2, Circle, ChevronRight, Printer, CheckSquare, Square,
} from "lucide-react";
import {
  getSession, onAuthChange, getOrCreateVehicle, listCharges, addCharge, deleteCharge,
  updateCharge, uploadReceipt, readReceiptOCR, listJobs, upsertJob, ensureJob, deleteJob,
} from "./lib/api";
import Login from "./components/Login";
import SettingsSheet from "./components/Settings";

const C = {
  accent: "#A98C67", accentSoft: "#EFE7DB", ink: "#3A322A",
  bg: "#F2F1EF", line: "#E5E2DE", muted: "#8A8279", green: "#5B8C6E", red: "#B4634F",
};

const PROVIDERS = [
  "EV Station PluZ", "PEA VOLTA", "EGAT EleXa", "MEA EV", "Spark EV",
  "iGreen+", "EVolt", "OneCharge", "Altervim", "Tesla",
  "Reversharger", "Shell Recharge", "Susco EV", "อื่นๆ / Other",
];

const THMONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const baht = (n) => "฿" + (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n, d = 2) => (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---------- เวลา: ระบบเก็บ "เวลาไทยตามนาฬิกา" ในรูป UTC (20:18 น. = 20:18Z) จึงอ่านจากข้อความตรงๆ ไม่แปลงโซนเวลา ---------- */
const thaiWallNow = () => new Date(Date.now() + 7 * 3600 * 1000);
const wallMs = (iso) => Date.parse(iso.slice(0, 19) + "Z");
const fmtTime = (iso) => iso.slice(11, 16);
const fmtShort = (iso) => {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${TH_SHORT[m - 1]}`;
};
const fmtLong = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${THMONTH[m - 1]} ${y + 543}`;
};

// รอบสรุป: startDay = วันเริ่มรอบ (1 = เดือนปกติ), offset 0 = รอบปัจจุบัน, -1 = รอบก่อน
function periodRange(startDay, offset = 0) {
  const ref = thaiWallNow();
  let m = ref.getUTCMonth() + offset;
  if (ref.getUTCDate() < startDay) m -= 1;
  const y = ref.getUTCFullYear();
  const start = new Date(Date.UTC(y, m, startDay));
  const end = new Date(Date.UTC(y, m + 1, startDay));
  const last = new Date(end.getTime() - 86400000);
  const s = start.getUTCMonth();
  const label = startDay === 1
    ? `${THMONTH[s]} ${start.getUTCFullYear() + 543}`
    : `${start.getUTCDate()} ${TH_SHORT[s]} – ${last.getUTCDate()} ${TH_SHORT[last.getUTCMonth()]} ${last.getUTCFullYear() + 543}`;
  const short = startDay === 1 ? TH_SHORT[s] : `${start.getUTCDate()} ${TH_SHORT[s]}`;
  return { start: start.getTime(), end: end.getTime(), label, short, year: start.getUTCFullYear() };
}
const inRange = (e, r) => {
  const t = wallMs(e.date);
  return t >= r.start && t < r.end;
};

/* ---------- ช่วงเวลา: สัปดาห์ (จันทร์–อาทิตย์) / ปี / สรุปยอด ---------- */
const DAY = 86400000;
const fmtMsDate = (ms, withYear = false) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${TH_SHORT[d.getUTCMonth()]}${withYear ? " " + (d.getUTCFullYear() + 543) : ""}`;
};
const dayFloor = (ms) => Math.floor(ms / DAY) * DAY;
const weekStartOf = (ms) => {
  const d = dayFloor(ms);
  return d - ((new Date(d).getUTCDay() + 6) % 7) * DAY;
};
function weekRange(offset = 0) {
  const start = weekStartOf(thaiWallNow().getTime()) + offset * 7 * DAY;
  const end = start + 7 * DAY;
  return { start, end, label: `${fmtMsDate(start)} – ${fmtMsDate(end - DAY, true)}`, short: fmtMsDate(start) };
}
function yearRange(y) {
  return { start: Date.UTC(y, 0, 1), end: Date.UTC(y + 1, 0, 1), label: `ปี ${y + 543}`, short: String(y + 543) };
}
function sumRows(rows) {
  const amount = rows.reduce((s, e) => s + e.amount, 0);
  const kwh = rows.reduce((s, e) => s + e.kwh, 0);
  return {
    count: rows.length, amount, kwh, avg: kwh ? amount / kwh : 0,
    home: rows.filter((e) => e.place === "home").reduce((s, e) => s + e.amount, 0),
    station: rows.filter((e) => e.place === "station").reduce((s, e) => s + e.amount, 0),
    personal: rows.filter((e) => e.category === "personal").reduce((s, e) => s + e.amount, 0),
    company: rows.filter((e) => e.category === "company").reduce((s, e) => s + e.amount, 0),
    pending: rows.filter((e) => e.category === "company" && !e.reimbursed).reduce((s, e) => s + e.amount, 0),
    paid: rows.filter((e) => e.category === "company" && e.reimbursed).reduce((s, e) => s + e.amount, 0),
  };
}
// จัดกลุ่มรายการตามช่วง (key ต่อรายการ) คืนเป็นอาร์เรย์เรียงตาม key
function groupRows(rows, keyOf, labelOf) {
  const m = new Map();
  rows.forEach((e) => {
    const k = keyOf(e);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  });
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, rs]) => ({ key: k, label: labelOf(k), ...sumRows(rs) }));
}
const weekLabelOf = (k) => `${fmtMsDate(k)} – ${fmtMsDate(k + 6 * DAY)}`;
const monthKeyOf = (e) => Date.UTC(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1, 1);
const monthLabelOf = (k) => { const d = new Date(k); return `${THMONTH[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`; };

function exportCsv(rows, label) {
  const head = ["วันที่", "เวลา", "ผู้ให้บริการ", "สถานี", "kWh", "ยอดเงิน (บาท)", "เลขที่ใบเสร็จ", "เลขงาน", "สถานะเบิก"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.map(esc).join(",")];
  rows.forEach((e) => {
    lines.push([
      e.date.slice(0, 10), fmtTime(e.date), e.provider, e.station, e.kwh, e.amount,
      e.receiptNo, e.job, e.reimbursed ? "เบิกแล้ว" : "รอเบิก",
    ].map(esc).join(","));
  });
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `company-${label.replace(/[^\wก-๙-]+/g, "_")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------- DB row <-> โมเดลหน้าจอ ---------- */
function fromRow(r) {
  return {
    id: r.id,
    place: r.place,
    provider: r.provider,
    station: r.station_name,
    conn: r.conn_type,
    kwh: Number(r.energy_kwh),
    amount: Number(r.amount),
    date: r.charged_at,
    odo: r.odometer || 0,
    category: r.category,
    note: r.note || "",
    receiptNo: r.receipt_no || "",
    job: r.project_code || "",
    reimbursed: !!r.reimbursed,
  };
}
function toRow(e, userId, vehicleId) {
  return {
    user_id: userId,
    vehicle_id: vehicleId,
    place: e.place,
    provider: e.provider,
    station_name: e.station,
    conn_type: e.conn,
    energy_kwh: e.kwh,
    amount: e.amount,
    charged_at: e.date,
    odometer: e.odo || null,
    category: e.category,
    note: e.note || null,
    receipt_no: e.receiptNo || null,
    project_code: e.job ? e.job.trim().toUpperCase() : null,
    reimbursed: e.category === "company" ? !!e.reimbursed : false,
    reimbursed_at: e.category === "company" && e.reimbursed ? thaiWallNow().toISOString().slice(0, 10) : null,
  };
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [vehicle, setVehicle] = useState(null);
  const [entries, setEntries] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("log");
  const [sheet, setSheet] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState(null);
  const [jobSheet, setJobSheet] = useState(null); // null | "new" | code
  const [loadErr, setLoadErr] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

  const loadData = useCallback(async (userId) => {
    setLoading(true); setLoadErr("");
    try {
      const [v, c, j] = await Promise.all([getOrCreateVehicle(userId), listCharges(userId), listJobs(userId)]);
      setVehicle(v);
      setEntries(c.map(fromRow));
      setJobs(j);
    } catch (e) {
      setLoadErr("โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้าใหม่");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) loadData(session.user.id);
  }, [session, loadData]);

  const startDay = vehicle?.period_start_day || 1;
  const period = useMemo(() => periodRange(startDay, periodOffset), [startDay, periodOffset]);
  const sorted = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)), [entries]);
  const periodRows = useMemo(() => sorted.filter((e) => inRange(e, period)), [sorted, period]);
  const visibleRows = showAll ? sorted : periodRows;

  const lifetime = useMemo(() => {
    const byOdo = entries.filter((e) => e.odo > 0).sort((a, b) => a.odo - b.odo);
    const totalKwh = entries.reduce((s, e) => s + e.kwh, 0);
    const totalAmt = entries.reduce((s, e) => s + e.amount, 0);
    const avgRate = totalKwh ? totalAmt / totalKwh : 0;
    let km = 0, kwhForKm = 0, amtForKm = 0;
    if (byOdo.length >= 2) {
      km = byOdo[byOdo.length - 1].odo - byOdo[0].odo;
      for (let i = 1; i < byOdo.length; i++) { kwhForKm += byOdo[i].kwh; amtForKm += byOdo[i].amount; }
    }
    return { totalKwh, totalAmt, avgRate, km, bahtPerKm: km ? amtForKm / km : 0, kwhPer100: km ? (kwhForKm / km) * 100 : 0 };
  }, [entries]);

  const summarize = (rows) => {
    const sum = (f) => rows.filter(f).reduce((s, e) => s + e.amount, 0);
    return {
      rows,
      total: sum(() => true),
      kwh: rows.reduce((s, e) => s + e.kwh, 0),
      home: sum((e) => e.place === "home"),
      station: sum((e) => e.place === "station"),
      personal: sum((e) => e.category === "personal"),
      company: sum((e) => e.category === "company"),
      companyPending: sum((e) => e.category === "company" && !e.reimbursed),
      companyPaid: sum((e) => e.category === "company" && e.reimbursed),
    };
  };
  const monthly = useMemo(() => summarize(periodRows), [periodRows]);

  const yearly = useMemo(() => {
    const rows = entries.filter((e) => e.date.startsWith(String(period.year)));
    return { total: rows.reduce((s, e) => s + e.amount, 0), kwh: rows.reduce((s, e) => s + e.kwh, 0), year: period.year };
  }, [entries, period.year]);

  const chart = useMemo(() => {
    const out = [];
    for (let k = -5; k <= 0; k++) {
      const r = periodRange(startDay, periodOffset + k);
      const s = summarize(entries.filter((e) => inRange(e, r)));
      out.push({ short: r.short, home: s.home, station: s.station, total: s.total, active: k === 0 });
    }
    return out;
  }, [entries, startDay, periodOffset]);

  const jobStats = useMemo(() => {
    const map = new Map();
    const get = (code) => {
      if (!map.has(code)) map.set(code, { code, title: "", roundTripKm: 0, count: 0, amount: 0, kwh: 0, odos: [] });
      return map.get(code);
    };
    jobs.forEach((j) => {
      const s = get(j.code);
      s.title = j.title || "";
      s.roundTripKm = Number(j.round_trip_km) || 0;
    });
    entries.forEach((e) => {
      if (!e.job) return;
      const s = get(e.job);
      s.count += 1; s.amount += e.amount; s.kwh += e.kwh;
      if (e.odo > 0) s.odos.push(e.odo);
    });
    return [...map.values()].map((s) => {
      const kmAuto = s.odos.length >= 2 ? Math.max(...s.odos) - Math.min(...s.odos) : 0;
      const km = s.roundTripKm > 0 ? s.roundTripKm : kmAuto;
      return { ...s, km, kmSource: s.roundTripKm > 0 ? "manual" : kmAuto > 0 ? "odo" : "none", perKm: km > 0 ? s.amount / km : 0 };
    }).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  }, [jobs, entries]);

  const shiftPeriod = (d) => setPeriodOffset((p) => Math.min(0, p + d));

  const touchJob = async (code) => {
    if (!code) return;
    const c = code.trim().toUpperCase();
    if (!c || jobs.some((j) => j.code === c)) return;
    try {
      await ensureJob(session.user.id, c);
      setJobs((p) => [{ user_id: session.user.id, code: c, title: null, round_trip_km: null }, ...p]);
    } catch (e) { /* ไม่กระทบการบันทึกรายการ */ }
  };

  const [toast, setToast] = useState("");
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const handleAdd = async (payload) => {
    const row = await addCharge(toRow(payload, session.user.id, vehicle.id));
    setEntries((p) => [fromRow(row), ...p]);
    touchJob(payload.job);
    setSheet(false);
    showToast(`✅ บันทึกแล้ว ${baht(row.amount)}`);
  };

  const handleDelete = async (id) => {
    await deleteCharge(id);
    setEntries((p) => p.filter((e) => e.id !== id));
    setDetail(null);
  };

  const handleUpdate = async (id, payload) => {
    const row = await updateCharge(id, toRow(payload, session.user.id, vehicle.id));
    const updated = fromRow(row);
    setEntries((p) => p.map((e) => (e.id === id ? updated : e)));
    setDetail(updated);
    touchJob(payload.job);
  };

  const handleToggleReimburse = async (e) => {
    const next = !e.reimbursed;
    const row = await updateCharge(e.id, {
      reimbursed: next,
      reimbursed_at: next ? thaiWallNow().toISOString().slice(0, 10) : null,
    });
    const updated = fromRow(row);
    setEntries((p) => p.map((x) => (x.id === e.id ? updated : x)));
    setDetail((d) => (d && d.id === e.id ? updated : d));
  };

  const handleSaveJob = async ({ code, title, round_trip_km }) => {
    const row = await upsertJob({ user_id: session.user.id, code, title: title || null, round_trip_km });
    setJobs((p) => [row, ...p.filter((j) => j.code !== row.code)]);
  };

  const handleDeleteJob = async (code) => {
    await deleteJob(session.user.id, code);
    setJobs((p) => p.filter((j) => j.code !== code));
  };

  if (session === undefined || (session && loading && !vehicle)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <Loader2 size={28} className="animate-spin" color={C.accent} />
      </div>
    );
  }
  if (!session) return <Login />;

  const activeJobStat = jobSheet && jobSheet !== "new" ? jobStats.find((s) => s.code === jobSheet) : null;

  return (
    <div className="min-h-screen w-full pb-32" style={{ background: C.bg, color: C.ink }}>
      <datalist id="jobs-list">
        {jobStats.map((s) => <option key={s.code} value={s.code}>{s.title}</option>)}
      </datalist>

      <div className="max-w-md mx-auto px-5 pt-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">บันทึกค่าไฟ</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>{vehicle?.name} · แบต {vehicle?.battery_kwh} kWh</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSettingsOpen(true)} className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm active:scale-95 transition bg-white" style={{ border: `1px solid ${C.line}` }} aria-label="ตั้งค่า">
              <SettingsIcon size={20} color={C.ink} />
            </button>
            <button onClick={() => setSheet(true)} className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm active:scale-95 transition" style={{ background: C.ink }} aria-label="เพิ่มรายการ">
              <Plus size={22} color="#fff" />
            </button>
          </div>
        </header>

        {loadErr && <p className="text-sm mb-4 p-3 rounded-2xl" style={{ background: "#F7ECE9", color: C.red }}>{loadErr}</p>}

        {tab === "log" && (
          <>
            <SummaryCard monthly={monthly} yearly={yearly} period={period} shiftPeriod={shiftPeriod} canNext={periodOffset < 0} />
            <div className="flex items-center justify-between mt-7 mb-3">
              <h2 className="text-sm font-semibold" style={{ color: C.muted }}>
                {showAll ? `ทุกรายการ · ${sorted.length} ครั้ง` : `รอบนี้ · ${periodRows.length} ครั้ง`}
              </h2>
              <button onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold" style={{ color: C.accent }}>
                {showAll ? "แสดงเฉพาะรอบนี้" : "แสดงทั้งหมด"}
              </button>
            </div>
            {sorted.length === 0 && <EmptyState onAdd={() => setSheet(true)} />}
            {sorted.length > 0 && visibleRows.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: C.muted }}>ยังไม่มีรายการในรอบนี้</p>
            )}
            <div className="space-y-3">
              {visibleRows.map((e) => (
                <EntryCard key={e.id} e={e} avgRate={lifetime.avgRate} onClick={() => setDetail(e)} />
              ))}
            </div>
          </>
        )}

        {tab === "stats" && (
          <StatsTab
            chart={chart} lifetime={lifetime} entries={entries} vehicle={vehicle}
            monthly={monthly} period={period} startDay={startDay}
            onReport={() => setReportOpen(true)}
            onToggleReimburse={handleToggleReimburse}
            onExport={() => exportCsv(periodRows.filter((e) => e.category === "company"), period.label)}
            onOpen={setDetail}
          />
        )}

        {tab === "jobs" && (
          <JobsTab stats={jobStats} onOpen={setJobSheet} onNew={() => setJobSheet("new")} />
        )}
      </div>

      <NavBar tab={tab} setTab={setTab} />
      {toast && (
        <div className="fixed left-0 right-0 flex justify-center z-[60]" style={{ bottom: 100 }}>
          <div className="px-5 py-3 rounded-2xl text-white text-sm font-semibold shadow-lg" style={{ background: C.ink }}>
            {toast}
          </div>
        </div>
      )}

      {sheet && vehicle && (
        <AddSheet onClose={() => setSheet(false)} onSave={handleAdd} avgRate={lifetime.avgRate} vehicle={vehicle} userId={session.user.id} />
      )}
      {detail && (
        <DetailSheet
          e={detail}
          avgRate={lifetime.avgRate}
          onClose={() => setDetail(null)}
          onDelete={handleDelete}
          onSaveEdit={handleUpdate}
          onToggleReimburse={handleToggleReimburse}
        />
      )}
      {jobSheet && (
        <JobSheet
          key={jobSheet}
          isNew={jobSheet === "new"}
          stat={activeJobStat}
          entries={entries}
          onClose={() => setJobSheet(null)}
          onSave={handleSaveJob}
          onDelete={handleDeleteJob}
        />
      )}
      {reportOpen && (
        <ReportSheet
          entries={entries} jobStats={jobStats} startDay={startDay} vehicle={vehicle}
          onClose={() => setReportOpen(false)}
        />
      )}
      {settingsOpen && vehicle && (
        <SettingsSheet
          vehicle={vehicle}
          userEmail={session.user.email}
          userId={session.user.id}
          onClose={() => setSettingsOpen(false)}
          onSaved={(v) => { setVehicle(v); setPeriodOffset(0); setSettingsOpen(false); }}
        />
      )}
    </div>
  );
}

/* ---------------- Summary ---------------- */
function SummaryCard({ monthly, yearly, period, shiftPeriod, canNext }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => shiftPeriod(-1)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.accentSoft }}>‹</button>
        <span className="font-semibold text-center text-sm">{period.label}</span>
        <button onClick={() => shiftPeriod(1)} disabled={!canNext} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.accentSoft, opacity: canNext ? 1 : 0.35 }}>›</button>
      </div>
      <div className="text-center mb-5">
        <p className="text-xs mb-1" style={{ color: C.muted }}>ค่าไฟรอบนี้</p>
        <p className="text-5xl font-bold tracking-tight">{baht(monthly.total)}</p>
        <p className="text-sm mt-2" style={{ color: C.muted }}>{num(monthly.kwh, 1)} kWh</p>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Pill icon={<Home size={14} />} label="บ้าน" value={baht(monthly.home)} />
        <Pill icon={<Zap size={14} />} label="สถานี" value={baht(monthly.station)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Pill icon={<User size={14} />} label="ส่วนตัว" value={baht(monthly.personal)} />
        <Pill icon={<Briefcase size={14} />} label="บริษัท" value={baht(monthly.company)} highlight />
      </div>
      {monthly.companyPending > 0 && (
        <p className="text-xs mt-3 text-center" style={{ color: C.accent }}>รอเบิกบริษัท {baht(monthly.companyPending)}</p>
      )}
      <div className="mt-4 pt-4 text-xs flex justify-between" style={{ borderTop: `1px solid ${C.line}`, color: C.muted }}>
        <span>รวมปี {yearly.year + 543}</span>
        <span className="font-semibold" style={{ color: C.ink }}>{baht(yearly.total)} · {num(yearly.kwh, 0)} kWh</span>
      </div>
    </div>
  );
}

function Pill({ icon, label, value, highlight }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: highlight ? C.accentSoft : "#F7F6F4" }}>
      <div className="flex items-center gap-1.5 text-xs mb-0.5" style={{ color: C.muted }}>{icon}{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

/* ---------------- Entry card ---------------- */
function EntryCard({ e, avgRate, onClick }) {
  const rate = e.kwh ? e.amount / e.kwh : 0;
  const diff = avgRate ? ((rate - avgRate) / avgRate) * 100 : 0;
  const cheaper = diff < 0;
  return (
    <button onClick={onClick} className="w-full text-left rounded-3xl bg-white p-4 shadow-sm active:scale-[0.99] transition" style={{ border: `1px solid ${C.line}` }}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: e.place === "home" ? C.accentSoft : "#F0F0EE" }}>
          {e.place === "home" ? <Home size={18} color={C.accent} /> : <Zap size={18} color={C.ink} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{e.place === "home" ? "ชาร์จที่บ้าน" : e.provider}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0" style={{ background: e.conn === "DC" ? C.ink : "#EDEBE8", color: e.conn === "DC" ? "#fff" : C.muted }}>{e.conn}</span>
            {e.category === "company" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0" style={{ background: e.reimbursed ? "#EDF3EF" : C.accentSoft, color: e.reimbursed ? C.green : C.accent }}>
                {e.reimbursed ? "บริษัท · เบิกแล้ว" : "บริษัท · รอเบิก"}
              </span>
            )}
            {e.job && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0" style={{ background: "#EDEBE8", color: C.ink }}>งาน {e.job}</span>
            )}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: C.muted }}>
            {e.station} · {fmtShort(e.date)} {fmtTime(e.date)} น.
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
            <span>{num(e.kwh, 1)} kWh</span>
            <span style={{ color: C.line }}>|</span>
            <span>{num(rate)} ฿/kWh</span>
            {avgRate > 0 && (
              <span className="flex items-center gap-0.5 font-medium" style={{ color: cheaper ? C.green : C.red }}>
                {cheaper ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                {Math.abs(diff).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-lg">{baht(e.amount)}</p>
        </div>
      </div>
    </button>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="rounded-3xl bg-white p-8 text-center" style={{ border: `1px dashed ${C.line}` }}>
      <p className="font-semibold mb-1">ยังไม่มีรายการ</p>
      <p className="text-sm mb-4" style={{ color: C.muted }}>ถ่ายรูปใบเสร็จหรือกรอกเองเพื่อเริ่มบันทึก</p>
      <button onClick={onAdd} className="px-5 py-2.5 rounded-2xl text-white text-sm font-semibold" style={{ background: C.accent }}>เพิ่มรายการแรก</button>
    </div>
  );
}

/* ---------------- Stats tab ---------------- */
function StatsTab({ chart, lifetime, entries, vehicle, monthly, period, startDay, onReport, onToggleReimburse, onExport, onOpen }) {
  return (
    <div className="space-y-4">
      <button onClick={onReport} className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.99] transition" style={{ background: C.ink }}>
        <Printer size={18} /> พิมพ์รายงานสรุป (เลือกหัวข้อได้)
      </button>

      <TrendCard data={chart} />

      <SpendCard entries={entries} startDay={startDay} />

      <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
        <h2 className="font-semibold mb-4">ค่าใช้งานเฉลี่ย</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="ค่าไฟเฉลี่ย" value={num(lifetime.avgRate)} unit="฿/kWh" big />
          <Stat label="ต้นทุนต่อระยะทาง" value={num(lifetime.bahtPerKm)} unit="฿/กม." big />
          <Stat label="อัตราสิ้นเปลือง" value={num(lifetime.kwhPer100, 1)} unit="kWh/100 กม." />
          <Stat label="ระยะทางสะสม" value={num(lifetime.km, 0)} unit="กม." />
        </div>
        {lifetime.km === 0 && (
          <p className="text-xs mt-4 p-3 rounded-2xl" style={{ background: C.accentSoft, color: C.accent }}>
            กรอกเลขไมล์อย่างน้อย 2 ครั้ง เพื่อคำนวณ ฿/กม. และ kWh/100 กม.
          </p>
        )}
      </div>

      <PriceCompare entries={entries} homeRate={Number(vehicle?.home_rate) || 0} />

      <PersonalCard monthly={monthly} period={period} onOpen={onOpen} />

      <CompanyCard monthly={monthly} period={period} onToggle={onToggleReimburse} onExport={onExport} onOpen={onOpen} />
    </div>
  );
}

/* ---------------- ยอดตามช่วงเวลา: สัปดาห์ / เดือน(รอบ) / ปี ---------------- */
function SpendCard({ entries, startDay }) {
  const [mode, setMode] = useState("week");
  const buckets = useMemo(() => {
    let ranges = [];
    if (mode === "week") for (let k = 0; k >= -7; k--) ranges.push(weekRange(k));
    else if (mode === "month") for (let k = 0; k >= -11; k--) ranges.push(periodRange(startDay, k));
    else {
      const ys = new Set(entries.map((e) => Number(e.date.slice(0, 4))));
      ys.add(thaiWallNow().getUTCFullYear());
      ranges = [...ys].sort((a, b) => b - a).map(yearRange);
    }
    return ranges.map((r) => ({ label: r.label, ...sumRows(entries.filter((e) => inRange(e, r))) }));
  }, [entries, startDay, mode]);
  const max = Math.max(1, ...buckets.map((b) => b.amount));
  const tabs = [["week", "รายสัปดาห์"], ["month", "รายเดือน"], ["year", "รายปี"]];
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
      <h2 className="font-semibold mb-3">ค่าใช้จ่ายตามช่วงเวลา</h2>
      <div className="flex gap-1 p-1 rounded-2xl mb-4" style={{ background: "#EDEBE8" }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className="flex-1 py-2 rounded-xl text-sm font-semibold transition" style={{ background: mode === k ? "#fff" : "transparent", color: mode === k ? C.ink : C.muted }}>{l}</button>
        ))}
      </div>
      <div className="space-y-3">
        {buckets.map((b, i) => (
          <div key={i}>
            <div className="flex items-baseline justify-between text-sm">
              <span style={{ fontWeight: i === 0 ? 700 : 500 }}>{b.label}{i === 0 ? " (ล่าสุด)" : ""}</span>
              <span className="font-bold">{baht(b.amount)}</span>
            </div>
            <div className="h-2 rounded-full mt-1" style={{ background: "#EDEBE8" }}>
              <div className="h-2 rounded-full" style={{ width: `${(b.amount / max) * 100}%`, background: i === 0 ? C.accent : "#CDBFA9" }} />
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: C.muted }}>{b.count} ครั้ง · {num(b.kwh)} kWh{b.avg ? ` · เฉลี่ย ${num(b.avg)} ฿/kWh` : ""}</p>
          </div>
        ))}
      </div>
      {mode === "week" && <p className="text-[11px] mt-3" style={{ color: C.muted }}>สัปดาห์นับจันทร์–อาทิตย์</p>}
    </div>
  );
}

/* ---------------- รายงานพิมพ์ (ติ๊กเลือกหัวข้อ) ---------------- */
const REPORT_SECTIONS = [
  ["summary", "สรุปยอดรวม (บ้าน/สถานี, ส่วนตัว/บริษัท)"],
  ["byWeek", "แยกรายสัปดาห์"],
  ["byMonth", "แยกรายเดือน"],
  ["byYear", "แยกรายปี"],
  ["jobs", "ระยะทางและค่าใช้จ่ายแต่ละงาน (Job)"],
  ["company", "รายการเบิกบริษัท (สถานะเบิก)"],
  ["items", "รายการชาร์จทั้งหมด (ละเอียด)"],
];

function ReportBody({ title, range, rows, opts, jobStats, vehicle }) {
  const total = sumRows(rows);
  const asc = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const jobCodes = new Set(rows.map((e) => e.job).filter(Boolean));
  const jobList = jobStats.filter((s) => jobCodes.has(s.code));
  const th = "text-left py-1 pr-2 font-semibold";
  const td = "py-1 pr-2 align-top";
  const R = "text-right";
  const H = ({ children }) => <h3 className="font-bold mt-5 mb-1.5 text-[15px]">{children}</h3>;
  const GroupTable = ({ data }) => (
    <table className="w-full text-[12px]">
      <thead><tr style={{ borderBottom: "1px solid #999" }}><th className={th}>ช่วง</th><th className={`${th} ${R}`}>ครั้ง</th><th className={`${th} ${R}`}>kWh</th><th className={`${th} ${R}`}>บาท</th></tr></thead>
      <tbody>
        {data.map((g) => (
          <tr key={g.key} style={{ borderBottom: "1px solid #e5e5e5" }}><td className={td}>{g.label}</td><td className={`${td} ${R}`}>{g.count}</td><td className={`${td} ${R}`}>{num(g.kwh)}</td><td className={`${td} ${R}`}>{num(g.amount)}</td></tr>
        ))}
      </tbody>
    </table>
  );
  const nowStr = fmtMsDate(thaiWallNow().getTime(), true);
  return (
    <div style={{ color: "#222", fontSize: 13, lineHeight: 1.45 }}>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-[12px]" style={{ color: "#666" }}>
        ช่วง: {range.label} · รถ: {vehicle?.name} · ออกรายงาน {nowStr}
      </p>

      {opts.summary && (
        <>
          <H>สรุปยอดรวม</H>
          <table className="w-full text-[12px]"><tbody>
            {[
              ["ค่าไฟรวม", `${baht(total.amount)} (${total.count} ครั้ง)`],
              ["พลังงานรวม", `${num(total.kwh)} kWh · เฉลี่ย ${num(total.avg)} ฿/kWh`],
              ["ชาร์จที่บ้าน", baht(total.home)],
              ["ชาร์จที่สถานี", baht(total.station)],
              ["ส่วนตัว", baht(total.personal)],
              ["บริษัท", `${baht(total.company)} (เบิกแล้ว ${baht(total.paid)} · รอเบิก ${baht(total.pending)})`],
            ].map(([k, v]) => (
              <tr key={k} style={{ borderBottom: "1px solid #e5e5e5" }}><td className={td} style={{ width: "34%" }}>{k}</td><td className={`${td} ${R} font-semibold`}>{v}</td></tr>
            ))}
          </tbody></table>
        </>
      )}

      {opts.byWeek && <><H>แยกรายสัปดาห์ (จันทร์–อาทิตย์)</H><GroupTable data={groupRows(rows, (e) => weekStartOf(wallMs(e.date)), weekLabelOf)} /></>}
      {opts.byMonth && <><H>แยกรายเดือน</H><GroupTable data={groupRows(rows, monthKeyOf, monthLabelOf)} /></>}
      {opts.byYear && <><H>แยกรายปี</H><GroupTable data={groupRows(rows, (e) => Date.UTC(Number(e.date.slice(0, 4)), 0, 1), (k) => `ปี ${new Date(k).getUTCFullYear() + 543}`)} /></>}

      {opts.jobs && (
        <>
          <H>ระยะทางและค่าใช้จ่ายแต่ละงาน</H>
          {jobList.length === 0 ? <p className="text-[12px]" style={{ color: "#666" }}>ไม่มีรายการที่ระบุเลขงานในช่วงนี้</p> : (
            <>
              <table className="w-full text-[12px]">
                <thead><tr style={{ borderBottom: "1px solid #999" }}><th className={th}>งาน</th><th className={`${th} ${R}`}>ครั้ง</th><th className={`${th} ${R}`}>ค่าไฟ (บาท)</th><th className={`${th} ${R}`}>กม.</th><th className={`${th} ${R}`}>฿/กม.</th></tr></thead>
                <tbody>
                  {jobList.map((s) => (
                    <tr key={s.code} style={{ borderBottom: "1px solid #e5e5e5" }}>
                      <td className={td}><b>{s.code}</b>{s.title ? ` · ${s.title}` : ""}</td>
                      <td className={`${td} ${R}`}>{s.count}</td>
                      <td className={`${td} ${R}`}>{num(s.amount)}</td>
                      <td className={`${td} ${R}`}>{s.km ? `${num(s.km, 0)}${s.kmSource === "manual" ? "" : "*"}` : "-"}</td>
                      <td className={`${td} ${R}`}>{s.perKm ? num(s.perKm) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] mt-1" style={{ color: "#666" }}>ยอดของแต่ละงานเป็นยอดรวมทั้งงาน · กม. จากระยะไป-กลับที่กรอก, * = คำนวณจากเลขไมล์สูงสุด−ต่ำสุดของงานนั้น</p>
            </>
          )}
        </>
      )}

      {opts.company && (
        <>
          <H>รายการเบิกบริษัท</H>
          {asc.filter((e) => e.category === "company").length === 0 ? <p className="text-[12px]" style={{ color: "#666" }}>ไม่มีรายการบริษัทในช่วงนี้</p> : (
            <table className="w-full text-[12px]">
              <thead><tr style={{ borderBottom: "1px solid #999" }}><th className={th}>วันที่</th><th className={th}>สถานี / เลขที่ใบเสร็จ</th><th className={th}>งาน</th><th className={`${th} ${R}`}>บาท</th><th className={`${th} ${R}`}>สถานะ</th></tr></thead>
              <tbody>
                {asc.filter((e) => e.category === "company").map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                    <td className={td}>{fmtShort(e.date)}</td>
                    <td className={td}>{e.station || e.provider}{e.receiptNo ? ` · ${e.receiptNo}` : ""}</td>
                    <td className={td}>{e.job || "-"}</td>
                    <td className={`${td} ${R}`}>{num(e.amount)}</td>
                    <td className={`${td} ${R}`}>{e.reimbursed ? "เบิกแล้ว" : "รอเบิก"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {opts.items && (
        <>
          <H>รายการชาร์จทั้งหมด</H>
          <table className="w-full text-[11px]">
            <thead><tr style={{ borderBottom: "1px solid #999" }}><th className={th}>วันที่</th><th className={th}>สถานที่</th><th className={th}>ประเภท</th><th className={`${th} ${R}`}>kWh</th><th className={`${th} ${R}`}>บาท</th><th className={th}>งาน</th></tr></thead>
            <tbody>
              {asc.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                  <td className={td}>{fmtShort(e.date)} {fmtTime(e.date)}</td>
                  <td className={td}>{e.place === "home" ? "บ้าน" : e.station || e.provider || "สถานี"}</td>
                  <td className={td}>{e.category === "company" ? "บริษัท" : "ส่วนตัว"}</td>
                  <td className={`${td} ${R}`}>{num(e.kwh)}</td>
                  <td className={`${td} ${R}`}>{num(e.amount)}</td>
                  <td className={td}>{e.job || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ReportSheet({ entries, jobStats, startDay, vehicle, onClose }) {
  const years = useMemo(() => {
    const ys = new Set(entries.map((e) => Number(e.date.slice(0, 4))));
    ys.add(thaiWallNow().getUTCFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [entries]);
  const [rangeKey, setRangeKey] = useState("period0");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [opts, setOpts] = useState({ summary: true, byWeek: false, byMonth: false, byYear: false, jobs: true, company: false, items: true });

  const range = useMemo(() => {
    if (rangeKey === "period0") return periodRange(startDay, 0);
    if (rangeKey === "period1") return periodRange(startDay, -1);
    if (rangeKey === "week0") return weekRange(0);
    if (rangeKey === "week1") return weekRange(-1);
    if (rangeKey === "all") return { start: -Infinity, end: Infinity, label: "ทั้งหมด" };
    if (rangeKey === "custom") {
      const s = from ? Date.parse(from + "T00:00:00Z") : -Infinity;
      const e = to ? Date.parse(to + "T00:00:00Z") + DAY : Infinity;
      return { start: s, end: e, label: `${from ? fmtMsDate(s, true) : "เริ่มต้น"} – ${to ? fmtMsDate(e - DAY, true) : "ปัจจุบัน"}` };
    }
    return yearRange(Number(rangeKey.slice(4)));
  }, [rangeKey, from, to, startDay]);

  const rows = useMemo(() => entries.filter((e) => inRange(e, range)), [entries, range]);
  const toggle = (k) => setOpts((p) => ({ ...p, [k]: !p[k] }));
  const anyOn = Object.values(opts).some(Boolean);
  const body = <ReportBody title="รายงานสรุปค่าไฟ EV" range={range} rows={rows} opts={opts} jobStats={jobStats} vehicle={vehicle} />;
  const inputCls = "w-full px-3 py-3 rounded-2xl bg-white outline-none text-base";

  return (
    <>
      <style>{`
        #print-root{display:none}
        @media print{
          #root{display:none !important}
          #print-root{display:block !important;padding:0;background:#fff}
          @page{size:A4;margin:14mm}
          body{background:#fff !important}
        }
      `}</style>
      {createPortal(<div id="print-root">{body}</div>, document.body)}
      <Sheet title="พิมพ์รายงาน" onClose={onClose}>
        <Field label="ช่วงเวลา">
          <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} className={inputCls}>
            <option value="period0">รอบปัจจุบัน ({periodRange(startDay, 0).label})</option>
            <option value="period1">รอบก่อน ({periodRange(startDay, -1).label})</option>
            <option value="week0">สัปดาห์นี้</option>
            <option value="week1">สัปดาห์ก่อน</option>
            {years.map((y) => <option key={y} value={`year${y}`}>ทั้งปี {y + 543}</option>)}
            <option value="all">ทั้งหมด</option>
            <option value="custom">กำหนดเอง…</option>
          </select>
        </Field>
        {rangeKey === "custom" && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
        )}

        <p className="text-sm font-medium mb-2 mt-2">เลือกหัวข้อที่จะพิมพ์</p>
        <div className="rounded-3xl bg-white p-2 mb-4" style={{ border: `1px solid ${C.line}` }}>
          {REPORT_SECTIONS.map(([k, label]) => (
            <button key={k} onClick={() => toggle(k)} className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm rounded-2xl active:bg-stone-100">
              {opts[k] ? <CheckSquare size={22} color={C.accent} /> : <Square size={22} color={C.muted} />}
              <span style={{ fontWeight: opts[k] ? 600 : 400 }}>{label}</span>
            </button>
          ))}
        </div>

        <p className="text-xs mb-3" style={{ color: C.muted }}>{range.label} · {rows.length} รายการ · {baht(sumRows(rows).amount)}</p>
        <button onClick={() => window.print()} disabled={!anyOn || rows.length === 0} className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2" style={{ background: C.accent, opacity: !anyOn || rows.length === 0 ? 0.4 : 1 }}>
          <Printer size={18} /> พิมพ์ / บันทึกเป็น PDF
        </button>
        <p className="text-[11px] mt-2 text-center" style={{ color: C.muted }}>ในหน้าต่างพิมพ์ เลือก "บันทึกเป็น PDF" เพื่อเก็บหรือส่งต่อได้</p>

        <p className="text-sm font-medium mt-6 mb-2">ตัวอย่างรายงาน</p>
        <div className="rounded-2xl bg-white p-4 overflow-x-auto" style={{ border: `1px solid ${C.line}` }}>{body}</div>
      </Sheet>
    </>
  );
}

function TrendCard({ data }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const compact = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(Math.round(n)));
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">ค่าไฟย้อนหลัง 6 รอบ</h2>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: C.muted }}>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: C.accent }} />บ้าน</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: C.ink }} />สถานี</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2" style={{ height: 150 }}>
        {data.map((d, i) => {
          const h = (d.total / max) * 110;
          const hHome = d.total ? (d.home / d.total) * h : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-[10px] mb-1" style={{ color: d.active ? C.ink : C.muted, fontWeight: d.active ? 700 : 400 }}>{d.total ? compact(d.total) : ""}</span>
              <div className="w-full rounded-lg overflow-hidden flex flex-col justify-end" style={{ height: Math.max(h, d.total ? 4 : 2), background: d.total ? "transparent" : "#EDEBE8", opacity: d.active ? 1 : 0.7 }}>
                <div style={{ height: h - hHome, background: C.ink }} />
                <div style={{ height: hHome, background: C.accent }} />
              </div>
              <span className="text-[10px] mt-1.5 whitespace-nowrap" style={{ color: d.active ? C.ink : C.muted, fontWeight: d.active ? 700 : 400 }}>{d.short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriceCompare({ entries, homeRate }) {
  const [mode, setMode] = useState("provider");
  const rows = useMemo(() => {
    const map = new Map();
    entries.filter((e) => e.place === "station" && e.kwh > 0).forEach((e) => {
      const key = mode === "provider" ? e.provider : (e.station || e.provider);
      const v = map.get(key) || { amount: 0, kwh: 0, count: 0 };
      v.amount += e.amount; v.kwh += e.kwh; v.count += 1;
      map.set(key, v);
    });
    return [...map.entries()].map(([name, v]) => ({ name, count: v.count, rate: v.amount / v.kwh })).sort((a, b) => a.rate - b.rate);
  }, [entries, mode]);
  const max = Math.max(1, ...rows.map((r) => r.rate), homeRate);

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">เทียบราคาต่อ kWh</h2>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "#EDEBE8" }}>
          {[["provider", "ตามค่าย"], ["station", "ตามสถานี"]].map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)} className="px-3 py-1 rounded-lg text-xs font-semibold" style={{ background: mode === v ? "#fff" : "transparent", color: mode === v ? C.accent : C.muted }}>{l}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 && <p className="text-sm" style={{ color: C.muted }}>ยังไม่มีข้อมูลการชาร์จที่สถานี</p>}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.name}>
            <div className="flex justify-between text-sm mb-1 gap-2">
              <span className="truncate">
                {r.name}
                {i === 0 && rows.length > 1 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "#EDF3EF", color: C.green }}>ถูกสุด</span>}
              </span>
              <span className="font-semibold shrink-0">{num(r.rate)} <span className="font-normal text-xs" style={{ color: C.muted }}>฿/kWh · {r.count} ครั้ง</span></span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F0EEEB" }}>
              <div className="h-full rounded-full" style={{ width: `${(r.rate / max) * 100}%`, background: i === 0 ? C.green : C.accent }} />
            </div>
          </div>
        ))}
      </div>
      {homeRate > 0 && (
        <p className="text-xs mt-4 pt-3" style={{ borderTop: `1px solid ${C.line}`, color: C.muted }}>เทียบกับชาร์จที่บ้าน {num(homeRate)} ฿/kWh</p>
      )}
    </div>
  );
}

function PersonalCard({ monthly, period, onOpen }) {
  const rows = monthly.rows.filter((e) => e.category === "personal");
  const total = rows.reduce((s, e) => s + e.amount, 0);
  const kwh = rows.reduce((s, e) => s + e.kwh, 0);
  const home = rows.filter((e) => e.place === "home").reduce((s, e) => s + e.amount, 0);
  const station = rows.filter((e) => e.place === "station").reduce((s, e) => s + e.amount, 0);
  const avg = kwh ? total / kwh : 0;
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
      <div className="mb-3">
        <h2 className="font-semibold">สรุปส่วนตัว</h2>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{period.label}</p>
      </div>
      <div className="text-center mb-4">
        <p className="text-4xl font-bold tracking-tight">{baht(total)}</p>
        <p className="text-xs mt-1" style={{ color: C.muted }}>{rows.length} ครั้ง · {num(kwh, 1)} kWh{avg > 0 ? ` · เฉลี่ย ${num(avg)} ฿/kWh` : ""}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Pill icon={<Home size={14} />} label="ชาร์จที่บ้าน" value={baht(home)} />
        <Pill icon={<Zap size={14} />} label="ชาร์จที่สถานี" value={baht(station)} />
      </div>
      {rows.length === 0 && <p className="text-sm" style={{ color: C.muted }}>รอบนี้ยังไม่มีรายการส่วนตัว</p>}
      <div className="space-y-2">
        {rows.map((e) => (
          <button key={e.id} onClick={() => onOpen(e)} className="w-full flex items-center gap-3 py-2 text-left" style={{ borderBottom: `1px solid ${C.line}` }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{e.place === "home" ? "ชาร์จที่บ้าน" : (e.station || e.provider)}</p>
              <p className="text-xs" style={{ color: C.muted }}>{fmtShort(e.date)} · {num(e.kwh, 1)} kWh{e.job ? ` · งาน ${e.job}` : ""}</p>
            </div>
            <span className="text-sm font-semibold shrink-0">{baht(e.amount)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CompanyCard({ monthly, period, onToggle, onExport, onOpen }) {
  const rows = monthly.rows.filter((e) => e.category === "company");
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold">เบิกบริษัท</h2>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>{period.label}</p>
        </div>
        <button onClick={onExport} disabled={rows.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: C.accentSoft, color: C.accent, opacity: rows.length ? 1 : 0.4 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-2xl px-4 py-3" style={{ background: C.accentSoft }}>
          <p className="text-xs" style={{ color: C.accent }}>รอเบิก</p>
          <p className="font-bold">{baht(monthly.companyPending)}</p>
        </div>
        <div className="rounded-2xl px-4 py-3" style={{ background: "#EDF3EF" }}>
          <p className="text-xs" style={{ color: C.green }}>เบิกแล้ว</p>
          <p className="font-bold">{baht(monthly.companyPaid)}</p>
        </div>
      </div>
      {rows.length === 0 && <p className="text-sm" style={{ color: C.muted }}>รอบนี้ยังไม่มีรายการของบริษัท</p>}
      <div className="space-y-2">
        {rows.map((e) => (
          <div key={e.id} className="flex items-center gap-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
            <button onClick={() => onToggle(e)} aria-label="สลับสถานะเบิก" className="shrink-0">
              {e.reimbursed ? <CheckCircle2 size={22} color={C.green} /> : <Circle size={22} color={C.muted} />}
            </button>
            <button onClick={() => onOpen(e)} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{e.station || e.provider}</p>
              <p className="text-xs" style={{ color: C.muted }}>{fmtShort(e.date)}{e.job ? ` · งาน ${e.job}` : ""}{e.receiptNo ? ` · ${e.receiptNo}` : ""}</p>
            </button>
            <span className="text-sm font-semibold shrink-0">{baht(e.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, big }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "#F7F6F4" }}>
      <p className="text-xs mb-1" style={{ color: C.muted }}>{label}</p>
      <p className={big ? "text-2xl font-bold" : "text-xl font-bold"}>{value}</p>
      <p className="text-xs" style={{ color: C.muted }}>{unit}</p>
    </div>
  );
}

/* ---------------- Jobs ---------------- */
function JobsTab({ stats, onOpen, onNew }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">งาน (Job)</h2>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>ดูค่าชาร์จและระยะทางแยกตามเลขงาน</p>
        </div>
        <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-white text-sm font-semibold" style={{ background: C.ink }}>
          <Plus size={16} /> เพิ่มงาน
        </button>
      </div>
      {stats.length === 0 && (
        <div className="rounded-3xl bg-white p-8 text-center" style={{ border: `1px dashed ${C.line}` }}>
          <p className="font-semibold mb-1">ยังไม่มีงาน</p>
          <p className="text-sm" style={{ color: C.muted }}>ใส่เลขงานตอนบันทึกค่าชาร์จ หรือกด "เพิ่มงาน" ได้เลย</p>
        </div>
      )}
      <div className="space-y-3">
        {stats.map((s) => (
          <button key={s.code} onClick={() => onOpen(s.code)} className="w-full text-left rounded-3xl bg-white p-4 shadow-sm active:scale-[0.99] transition" style={{ border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">งาน {s.code}</p>
                {s.title && <p className="text-xs truncate" style={{ color: C.muted }}>{s.title}</p>}
              </div>
              <ChevronRight size={18} color={C.muted} className="shrink-0" />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="rounded-xl py-2" style={{ background: "#F7F6F4" }}>
                <p className="text-[10px]" style={{ color: C.muted }}>ค่าชาร์จ</p>
                <p className="text-sm font-bold">{baht(s.amount)}</p>
              </div>
              <div className="rounded-xl py-2" style={{ background: "#F7F6F4" }}>
                <p className="text-[10px]" style={{ color: C.muted }}>ระยะไป-กลับ</p>
                <p className="text-sm font-bold">{s.km > 0 ? `${num(s.km, 0)} กม.` : "-"}</p>
              </div>
              <div className="rounded-xl py-2" style={{ background: "#F7F6F4" }}>
                <p className="text-[10px]" style={{ color: C.muted }}>฿/กม.</p>
                <p className="text-sm font-bold">{s.perKm > 0 ? num(s.perKm) : "-"}</p>
              </div>
            </div>
            <p className="text-[11px] mt-2" style={{ color: C.muted }}>ชาร์จ {s.count} ครั้ง · {num(s.kwh, 1)} kWh</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function JobSheet({ isNew, stat, entries, onClose, onSave, onDelete }) {
  const [code, setCode] = useState(stat?.code || "");
  const [title, setTitle] = useState(stat?.title || "");
  const [km, setKm] = useState(stat?.roundTripKm ? String(stat.roundTripKm) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const rows = stat ? entries.filter((e) => e.job === stat.code).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];

  const save = async () => {
    const c = code.trim().toUpperCase();
    if (!c) { setErr("ใส่เลขงานก่อน"); return; }
    setBusy(true); setErr("");
    try {
      await onSave({ code: c, title: title.trim(), round_trip_km: parseFloat(km) > 0 ? parseFloat(km) : null });
      onClose();
    } catch (e) {
      setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try { await onDelete(stat.code); onClose(); } catch (e) { setErr("ลบไม่สำเร็จ"); setBusy(false); }
  };

  return (
    <Sheet title={isNew ? "เพิ่มงานใหม่" : `งาน ${stat?.code}`} onClose={onClose}>
      {stat && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Stat label="ค่าชาร์จรวม" value={baht(stat.amount)} unit={`${stat.count} ครั้ง · ${num(stat.kwh, 1)} kWh`} big />
          <Stat label="ต้นทุนต่อกิโล" value={stat.perKm > 0 ? num(stat.perKm) : "-"} unit={stat.km > 0 ? `฿/กม. (${stat.kmSource === "manual" ? "ระยะกรอกเอง" : "จากเลขไมล์"})` : "ใส่ระยะทางด้านล่าง"} big />
        </div>
      )}

      <Field label="เลขงาน">
        <input value={code} onChange={(e) => setCode(e.target.value)} readOnly={!isNew} placeholder="เช่น 1234" className={inputCls} style={!isNew ? { opacity: 0.6 } : undefined} />
      </Field>
      <Field label="ชื่อ/รายละเอียดงาน (ไม่บังคับ)">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ตรวจรีเลย์ ไซต์ระยอง" className={inputCls} />
      </Field>
      <Field label="ระยะทางไป-กลับ (กม.)">
        <input type="number" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="เช่น 240" className={inputCls} />
        <p className="text-xs mt-1.5" style={{ color: C.muted }}>ไม่ใส่ก็ได้ ถ้ามีเลขไมล์ในรายการชาร์จ ระบบคำนวณระยะให้เอง</p>
      </Field>

      {err && <p className="text-sm mb-3" style={{ color: C.red }}>{err}</p>}
      <button onClick={save} disabled={busy} className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2 mb-3" style={{ background: C.accent }}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : "บันทึกงาน"}
      </button>

      {rows.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold mb-2" style={{ color: C.muted }}>รายการชาร์จของงานนี้</p>
          {rows.map((e) => (
            <div key={e.id} className="flex justify-between py-2 text-sm" style={{ borderBottom: `1px solid ${C.line}` }}>
              <span className="truncate">{fmtShort(e.date)} · {e.station || e.provider}</span>
              <span className="font-semibold ml-3 shrink-0">{baht(e.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {stat && stat.count === 0 && (
        <button onClick={remove} disabled={busy} className="w-full mt-4 py-3 rounded-2xl font-semibold text-sm" style={{ background: "#F7ECE9", color: C.red }}>ลบงานนี้</button>
      )}
    </Sheet>
  );
}

/* ---------------- Add sheet ---------------- */
function AddSheet({ onClose, onSave, avgRate, vehicle, userId }) {
  const w = thaiWallNow().toISOString();
  const [f, setF] = useState({
    place: "station", provider: "EV Station PluZ", station: "", conn: "DC",
    kwh: "", amount: "",
    date: w.slice(0, 10), time: w.slice(11, 16),
    odo: "", category: "personal", note: "", receiptNo: "", job: "",
    socFrom: 20, socTo: 80,
  });
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [dateWarn, setDateWarn] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const fileRef = useRef(null);
  const savedRef = useRef(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const homeKwh = ((f.socTo - f.socFrom) / 100) * vehicle.battery_kwh;
  const homeAmount = homeKwh * vehicle.home_rate;
  const kwh = f.place === "home" ? homeKwh : parseFloat(f.kwh) || 0;
  const amount = f.place === "home" ? homeAmount : parseFloat(f.amount) || 0;
  const rate = kwh ? amount / kwh : 0;

  const pickFile = (file) => { setPendingFile(file); readReceipt(file); };

  const readReceipt = async (file) => {
    setBusy(true); setErr(""); setDateWarn(false);
    try {
      const j = await readReceiptOCR(file);
      if (!j.date) setDateWarn(true);
      setF((p) => ({
        ...p,
        place: "station",
        provider: PROVIDERS.includes(j.provider) ? j.provider : p.provider,
        station: j.station || p.station,
        conn: j.conn === "AC" || j.conn === "DC" ? j.conn : p.conn,
        kwh: j.kwh != null ? String(j.kwh) : p.kwh,
        amount: j.amount != null ? String(j.amount) : p.amount,
        date: j.date || p.date,
        time: j.time || p.time,
        receiptNo: j.receipt_no || p.receiptNo,
      }));
    } catch (e) {
      setErr("อ่านใบเสร็จไม่สำเร็จ ลองถ่ายให้ชัดขึ้นหรือกรอกเอง");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (savedRef.current) return; // กันกดซ้ำ/แตะซ้ำก่อนปุ่มจะ disable ทัน
    if (!amount || !kwh) { setErr("กรอกยอดเงินและหน่วยไฟก่อนบันทึก"); return; }
    savedRef.current = true;
    setSaving(true); setErr("");
    try {
      await onSave({
        place: f.place,
        provider: f.place === "home" ? "บ้าน" : f.provider,
        station: f.place === "home" ? "บ้าน" : (f.station || f.provider),
        conn: f.place === "home" ? "AC" : f.conn,
        kwh: +kwh.toFixed(2),
        amount: +amount.toFixed(2),
        date: `${f.date}T${f.time}:00`,
        odo: parseInt(f.odo) || 0,
        category: f.category,
        note: f.note,
        receiptNo: f.receiptNo,
        job: f.job,
        reimbursed: false,
      });
      if (pendingFile) uploadReceipt(userId, pendingFile);
    } catch (e) {
      savedRef.current = false;
      setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="บันทึกค่าไฟ" onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl mb-5" style={{ background: "#EDEBE8" }}>
        {[["station", "สถานี", <Zap size={16} key="z" />], ["home", "บ้าน", <Home size={16} key="h" />]].map(([v, l, ic]) => (
          <button key={v} onClick={() => set("place", v)} className="py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition" style={{ background: f.place === v ? "#fff" : "transparent", color: f.place === v ? C.accent : C.muted }}>
            {ic}{l}
          </button>
        ))}
      </div>

      {f.place === "station" && (
        <>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full mb-5 py-4 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm" style={{ background: C.accentSoft, color: C.accent }}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            {busy ? "กำลังอ่านใบเสร็จ..." : "ถ่ายรูป/เลือกรูปใบเสร็จ"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />

          <Field label="ผู้ให้บริการ">
            <select value={f.provider} onChange={(e) => set("provider", e.target.value)} className={inputCls}>
              {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="ชื่อสถานี / สาขา">
            <input value={f.station} onChange={(e) => set("station", e.target.value)} placeholder="เช่น PTT รัชดา" className={inputCls} />
          </Field>
          <Field label="ประเภทการชาร์จ">
            <div className="grid grid-cols-2 gap-2">
              {["DC", "AC"].map((v) => (
                <button key={v} onClick={() => set("conn", v)} className="py-3 rounded-2xl text-sm font-semibold" style={{ background: f.conn === v ? C.accent : "#fff", color: f.conn === v ? "#fff" : C.ink, border: `1px solid ${f.conn === v ? C.accent : C.line}` }}>
                  {v} <span className="font-normal text-xs">{v === "DC" ? "เร็ว" : "ทั่วไป"}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ยอดเงิน (฿)"><input type="number" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" className={inputCls} /></Field>
            <Field label="พลังงาน (kWh)"><input type="number" inputMode="decimal" value={f.kwh} onChange={(e) => set("kwh", e.target.value)} placeholder="0" className={inputCls} /></Field>
          </div>
        </>
      )}

      {f.place === "home" && (
        <>
          <div className="rounded-2xl p-4 mb-4 flex items-center justify-between" style={{ background: C.accentSoft }}>
            <div><p className="text-xs" style={{ color: C.accent }}>ค่าไฟโดยประมาณ</p><p className="text-2xl font-bold">{baht(homeAmount)}</p></div>
            <span className="px-3 py-1.5 rounded-xl bg-white text-sm font-semibold">{num(homeKwh)} kWh</span>
          </div>
          <Field label="ระดับแบตเตอรี่">
            <div className="rounded-2xl p-4 bg-white" style={{ border: `1px solid ${C.line}` }}>
              <div className="flex justify-between items-baseline mb-3">
                <div><p className="text-xs" style={{ color: C.muted }}>เริ่ม</p><p className="text-3xl font-bold" style={{ color: C.muted }}>{f.socFrom}%</p></div>
                <div className="text-right"><p className="text-xs" style={{ color: C.muted }}>จบ</p><p className="text-3xl font-bold" style={{ color: C.accent }}>{f.socTo}%</p></div>
              </div>
              <input type="range" min="0" max="100" value={f.socFrom} onChange={(e) => set("socFrom", Math.min(+e.target.value, f.socTo - 1))} className="w-full mb-2" />
              <input type="range" min="0" max="100" value={f.socTo} onChange={(e) => set("socTo", Math.max(+e.target.value, f.socFrom + 1))} className="w-full" />
            </div>
          </Field>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="วันที่"><input type="date" value={f.date} onChange={(e) => { set("date", e.target.value); setDateWarn(false); }} className={inputCls} /></Field>
        <Field label="เวลา"><input type="time" value={f.time} onChange={(e) => { set("time", e.target.value); setDateWarn(false); }} className={inputCls} /></Field>
      </div>
      {dateWarn && (
        <p className="text-xs mb-4 -mt-2 px-1" style={{ color: C.red }}>⚠️ AI อ่านวันที่ในใบเสร็จไม่ชัด ใช้วันนี้แทนไว้ก่อน กรุณาตรวจสอบและแก้ไขให้ตรงกับใบเสร็จจริง</p>
      )}

      <Field label="เลขงาน (Job)">
        <input list="jobs-list" value={f.job} onChange={(e) => set("job", e.target.value)} placeholder="เช่น 1234 (ไม่บังคับ)" className={inputCls} />
      </Field>

      <Field label="ใช้สำหรับ">
        <div className="grid grid-cols-2 gap-2">
          {[["personal", "ส่วนตัว", <User size={15} key="u" />], ["company", "บริษัท", <Briefcase size={15} key="b" />]].map(([v, l, ic]) => (
            <button key={v} onClick={() => set("category", v)} className="py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: f.category === v ? C.accent : "#fff", color: f.category === v ? "#fff" : C.ink, border: `1px solid ${f.category === v ? C.accent : C.line}` }}>
              {ic}{l}
            </button>
          ))}
        </div>
      </Field>

      {f.category === "company" && (
        <Field label="เลขที่ใบเสร็จ (สำหรับเบิก)">
          <input value={f.receiptNo} onChange={(e) => set("receiptNo", e.target.value)} placeholder="INV-..." className={inputCls} />
        </Field>
      )}

      <Field label={<span className="flex items-center gap-1"><Gauge size={14} /> เลขไมล์รถ <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: C.accentSoft, color: C.accent }}>ไม่บังคับ</span></span>}>
        <input type="number" inputMode="numeric" value={f.odo} onChange={(e) => set("odo", e.target.value)} placeholder="เช่น 22450" className={inputCls} />
      </Field>

      <Field label="รายละเอียด (ไม่บังคับ)">
        <textarea rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="เช่น ชาร์จระหว่างไปไซต์งาน" className={inputCls} />
      </Field>

      {rate > 0 && (
        <div className="rounded-2xl p-4 mb-4 text-sm" style={{ background: "#F7F6F4" }}>
          ครั้งนี้ <b>{num(rate)} ฿/kWh</b>
          {avgRate > 0 && (
            <span style={{ color: rate < avgRate ? C.green : C.red }}> · {rate < avgRate ? "ถูกกว่า" : "แพงกว่า"}ค่าเฉลี่ย {num(Math.abs(rate - avgRate))} ฿</span>
          )}
        </div>
      )}

      {err && <p className="text-sm mb-3" style={{ color: C.red }}>{err}</p>}

      <button onClick={save} disabled={saving || savedRef.current} className="w-full py-4 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-2" style={{ background: C.accent }}>
        {saving ? <Loader2 size={18} className="animate-spin" /> : "บันทึก"}
      </button>
    </Sheet>
  );
}

/* ---------------- Detail / Edit ---------------- */
function DetailSheet({ e, avgRate, onClose, onDelete, onSaveEdit, onToggleReimburse }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({
    place: e.place, provider: e.provider, station: e.station, conn: e.conn || "DC",
    kwh: String(e.kwh), amount: String(e.amount),
    odo: e.odo ? String(e.odo) : "", category: e.category, note: e.note || "",
    receiptNo: e.receiptNo || "", job: e.job || "",
    date: e.date.slice(0, 10), time: e.date.slice(11, 16),
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const rate = e.kwh ? e.amount / e.kwh : 0;

  const saveEdit = async () => {
    const kwh = parseFloat(f.kwh) || 0;
    const amount = parseFloat(f.amount) || 0;
    if (!kwh || !amount) { setErr("กรอกยอดเงินและหน่วยไฟก่อนบันทึก"); return; }
    setBusy(true); setErr("");
    try {
      await onSaveEdit(e.id, {
        place: f.place, provider: f.provider, station: f.station, conn: f.conn,
        kwh: +kwh.toFixed(2), amount: +amount.toFixed(2),
        date: `${f.date}T${f.time}:00`,
        odo: parseInt(f.odo) || 0, category: f.category, note: f.note,
        receiptNo: f.receiptNo, job: f.job, reimbursed: e.reimbursed,
      });
      setEditing(false);
    } catch (err2) {
      setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <Sheet title="แก้ไขรายการ" onClose={() => setEditing(false)}>
        {f.place === "station" && (
          <>
            <Field label="ผู้ให้บริการ">
              <select value={f.provider} onChange={(ev) => set("provider", ev.target.value)} className={inputCls}>
                {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="ชื่อสถานี / สาขา">
              <input value={f.station} onChange={(ev) => set("station", ev.target.value)} className={inputCls} />
            </Field>
            <Field label="ประเภทการชาร์จ">
              <div className="grid grid-cols-2 gap-2">
                {["DC", "AC"].map((v) => (
                  <button key={v} onClick={() => set("conn", v)} className="py-3 rounded-2xl text-sm font-semibold" style={{ background: f.conn === v ? C.accent : "#fff", color: f.conn === v ? "#fff" : C.ink, border: `1px solid ${f.conn === v ? C.accent : C.line}` }}>{v}</button>
                ))}
              </div>
            </Field>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="วันที่"><input type="date" value={f.date} onChange={(ev) => set("date", ev.target.value)} className={inputCls} /></Field>
          <Field label="เวลา"><input type="time" value={f.time} onChange={(ev) => set("time", ev.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ยอดเงิน (฿)"><input type="number" inputMode="decimal" value={f.amount} onChange={(ev) => set("amount", ev.target.value)} className={inputCls} /></Field>
          <Field label="พลังงาน (kWh)"><input type="number" inputMode="decimal" value={f.kwh} onChange={(ev) => set("kwh", ev.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="เลขงาน (Job)">
          <input list="jobs-list" value={f.job} onChange={(ev) => set("job", ev.target.value)} placeholder="ไม่บังคับ" className={inputCls} />
        </Field>
        <Field label="ใช้สำหรับ">
          <div className="grid grid-cols-2 gap-2">
            {[["personal", "ส่วนตัว", <User size={15} key="u" />], ["company", "บริษัท", <Briefcase size={15} key="b" />]].map(([v, l, ic]) => (
              <button key={v} onClick={() => set("category", v)} className="py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: f.category === v ? C.accent : "#fff", color: f.category === v ? "#fff" : C.ink, border: `1px solid ${f.category === v ? C.accent : C.line}` }}>
                {ic}{l}
              </button>
            ))}
          </div>
        </Field>
        {f.category === "company" && (
          <Field label="เลขที่ใบเสร็จ (สำหรับเบิก)">
            <input value={f.receiptNo} onChange={(ev) => set("receiptNo", ev.target.value)} className={inputCls} />
          </Field>
        )}
        <Field label={<span className="flex items-center gap-1"><Gauge size={14} /> เลขไมล์รถ</span>}>
          <input type="number" inputMode="numeric" value={f.odo} onChange={(ev) => set("odo", ev.target.value)} className={inputCls} />
        </Field>
        <Field label="รายละเอียด (ไม่บังคับ)">
          <textarea rows={2} value={f.note} onChange={(ev) => set("note", ev.target.value)} className={inputCls} />
        </Field>

        {err && <p className="text-sm mb-3" style={{ color: C.red }}>{err}</p>}
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="flex-1 py-3.5 rounded-2xl font-semibold" style={{ background: "#F0EEEB", color: C.ink }}>ยกเลิก</button>
          <button onClick={saveEdit} disabled={busy} className="flex-1 py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2" style={{ background: C.accent }}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : "บันทึกการแก้ไข"}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={e.place === "home" ? "ชาร์จที่บ้าน" : e.provider} onClose={onClose}>
      <p className="text-5xl font-bold mb-1">{baht(e.amount)}</p>
      <p className="text-sm mb-6" style={{ color: C.muted }}>{fmtLong(e.date)} · {fmtTime(e.date)} น.</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="พลังงาน" value={num(e.kwh, 1)} unit="kWh" />
        <Stat label="ราคาต่อหน่วย" value={num(rate)} unit="฿/kWh" />
      </div>
      {avgRate > 0 && (
        <div className="rounded-2xl p-4 mb-4 text-sm" style={{ background: rate < avgRate ? "#EDF3EF" : "#F7ECE9" }}>
          เทียบค่าเฉลี่ยของคุณ ({num(avgRate)} ฿/kWh) ครั้งนี้
          <b style={{ color: rate < avgRate ? C.green : C.red }}> {rate < avgRate ? "ประหยัดกว่า" : "แพงกว่า"} {num(Math.abs(rate - avgRate) * e.kwh)} บาท</b>
        </div>
      )}
      <div className="space-y-2 text-sm mb-5">
        <Row k="สถานี" v={e.station} />
        <Row k="ประเภท" v={e.conn} />
        <Row k="หมวด" v={e.category === "company" ? (e.reimbursed ? "บริษัท · เบิกแล้ว" : "บริษัท · รอเบิก") : "ส่วนตัว"} />
        {e.job && <Row k="เลขงาน" v={e.job} />}
        {e.receiptNo && <Row k="เลขที่ใบเสร็จ" v={e.receiptNo} />}
        {e.odo > 0 && <Row k="เลขไมล์" v={`${e.odo.toLocaleString()} กม.`} />}
        {e.note && <Row k="หมายเหตุ" v={e.note} />}
      </div>

      {e.category === "company" && (
        <button onClick={() => onToggleReimburse(e)} className="w-full mb-3 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2" style={{ background: e.reimbursed ? "#EDF3EF" : C.accentSoft, color: e.reimbursed ? C.green : C.accent }}>
          {e.reimbursed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          {e.reimbursed ? "เบิกแล้ว (แตะเพื่อยกเลิก)" : "ทำเครื่องหมายว่าเบิกแล้ว"}
        </button>
      )}

      <div className="flex gap-2">
        <button onClick={() => setEditing(true)} className="flex-1 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2" style={{ background: C.accentSoft, color: C.accent }}>
          <Pencil size={16} /> แก้ไข
        </button>
        <button onClick={async () => { setBusy(true); await onDelete(e.id); }} disabled={busy} className="flex-1 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2" style={{ background: "#F7ECE9", color: C.red }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} ลบ
        </button>
      </div>
    </Sheet>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span className="font-medium text-right ml-4">{v}</span>
    </div>
  );
}

/* ---------------- shared ---------------- */
const inputCls = "w-full px-4 py-3.5 rounded-2xl bg-white outline-none text-base";

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2" style={{ color: C.ink }}>{label}</label>
      {children}
    </div>
  );
}

function Sheet({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl max-h-[92vh] overflow-y-auto p-6 pb-10" style={{ background: C.bg }} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 sticky top-0 pt-1 pb-3" style={{ background: C.bg }}>
          <h2 className="text-2xl font-bold">{title}</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#E6E4E1" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NavBar({ tab, setTab }) {
  const items = [
    { k: "log", label: "บันทึก", icon: List },
    { k: "stats", label: "สรุป", icon: Calendar },
    { k: "jobs", label: "งาน", icon: Briefcase },
  ];
  return (
    <div className="fixed bottom-5 left-0 right-0 flex justify-center px-5">
      <div className="flex gap-1 p-2 rounded-full shadow-lg" style={{ background: C.ink }}>
        {items.map(({ k, label, icon: Icon }) => (
          <button key={k} onClick={() => setTab(k)} className="px-5 py-3 rounded-full flex items-center gap-2 text-sm font-medium transition" style={{ background: tab === k ? "rgba(255,255,255,.12)" : "transparent", color: tab === k ? "#fff" : "rgba(255,255,255,.55)" }}>
            <Icon size={18} />{label}
          </button>
        ))}
      </div>
    </div>
  );
}
