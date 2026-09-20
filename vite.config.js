import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

  export default defineConfig({
  base: "./",
    plugins: [
    react(),
    VitePWA({
    registerType: "autoUpdate",
    includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
    manifest: {
    name: "บันทึกค่าไฟรถ EV",
    short_name: "EV ชาร์จ",
    description: "บันทึกค่าชาร์จรถไฟฟ้า แยกส่วนตัว/บริษัท พร้อมอ่านใบเสร็จอัตโนมัติ",
    theme_color: "#A98C67",
    background_color: "#F2F1EF",
    display: "standalone",
    start_url: "./",
    icons: [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
  },
  }),
  ],
  });
