import React, { useState } from "react";
import { Zap, Loader2, Mail, Lock, CheckCircle2 } from "lucide-react";
import { signUpWithPassword, signInWithPassword } from "../lib/api";

const C = { accent: "#A98C67", accentSoft: "#EFE7DB", ink: "#3A322A", bg: "#F2F1EF", muted: "#8A8279", line: "#E5E2DE" };
const inputCls = "w-full px-4 py-3.5 rounded-2xl bg-white outline-none text-base";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedUp, setSignedUp] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true); setErr("");
    try {
      if (mode === "signup") {
        await signUpWithPassword(email.trim(), password);
        setSignedUp(true);
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (e) {
      const msg = e?.message || "";
      if (msg.includes("Invalid login credentials")) {
        setErr("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else if (msg.includes("already registered") || msg.includes("already been registered")) {
        setErr("อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน");
      } else if (msg.includes("Email not confirmed")) {
        setErr("ยังไม่ได้ยืนยันอีเมล เช็กกล่องจดหมายแล้วกดลิงก์ยืนยันก่อน");
      } else {
        setErr(mode === "signup" ? "สมัครไม่สำเร็จ ลองใหม่อีกครั้ง" : "เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
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
        <p className="text-sm text-center mb-8" style={{ color: C.muted }}>
          {mode === "signup" ? "สมัครสมาชิกครั้งแรก" : "เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน"}
        </p>

        {signedUp ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-sm" style={{ border: `1px solid ${C.line}` }}>
            <CheckCircle2 size={36} color={C.accent} className="mx-auto mb-3" />
            <p className="font-semibold mb-1">สมัครสำเร็จ</p>
            <p className="text-sm mb-4" style={{ color: C.muted }}>
              เช็กอีเมล <b>{email}</b> แล้วกดลิงก์ยืนยันหนึ่งครั้ง (อาจอยู่ในถังขยะ/สแปม) จากนั้นกลับมาเข้าสู่ระบบด้วยอีเมล+รหัสผ่านนี้ได้เลย
            </p>
            <button
              onClick={() => { setSignedUp(false); setMode("signin"); setPassword(""); }}
              className="text-sm font-semibold"
              style={{ color: C.accent }}
            >
              ไปหน้าเข้าสู่ระบบ
            </button>
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

            <label className="block text-sm font-medium mb-2">รหัสผ่าน</label>
            <div className="flex items-center gap-2 px-4 py-3.5 rounded-2xl mb-4" style={{ background: "#F7F6F4" }}>
              <Lock size={18} color={C.muted} />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "ตั้งรหัสผ่าน (อย่างน้อย 6 ตัว)" : "รหัสผ่าน"}
                className="flex-1 bg-transparent outline-none text-base"
              />
            </div>

            {err && <p className="text-sm mb-3" style={{ color: "#B4634F" }}>{err}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-2xl text-white font-bold flex items-center justify-center gap-2 mb-4"
              style={{ background: C.accent }}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : mode === "signup" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
            </button>

            <button
              type="button"
              onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setErr(""); }}
              className="w-full text-center text-sm"
              style={{ color: C.muted }}
            >
              {mode === "signup" ? (
                <>มีบัญชีอยู่แล้ว? <span style={{ color: C.accent, fontWeight: 600 }}>เข้าสู่ระบบ</span></>
              ) : (
                <>ยังไม่มีบัญชี? <span style={{ color: C.accent, fontWeight: 600 }}>สมัครสมาชิก</span></>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
