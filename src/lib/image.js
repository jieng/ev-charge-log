// ย่อรูปใบเสร็จก่อนส่ง OCR: รูปจากมือถือหลาย MB ส่งช้ามาก ย่อเหลือด้านยาว 1600px ก็ยังอ่านตัวเลขชัด
export function fitSize(width, height, max) {
  if (!(width > 0 && height > 0)) return { width, height };
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const k = max / long;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

const readAsBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1]);
  r.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
  r.readAsDataURL(blob);
});

// คืน { base64, mediaType }; ถ้าย่อไม่ได้ (เบราว์เซอร์ไม่รองรับ/ไฟล์แปลก) ใช้ไฟล์เดิม
export async function prepareReceiptImage(file, max = 1600, quality = 0.85) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitSize(bmp.width, bmp.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(bmp, 0, 0, width, height);
    bmp.close?.();
    const url = canvas.toDataURL("image/jpeg", quality);
    return { base64: url.split(",")[1], mediaType: "image/jpeg" };
  } catch (e) {
    return { base64: await readAsBase64(file), mediaType: file.type || "image/jpeg" };
  }
}
