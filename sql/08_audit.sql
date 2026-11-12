-- =========================================================
-- 08_audit.sql — 보안 기록(감사 로그): 사고가 났을 때 증거로 쓸 기록
--
-- 01~06 다음, 07 앞에 돌린다. (07 은 늘 마지막)
-- 몇 번을 돌려도 같은 상태가 된다. 기록은 지워지지 않는다.
--
-- 무엇을 남기나 (누가, 언제, 어느 IP·브라우저에서, 무엇을)
--   visit             하루 첫 접속 (my_state)
--   admin_call        관리자 함수를 썼다 (어떤 함수)
--   admin_denied      관리자가 아닌 사람, 또는 2단계 인증 없이 관리자 함수를 두드렸다  ← 공격 시도
--   admin_added / admin_removed   관리자 명단이 바뀌었다
--   lock / unlock     계정 잠김, 잠금 풀림(누가 풀었는지)
--   tap_flag          탭이 이상해 표시됨
--   quiz_pause        단어를 너무 빠르게 맞혀 코인이 쉬어 감
--   send              코인 보내기 (지역, 금액, 배수)
--   infra_vote / infra_build      시설 투표, 시설 지음
--   suggestion_post   건의 글 (글 내용까지. 나중에 지워져도 기록은 남는다)
--   suggestion_mod    건의 승인·숨김·답변
--   wordset_create / wordset_update / wordset_delete   단어장 바뀜
--   audit_purge       1년 지난 기록을 지움 (몇 줄, 마지막 해시)
--
-- 고칠 수 없게 (증거 능력)
--   1. 학생·비로그인 계정은 이 표를 읽지도 쓰지도 못한다. 쓰기는 아래 함수와 트리거만.
--   2. 고치기(UPDATE)·지우기(DELETE)·통째 비우기(TRUNCATE)는 트리거가 막는다.
--      예외는 audit_purge() 하나(1년 지난 것만, 지운 사실도 기록).
--   3. 줄마다 앞 줄의 해시를 이어 붙인 SHA-256 해시를 남긴다(해시 사슬).
--      중간 줄을 몰래 고치거나 빼면 audit_verify() 가 어디서 끊겼는지 알려 준다.
--   4. 계정이 지워져도 기록은 남는다(user_id 에 외래 키를 걸지 않고, 그때 이메일을 같이 적는다).
--
-- 보관 기간: 1년. (개인정보 안전성 확보조치 기준의 접속기록 1년 보관을 따른다)
--   1년 지난 기록 지우기: select public.audit_purge();   ← 관리자 계정(2단계 인증)이나 SQL Editor 에서
--   (Supabase → Integrations → Cron 에서 매일 돌게 해 두어도 된다)
--
-- 로그인 기록은 Supabase 가 따로 남긴다: auth.audit_log_entries (로그인·가입·비밀번호 변경, IP 포함)
-- =========================================================

create table if not exists public.audit_log (
  id         bigint primary key,
  at         timestamptz not null default now(),
  user_id    uuid,                 -- 한 사람(외래 키 없음: 계정이 지워져도 남게)
  email      text,                 -- 그때의 이메일
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  ip         text,
  user_agent text,
  prev_hash  text,
  hash       text not null
);
create sequence if not exists public.audit_log_id_seq owned by public.audit_log.id;
create index if not exists audit_log_at_idx     on public.audit_log (at);
create index if not exists audit_log_user_idx   on public.audit_log (user_id, action, at);
create index if not exists audit_log_action_idx on public.audit_log (action, at);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;

-- 고치기·지우기·비우기 막기
create or replace function public.audit_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and current_setting('app.audit_purge', true) = 'on' then return old; end if;
  raise exception '보안 기록은 고치거나 지울 수 없어요.' using errcode = '42501';
end;
$$;
drop trigger if exists audit_no_change on public.audit_log;
create trigger audit_no_change before update or delete on public.audit_log
  for each row execute function public.audit_guard();
drop trigger if exists audit_no_truncate on public.audit_log;
create trigger audit_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_guard();

-- 요청한 사람의 IP·브라우저
-- 브라우저가 Supabase 를 바로 부를 때: Cloudflare 가 붙인 cf-connecting-ip 등
-- 우리 서버 함수(/api/answer, /api/question)가 대신 부를 때: 그 함수가 붙인 x-client-ip
--   (x-client-ip 는 비밀 키로 부른 요청일 때만 믿는다. 학생이 꾸며 보낸 값은 무시)
create or replace function public.audit_client()
returns jsonb language plpgsql stable set search_path = public as $$
declare
  h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  r text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_setting('role', true));
  ip text; ua text;
begin
  if r = 'service_role' and h ? 'x-client-ip' then
    ip := h ->> 'x-client-ip'; ua := h ->> 'x-client-ua';
  else
    ip := coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''));
    ua := h ->> 'user-agent';
  end if;
  return jsonb_build_object('ip', left(ip, 64), 'ua', left(ua, 300));
end;
$$;

-- 기록 한 줄 쓰기 (해시 사슬)
create or replace function public.audit_write(p_user uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  c jsonb := public.audit_client();
  v_id bigint; v_at timestamptz := now(); v_prev text; v_email text; v_hash text;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  perform pg_advisory_xact_lock(hashtext('public.audit_log'));      -- 사슬이 엇갈리지 않게 한 줄씩
  select hash into v_prev from public.audit_log order by id desc limit 1;
  select email into v_email from auth.users where id = p_user;
  v_id := nextval('public.audit_log_id_seq');
  v_hash := encode(sha256(convert_to(concat_ws('|',
              coalesce(v_prev, ''), v_id, to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
              coalesce(p_user::text, ''), coalesce(v_email, ''), p_action, v_detail::text,
              coalesce(c ->> 'ip', ''), coalesce(c ->> 'ua', '')), 'UTF8')), 'hex');
  insert into public.audit_log (id, at, user_id, email, action, detail, ip, user_agent, prev_hash, hash)
  values (v_id, v_at, p_user, v_email, p_action, v_detail, c ->> 'ip', c ->> 'ua', v_prev, v_hash);
end;
$$;
revoke execute on function public.audit_write(uuid, text, jsonb) from public, anon, authenticated;

-- 하루 첫 접속 (my_state 가 부른다)
create or replace function public.audit_visit()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  if exists (select 1 from public.audit_log
              where user_id = v_uid and action = 'visit'
                and at >= (public.kst_today()::timestamp at time zone 'Asia/Seoul')) then return; end if;
  perform public.audit_write(v_uid, 'visit', '{}'::jsonb);
end;
$$;
revoke execute on function public.audit_visit() from public, anon, authenticated;

-- ---------- 표가 바뀔 때 자동으로 남기기 (트리거) ----------
create or replace function public.audit_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  case tg_table_name
  when 'sends' then
    perform public.audit_write(new.user_id, 'send', jsonb_build_object('region', new.region_id, 'amount', new.amount, 'mult', new.mult, 'class', new.class_id));
  when 'flags' then
    perform public.audit_write(new.user_id, 'tap_flag', jsonb_build_object('reason', new.reason, 'detail', new.detail));
  when 'players' then
    if old.locked_at is null and new.locked_at is not null then
      perform public.audit_write(new.user_id, 'lock', jsonb_build_object('reason', new.lock_reason));
    elsif old.locked_at is not null and new.locked_at is null then
      perform public.audit_write(new.user_id, 'unlock', jsonb_build_object('by', actor, 'by_email', (select email from auth.users where id = actor)));
    end if;
    if new.quiz_pause_until is distinct from old.quiz_pause_until and new.quiz_pause_until > now() then
      perform public.audit_write(new.user_id, 'quiz_pause', jsonb_build_object('until', new.quiz_pause_until));
    end if;
  when 'suggestions' then
    if tg_op = 'INSERT' then
      perform public.audit_write(new.user_id, 'suggestion_post', jsonb_build_object('id', new.id, 'body', new.body));
    else
      perform public.audit_write(actor, 'suggestion_mod', jsonb_build_object('id', new.id, 'hidden', new.hidden, 'approved', (to_jsonb(new) ->> 'approved_at') is not null, 'answer', new.answer));
    end if;
  when 'word_sets' then
    if tg_op = 'DELETE' then
      perform public.audit_write(actor, 'wordset_delete', jsonb_build_object('id', old.id, 'name', old.name));
    else
      perform public.audit_write(actor, case when tg_op = 'INSERT' then 'wordset_create' else 'wordset_update' end,
        jsonb_build_object('id', new.id, 'name', new.name, 'hidden', new.hidden, 'deleted_at', to_jsonb(new) -> 'deleted_at'));
    end if;
  when 'admins' then
    if tg_op = 'INSERT' then perform public.audit_write(new.user_id, 'admin_added', jsonb_build_object('by', actor));
    else perform public.audit_write(old.user_id, 'admin_removed', jsonb_build_object('by', actor)); end if;
  when 'infra_votes' then
    perform public.audit_write(new.user_id, 'infra_vote', jsonb_build_object('region', new.region_id, 'key', new.key));
  when 'infra_builds' then
    perform public.audit_write(actor, 'infra_build', jsonb_build_object('region', new.region_id, 'key', new.key, 'level', new.level, 'cost', new.cost));
  end case;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.audit_trg() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['sends', 'flags', 'infra_votes', 'infra_builds'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert on public.%1$I for each row execute function public.audit_trg()', t);
  end loop;
  drop trigger if exists audit_infra_votes_upd on public.infra_votes;
  create trigger audit_infra_votes_upd after update of key, region_id on public.infra_votes for each row execute function public.audit_trg();
  drop trigger if exists audit_players on public.players;
  create trigger audit_players after update of locked_at, quiz_pause_until on public.players for each row execute function public.audit_trg();
  drop trigger if exists audit_suggestions on public.suggestions;
  create trigger audit_suggestions after insert or update on public.suggestions for each row execute function public.audit_trg();
  drop trigger if exists audit_word_sets on public.word_sets;
  create trigger audit_word_sets after insert or update or delete on public.word_sets for each row execute function public.audit_trg();
  drop trigger if exists audit_admins on public.admins;
  create trigger audit_admins after insert or delete on public.admins for each row execute function public.audit_trg();
end $$;

-- ---------- 관리자가 보는 함수 ----------
-- 기록 찾기 (관리 화면 "보안 기록"). 찾아본 것도 admin_call 로 남는다.
-- 관리자도 학생이라, 이 화면에서는 학생 개인정보를 가린다(개인정보처리방침과 같게):
--   학생 이메일 → 계정 코드(계정마다 다른 8글자), IP → 앞 세 자리만(203.0.113.x), 건의 글쓴이는 아예 없음.
--   관리자끼리는 누가 무엇을 했는지 보이도록 관리자 이메일은 그대로.
-- 전체(이메일·전체 IP)는 운영 책임자가 SQL Editor 에서만 본다(아래 맨 끝 주석의 내보내기 SQL).
create or replace function public.audit_mask_ip(p_ip text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_ip is null then null
    when p_ip ~ '^\d+\.\d+\.\d+\.\d+$' then regexp_replace(p_ip, '\.\d+$', '.x')
    when p_ip like '%:%' then array_to_string((string_to_array(p_ip, ':'))[1:3], ':') || ':…'
    else '가림' end
$$;

drop function if exists public.admin_audit(timestamptz, timestamptz, text, integer);
create or replace function public.admin_audit(p_since timestamptz default now() - interval '7 days',
                                              p_until timestamptz default now(),
                                              p_query text default null, p_limit integer default 300)
returns table (id bigint, at timestamptz, who text, action text, detail jsonb, ip text, user_agent text, prev_hash text, hash text)
language plpgsql security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not public.admin_gate('admin_audit') then return; end if;
  return query
    with x as (
      select a.*, (a.user_id in (select ad.user_id from public.admins ad)) as is_adm,
             left(md5('hcu-audit:' || coalesce(a.user_id::text, '')), 8) as code
        from public.audit_log a
       where a.at between p_since and p_until)
    select x.id, x.at,
           case when x.user_id is null then null
                when x.action like 'suggestion_post' then '익명'
                when x.is_adm then x.email
                else '계정 ' || x.code end,
           x.action,
           x.detail - 'author',
           case when x.action = 'suggestion_post' then null when x.is_adm then x.ip else public.audit_mask_ip(x.ip) end,
           case when x.action = 'suggestion_post' then null else x.user_agent end, x.prev_hash, x.hash
      from x
     where q is null or x.action = q or x.code = q or x.code = replace(q, '계정 ', '')
        or (x.is_adm and x.email ilike '%' || q || '%')
        or public.audit_mask_ip(x.ip) like replace(q, '.x', '') || '%'
        or (x.action <> 'suggestion_post' and (x.detail - 'author')::text ilike '%' || q || '%')
     order by x.id desc
     limit least(greatest(coalesce(p_limit, 300), 1), 5000);
end;
$$;

-- 해시 사슬 검사: 고치거나 뺀 줄이 있으면 처음 끊긴 곳을 알려 준다
create or replace function public.audit_verify()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_prev text := null; v_first boolean := true; n bigint := 0; v_hash text;
begin
  -- SQL Editor(운영 책임자)에서는 바로, 화면에서는 관리자 + 2단계 인증일 때만
  if coalesce(current_setting('role', true), 'none') not in ('none', 'postgres', 'service_role') and not public.admin_gate('audit_verify') then
    return jsonb_build_object('error', '관리자만, 2단계 인증을 한 뒤에 할 수 있어요.');
  end if;
  for r in select * from public.audit_log order by id loop
    if not v_first and r.prev_hash is distinct from v_prev then
      return jsonb_build_object('ok', false, 'broken_at', r.id, 'checked', n, 'why', '앞 줄과 이어지지 않음(중간 줄이 빠졌거나 바뀜)');
    end if;
    v_hash := encode(sha256(convert_to(concat_ws('|',
                coalesce(r.prev_hash, ''), r.id, to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
                coalesce(r.user_id::text, ''), coalesce(r.email, ''), r.action, r.detail::text,
                coalesce(r.ip, ''), coalesce(r.user_agent, '')), 'UTF8')), 'hex');
    if v_hash <> r.hash then
      return jsonb_build_object('ok', false, 'broken_at', r.id, 'checked', n, 'why', '내용이 해시와 다름(이 줄이 바뀜)');
    end if;
    v_prev := r.hash; v_first := false; n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'checked', n, 'last_hash', v_prev);
end;
$$;

-- 1년 지난 기록 지우기 (지운 사실과 마지막 해시를 남긴다)
create or replace function public.audit_purge(p_keep interval default interval '1 year')
returns jsonb language plpgsql security definer set search_path = public as $$
declare n bigint; v_last text; v_role text := current_setting('role', true);
begin
  if coalesce(v_role, 'none') not in ('none', 'postgres', 'service_role') and not public.admin_gate('audit_purge') then
    return jsonb_build_object('error', '관리자만, 2단계 인증을 한 뒤에 할 수 있어요.');
  end if;
  if p_keep < interval '1 year' then raise exception '1년보다 짧게는 지울 수 없어요.'; end if;
  select hash into v_last from public.audit_log where at < now() - p_keep order by id desc limit 1;
  perform set_config('app.audit_purge', 'on', true);
  delete from public.audit_log where at < now() - p_keep;
  get diagnostics n = row_count;
  perform set_config('app.audit_purge', 'off', true);
  if n > 0 then perform public.audit_write(auth.uid(), 'audit_purge', jsonb_build_object('deleted', n, 'last_deleted_hash', v_last, 'keep', p_keep::text)); end if;
  return jsonb_build_object('deleted', n);
end;
$$;

revoke execute on function public.audit_mask_ip(text)                                   from public, anon;
revoke execute on function public.admin_audit(timestamptz, timestamptz, text, integer) from public, anon;
revoke execute on function public.audit_verify()                                         from public, anon;
revoke execute on function public.audit_purge(interval)                                  from public, anon;
grant  execute on function public.admin_audit(timestamptz, timestamptz, text, integer) to authenticated;
grant  execute on function public.audit_verify()                                         to authenticated;
grant  execute on function public.audit_purge(interval)                                  to authenticated;

-- =========================================================
-- 운영 책임자용: 사고가 났을 때 증거로 낼 전체 기록 내보내기 (SQL Editor 에서, 가리지 않은 원본)
--   select id, at, user_id, email, action, detail, ip, user_agent, prev_hash, hash
--     from public.audit_log
--    where at between '2026-11-01' and '2026-11-30'      -- 기간
--    order by id;
--   → 결과 오른쪽 위 "Download CSV". 내려받은 파일의 SHA-256 을 적어 두고 고치지 말고 보관한다.
--   무결성 확인: select public.audit_verify();   (SQL Editor 에서는 관리자 확인 없이 돈다)
-- 로그인 기록(IP 포함):
--   select created_at, ip_address, payload->>'action' as action, payload->>'actor_username' as email
--     from auth.audit_log_entries where created_at > now() - interval '30 days' order by created_at;
-- =========================================================
