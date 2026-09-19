import React, { useState } from "react";
import { X, LogOut } from "lucide-react";
  import { updateVehicle, signOut } from "../lib/api";

const C = { accent: "#A98C67", accentSoft: "#EFE7DB", ink: "#3A322A", bg: "#F2F1EF", muted: "#8A8279", line: "#E5E2DE" };
const inputCls = "w-full px-4 py-3.5 rounded-2xl bg-white outline-none text-base";

export default function Settings({ vehicle, onClose, onSaved, userEmail }) {
const [f, setF] = useState({
name: vehicle.name,
battery_kwh: vehicle.battery_kwh,
home_rate: vehicle.home_rate,
start_odo: vehicle.start_odo || "",
});
const [busy, setBusy] = useState(false);
const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

const save = async () => {
setBusy(true);
try {
const updated = await updateVehicle(vehicle.id, {
name: f.name,
battery_kwh: parseFloat(f.battery_kwh) || 0,
home_rate: parseFloat(f.home_rate) || 0,
start_odo: parseInt(f.start_odo) || 0,
});
onSaved(updated);
} finally {
setBusy(false);
}
};

return (
<div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
<div className="w-full max-w-md rounded-t-3xl max-h-[92vh] overflow-y-auto p-6 pb-10" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
<div className="flex items-center justify-between mb-6">
<h2 className="text-2xl font-bold">ตั้งค่ารถ</h2>
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
<div className="mb-6">
<label className="block text-sm font-medium mb-2">เลขไมล์เริ่มต้น (ไม่บังคับ)</label>
<input type="number" value={f.start_odo} onChange={(e) => set("start_odo", e.target.value)} placeholder="0" className={inputCls} />
</div>

<button onClick={save} disabled={busy} className="w-full py-3.5 rounded-2xl text-white font-bold mb-3" style={{ background: C.accent }}>
{busy ? "กำลังบันทึก..." : "บันทึก"}
</button>

<div className="pt-4 mt-2 flex items-center justify-between text-sm" style={{ borderTop: `1px solid ${C.line}`, color: C.muted }}>
<span className="truncate">เข้าสู่ระบบด้วย {userEmail}</span>
<button onClick={signOut} className="flex items-center gap-1.5 font-medium shrink-0 ml-3" style={{ color: "#B4634F" }}>
<LogOut size={15} /> ออกจากระบบ
</button>
</div>
</div>
</div>
);
}
