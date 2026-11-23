-- เที่ยวของงาน/ทริป: งานเลขเดียวกันเดินทางได้หลายช่วงเวลา แต่ละเที่ยวมีไมล์เริ่ม-จบของตัวเอง
create table if not exists public.job_legs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_code text not null,
  start_date date not null,
  end_date date not null,
  start_odo integer,
  end_odo integer,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists job_legs_user_job_idx on public.job_legs (user_id, job_code);

alter table public.job_legs enable row level security;

create policy "job_legs owner all" on public.job_legs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
