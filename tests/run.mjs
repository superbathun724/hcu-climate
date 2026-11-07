/* ==========================================================
   tests/run.mjs — 순수 함수 검사. 실행: node tests/run.mjs  (Node 18 이상, 설치할 것 없음)
   서버(DB) 규칙은 여기서 못 본다. 화면과 서버가 같이 쓰는 js/quiz-core.js, 채점 규칙(grade.js),
   단어 CSV 읽기·쓰기(csv.js)만 본다. 코인·단계 규칙을 고치면 여기도 같이 고친다.
   ========================================================== */
import { typesForLevel, coinLevel, check, COINS, ENERGY } from "../js/quiz-core.js";
import { CASES } from "../js/cases.js";
import { checkMeaning } from "../js/grade.js";
import { rowsToWords, wordsToCSV } from "../js/csv.js";

let fail = 0, pass = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`✗ ${name}\n    받은 값: ${JSON.stringify(got)}\n    기대 값: ${JSON.stringify(want)}`);
};

/* ---- 문제 유형과 코인 ---- */
const bare = { word: "modest", senses: [{ pos: "형용사", meaning: "겸손한" }], synonyms: [], antonyms: [], phrases: [], sentences: [] };
const rich = { ...bare,
  synonyms: [{ word: "humble", meaning: "겸손한" }],
  phrases: [{ text: "a modest goal", meaning: "적당한 목표" }],
  sentences: [{ text: "She is modest about her success.", meaning: "그녀는 성공에 겸손하다." }] };

eq("자료 많은 단어 6단계는 뜻·철자 없음", typesForLevel(rich, 5).filter(t => t === "meaning" || t === "spelling"), []);
eq("자료 많은 단어 6단계 코인 8", COINS[coinLevel(5, typesForLevel(rich, 5)[0])], 8);
eq("자료 없는 단어 6단계는 철자로 대신", typesForLevel(bare, 5), ["spelling"]);
eq("대신 낸 철자 문제는 2코인(8코인 아님)", COINS[coinLevel(5, "spelling")], 2);
eq("3단계 자료 없으면 뜻 문제, 1코인", [typesForLevel(bare, 2)[0], COINS[coinLevel(2, "meaning")]], ["meaning", 1]);
eq("4단계 본래 유형(표현)은 4코인", COINS[coinLevel(3, "phrase")], 4);
eq("1단계 뜻 1코인", COINS[coinLevel(0, "meaning")], 1);
eq("빈 답은 오답", check(rich, "spelling", "  "), false);
eq("철자 정답", check(rich, "spelling", "Modest"), true);

eq("에너지 = 코인 × 5", ENERGY, [5, 10, 15, 20, 25, 40]);
eq("대신 낸 철자 문제 에너지 10", ENERGY[coinLevel(5, "spelling")], 10);

/* ---- 재난 사례: 8곳 모두 문장 두 줄과 https 출처 ---- */
eq("사례 8곳", Object.keys(CASES).map(Number), [1, 2, 3, 4, 5, 6, 7, 8]);
eq("사례마다 출처", Object.values(CASES).every(c => c.event && c.measure && c.src.length && c.src.every(([t, u]) => t && u.startsWith("https://"))), true);

/* ---- 뜻 채점 (voca-web grade.js 그대로) ---- */
const consider = { senses: [{ pos: "동사", meaning: "~을 고려하다" }] };
eq("뜻: 물결표 빼고 써도 정답", checkMeaning(consider, "고려하다"), true);
eq("뜻: 조사 붙여도 정답", checkMeaning(consider, "을 고려하다"), true);
eq("뜻: 어미가 다르면 오답(현재 규칙)", checkMeaning(consider, "고려한다"), false);

/* ---- CSV 내보냈다가 다시 읽으면 같다 ---- */
const src = `word,senses,notes,synonyms,antonyms,phrase1,phrase1_ko,sentence1,sentence1_ko
abandon,"v|버리다; 포기하다; n|방종",give up|v|포기하다,desert|버리다,keep|유지하다,abandon ship,배를 버리다,"He abandoned the plan, sadly.",그는 그 계획을 버렸다.
"=cmd",|뜻만,,,,,,,
`;
const a = rowsToWords(src);
eq("CSV 왕복", rowsToWords(wordsToCSV(a)), a);
eq("CSV 수식 막기", wordsToCSV(a).includes("'=cmd"), true);

console.log(`${pass}개 통과${fail ? `, ${fail}개 실패` : ""}`);
process.exit(fail ? 1 : 0);
