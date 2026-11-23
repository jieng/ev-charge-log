export const DEFAULT_THEME = "swiss";
const KEY = "ev-theme";

export const THEMES = {
  swiss: {
    label: "Swiss ฟ้า",
    vars: {
      "--accent": "#0E7490", "--accent-text": "#0E7490", "--accent-soft": "#DCEFF3",
      "--ink": "#164E63", "--bg": "#F4FAFB", "--card": "#FFFFFF", "--line": "#CFE8EE",
      "--muted": "#475569", "--green": "#15803D", "--red": "#B91C1C", "--red-soft": "#FDECEC",
      "--strong": "#164E63", "--green-soft": "#EEF8F3", "--amber-soft": "#FEF3C7", "--amber-text": "#92400E", "--bar2": "#A5D4E0",
    },
  },
  bento: {
    label: "Bento ม่วงอุ่น",
    vars: {
      "--accent": "#4F46E5", "--accent-text": "#4338CA", "--accent-soft": "#E7E6FB",
      "--ink": "#1F2937", "--bg": "#F5F3EE", "--card": "#FFFFFF", "--line": "#E4DFD3",
      "--muted": "#57534E", "--green": "#15803D", "--red": "#B91C1C", "--red-soft": "#FDECEC",
      "--strong": "#1F2937", "--green-soft": "#EEF7F0", "--amber-soft": "#FEF3C7", "--amber-text": "#92400E", "--bar2": "#C7C2F4",
    },
  },
  dark: {
    label: "Dark มืด",
    vars: {
      "--accent": "#0E7490", "--accent-text": "#67D4EE", "--accent-soft": "#12394A",
      "--ink": "#E6F1F5", "--bg": "#0B1620", "--card": "#12232F", "--line": "#234050",
      "--muted": "#9FB6C2", "--green": "#4ADE80", "--red": "#F87171", "--red-soft": "#3A1E22",
      "--strong": "#1E4A5E", "--green-soft": "#12301F", "--amber-soft": "#3B2F10", "--amber-text": "#FCD34D", "--bar2": "#3C6B80",
    },
  },
};

export function loadTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v && THEMES[v] ? v : DEFAULT_THEME;
  } catch (e) {
    return DEFAULT_THEME;
  }
}

export function applyTheme(id) {
  const key = THEMES[id] ? id : DEFAULT_THEME;
  const root = document.documentElement;
  Object.entries(THEMES[key].vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.theme = key;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEMES[key].vars["--bg"]);
  try { localStorage.setItem(KEY, key); } catch (e) { /* ไม่กระทบการใช้งาน */ }
}

// ใช้ในโค้ดหน้าจอ: ค่าเป็นตัวแปร CSS จึงเปลี่ยนตามธีมทันที (--strong = พื้นเข้มที่ใช้กับตัวอักษรขาว, --accent-text = สีตัวอักษรเน้นบนพื้นธีม)
export const C = {
  accent: "var(--accent)", accentText: "var(--accent-text)", accentSoft: "var(--accent-soft)",
  ink: "var(--ink)", strong: "var(--strong)", bg: "var(--bg)", card: "var(--card)", line: "var(--line)",
  muted: "var(--muted)", green: "var(--green)", red: "var(--red)",
};
