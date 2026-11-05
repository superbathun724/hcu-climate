-- ==========================================================
-- 04_study.sql — 단어 공부 기록과 코인
--
-- 03_game.sql 다음에 실행. 몇 번을 돌려도 같은 상태가 됩니다.
--
-- 규칙 (복습 날짜를 기다리지 않는다. 고른 단어장을 언제든, 고른 단계로 공부한다)
--   p_level = 이번 문제의 단계(학생이 고른 단계, "내 단계대로"면 그 단어의 지금 단계)
--   - 맞히면: p_level 단계만큼 코인 (1·2·3·4·5·8)
--       p_level ≥ 지금 단계(도전) → p_level 의 다음 단계로 오른다(건너뛸 수 있다)
--       p_level < 지금 단계(복습) → 단계 그대로
--   - 틀리면: 복습(p_level ≤ 지금 단계)이면 1단계로, 도전(p_level > 지금 단계)이면 그대로
--   - 같은 단어는 하루(한국 날짜)에 한 번만 코인을 받고 단계가 바뀐다.
--     → 같은 단어를 반복해서 코인을 불리는 길을 막는다. 하루 한도는 없다.
--
-- 채점은 브라우저가 하지 않는다. functions/api/answer.js(Cloudflare)가 채점하고,
-- 비밀 키로 record_answer 를 부른다. 학생 계정은 record_answer 를 부를 수 없다.
-- ==========================================================

alter table public.progress add column if not exists last_correct_day date;

-- 단계별 코인 (js/quiz-core.js 의 COINS 와 같게)
create or replace function public.word_coins(p_level integer)
returns integer language sql immutable as $$
  select (array[1,2,3,4,5,8])[least(greatest(coalesce(p_level,0),0),5) + 1]
$$;

-- 예전 3칸짜리(단계 없이) 함수는 지운다. 남아 있으면 이름이 같은 함수가 둘이 된다.
drop function if exists public.record_answer(uuid, bigint, boolean);

create or replace function public.record_answer(p_user uuid, p_word bigint, p_correct boolean, p_level smallint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.kst_today();
  pr public.progress;
  v_before smallint;
  v_lv smallint;
  v_coins integer := 0;
  v_already boolean := false;
  v_balance numeric;
begin
  if not exists (select 1 from public.words w join public.word_sets s on s.id = w.set_id
                  where w.id = p_word and not s.hidden and s.deleted_at is null) then
    raise exception '단어를 찾을 수 없어요.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then
    raise exception '계정 정보를 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  perform public.assert_unlocked(p_user);            -- 잠긴 계정은 단어 코인도 없음 (03_game.sql)
  perform public.ensure_player(p_user);

  insert into public.progress (user_id, word_id) values (p_user, p_word) on conflict do nothing;
  select * into pr from public.progress where user_id = p_user and word_id = p_word for update;
  v_before := pr.srs_level;
  v_lv := least(greatest(coalesce(p_level, pr.srs_level), 0), 5);

  if p_correct then
    if pr.last_correct_day = v_today then
      v_already := true;                                  -- 오늘 이미 받음: 코인·단계 그대로
    else
      v_coins := public.word_coins(v_lv);
      if v_lv >= pr.srs_level then
        pr.srs_level := least(v_lv + 1, 5);               -- 도전 성공: 고른 단계의 다음으로
      end if;
      pr.last_correct_day := v_today;
    end if;
  else
    if v_lv <= pr.srs_level then pr.srs_level := 0; end if;   -- 복습에서 틀림
    pr.wrong_count := pr.wrong_count + 1;
  end if;

  update public.progress set
    srs_level        = pr.srs_level,
    last_correct_day = pr.last_correct_day,
    wrong_count      = pr.wrong_count,
    attempt_count    = attempt_count + 1,
    last_tested_at   = now()
  where user_id = p_user and word_id = p_word;

  update public.players
     set balance = balance + v_coins, earned_words = earned_words + v_coins
   where user_id = p_user
  returning balance into v_balance;

  return jsonb_build_object(
    'correct', p_correct, 'level_before', v_before, 'level', pr.srs_level, 'asked', v_lv,
    'coins', v_coins, 'already_today', v_already, 'balance', v_balance);
end;
$$;

-- 서버 함수(functions/api/answer.js)가 비밀 키로 단어와 단계를 읽는다.
-- 프로젝트를 "새 표 자동 공개 끔"으로 만들었기 때문에 service_role 에게도 따로 열어 줘야 한다.
grant select on public.words, public.word_sets, public.progress to service_role;

-- 서버 함수(비밀 키 = service_role)만 부를 수 있다.
revoke execute on function public.record_answer(uuid, bigint, boolean, smallint) from public, anon, authenticated;
grant  execute on function public.record_answer(uuid, bigint, boolean, smallint) to service_role;
