-- =========================================================
-- reset_for_launch.sql — 실제 배포 전에 한 번만: 계정만 남기고 게임 기록을 모두 지운다
--
-- 남는 것: 회원가입한 계정(auth.users), 반·동아리(profiles), 관리자 명단, 관리자 2단계 인증,
--          단어장과 단어, 지역·반·동아리·시설 종류 같은 기본 설정
-- 지우는 것: 단어 학습 기록(진도), 코인·에너지·탭·잠금(지갑), 코인 보낸 기록, 재난 기록과 순위 보너스,
--           탭 이상 표시, 단어 문제 기록, 건의 글과 공감, 시설 투표·건설 기록,
--           지역 대비율·기금·시설 단계(0으로), 보안 기록(새로 시작, 첫 줄에 "배포 초기화"를 남김)
--
-- 한 덩어리(트랜잭션)로 돈다. 중간에 오류가 나면 아무것도 지워지지 않는다.
-- 되돌릴 수 없으니, 필요하면 먼저 Supabase → Database → Backups 를 확인한다.
-- 01~08, 07 을 모두 돌린 뒤에 돌린다. 08(보안 기록)을 안 돌렸으면 보안 기록 부분은 건너뛴다.
-- =========================================================

begin;

-- 지우기 전에 몇 줄 있었는지 (결과 창에 보인다)
select 'before' as at,
  (select count(*) from auth.users)            as accounts,
  (select count(*) from public.words)          as words,
  (select count(*) from public.progress)       as progress,
  (select count(*) from public.players)        as players,
  (select count(*) from public.sends)          as sends,
  (select count(*) from public.suggestions)    as suggestions;

truncate table
  public.progress,
  public.players,
  public.sends,
  public.disasters,
  public.rank_bonus,
  public.flags,
  public.quiz_issues,
  public.answer_log,
  public.suggestion_votes,
  public.suggestions,
  public.infra_votes,
  public.infra_builds
  restart identity;

update public.regions      set shield = 0, fund = 0, updated_at = now();
update public.region_infra set level = 0;

-- 보안 기록: 배포 전 시험 기록을 비우고, 첫 줄에 초기화한 사실을 남긴다
do $$
begin
  if to_regclass('public.audit_log') is not null then
    alter table public.audit_log disable trigger audit_no_truncate;
    truncate table public.audit_log;
    alter table public.audit_log enable trigger audit_no_truncate;
    perform setval('public.audit_log_id_seq', 1, false);
    perform public.audit_write(null, 'launch_reset', jsonb_build_object('note', '실제 배포 전 초기화. 계정·단어장만 남김'));
  end if;
end $$;

commit;

-- 지운 뒤 (accounts, words 는 그대로, 나머지는 0 이어야 한다)
select 'after' as at,
  (select count(*) from auth.users)            as accounts,
  (select count(*) from public.words)          as words,
  (select count(*) from public.progress)       as progress,
  (select count(*) from public.players)        as players,
  (select count(*) from public.sends)          as sends,
  (select count(*) from public.suggestions)    as suggestions;

-- ---------------------------------------------------------
-- (선택) 단어장까지 모두 지우고 CSV 로 처음부터 다시 올리고 싶을 때만, 아래 두 줄의 -- 를 지우고 따로 실행:
-- truncate table public.progress, public.words, public.word_sets restart identity;
-- select count(*) from public.word_sets;
-- ---------------------------------------------------------
