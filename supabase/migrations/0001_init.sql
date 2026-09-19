-- EV Charge Log Supabase schema

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  battery_kwh numeric(6,2) not null,
  home_rate numeric(6,2) default 4.42,
  start_odo integer default 0,
  is_default boolean default true,
  created_at timestamptz default now()
  );

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  place text not null check (place in ('home','station')),
  provider text,
  station_name text,
  conn_type text check (conn_type in ('AC','DC')),
  energy_kwh numeric(8,2) not null check (energy_kwh > 0),
  amount numeric(10,2) not null check (amount >= 0),
  unit_rate numeric(8,4) generated always as (
  case when energy_kwh > 0 then amount / energy_kwh else 0 end
  ) stored,
  soc_from smallint check (soc_from between 0 and 100),
  soc_to smallint check (soc_to between 0 and 100),
  odometer integer,
  category text not null default 'personal' check (category in ('personal','company')),
  receipt_no text,
  tax_id text,
  project_code text,
  reimbursed boolean default false,
  reimbursed_at date,
  charged_at timestamptz not null,
  note text,
  receipt_url text,
  ocr_raw jsonb,
  created_at timestamptz default now()
  );

create index charges_user_time_idx on public.charges (user_id, charged_at desc);
create index charges_user_odo_idx on public.charges (user_id, odometer);

alter table public.vehicles enable row level security;
alter table public.charges enable row level security;

create policy "own vehicles" on public.vehicles
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own charges" on public.charges
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create view public.monthly_summary as
select
user_id,
date_trunc('month', charged_at) as month,
count(*) as sessions,
sum(amount) as total_amount,
sum(energy_kwh) as total_kwh,
sum(amount) / nullif(sum(energy_kwh),0) as avg_rate,
sum(amount) filter (where place='home') as home_amount,
sum(amount) filter (where place='station') as station_amount,
sum(amount) filter (where category='personal') as personal_amount,
sum(amount) filter (where category='company') as company_amount,
sum(amount) filter (where category='company' and not reimbursed) as pending_claim
from public.charges
group by user_id, date_trunc('month', charged_at);

create view public.efficiency as
with s as (
  select user_id, charged_at, odometer, energy_kwh, amount,
  odometer - lag(odometer) over (partition by user_id order by odometer) as km
  from public.charges
  where odometer is not null and odometer > 0
  )
select
user_id,
sum(km) as total_km,
sum(amount) filter (where km is not null) / nullif(sum(km),0) as baht_per_km,
sum(energy_kwh) filter (where km is not null) / nullif(sum(km),0) * 100 as kwh_per_100km
from s
group by user_id;

insert into storage.buckets (id, name, public) values ('receipts','receipts', false)
on conflict do nothing;

create policy "own receipts" on storage.objects
for all using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
