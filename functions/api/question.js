/* ==========================================================
   POST /api/question — 단어 문제 내기 (Cloudflare Pages Function)

   본문(JSON): { word_id, level }   level: 학생이 고른 단계 0~5, 없으면(null) 그 단어의 지금 단계
   머리:       Authorization: Bearer <로그인한 학생의 access token>

   ── 이 파일이 있는 이유 (단어 매크로 막기) ───────────────
   예전에는 브라우저가 단어의 유의어·반의어·예문까지 다 받아 와서 문제를 냈다.
   그러면 봇이 답을 그대로 읽어 넣을 수 있다. 이제는
     1. 서버가 비밀 키로 단어를 읽고(학생 계정은 그 열을 못 읽는다, sql/02_words.sql)
     2. 문제 유형을 서버가 정하고, 답을 뺀 문제만 보낸다
     3. 낸 시각·유형을 issue_question_srv 로 남긴다 → answer.js 가 그 유형의 답만 받는다
   ========================================================== */
import { typesForLevel, question, coinLevel } from "../../js/quiz-core.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
function authHeaders(key) { const h = { apikey: key }; if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`; return h; }
async function whoIs(env, token) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_KEY } });
  if (!res.ok) return null;
  return (await res.json())?.id ?? null;
}
async function rest(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: { ...authHeaders(env.SUPABASE_SERVICE_KEY), Accept: "application/json" } });
  if (!res.ok) throw new Error(`DB read ${res.status}`);
  return res.json();
}
const rnd = arr => arr[(crypto.getRandomValues(new Uint32Array(1))[0]) % arr.length];

export async function onRequestPost({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: "서버 설정이 끝나지 않았어요. 관리자에게 알려 주세요." }, 500);
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env.SUPABASE_URL)) return json({ error: "서버 설정이 이상해요. 관리자에게 알려 주세요." }, 500);
  env = { ...env, SUPABASE_URL: env.SUPABASE_URL.replace(/\/+$/, "") };

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "로그인이 필요해요." }, 401);
  const userId = await whoIs(env, token);
  if (!userId) return json({ error: "로그인이 만료됐어요. 새로고침해 주세요." }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: "요청을 읽지 못했어요." }, 400); }
  const wordId = Number(body?.word_id);
  if (!Number.isInteger(wordId) || wordId <= 0) return json({ error: "단어 번호가 이상해요." }, 400);
  const chosen = body?.level == null ? null : Number(body.level);
  if (chosen !== null && !(Number.isInteger(chosen) && chosen >= 0 && chosen <= 5)) return json({ error: "단계가 이상해요." }, 400);

  try {
    const [[w], [pr]] = await Promise.all([
      rest(env, `words?id=eq.${wordId}&select=id,word,senses,synonyms,antonyms,phrases,sentences,word_sets!inner(hidden,deleted_at)&word_sets.hidden=eq.false&word_sets.deleted_at=is.null`),
      rest(env, `progress?user_id=eq.${userId}&word_id=eq.${wordId}&select=srs_level`),
    ]);
    if (!w) return json({ error: "단어를 찾을 수 없어요." }, 404);
    const mine = pr?.srs_level ?? 0;
    const asked = chosen ?? mine;
    const types = typesForLevel(w, asked);
    if (!types.length) return json({ skip: true, error: "이 단어로는 낼 문제가 없어요." }, 422);
    const type = rnd(types);
    const q = question(w, type);
    // 답은 빼고 보낸다. 빈칸 문제는 빈칸 길이만.
    const out = { label: q.label, big: q.big ?? "", sub: q.sub ?? "", ask: q.ask, lang: q.lang };
    if (q.cloze) out.cloze = { before: q.cloze.before, after: q.cloze.after, len: q.cloze.answer.length };

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/issue_question_srv`, {
      method: "POST",
      headers: { ...authHeaders(env.SUPABASE_SERVICE_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ p_user: userId, p_word: wordId, p_type: type, p_level: asked }),
    });
    if (!res.ok) { console.error("issue_question_srv", res.status, await res.text()); return json({ error: "문제를 내지 못했어요. 잠시 뒤에 다시 해 주세요." }, 500); }
    return json({ type, level: asked, mine, pay: coinLevel(asked, type), q: out });
  } catch (e) {
    console.error("question", e);
    return json({ error: "문제 서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요." }, 502);
  }
}
