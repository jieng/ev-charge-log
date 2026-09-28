import React, { useState, useEffect } from "react";
import { X, LogOut, Link2, Loader2, CheckCircle2 } from "lucide-react";
import { updateVehicle, signOut, createLinkCode, getLineLinks, unlinkLine } from "../lib/api";

const C = { accent: "#A98C67", accentSoft: "#EFE7DB", ink: "#3A322A", bg: "#F2F1EF", muted: "#8A8279", line: "#E5E2DE", red: "#B4634F" };
const inputCls = "w-full px-4 py-3.5 rounded-2xl bg-white outline-none text-base";
const TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default function Settings({ vehicle, onClose, onSaved, userEmail, userId }) {
  const [f, setF] = useState({
    name: vehicle.name,
    battery_kwh: vehicle.battery_kwh,
    home_rate: vehicle.home_rate,
    start_odo: vehicle.start_odo || "",
    period_start_day: vehicle.period_start_day || 1,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [links, setLinks] = useState([]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const loadLinks = async () => {
    try { setLinks(await getLineLinks(userId)); } catch (e) { /* ไม่กระทบการตั้งค่าอื่น */ }
  };
  useEffect(() => { loadLinks(); }, []);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const updated = await updateVehicle(vehicle.id, {
        name: f.name,
        battery_kwh: parseFloat(f.battery_kwh) || 0,
        home_rate: parseFloat(f.home_rate) || 0,
        start_odo: parseInt(f.start_odo) || 0,
        period_start_day: parseInt(f.period_start_day) || 1,
      });
      onSaved(updated);
    } catch (e) {
      setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const makeCode = async () => {
    setCodeBusy(true); setErr("");
    try {
      setCode(await createLinkCode(userId));
    } catch (e) {
      setErr("สร้างรหัสไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setCodeBusy(false);
    }
  };

  const unlink = async (id) => {
    try { await unlinkLine(id); await loadLinks(); } catch (e) { setErr("ยกเลิกการผูกไม่สำเร็จ"); }
  };

  const day = parseInt(f.period_start_day) || 1;
  const nextMonth = TH[(new Date().getMonth() + 1) % 12];
  const thisMonth = TH[new Date().getMonth()];
  const example = day === 1 ? "นับตามเดือนปกติ (1 – สิ้นเดือน)" : `ตัวอย่าง: ${day} ${thisMonth} – ${day - 1} ${nextMonth}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl max-h-[92vh] overflow-y-auto p-6 pb-10" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">ตั้งค่า</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#E6E4E1" }}>
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">ชื่อรถ</label>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">ความจุแบต (kWh)</label>
            <input type="number" value={f.battery_kwh} onChange={(e) => set("battery_kwh", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">ค่าไฟบ้าน (฿/kWh)</label>
            <input type="number" step="0.01" value={f.home_rate} onChange={(e) => set("home_rate", e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">เลขไมล์เริ่มต้น (ไม่บังคับ)</label>
          <input type="number" value={f.start_odo} onChange={(e) => set("start_odo", e.target.value)} placeholder="0" className={inputCls} />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">รอบสรุปรายเดือน เริ่มวันที่</label>
          <select value={f.period_start_day} onChange={(e) => set("period_start_day", e.target.value)} className={inputCls}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d === 1 ? "1 (เดือนปกติ)" : `วันที่ ${d}`}</option>
            ))}
          </select>
          <p className="text-xs mt-1.5" style={{ color: C.muted }}>{example} ใช้กับทั้งหน้าเว็บ สรุปใน LINE และแจ้งเตือนสิ้นรอบ</p>
        </div>

        {err && <p className="text-sm mb-3" style={{ color: C.red }}>{err}</p>}
        <button onClick={save} disabled={busy} className="w-full py-3.5 rounded-2xl text-white font-bold mb-6" style={{ background: C.accent }}>
          {busy ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>

        <div className="rounded-3xl bg-white p-5 mb-4" style={{ border: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-2 mb-1 font-semibold"><Link2 size={16} color={C.accent} /> ผูก LINE</div>
          <p className="text-xs mb-3" style={{ color: C.muted }}>
            ผูกแล้วส่งรูปใบเสร็จเข้า LINE บันทึกให้อัตโนมัติ และรับสรุปสิ้นรอบทุกครั้ง
          </p>

          {links.length > 0 && links.map((l) => (
            <div key={l.line_user_id} className="flex items-center justify-between rounded-2xl px-4 py-3 mb-2" style={{ background: "#EDF3EF" }}>
              <span className="flex items-center gap-2 text-sm"><CheckCircle2 size={16} color="#5B8C6E" /> ผูกแล้ว</span>
              <button onClick={() => unlink(l.line_user_id)} className="text-xs font-semibold" style={{ color: C.red }}>ยกเลิกการผูก</button>
            </div>
          ))}

          {code ? (
            <div className="rounded-2xl p-4 text-center" style={{ background: C.accentSoft }}>
              <p className="text-xs mb-1" style={{ color: C.accent }}>พิมพ์ข้อความนี้ในแชท LINE ของบอท (ใช้ได้ 15 นาที)</p>
              <p className="text-3xl font-bold tracking-widest">ผูก {code}</p>
            </div>
          ) : (
            <button onClick={makeCode} disabled={codeBusy} className="w-full py-3 rounded-2xl font-semibold flex items-center justify-center gap-2" style={{ background: C.accentSoft, color: C.accent }}>
              {codeBusy ? <Loader2 size={16} className="animate-spin" /> : null}
              {links.length > 0 ? "ผูกเพิ่มอีกบัญชี LINE" : "สร้างรหัสผูก LINE"}
            </button>
          )}
        </div>

        <div className="pt-4 mt-2 flex items-center justify-between text-sm" style={{ borderTop: `1px solid ${C.line}`, color: C.muted }}>
          <span className="truncate">เข้าสู่ระบบด้วย {userEmail}</span>
          <button onClick={signOut} className="flex items-center gap-1.5 font-medium shrink-0 ml-3" style={{ color: C.red }}>
            <LogOut size={15} /> ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}
