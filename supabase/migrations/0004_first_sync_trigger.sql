-- Garmin Growth: 가민 연결 직후 첫 동기화를 즉시 시작하기 위한 호출 제한
-- 0003 적용 후 실행하세요.

alter table public.garmin_sync_state add column if not exists sync_requested_at timestamptz;

-- 첫 동기화 요청 허용 여부를 판단하고 기록한다.
--  - 토큰이 있고 아직 한 번도 동기화되지 않은 본인 행만 대상
--  - 10분 안에 이미 요청했다면 false (버튼 연타/도배 방지)
-- true 일 때만 서버가 GitHub Actions 를 즉시 실행한다.
create or replace function public.request_first_sync()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  n  integer;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  update public.garmin_sync_state
     set sync_requested_at = now()
   where user_id = me
     and tokens is not null
     and last_synced_date is null
     and (sync_requested_at is null or sync_requested_at < now() - interval '10 minutes');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.request_first_sync() from public, anon;
grant  execute on function public.request_first_sync() to authenticated;
