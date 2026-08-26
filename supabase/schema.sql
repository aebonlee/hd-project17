-- 사양서 검색 — 테이블 · 제약 · 트리거 · RLS
--
-- 화면(js/logic.js)이 막는 것과 **같은 규칙**을 서버에서 한 번 더 막는다.
-- anon 키는 공개된 값이라, 브라우저를 거치지 않고 REST 를 직접 부르면
-- 화면 규칙은 전부 통과한다. 여기가 진짜 방어선이다.
--
-- Supabase SQL Editor 에 통째로 붙여 넣으면 된다. 여러 번 돌려도 안전하다.

-- ─────────────────────────────────────────── 계정
create table if not exists app_user (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,
  email       text not null unique,
  name        text not null,
  -- reader : 사내 이용자. 검색만 한다
  -- editor : 생산기술팀. 색인을 갱신한다
  -- admin  : 계정 승인
  role        text not null default 'reader'
              check (role in ('reader', 'editor', 'admin')),
  status      text not null default '대기'
              check (status in ('대기', '승인', '거절')),
  created_at  timestamptz not null default now()
);

-- 승인된 계정의 역할만 돌려준다. 승인 전이면 null → 아무것도 못 한다.
create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from app_user
   where auth_id = auth.uid() and status = '승인'
   limit 1
$$;

-- ─────────────────────────────────────────── 사양서 색인
create table if not exists spec (
  id             uuid primary key default gen_random_uuid(),

  -- 품번은 6자리-5자리다. 12번 프로젝트(6-6)와 다르므로 옮겨 쓰면 안 된다.
  part_no        text not null
                 check (part_no ~ '^[0-9]{6}-[0-9]{5}$'),

  -- 품번을 어디서 읽었나. 'conflict' 는 파일명과 내용이 어긋난 것으로,
  -- 사람이 확인해야 한다. 조용히 한쪽을 고르지 않기 위해 남긴다.
  part_no_source text not null default 'body'
                 check (part_no_source in ('body', 'filename', 'conflict', 'none')),

  -- 사양서가 아닌 문서도 색인에는 남긴다. 검색 결과로 내주지 않을 뿐이다.
  kind           text not null
                 check (kind in ('spec', 'desc', 'purchase', 'unknown', 'error')),

  file           text not null,
  sheet          text not null default '',

  -- 항목은 { "name": {"value":"...","state":"filled"}, ... } 로 담는다.
  -- 값과 함께 **상태**를 담는 것이 핵심이다. filled / blank / missing 을
  -- 뭉뚱그리면 사양서에 원래 없는 항목인지 담당자가 안 적은 것인지 알 수 없다.
  fields         jsonb not null default '{}'::jsonb,

  updated_at     timestamptz not null default now(),

  -- 한 파일은 한 줄이다. 같은 파일을 두 번 넣으면 갱신이지 추가가 아니다.
  unique (file)
);

create index if not exists spec_part_no_idx on spec (part_no);
create index if not exists spec_kind_idx    on spec (kind);

-- 항목 상태는 세 가지뿐이다. 화면의 fieldState 와 같은 값이어야 한다.
create or replace function spec_fields_valid(f jsonb) returns boolean
language sql immutable as $$
  select coalesce(bool_and(v->>'state' in ('filled', 'blank', 'missing')), true)
    from jsonb_each(f) as t(k, v)
$$;

alter table spec drop constraint if exists spec_fields_state;
alter table spec add constraint spec_fields_state
  check (spec_fields_valid(fields));

-- 값이 있는데 state 가 missing 이라고 적힌 줄을 막는다.
-- 이게 어긋나면 화면이 값을 가진 항목을 통째로 숨긴다.
create or replace function spec_fields_consistent(f jsonb) returns boolean
language sql immutable as $$
  select coalesce(bool_and(
           not (v->>'state' = 'missing' and coalesce(v->>'value', '') <> '')
         ), true)
    from jsonb_each(f) as t(k, v)
$$;

alter table spec drop constraint if exists spec_fields_sane;
alter table spec add constraint spec_fields_sane
  check (spec_fields_consistent(fields));

-- ─────────────────────────────────────────── 검색 기록
create table if not exists search_log (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  query      text not null check (length(trim(query)) > 0),
  result     text not null check (result in ('sheet', 'ask', 'none')),
  part_no    text default '',
  hits       int not null default 0 check (hits >= 0),
  user_id    uuid references app_user (id) on delete set null
);

create index if not exists search_log_at_idx on search_log (at desc);

-- 기록에 연락처를 남기지 않는다.
-- 화면(Logic.maskContact)에서도 가리지만, REST 로 직접 넣으면 그냥 들어온다.
-- 기록은 "무엇을 찾았나"를 보려는 것이지 번호를 모으려는 것이 아니다.
create or replace function mask_contact(t text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(coalesce(t, ''),
             '(01[016-9])[-. ]?([0-9]{3,4})[-. ]?([0-9]{4})', '\1-****-\3', 'g'),
           '([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@', '\1***@', 'g')
$$;

create or replace function search_log_mask() returns trigger
language plpgsql as $$
begin
  new.query := mask_contact(new.query);
  return new;
end $$;

drop trigger if exists search_log_mask_trg on search_log;
create trigger search_log_mask_trg
  before insert or update on search_log
  for each row execute function search_log_mask();

-- ─────────────────────────────────────────── RLS
alter table app_user   enable row level security;
alter table spec       enable row level security;
alter table search_log enable row level security;

-- 계정 --------------------------------------------------------------
drop policy if exists user_read on app_user;
create policy user_read on app_user for select
  using (auth_id = auth.uid() or my_role() = 'admin');

drop policy if exists user_signup on app_user;
create policy user_signup on app_user for insert
  with check (
    auth_id = auth.uid()
    -- 가입은 누구나 하지만 **스스로 권한을 정할 수는 없다.**
    -- 이 두 줄이 없으면 가입하면서 role='admin', status='승인' 을 적어 넣을 수 있다.
    and role = 'reader'
    and status = '대기'
  );

drop policy if exists user_admin on app_user;
create policy user_admin on app_user for update
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- 사양서 색인 --------------------------------------------------------
-- 읽기는 승인된 계정이면 누구나. 사양서는 사내에서 공유하라고 있는 것이다.
drop policy if exists spec_read on spec;
create policy spec_read on spec for select
  using (my_role() is not null);

-- 쓰기는 생산기술팀(editor)과 관리자만. 색인은 build_index.py 가 만든다.
drop policy if exists spec_write on spec;
create policy spec_write on spec for insert
  with check (my_role() in ('editor', 'admin'));

drop policy if exists spec_update on spec;
create policy spec_update on spec for update
  using (my_role() in ('editor', 'admin'))
  with check (my_role() in ('editor', 'admin'));

drop policy if exists spec_delete on spec;
create policy spec_delete on spec for delete
  using (my_role() in ('editor', 'admin'));

-- 검색 기록 ----------------------------------------------------------
-- 자기 기록은 자기가 본다. 생산기술팀은 전부 본다 —
-- 못 찾은 검색어 목록이 곧 등록해야 할 사양서 목록이기 때문이다.
drop policy if exists log_read on search_log;
create policy log_read on search_log for select
  using (
    my_role() in ('editor', 'admin')
    or user_id = (select id from app_user where auth_id = auth.uid())
  );

drop policy if exists log_write on search_log;
create policy log_write on search_log for insert
  with check (my_role() is not null);

-- 기록은 고치거나 지우지 않는다. 정책을 만들지 않으면 RLS 가 전부 막는다.

-- ─────────────────────────────────────────── 함수 권한
-- Supabase 는 새로 만든 함수마다 기본 권한으로 anon 에 EXECUTE 를 붙인다.
-- PUBLIC 에서만 회수하면 anon 이 남아, 로그인하지 않은 사람이 함수를 그대로 부를 수 있다.
-- my_role() 은 security definer 라 특히 그렇다.
do $grants$
declare v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname not like '\_assert%'
  loop
    execute format('revoke all on function %s from public', v_fn.sig);
    begin
      execute format('revoke all on function %s from anon', v_fn.sig);
    exception when undefined_object then null;  -- 로컬 검증 환경에는 anon 이 없을 수 있다
    end;
    begin
      execute format('grant execute on function %s to authenticated', v_fn.sig);
    exception when undefined_object then null;
    end;
  end loop;
end;
$grants$;
