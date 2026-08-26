-- ============================================================================
-- 사양서 검색 — 스키마가 실제로 막는지 진짜 PostgreSQL 에서 확인한다.
-- ⚠ 로컬 검증 전용 (10_common.local.sql 의 가드가 운영에서 실행을 막는다)
-- ============================================================================

\set ON_ERROR_STOP on

do $$ begin raise notice '── 1. 품번 형식 (6자리-5자리)'; end $$;

-- 이 회사 품번은 6-5 다. 12번 프로젝트(6-6)와 다르다.
select _assert_raises(
  $$insert into spec (part_no, kind, file) values ('123456-100001', 'spec', 'a.xlsx')$$,
  '6-6 품번은 거절된다');
select _assert_raises(
  $$insert into spec (part_no, kind, file) values ('42010-02540', 'spec', 'b.xlsx')$$,
  '앞이 5자리면 거절된다');
select _assert_raises(
  $$insert into spec (part_no, kind, file) values ('420108-0254', 'spec', 'c.xlsx')$$,
  '뒤가 4자리면 거절된다');
select _assert_raises(
  $$insert into spec (part_no, kind, file) values ('', 'spec', 'd.xlsx')$$,
  '빈 품번은 거절된다');

insert into spec (part_no, kind, file, sheet)
values ('420108-02540', 'spec', '420108-02540 HOSE,GAS.xlsx', '부품사양서');
select _assert(
  (select count(*) from spec where part_no = '420108-02540') = 1,
  '올바른 품번은 들어간다');


do $$ begin raise notice '── 2. 문서 종류'; end $$;

select _assert_raises(
  $$insert into spec (part_no, kind, file) values ('111111-11111', '사양서', 'e.xlsx')$$,
  '정해지지 않은 종류는 거절된다');

insert into spec (part_no, kind, file) values ('300644-00023', 'purchase', '구매목록.xlsx');
select _assert(
  (select kind from spec where file = '구매목록.xlsx') = 'purchase',
  '사양서가 아닌 문서도 색인에는 담긴다 (검색에서 걸러 낸다)');


do $$ begin raise notice '── 3. 한 파일은 한 줄'; end $$;

select _assert_raises(
  $$insert into spec (part_no, kind, file) values ('999999-99999', 'spec', '구매목록.xlsx')$$,
  '같은 파일을 두 번 넣을 수 없다');


do $$ begin raise notice '── 4. 품번을 어디서 읽었나'; end $$;

select _assert_raises(
  $$insert into spec (part_no, kind, file, part_no_source)
    values ('222222-22222', 'spec', 'f.xlsx', '아무거나')$$,
  '정해지지 않은 출처는 거절된다');

insert into spec (part_no, kind, file, part_no_source)
values ('101602-00312', 'spec', '101602-00312 BRUSH.xlsx', 'conflict');
select _assert(
  (select part_no_source from spec where file = '101602-00312 BRUSH.xlsx') = 'conflict',
  '어긋난 건은 conflict 로 남는다 — 조용히 한쪽을 고르지 않는다');


do $$ begin raise notice '── 5. 항목 상태 (filled / blank / missing)'; end $$;

select _assert_raises(
  $$insert into spec (part_no, kind, file, fields)
    values ('333333-33333', 'spec', 'g.xlsx',
            '{"name":{"value":"x","state":"있음"}}'::jsonb)$$,
  '정해지지 않은 상태는 거절된다');

-- 값이 있는데 missing 이라고 적히면 화면이 그 항목을 통째로 숨긴다
select _assert_raises(
  $$insert into spec (part_no, kind, file, fields)
    values ('444444-44444', 'spec', 'h.xlsx',
            '{"name":{"value":"HOSE","state":"missing"}}'::jsonb)$$,
  '값이 있는데 missing 이라고 적을 수 없다');

insert into spec (part_no, kind, file, fields)
values ('420103-00591', 'spec', '420103-00591 HOSE,FUEL.xlsx',
        '{"name":{"value":"HOSE,FUEL","state":"filled"},
          "material":{"value":"","state":"blank"},
          "origin":{"value":"","state":"missing"}}'::jsonb);
select _assert(
  (select fields->'material'->>'state' from spec where part_no = '420103-00591') = 'blank',
  'blank 는 blank 로 남는다');
select _assert(
  (select fields->'origin'->>'state' from spec where part_no = '420103-00591') = 'missing',
  'missing 은 missing 으로 남는다 — 둘을 뭉뚱그리지 않는다');


do $$ begin raise notice '── 6. 검색 기록에서 연락처를 지운다'; end $$;

insert into search_log (query, result) values ('홍길동 010-1234-5678', 'none');
select _assert_eq(
  (select query from search_log order by at desc limit 1),
  '홍길동 010-****-5678',
  '휴대전화 가운데 자리를 지운다 (REST 로 직접 넣어도)');

insert into search_log (query, result) values ('gildong.hong@example.com', 'none');
select _assert(
  (select query from search_log order by at desc limit 1) not like '%gildong.hong%',
  '이메일 아이디를 지운다');

insert into search_log (query, result) values ('01087654321 담당', 'none');
select _assert(
  (select query from search_log order by at desc limit 1) like '%010-****-4321%',
  '하이픈 없이 붙여 쓴 번호도 지운다');

insert into search_log (query, result) values ('산소호스', 'sheet');
select _assert_eq(
  (select query from search_log order by at desc limit 1),
  '산소호스',
  '보통 검색어는 건드리지 않는다');

select _assert_raises(
  $$insert into search_log (query, result) values ('  ', 'none')$$,
  '빈 검색어는 기록하지 않는다');
select _assert_raises(
  $$insert into search_log (query, result) values ('x', '찾음')$$,
  '정해지지 않은 결과값은 거절된다');


do $$ begin raise notice '── 7. 가입하면서 스스로 권한을 올릴 수 없다'; end $$;

select _assert(
  (select count(*) from pg_policies
    where tablename = 'app_user' and policyname = 'user_signup'
      and with_check like '%reader%' and with_check like '%대기%') = 1,
  '가입 정책이 role=reader, status=대기 를 못 박는다');

select _assert(
  (select count(*) from pg_policies
    where tablename = 'spec' and cmd = 'INSERT'
      and with_check like '%editor%') = 1,
  '색인 쓰기는 생산기술팀(editor)만');

select _assert(
  (select count(*) from pg_policies
    where tablename = 'search_log' and cmd in ('UPDATE', 'DELETE')) = 0,
  '검색 기록은 고치거나 지울 수 없다 (정책이 아예 없다)');

select _assert(
  (select count(*) from pg_tables
    where tablename in ('spec', 'search_log', 'app_user') and rowsecurity) = 3,
  '세 표 모두 RLS 가 켜져 있다');


do $$ begin raise notice '── 8. 승인 전 계정은 아무것도 못 한다'; end $$;

select _assert(
  (select prosrc from pg_proc where proname = 'my_role') like '%승인%',
  'my_role() 이 승인된 계정만 돌려준다');
