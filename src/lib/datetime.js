// เวลาจากใบเสร็จ/OCR อาจมีวินาที (09:10:11) ซึ่งทำให้ timestamp ผิดรูปแบบและบันทึกไม่ได้ จึงตัดเหลือ HH:MM เสมอ
export function normTime(t) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec((t || "").trim());
  if (!m) return "";
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return "";
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function toChargedAt(date, time) {
  return `${date}T${normTime(time) || "00:00"}:00`;
}
