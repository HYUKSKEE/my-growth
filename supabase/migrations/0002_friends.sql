-- Garmin Growth: 다중 사용자 + 친구 공유
-- 0001 적용 후 Supabase SQL Editor에서 실행하세요.

-- ------------------------------------------------------------------ 프로필
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  -- 친구 추가용 초대 코드 (8자리 대문자/숫자)
  invite_code  text not null unique
               default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_at   timestamptz not null default now()
);

-- 가입하면 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 가입한 사용자(기존 본인 계정) 프로필 보충
insert into public.profiles (user_id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict do nothing;

-- ------------------------------------------------------------------ 친구 관계
create table if not exists public.friendships (
  id            bigint generated always as identity primary key,
  requester_id  uuid not null references auth.users(id) on delete cascade,
  addressee_id  uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- (A,B) 와 (B,A) 를 같은 쌍으로 취급
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- RLS 정책에서 쓰는 헬퍼 (security definer 로 friendships RLS 재귀 방지)
create or replace function public.is_friend_of(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = other)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = other))
  );
$$;

-- 친구 신청이 걸려 있는 상대(수락 전 포함)의 이름은 볼 수 있어야 함
create or replace function public.has_friendship_with(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where (f.requester_id = (select auth.uid()) and f.addressee_id = other)
       or (f.addressee_id = (select auth.uid()) and f.requester_id = other)
  );
$$;

revoke execute on function public.is_friend_of(uuid), public.has_friendship_with(uuid) from public, anon;
grant  execute on function public.is_friend_of(uuid), public.has_friendship_with(uuid) to authenticated;

alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "read own or related profiles" on public.profiles;
create policy "read own or related profiles" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_friendship_with(user_id));

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- 초대 코드는 바꿀 수 없고 표시 이름만 수정 가능
revoke update on public.profiles from authenticated;
grant  update (display_name) on public.profiles to authenticated;

drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- 수락은 받은 사람만 (status 컬럼만 변경 가능)
drop policy if exists "addressee accepts" on public.friendships;
create policy "addressee accepts" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) and status = 'accepted');
revoke update on public.friendships from authenticated;
grant  update (status) on public.friendships to authenticated;

-- 거절/취소/친구 끊기는 양쪽 모두 가능
drop policy if exists "either party deletes" on public.friendships;
create policy "either party deletes" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- INSERT 정책 없음 → 신청은 아래 RPC 로만 가능

-- ------------------------------------------------------------------ RPC
-- 초대 코드로 친구 신청. 상대가 이미 나에게 신청한 상태면 바로 수락 처리.
create or replace function public.send_friend_request(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := (select auth.uid());
  target public.profiles;
  fs     public.friendships;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select * into target from public.profiles where invite_code = upper(trim(p_code));
  if not found then
    raise exception '초대 코드를 찾을 수 없습니다.';
  end if;
  if target.user_id = me then
    raise exception '내 초대 코드입니다.';
  end if;

  select * into fs from public.friendships
  where (requester_id = me and addressee_id = target.user_id)
     or (requester_id = target.user_id and addressee_id = me);

  if found then
    if fs.status = 'accepted' then
      raise exception '이미 친구입니다.';
    elsif fs.requester_id = me then
      raise exception '이미 신청했습니다. 상대가 수락하면 연결됩니다.';
    else
      update public.friendships set status = 'accepted' where id = fs.id;
      return target.display_name;
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, target.user_id);
  return target.display_name;
end;
$$;

-- 로컬 CLI(`python sync.py login`)가 본인 가민 토큰을 저장하는 함수.
-- service role 키 없이 본인 로그인 세션만으로 본인 행만 쓸 수 있음.
create or replace function public.set_garmin_tokens(p_tokens text)
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
  insert into public.garmin_sync_state (user_id, tokens, last_error)
  values (me, p_tokens, null)
  on conflict (user_id) do update set tokens = excluded.tokens, last_error = null;
end;
$$;

revoke execute on function public.send_friend_request(text), public.set_garmin_tokens(text) from public, anon;
grant  execute on function public.send_friend_request(text), public.set_garmin_tokens(text) to authenticated;

-- ------------------------------------------------------------------ 친구 데이터 읽기 허용
drop policy if exists "read own daily_metrics" on public.daily_metrics;
drop policy if exists "read own or friends daily_metrics" on public.daily_metrics;
create policy "read own or friends daily_metrics" on public.daily_metrics
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend_of(user_id));

drop policy if exists "read own activities" on public.activities;
drop policy if exists "read own or friends activities" on public.activities;
create policy "read own or friends activities" on public.activities
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend_of(user_id));

-- 동기화 상태 뷰: 본인 + 친구. 토큰은 노출하지 않고 연결 여부만 보여줌.
create or replace view public.my_sync_status
with (security_invoker = false) as
  select user_id, last_synced_date, last_run_at, last_error, (tokens is not null) as connected
  from public.garmin_sync_state
  where user_id = (select auth.uid()) or public.is_friend_of(user_id);
grant select on public.my_sync_status to authenticated;
revoke all on public.my_sync_status from anon;
