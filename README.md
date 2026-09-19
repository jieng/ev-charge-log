# บันทึกค่าไฟรถ EV

React PWA บันทึกค่าชาร์จรถไฟฟ้า อ่านใบเสร็จด้วย Google Gemini vision (ฟรี), แยกส่วนตัว/บริษัท, สรุปรายเดือน/รายปี และเทียบทุกครั้งกับค่าเฉลี่ยของตัวเอง

## สิ่งที่ทำให้แล้ว
- ตาราง vehicles, charges + Row Level Security ใน Supabase
- Edge Function read-receipt deploy ขึ้น Supabase แล้ว
- Storage bucket receipts สำหรับเก็บรูปใบเสร็จ
- โค้ด React ทั้งหมด ต่อกับ Supabase จริงแล้ว
- ระบบล็อกอินแบบ magic link
- PWA ติดตั้งลงหน้าจอโหมดได้
- GitHub Actions deploy อัตโนมัติทุกครั้งที่ push ขึ้น main

## ตั้งค่า GEMINI_API_KEY
1. ไปที่ https://aistudio.google.com/apikey ล็อกอินด้วย Google แล้วกด Create API key
2. ไปที่ Supabase Dashboard ของโปรเจกต์ เมนู Edge Functions เลือก read-receipt แท็บ Secrets
3. เพิ่มตัวแปร GEMINI_API_KEY ใส่ค่าที่ได้จากข้อ 1

## รันทดสอบในเครื่อง
npm install แล้ว npm run dev เปิด http://localhost:5173

## โครงสร้างโปรเจกต์
src/lib/supabaseClient.js เชื่อมต่อ Supabase
src/lib/api.js ฟังก์ชันคุยกับฐานข้อมูลทั้งหมด
src/components/Login.jsx หน้าล็อกอิน
src/components/Settings.jsx ตั้งค่ารถ
src/App.jsx หน้าจอหลัก
supabase/functions/read-receipt โค้ด Edge Function
supabase/migrations สคีมาฐานข้อมูล

## จุดที่ยังไม่ได้ทำ
- ยังไม่แสดงรูปใบเสร็จย้อนหลังในหน้ารายละเอียด
- ยังไม่มีปุ่ม export เป็น Excel/PDF
- ยังไม่รองรับหลายรถต่อผู้ใช้
