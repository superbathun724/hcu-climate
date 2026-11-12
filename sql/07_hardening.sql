-- =========================================================
-- 07_hardening.sql — Supabase Security Advisor 경고 정리
--
-- 01~06, 08 을 모두 돌린 다음 마지막에 돌린다.
-- 다른 파일 중 하나를 다시 돌렸으면 이 파일도 다시 돌린다
-- (create or replace function 이 아래 설정을 지우기 때문).
-- 몇 번을 돌려도 같은 상태가 된다.
--
-- 1. 내부 계산 함수 5개 (반 인원, 시설 단계, 지역 상한·피해·방어 보너스)
--    화면은 부르지 않고 다른 서버 함수 안에서만 쓴다.
--    → 학생·비로그인 계정의 실행 권한을 거둔다. (경고: anon/authenticated can execute)
-- 2. rls_auto_enable 은 Supabase 가 만든 함수다. 있으면 같은 식으로 거둔다.
-- 3. search_path 고정 (경고: Function Search Path Mutable)
--    우리가 만든 public 함수 가운데 search_path 가 정해지지 않은 것에 모두
--    "public, pg_temp" 를 정한다. 남이 같은 이름의 함수·표를 다른 스키마에
--    만들어 끼워 넣는 공격을 막는다.
--
-- 남는 경고는 일부러 그대로 둔다 (README 의 보안 절 참고):
--   - "Signed-In Users Can Execute SECURITY DEFINER Function":
--     학생이 부르는 게임 함수(탭, 보내기, 투표, 건의…)와 관리자 함수다.
--     표를 직접 못 고치게 하고 이 함수들로만 바꾸게 한 설계라 실행 권한이 필요하다.
--     관리자 함수는 안에서 require_admin()(관리자 + 2단계 인증)을 확인한다.
--   - "RLS Enabled No Policy"(INFO): 정책이 없으면 아무도 직접 못 읽는다는 뜻.
--     players, sends, suggestions 같은 표는 일부러 서버 함수로만 연다.
-- =========================================================

-- 1. 내부 계산 함수
revoke execute on function public.class_members(smallint)            from public, anon, authenticated;
revoke execute on function public.infra_level(smallint, text)        from public, anon, authenticated;
revoke execute on function public.region_cap(smallint)               from public, anon, authenticated;
revoke execute on function public.region_defense_bonus_pc(smallint)  from public, anon, authenticated;
revoke execute on function public.region_drain(smallint)             from public, anon, authenticated;

-- 2. Supabase 가 만든 rls_auto_enable (없거나 우리 것이 아니면 건너뛴다)
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    begin
      execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    exception when insufficient_privilege then
      raise notice 'rls_auto_enable: 권한이 없어 건너뜀 (Supabase 관리 함수)';
    end;
  end if;
end $$;

-- 3. search_path 고정: 지금 계정이 주인인 public 함수 가운데 정해지지 않은 것만
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public'
       and p.prokind = 'f'
       and p.proowner = (select oid from pg_roles where rolname = current_user)
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- 확장 함수는 빼고
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
    n := n + 1;
  end loop;
  raise notice 'search_path 를 정한 함수: %개', n;
end $$;
