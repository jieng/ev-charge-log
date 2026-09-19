import React, { useState } from "react";
import { Zap, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { sendMagicLink } from "../lib/api";

  const C = { accent: "#A98C67", accentSoft: "#EFE7DB", ink: "#3A322A", bg: "#F2F1EF", muted: "#8A8279", line: "#E5E2DE" };

export default function Login() {
  const [email, setEmail] = useState("");
const [busy, setBusy] = useState(false);
const [sent, setSent] = useState(false);
const [err, setErr] = useState("");

const submit = async (e) => {
e.preventDefault();
if (!email) return;
setBusy(true); setErr("");
try {
await sendMagicLink(email.trim());
setSent(true);
} catch (e) {
setErr("ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง");
} finally {
setBusy(false);
}
};

return (
<div className="min-h-screen flex items-center justify-center px-6" style={{ background: C.bg, color: C.ink }}>
<div className="w-full max-w-sm">
<div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 mx-auto" style={{ background: C.ink }}>
<Zap size={26} color="#fff" />
</div>
<h1 className="text-2xl font-bold text-center mb-1">บันทึกค่าไฟรถ EV</h1>
<p className="text-sm text-center mb-8" style={{ color: C.muted }}>เข้าสู่ระบบด้วยอีเมล ไม่ต้องจำรหัสผ่าน</p>

{sent ? (
<div className="rounded-3xl bg-white p-6 text-center shadow-sm" style={{ border: `1px solid ${C.line}` }}>
<CheckCircle2 size={36} color={C.accent} className="mx-auto mb-3" />
<p className="font-semibold mb-1">ส่งลิงก์แล้ว</p>
<p className="text-sm" style={{ color: C.muted }}>
เช็กอีเมล <b>{email}</b> แล้วกดลิงก์เพื่อเข้าสู่ระบบ (อาจอยู่ในถังขยะ/สแปม)
</p>
</div>
) : (
<form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-sm" style={{ border: `1px solid ${C.line}` }}>
<label className="block text-sm font-medium mb-2">อีเมล</label>
<div className="flex items-center gap-2 px-4 py-3.5 rounded-2xl mb-4" style={{ background: "#F7F6F4" }}>
<Mail size={18} color={C.muted} />
<input
type="email"
required
value={email}
onChange={(e) => setEmail(e.target.value)}
placeholder="you@example.com"
className="flex-1 bg-transparent outline-none text-base"
/>
</div>
{err && <p className="text-sm mb-3" style={{ color: "#B4634F" }}>{err}</p>}
<button
type="submit"
disabled={busy}
className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2"
style={{ background: C.accent }}
>
{busy ? <Loader2 size={18} className="animate-spin" /> : "ส่งลิงก์เข้าสู่ระบบ"}
</button>
</form>
)}
</div>
</div>
);
}
