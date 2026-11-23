# Themes, providers, and job legs — design

Status: approved by Thapakon in conversation (2026-11-20). Not yet committed or pushed.

## Intent
Thapakon logs real EV charging bills (59 so far) for company jobs and personal trips.
1. New charging providers appear that are not in the fixed list.
2. One job code is often driven in separate periods (e.g. S26109: Jul and Nov 2026), but a job holds only one start/end odometer, so km and ฿/km are wrong.
3. He wants a choice of theme.

## Goals
- Pick a theme in Settings: Swiss blue (current), Bento, Dark. Saved on the device.
- Provider list includes EA Anywhere and SHARGE; user can add a new provider by typing; providers already used in his bills appear automatically; past station names are suggested.
- Each job is split into legs (เที่ยว). Job page shows: cumulative total for the job, each leg (km, cost, ฿/km, kWh/100km), and monthly totals.

## Non-goals
- No external provider/station database (none found: PlugShare is an aggregator without a usable open feed). Revisit if he names another source.
- No change to how bills are entered or to existing km/฿ per km rules inside one leg.

## Anti-goals
- Must not change existing numbers for jobs that have a single leg.
- Must not lose or rewrite any bill data.

## Approaches considered
- Legs: (1) automatic only, (2) manual only, (3) automatic with user edits. Chosen: 3.
- Providers: fixed list only (goes stale) vs fixed list + typed + learned from bills (chosen) vs external database (no usable source).
- Theme: light themes only vs including Dark. Chosen: all three; Dark needs hardcoded whites replaced.

## Design
Legs
- Automatic cut: a gap of more than 3 days between consecutive bills of the same job code starts a new leg.
- Stored legs (new table job_legs: user_id, job_code, start_date, end_date, start_odo, end_odo) override automatic ones. Once he edits a job, its stored legs fully replace the automatic ones; "reset to automatic" deletes them.
- Each leg uses the existing per-job km logic (end−start odo when both set, else min/max of odometers, plus the existing ฿/km bill selection).
- Cumulative: sum of leg km and cost; ฿/km = cost used / km.
- Monthly totals: cost, kWh, bill count by month; a leg's km is counted in the month of its first bill (builder-level call, mine).
- Job.start_odo/end_odo stay for single-leg jobs and migrate into the first leg when edited.
- Report "งาน/ทริป" section lists legs.

Providers and stations
- Add EA Anywhere, SHARGE to PROVIDERS. Dropdown = fixed list + distinct providers from his bills + "+ เพิ่มค่ายใหม่…" (text input). Station field gets a suggestion list of past names. No database change.

Theme
- Colors become CSS variables set from the chosen theme; the C tokens point at them. Replace hardcoded white/neutral hexes. Palettes taken from the AppBento and AppDark boards; Swiss is today's palette. Choice in localStorage.

## Constraints
- Thai wall-clock-as-UTC date handling: use string slicing and wallMs(), no timezone conversion.
- DB migration is additive (new table with row-level security by user_id).

## Left to the builder
Exact UI layout of the legs editor, leg labels, Dark palette contrast checks (4.5:1 text).
