# Themes, Providers, Job Legs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a theme, add new charging providers, and see each job split into legs with cumulative, per-leg and monthly totals.

**Architecture:** Pure logic moves into small testable modules (`src/lib/providers.js`, `src/lib/legs.js`, `src/lib/theme.js`); `App.jsx` and `Settings.jsx` call them. Legs are computed on the client (automatic by date gap) and overridden by rows in a new `job_legs` table once the user edits a job. Theme colors become CSS variables.

**Tech Stack:** React 18, Vite, Tailwind, Supabase (project `lwcuhxlqtenszokpiyoc`), Vitest (added for the pure modules only).

**Spec:** `docs/superpowers/specs/2026-11-20-themes-providers-job-legs-design.md`

## Global Constraints

- Dates: `charged_at` is Thai wall-clock stored as UTC. Use string slicing and `wallMs()`; never convert time zones.
- Auto leg cut: gap of more than 3 days (72 h) between consecutive bills of one job code.
- Existing single-leg numbers must not change: km priority is manual round_trip_km, then end_odo − start_odo when both set, then min/max odometer; ฿/km bill selection stays as in current `jobStats`.
- Added providers: `EA Anywhere`, `SHARGE`. Theme ids: `swiss` (default), `bento`, `dark`. Storage key: `ev-theme`.
- DB change is additive only (`job_legs` with row-level security by `user_id`). No bill rows are modified.
- UI text in Thai. Text contrast at least 4.5:1 in every theme.
- Do not commit or push unless the user asks.

## Review Focus

- A job with one bill, or bills without odometer: one leg, km 0, no NaN or Infinity anywhere.
- Odometer end lower than start (bad entry): leg km clamps to 0, not negative.
- A new bill added after the user saved legs, outside every stored leg: appears in an "ยังไม่จัดเที่ยว" group, never dropped from totals.
- Provider names differing only by case or spaces ("sharge ", "SHARGE"): listed once.
- Saved theme value missing, invalid, or localStorage throwing: falls back to `swiss`.

## File Structure

- Create `src/lib/providers.js`: provider list merge. 
- Create `src/lib/legs.js`: leg building, leg stats, cumulative and monthly roll-ups.
- Create `src/lib/theme.js`: theme palettes, apply and load.
- Create `src/lib/legs.test.js`, `src/lib/providers.test.js`, `src/lib/theme.test.js`.
- Create `supabase/migrations/20261120_job_legs.sql`.
- Modify `src/lib/api.js` (legs CRUD), `src/App.jsx` (use modules, UI), `src/components/Settings.jsx` (theme picker), `src/index.css` (variables), `package.json` (vitest).

### Task 1: Test runner and provider list

**Files:**
- Modify: `package.json` (add devDependency `vitest`, script `"test": "vitest run"`)
- Create: `src/lib/providers.js`, `src/lib/providers.test.js`
- Modify: `src/App.jsx` (remove inline `PROVIDERS`, AddSheet at ~1353 and EditSheet at ~1504 provider/station fields)

**Interfaces:**
- Produces: `BASE_PROVIDERS: string[]` (existing 14 plus EA Anywhere and SHARGE, "อื่นๆ / Other" last); `mergeProviders(used: string[]): string[]` returns base list plus used names not already present (compare trimmed, case-insensitive; keep the first spelling; "อื่นๆ / Other" stays last); `uniqueStations(entries: {station: string}[]): string[]` (trimmed, non-empty, case-insensitive unique, most frequent first).

- [ ] **Step 1: Write failing tests** in `providers.test.js`: `mergeProviders(["sharge ", "Zeekr Charge", "zeekr charge"])` contains "SHARGE" once and "Zeekr Charge" once, and last item is "อื่นๆ / Other"; `uniqueStations` of stations ["PTT รัชดา","ptt รัชดา ","MEA"] returns ["PTT รัชดา","MEA"].
- [ ] **Step 2: Run** `npx vitest run src/lib/providers.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** both functions in `providers.js`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Wire UI.** In AddSheet and EditSheet the provider `<select>` options come from `mergeProviders(entries.map(e => e.provider))` plus a final option "+ เพิ่มค่ายใหม่…"; choosing it shows a text input whose trimmed value becomes `f.provider`. Station input gets `list="stations-list"` with a `<datalist>` built from `uniqueStations(entries)` (same pattern as existing `jobs-list`).
- [ ] **Step 6: Verify** `npm run build` succeeds and run `npm run dev`; in the Add sheet pick "+ เพิ่มค่ายใหม่…", type a name, save a test bill, confirm the name appears in the list next time (delete the test bill after).

### Task 2: Leg logic (pure)

**Files:**
- Create: `src/lib/legs.js`, `src/lib/legs.test.js`

**Interfaces:**
- Consumes: entry shape `{id, date: string, amount, kwh, odo, job}` (as `fromRow` returns).
- Produces:
  - `autoLegs(rows: Entry[]): Leg[]` where `Leg = {key: string, startDate: string, endDate: string, startOdo: number, endOdo: number, rows: Entry[], source: "auto"|"saved"|"unassigned"}`; rows sorted by date, new leg when gap > 72 h by `wallMs`; startOdo/endOdo 0 when unset.
  - `applySavedLegs(rows: Entry[], saved: SavedLeg[]): Leg[]` where `SavedLeg = {id, job_code, start_date, end_date, start_odo, end_odo}`; a row belongs to the saved leg whose `[start_date, end_date]` (date part, inclusive) contains it; leftover rows form one `source:"unassigned"` leg; with no saved legs returns `autoLegs(rows)`.
  - `legStats(leg: Leg, roundTripKm = 0): {km, kmSource: "manual"|"trip"|"odo"|"none", amount, kwh, count, perKm, kwhPer100}` using exactly the current `jobStats` rules (move that logic here), km never below 0.
  - `jobRollup(legs: Leg[], roundTripKm): {legs: LegStat[], total: {km, amount, kwh, count, perKm}, months: {key: string, amount, kwh, count, km}[]}`; total km is the sum of leg km (manual round_trip_km applies only when there is exactly one leg); total perKm = sum of each leg's used-bill cost / total km; month key `YYYY-MM` by bill date, a leg's km is added to the month of its first bill.

- [ ] **Step 1: Write failing tests** in `legs.test.js`:
  - Regression: rows for one leg with startOdo 128493, endOdo 129128 → `legStats(...).km === 635`, kmSource "trip".
  - S26109 shape: two bills on 2026-07-17 and two on 2026-11-18 → `autoLegs` returns 2 legs; `jobRollup` months has "2026-07" and "2026-11".
  - Single bill, no odo → km 0, perKm 0, no NaN (`Number.isFinite`).
  - endOdo 100, startOdo 200 → km 0.
  - `applySavedLegs` with one saved leg covering only the first of two bills → second bill is in an "unassigned" leg and `total.amount` equals the sum of both.
  - Per-leg cost matches the old rule: first bill at the minimum odometer is excluded from ฿/km unless both trip odos are set.
- [ ] **Step 2: Run** `npx vitest run src/lib/legs.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the four functions in `legs.js`, lifting the km/perKm block from `jobStats` (App.jsx ~266-308) unchanged in behavior.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Parity check** against real data: add a temporary script (not committed) that loads the 59 bills via Supabase read-only SQL export, and confirm that for every job with a single leg `legStats.km/perKm` equal the values `jobStats` produced before this change (S26082 km 635).

### Task 3: Saved legs storage

**Files:**
- Create: `supabase/migrations/20261120_job_legs.sql`
- Modify: `src/lib/api.js`

**Interfaces:**
- Produces: table `public.job_legs(id uuid pk default gen_random_uuid(), user_id uuid not null, job_code text not null, start_date date not null, end_date date not null, start_odo integer, end_odo integer, created_at timestamptz default now())` with RLS policy `user_id = auth.uid()` for all operations; `listLegs(userId): Promise<SavedLeg[]>`; `replaceLegs(userId, code, legs: Omit<SavedLeg,"id"|"job_code">[]): Promise<void>` (delete the job's rows then insert, empty array deletes only = reset to automatic).

- [ ] **Step 1: Write the migration** SQL with the table and policy.
- [ ] **Step 2: Apply** via `mcp__Supabase__apply_migration` (the server asks the user to confirm; if no answer, stop and ask the user).
- [ ] **Step 3: Implement** `listLegs` and `replaceLegs` in `api.js` following the style of `listJobs`/`upsertJob`.
- [ ] **Step 4: Verify** with `select count(*) from public.job_legs` (expect 0) and a policy check from `pg_policies`.

### Task 4: Legs in the job screens

**Files:**
- Modify: `src/App.jsx` (`jobStats` useMemo ~266, `JobsTab` ~1133, `JobSheet` ~1183, report jobs section ~753-810)

**Interfaces:**
- Consumes: `applySavedLegs`, `legStats`, `jobRollup`, `listLegs`, `replaceLegs`.

- [ ] **Step 1:** Load saved legs with jobs at startup; `jobStats` builds per job `legs`/`rollup` via `applySavedLegs` + `jobRollup`, and keeps the old fields (`km`, `perKm`, `amount`, …) populated from `rollup.total` so JobsTab and the report keep working.
- [ ] **Step 2:** JobsTab card shows total cost, total km, ฿/km as now and adds a "N เที่ยว" chip when the job has more than one leg.
- [ ] **Step 3:** JobSheet shows three sections: "สะสมทั้งงาน" (total), "แต่ละเที่ยว" (each leg: date range, bills, km, cost, ฿/km, kWh/100 กม., editable start/end odometer and start/end date, buttons "รวมกับเที่ยวก่อนหน้า" and "แยกเที่ยว" at a chosen bill), "รวมรายเดือน" (month rows). The existing single start/end odometer inputs are replaced by the first leg's inputs. Save calls `replaceLegs` with all legs; a "กลับไปใช้อัตโนมัติ" button calls `replaceLegs(userId, code, [])`.
- [ ] **Step 4:** Report jobs section lists each leg under its job and the monthly rows when the job spans more than one month.
- [ ] **Step 5: Verify in the browser** on the live data: S26109 shows 2 legs (Jul, Nov) and months 2026-07 and 2026-11; S26082 still shows 635 km; edit a leg's odometer, save, reload, confirm it persists; reset returns to automatic.

### Task 5: Themes

**Files:**
- Create: `src/lib/theme.js`, `src/lib/theme.test.js`
- Modify: `src/index.css`, `src/App.jsx` (`C`, hardcoded colors), `src/components/Settings.jsx`, `src/components/Login.jsx`, `index.html` (theme-color meta updates on change)

**Interfaces:**
- Produces: `THEMES: Record<"swiss"|"bento"|"dark", {label: string, vars: Record<string,string>}>` with variable names `--accent --accent-soft --ink --bg --card --line --muted --green --red`; `loadTheme(): "swiss"|"bento"|"dark"`; `applyTheme(id): void` sets the variables on `document.documentElement` and saves to `localStorage["ev-theme"]` inside try/catch; `C` in App.jsx becomes `{accent: "var(--accent)", …}`.

- [ ] **Step 1: Write failing tests** in `theme.test.js` (environment jsdom): `loadTheme()` returns "swiss" when storage is empty, holds "nope", or `getItem` throws; after `applyTheme("dark")`, `document.documentElement.style.getPropertyValue("--bg")` equals `THEMES.dark.vars["--bg"]`; for each theme, `--ink` on `--bg` and `--ink` on `--card` have contrast ≥ 4.5 (small helper in the test).
- [ ] **Step 2: Run** `npx vitest run src/lib/theme.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `theme.js`. Swiss values are today's `C` (`#0E7490`, `#DCEFF3`, `#164E63`, `#F4FAFB`, `#CFE8EE`, `#475569`, `#15803D`, `#B91C1C`, card `#FFFFFF`). Take Bento and Dark palettes from the `AppBento.dc.html` and `AppDark.dc.html` boards; adjust any pair below 4.5:1.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Replace hardcoded colors** in `App.jsx`, `Settings.jsx`, `Login.jsx`: `bg-white` and `background:"#fff"` become `var(--card)`, hardcoded `#F4FAFB`/neutral hexes become variables (`grep -n '#[0-9A-Fa-f]\{3,6\}\|bg-white' src` must list only theme.js and intentional exceptions such as the print sheet, which stays light). Call `applyTheme(loadTheme())` in `main.jsx` before render.
- [ ] **Step 6: Add the picker** to Settings: three buttons with a swatch and label; selecting calls `applyTheme` and re-renders.
- [ ] **Step 7: Verify** in the browser: switch each theme on Home, Stats, Jobs, Add sheet, Settings, Login; no white panels or unreadable text in Dark; print preview still light.

### Task 6: Final check

- [ ] **Step 1:** `npx vitest run` all PASS and `npm run build` succeeds.
- [ ] **Step 2:** Re-check the numbers on the live data against the pre-change values (lifetime ฿/km 1.031, 16.0 kWh/100 km; S26082 635 km).
- [ ] **Step 3:** Ask the user whether to commit and push (deploys to GitHub Pages); do not do it unprompted.

## Self-Review

- Spec coverage: providers/stations (Task 1), legs auto + override + cumulative + monthly (Tasks 2–4), report (Task 4), theme with Dark (Task 5), additive migration (Task 3).
- Types: `Leg`, `SavedLeg`, `legStats`, `jobRollup`, `THEMES`, `applyTheme` are used with the same names in every task that touches them.
- Review Focus items are pinned: one-bill and negative odometer (Task 2 tests), unassigned bills (Task 2 test), provider dedupe (Task 1 test), theme fallback (Task 5 test).
