import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Plus, X, Home, Zap, Calendar, List, Camera, Loader2,
  Gauge, Briefcase, User, TrendingDown, TrendingUp, Trash2, Settings as SettingsIcon,
} from "lucide-react";
import {
  getSession, onAuthChange, getOrCreateVehicle,
  listCharges, addCharge, deleteCharge, uploadReceipt, readReceiptOCR,
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

const baht = (n) => "฿" + (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n, d = 2) => (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
const monthKey = (iso) => iso.slice(0, 7);
const THMONTH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = ยังไม่รู้, null = ไม่ได้ล็อกอิน
  const [vehicle, setVehicle] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("log");
  const [sheet, setSheet] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [detail, setDetail] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

  const loadData = useCallback(async (userId) => {
    setLoading(true); setLoadErr("");
    try {
      const [v, c] = await Promise.all([getOrCreateVehicle(userId), listCharges(userId)]);
      setVehicle(v);
      setEntries(c.map(fromRow));
    } catch (e) {
      setLoadErr("โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้าใหม่");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) loadData(session.user.id);
  }, [session, loadData]);

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)), [entries]);

  const lifetime = useMemo(() => {
    const byOdo = [...entries].filter((e) => e.odo > 0).sort((a, b) => a.odo - b.odo);
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

  const monthly = useMemo(() => {
    const rows = entries.filter((e) => monthKey(e.date) === month);
    const sum = (f) => rows.reduce((s, e) => s + f(e), 0);
    return {
      rows,
      total: sum((e) => e.amount),
      kwh: sum((e) => e.kwh),
      home: rows.filter((e) => e.place === "home").reduce((s, e) => s + e.amount, 0),
      station: rows.filter((e) => e.place === "station").reduce((s, e) => s + e.amount, 0),
      personal: rows.filter((e) => e.category === "personal").reduce((s, e) => s + e.amount, 0),
      company: rows.filter((e) => e.category === "company").reduce((s, e) => s + e.amount, 0),
      companyKwh: rows.filter((e) => e.category === "company").reduce((s, e) => s + e.kwh, 0),
    };
  }, [entries, month]);

  const yearly = useMemo(() => {
    const y = month.slice(0, 4);
    const rows = entries.filter((e) => e.date.startsWith(y));
    return {
      total: rows.reduce((s, e) => s + e.amount, 0),
      kwh: rows.reduce((s, e) => s + e.kwh, 0),
      year: y,
    };
  }, [entries, month]);

  const shiftMonth = (d) => {
    const [y, m] = month.split("-").map(Number);
    const dt = new Date(y, m - 1 + d, 1);
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleAdd = async (payload) => {
    const row = await addCharge(toRow(payload, session.user.id, vehicle.id));
    setEntries((p) => [fromRow(row), ...p]);
    setSheet(false);
  };

  const handleDelete = async (id) => {
    await deleteCharge(id);
    setEntries((p) => p.filter((e) => e.id !== id));
    setDetail(null);
  };

  if (session === undefined || (session && loading && !vehicle)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <Loader2 size={28} className="animate-spin" color={C.accent} />
      </div>
    );
  }
  if (!session) return <Login />;

  return (
    <div className="min-h-screen w-full pb-32" style={{ background: C.bg, color: C.ink }}>
      <div className="max-w-md mx-auto px-5 pt-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">บันทึกค่าไฟ</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              {vehicle?.name} · แบต {vehicle?.battery_kwh} kWh
            </p>
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
            <SummaryCard monthly={monthly} yearly={yearly} month={month} shiftMonth={shiftMonth} />
            <h2 className="text-sm font-semibold mt-7 mb-3" style={{ color: C.muted }}>
              ประวัติการชาร์จ · {monthly.rows.length} ครั้งในเดือนนี้
            </h2>
            {sorted.length === 0 && <EmptyState onAdd={() => setSheet(true)} />}
            <div className="space-y-3">
              {sorted.map((e) => (
                <EntryCard key={e.id} e={e} avgRate={lifetime.avgRate} onClick={() => setDetail(e)} />
              ))}
            </div>
          </>
        )}

        {tab === "stats" && <Stats lifetime={lifetime} monthly={monthly} entries={entries} />}
      </div>

      <NavBar tab={tab} setTab={setTab} />

      {sheet && vehicle && (
        <AddSheet onClose={() => setSheet(false)} onSave={handleAdd} avgRate={lifetime.avgRate} vehicle={vehicle} userId={session.user.id} />
      )}
      {detail && <DetailSheet e={detail} avgRate={lifetime.avgRate} onClose={() => setDetail(null)} onDelete={handleDelete} />}
      {settingsOpen && vehicle && (
        <SettingsSheet
          vehicle={vehicle}
          userEmail={session.user.email}
          onClose={() => setSettingsOpen(false)}
          onSaved={(v) => { setVehicle(v); setSettingsOpen(false); }}
        />
      )}
    </div>
  );
}

/* ---------------- แปลงข้อมูลระหว่าง DB row <-> โมเดลในหน้าจอ ---------------- */
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
  };
}

/* ---------------- Summary ---------------- */
function SummaryCard({ monthly, yearly, month, shiftMonth }) {
  const [y, m] = month.split("-").map(Number);
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => shiftMonth(-1)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.accentSoft }}>‹</button>
        <span className="font-semibold">{THMONTH[m - 1]} {y + 543}</span>
        <button onClick={() => shiftMonth(1)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.accentSoft }}>›</button>
      </div>
      <div className="text-center mb-5">
        <p className="text-xs mb-1" style={{ color: C.muted }}>ค่าไฟรายเดือน</p>
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
      <div className="mt-4 pt-4 text-xs flex justify-between" style={{ borderTop: `1px solid ${C.line}`, color: C.muted }}>
        <span>รวมปี {Number(yearly.year) + 543}</span>
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
  const d = new Date(e.date);

  return (
    <button onClick={onClick} className="w-full text-left rounded-3xl bg-white p-4 shadow-sm active:scale-[0.99] transition" style={{ border: `1px solid ${C.line}` }}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
             style={{ background: e.place === "home" ? C.accentSoft : "#F0F0EE" }}>
          {e.place === "home" ? <Home size={18} color={C.accent} /> : <Zap size={18} color={C.ink} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{e.place === "home" ? "ชาร์จที่บ้าน" : e.provider}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0"
                  style={{ background: e.conn === "DC" ? C.ink : "#EDEBE8", color: e.conn === "DC" ? "#fff" : C.muted }}>
              {e.conn}
            </span>
            {e.category === "company" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0" style={{ background: C.accentSoft, color: C.accent }}>
                บริษัท
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: C.muted }}>
            {e.station} · {d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} {d.toTimeString().slice(0, 5)} น.
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
      <button onClick={onAdd} className="px-5 py-2.5 rounded-2xl text-white text-sm font-semibold" style={{ background: C.accent }}>
        เพิ่มรายการแรก
      </button>
    </div>
  );
}

/* ---------------- Stats ---------------- */
function Stats({ lifetime, monthly, entries }) {
  const byProvider = useMemo(() => {
    const m = {};
    entries.forEach((e) => {
      const k = e.place === "home" ? "บ้าน" : e.provider;
      m[k] = m[k] || { amount: 0, kwh: 0 };
      m[k].amount += e.amount; m[k].kwh += e.kwh;
    });
    return Object.entries(m).sort((a, b) => b[1].amount - a[1].amount);
  }, [entries]);

  return (
    <div className="space-y-4">
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
            กรอกเลขไมล์ทุกครั้งอย่างน้อย 2 ครั้งติดกัน เพื่อคำนวณ ฿/กม. และ kWh/100 กม.
          </p>
        )}
      </div>

      {byProvider.length > 0 && (
        <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
          <h2 className="font-semibold mb-4">แยกตามผู้ให้บริการ</h2>
          <div className="space-y-3">
            {byProvider.map(([name, v]) => {
              const max = byProvider[0][1].amount || 1;
              return (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="truncate">{name}</span>
                    <span className="font-semibold shrink-0 ml-2">{baht(v.amount)} <span className="font-normal text-xs" style={{ color: C.muted }}>· {num(v.amount / v.kwh)} ฿/kWh</span></span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F0EEEB" }}>
                    <div className="h-full rounded-full" style={{ width: `${(v.amount / max) * 100}%`, background: C.accent }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
        <h2 className="font-semibold mb-1">ยอดเบิกบริษัทเดือนนี้</h2>
        <p className="text-3xl font-bold mt-2">{baht(monthly.company)}</p>
        <p className="text-sm mt-1" style={{ color: C.muted }}>{num(monthly.companyKwh, 1)} kWh</p>
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

/* ---------------- Add sheet ---------------- */
function AddSheet({ onClose, onSave, avgRate, vehicle, userId }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const [f, setF] = useState({
    place: "station", provider: "EV Station PluZ", station: "", conn: "DC",
    kwh: "", amount: "",
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    odo: "", category: "personal", note: "", receiptNo: "",
    socFrom: 20, socTo: 80,
  });
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const fileRef = useRef(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const homeKwh = ((f.socTo - f.socFrom) / 100) * vehicle.battery_kwh;
  const homeAmount = homeKwh * vehicle.home_rate;

  const kwh = f.place === "home" ? homeKwh : parseFloat(f.kwh) || 0;
  const amount = f.place === "home" ? homeAmount : parseFloat(f.amount) || 0;
  const rate = kwh ? amount / kwh : 0;

  const pickFile = (file) => {
    setPendingFile(file);
    readReceipt(file);
  };

  const readReceipt = async (file) => {
    setBusy(true); setErr("");
    try {
      const j = await readReceiptOCR(file);
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
    if (!amount || !kwh) { setErr("กรอกยอดเงินและหน่วยไฟก่อนบันทึก"); return; }
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
      });
      if (pendingFile) uploadReceipt(userId, pendingFile); // ไม่ต้องรอ ไม่บล็อก UI
    } catch (e) {
      setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="บันทึกค่าไฟ" onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl mb-5" style={{ background: "#EDEBE8" }}>
        {[["station", "สถานี", <Zap size={16} key="z" />], ["home", "บ้าน", <Home size={16} key="h" />]].map(([v, l, ic]) => (
          <button key={v} onClick={() => set("place", v)} className="py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition"
            style={{ background: f.place === v ? "#fff" : "transparent", color: f.place === v ? C.accent : C.muted }}>
            {ic}{l}
          </button>
        ))}
      </div>

      {f.place === "station" && (
        <>
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="w-full mb-5 py-4 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm" style={{ background: C.accentSoft, color: C.accent }}>
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
                <button key={v} onClick={() => set("conn", v)} className="py-3 rounded-2xl text-sm font-semibold"
                  style={{ background: f.conn === v ? C.accent : "#fff", color: f.conn === v ? "#fff" : C.ink, border: `1px solid ${f.conn === v ? C.accent : C.line}` }}>
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
              <input type="range" min="0" max="100" value={f.socFrom} onChange={(e) => set("socFrom", Math.min(+e.target.value, f.socTo - 1))} className="w-full mb-2" style={{ color: C.muted }} />
              <input type="range" min="0" max="100" value={f.socTo} onChange={(e) => set("socTo", Math.max(+e.target.value, f.socFrom + 1))} className="w-full" style={{ color: C.accent }} />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ความจุแบต"><input value={vehicle.battery_kwh} readOnly className={inputCls} /></Field>
            <Field label="ค่าไฟ (฿/kWh)"><input value={vehicle.home_rate} readOnly className={inputCls} /></Field>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="วันที่"><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} /></Field>
        <Field label="เวลา"><input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className={inputCls} /></Field>
      </div>

      <Field label="ใช้สำหรับ">
        <div className="grid grid-cols-2 gap-2">
          {[["personal", "ส่วนตัว", <User size={15} key="u" />], ["company", "บริษัท", <Briefcase size={15} key="b" />]].map(([v, l, ic]) => (
            <button key={v} onClick={() => set("category", v)} className="py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-1.5"
              style={{ background: f.category === v ? C.accent : "#fff", color: f.category === v ? "#fff" : C.ink, border: `1px solid ${f.category === v ? C.accent : C.line}` }}>
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
        <input type="number" inputMode="numeric" value={f.odo} onChange={(e) => set("odo", e.target.value)} placeholder="เช่น 22,450" className={inputCls} />
        <p className="text-xs mt-1.5" style={{ color: C.muted }}>กรอกให้ต่อเนื่องเพื่อคำนวณ ฿/กม.</p>
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

      <button onClick={save} disabled={saving} className="w-full py-4 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-2" style={{ background: C.accent }}>
        {saving ? <Loader2 size={18} className="animate-spin" /> : "บันทึก"}
      </button>
    </Sheet>
  );
}

/* ---------------- Detail ---------------- */
function DetailSheet({ e, avgRate, onClose, onDelete }) {
  const rate = e.kwh ? e.amount / e.kwh : 0;
  const d = new Date(e.date);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={e.place === "home" ? "ชาร์จที่บ้าน" : e.provider} onClose={onClose}>
      <p className="text-5xl font-bold mb-1">{baht(e.amount)}</p>
      <p className="text-sm mb-6" style={{ color: C.muted }}>{d.toLocaleDateString("th-TH", { dateStyle: "long" })} · {d.toTimeString().slice(0, 5)} น.</p>
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
      <div className="space-y-2 text-sm mb-6">
        <Row k="สถานี" v={e.station} />
        <Row k="ประเภท" v={e.conn} />
        <Row k="หมวด" v={e.category === "company" ? "บริษัท" : "ส่วนตัว"} />
        {e.receiptNo && <Row k="เลขที่ใบเสร็จ" v={e.receiptNo} />}
        {e.odo > 0 && <Row k="เลขไมล์" v={`${e.odo.toLocaleString()} กม.`} />}
        {e.note && <Row k="หมายเหตุ" v={e.note} />}
      </div>
      <button
        onClick={async () => { setBusy(true); await onDelete(e.id); }}
        disabled={busy}
        className="w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2"
        style={{ background: "#F7ECE9", color: C.red }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} ลบรายการนี้
      </button>
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
  ];
  return (
    <div className="fixed bottom-5 left-0 right-0 flex justify-center px-5">
      <div className="flex gap-1 p-2 rounded-full shadow-lg" style={{ background: C.ink }}>
        {items.map(({ k, label, icon: Icon }) => (
          <button key={k} onClick={() => setTab(k)} className="px-7 py-3 rounded-full flex items-center gap-2 text-sm font-medium transition"
            style={{ background: tab === k ? "rgba(255,255,255,.12)" : "transparent", color: tab === k ? "#fff" : "rgba(255,255,255,.55)" }}>
            <Icon size={18} />{label}
          </button>
        ))}
      </div>
    </div>
  );
}
