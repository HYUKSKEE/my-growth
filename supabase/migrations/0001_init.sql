-- Garmin Growth: 초기 스키마
-- Supabase SQL Editor에 붙여넣거나 `supabase db push`로 적용하세요.

-- 일 단위 건강 지표 (사용자당 하루 1행)
create table if not exists public.daily_metrics (
  user_id            uuid not null references auth.users(id) on delete cascade,
  date               date not null,
  steps              integer,
  distance_m         numeric,
  active_kcal        numeric,
  resting_hr         integer,
  stress_avg         integer,
  body_battery_max   integer,
  body_battery_min   integer,
  sleep_seconds      integer,
  sleep_score        integer,
  hrv_last_night     numeric,
  hrv_weekly_avg     numeric,
  hrv_status         text,
  vo2max_run         numeric,
  vo2max_cycle       numeric,
  raw                jsonb not null default '{}'::jsonb,  -- 원본 응답 (나중에 필드 재추출용)
  updated_at         timestamptz not null default now(),
  primary key (user_id, date)
);

-- 개별 운동 기록
create table if not exists public.activities (
  user_id            uuid not null references auth.users(id) on delete cascade,
  activity_id        bigint not null,
  start_time         timestamptz not null,
  start_date_local   date not null,
  type               text not null,       -- running, cycling, strength_training ...
  name               text,
  duration_s         numeric,
  distance_m         numeric,
  avg_hr             integer,
  max_hr             integer,
  avg_speed_mps      numeric,
  elevation_gain_m   numeric,
  calories           numeric,
  training_load      numeric,
  aerobic_te         numeric,
  anaerobic_te       numeric,
  vo2max             numeric,
  raw                jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now(),
  primary key (user_id, activity_id)
);
create index if not exists activities_user_start_idx on public.activities (user_id, start_time desc);

-- 가민 로그인 토큰 + 동기화 상태 (service role 전용, 브라우저에서 접근 불가)
create table if not exists public.garmin_sync_state (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  tokens             text,
  last_synced_date   date,
  last_run_at        timestamptz,
  last_error         text
);

-- RLS: 로그인한 본인 데이터만 읽기. 쓰기는 동기화 스크립트(service role)만.
alter table public.daily_metrics     enable row level security;
alter table public.activities        enable row level security;
alter table public.garmin_sync_state enable row level security;

drop policy if exists "read own daily_metrics" on public.daily_metrics;
create policy "read own daily_metrics" on public.daily_metrics
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "read own activities" on public.activities;
create policy "read own activities" on public.activities
  for select to authenticated using ((select auth.uid()) = user_id);

-- garmin_sync_state 에는 정책을 만들지 않음 → anon/authenticated 접근 차단.
-- 대시보드에 마지막 동기화 시각만 보여주기 위한 안전한 뷰
create or replace view public.my_sync_status
with (security_invoker = false) as
  select user_id, last_synced_date, last_run_at, last_error
  from public.garmin_sync_state
  where user_id = (select auth.uid());
grant select on public.my_sync_status to authenticated;
revoke all on public.my_sync_status from anon;
