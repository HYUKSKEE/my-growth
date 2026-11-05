-- Garmin Growth: 웹에서 가민 연결 (MFA 2단계 중간 상태 보관 + 연결 해제)
-- 0002 적용 후 실행하세요.

-- MFA 코드를 기다리는 동안의 가민 SSO 세션 상태 (비밀번호는 포함되지 않지만 쿠키가 있으므로 비밀로 취급)
create table if not exists public.garmin_login_pending (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.garmin_login_pending enable row level security;
-- 정책 없음 → anon/authenticated 직접 접근 불가. 아래 RPC 로만 접근.

create or replace function public.save_mfa_state(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  insert into public.garmin_login_pending (user_id, state, created_at)
  values (me, p_state, now())
  on conflict (user_id) do update set state = excluded.state, created_at = now();
end;
$$;

-- 상태를 꺼낼 때 10분 지난 건 무효. 성공 후 재사용 방지를 위해 꺼내면서 삭제하지 않고,
-- 코드가 틀려 재시도할 수 있게 둔다(성공 시 clear_mfa_state 로 삭제).
create or replace function public.get_mfa_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  s  jsonb;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select state into s from public.garmin_login_pending
  where user_id = me and created_at > now() - interval '10 minutes';
  return s;
end;
$$;

create or replace function public.clear_mfa_state()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.garmin_login_pending where user_id = (select auth.uid());
end;
$$;

-- 가민 연결 해제: 토큰과 진행 중 로그인 상태 삭제 (수집된 운동 기록은 유지)
create or replace function public.disconnect_garmin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  update public.garmin_sync_state set tokens = null where user_id = me;
  delete from public.garmin_login_pending where user_id = me;
end;
$$;

revoke execute on function
  public.save_mfa_state(jsonb), public.get_mfa_state(), public.clear_mfa_state(), public.disconnect_garmin()
  from public, anon;
grant execute on function
  public.save_mfa_state(jsonb), public.get_mfa_state(), public.clear_mfa_state(), public.disconnect_garmin()
  to authenticated;

-- 새로 연결된 사용자가 처음 동기화되기 전인지 UI 에서 알 수 있도록 뷰는 last_synced_date 를 이미 노출함.
