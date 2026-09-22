import { supabase } from "./supabaseClient";

export async function sendMagicLink(email) {
const { error } = await supabase.auth.signInWithOtp({
email,
options: { emailRedirectTo: window.location.origin + window.location.pathname },
});
if (error) throw error;
}
export async function signUpWithPassword(email, password) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
await supabase.auth.signOut();
}

export function onAuthChange(cb) {
const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));

  return () => data.subscription.unsubscribe();
}

export async function getSession() {
const { data } = await supabase.auth.getSession();
return data.session;
}

export async function updateCharge(id, updates) {
  const { data, error } = await supabase.from("charges").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}


export async function getOrCreateVehicle(userId) {
const { data, error } = await supabase
.from("vehicles")
.select("*")
.eq("user_id", userId)
.order("created_at", { ascending: true })
.limit(1)
.maybeSingle();
if (error) throw error;
if (data) return data;

const { data: created, error: insErr } = await supabase
.from("vehicles")
.insert({ user_id: userId, name: "รถของฉัน", battery_kwh: 60, home_rate: 4.42 })
.select()
.single();
if (insErr) throw insErr;
return created;
}

export async function updateVehicle(id, patch) {
const { data, error } = await supabase
.from("vehicles")
.update(patch)
.eq("id", id)
.select()
.single();
if (error) throw error;
return data;
}

export async function listCharges(userId) {
const { data, error } = await supabase
.from("charges")
.select("*")
.eq("user_id", userId)
.order("charged_at", { ascending: false });
if (error) throw error;
return data;
}

export async function addCharge(row) {
const { data, error } = await supabase.from("charges").insert(row).select().single();
if (error) throw error;
return data;
}

export async function deleteCharge(id) {
const { error } = await supabase.from("charges").delete().eq("id", id);
if (error) throw error;
}

export async function uploadReceipt(userId, file) {
const path = `${userId}/${Date.now()}-${file.name}`;
const { error } = await supabase.storage.from("receipts").upload(path, file);
if (error) {
console.warn("อัปโหลดรูปใบเสร็จไม่สำเร็จ:", error.message);
return null;
}
return path;
}

export async function readReceiptOCR(file) {
const base64 = await new Promise((resolve, reject) => {
const r = new FileReader();
r.onload = () => resolve(r.result.split(",")[1]);
r.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
r.readAsDataURL(file);
});

const { data, error } = await supabase.functions.invoke("read-receipt", {
body: { image: base64, mediaType: file.type || "image/jpeg" },
});
if (error) throw error;
if (data?.error) throw new Error(data.error);
return data;
}
