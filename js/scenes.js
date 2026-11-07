/* ==========================================================
   scenes.js — 게임 배경: 반마다 돕는 지역의 풍경 8종
   (un-summit 의 SCENES 방식: 하늘·먼 산·땅·전경을 지역마다 다르게, SVG 로 직접 그림)
   실제 풍경 사진(모잠비크 이냠바네 다우선, 팔라완 석회암 섬, 피지 산호초 라군, 안나푸르나 산골 마을,
   신드 흙집 마을, 몰디브 수상 가옥, 방글라데시 강 마을, 바누아투 야수르 화산)을 보고 분위기를 맞췄다.

   규칙 (un-summit 과 같다)
     - 지형·기후·공공 구조물만 그린다. 국기·국경·종교 상징·특정 건물을 그대로 본뜬 모양은 넣지 않는다.
     - 아래쪽 방파제(해안) / 제방(강) 높이 = 그 지역의 실제 대비율.
       대비율이 오를수록 위험(폭풍·홍수) 그림이 옅어진다. 그 계산은 game.js.
   viewBox 0 0 420 300, 아래를 기준으로 맞춘다(xMidYMax slice). 중요한 것은 y 60~300 안에 둔다.
   한 번에 한 지역만 그리므로 그라데이션 id 는 지역끼리 겹쳐도 된다.
   ========================================================== */

const R = (x, y, w, h, f, a = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${a}/>`;
const P = (d, f, a = "") => `<path d="${d}" fill="${f}"${a}/>`;
const C = (x, y, r, f, a = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"${a}/>`;
const E = (x, y, rx, ry, f, a = "") => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}"${a}/>`;
const L = (d, c, w = 1.5, a = "") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}"${a}/>`;
const f1 = n => Math.round(n * 10) / 10;

/* 같은 그림이 매번 나오도록 정해진 씨앗으로 뽑는 난수 */
const rnd = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---- 그라데이션 ---- */
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ""}/>`).join("");
const vg = (id, y1, y2, s) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}">${stops(s)}</linearGradient>`;
const hg = (id, s) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops(s)}</linearGradient>`;
const rg = (id, s) => `<radialGradient id="${id}">${stops(s)}</radialGradient>`;

/* ---- 하늘·해·구름·물 ---- */
const sky = (top, mid, bot, h) => `${vg("sky", 0, h, [[0, top], [.6, mid], [1, bot]])}`;
const skyRect = h => R(-200, -200, 820, h + 210, "url(#sky)");
const sun = (x, y, r, core, glow) =>
  `${rg("sunG", [[0, glow, .9], [.35, glow, .35], [1, glow, 0]])}${C(x, y, r * 5, "url(#sunG)")}${C(x, y, r, core)}`;
const cloud = (x, y, s = 1, f = "#fff", o = .9, shade = "#d9e4ee") => `<g opacity="${o}">
  ${E(x, y, 30 * s, 8 * s, f)}${C(x - 15 * s, y - 4 * s, 10 * s, f)}${C(x - 2 * s, y - 10 * s, 14 * s, f)}${C(x + 14 * s, y - 6 * s, 11 * s, f)}${C(x + 25 * s, y - 1 * s, 7 * s, f)}
  ${E(x + 2 * s, y + 4 * s, 28 * s, 4 * s, shade, ' opacity=".7"')}</g>`;
const streak = (x, y, w, f, o = .5) => E(x, y, w, w * .06 + 1.2, f, ` opacity="${o}"`);
/* 물 표면의 반짝임: y0~y1 사이 짧은 가로선 n개. 아래로 갈수록 길어진다(가까우니까) */
const glints = (y0, y1, n, c, seed, o = .55) => {
  const r = rnd(seed); let s = "";
  for (let i = 0; i < n; i++) {
    const y = y0 + (y1 - y0) * Math.pow(r(), .8), k = (y - y0) / (y1 - y0 || 1);
    const x = -60 + r() * 540, w = 4 + k * 22 * (.5 + r());
    s += `M${f1(x)} ${f1(y)}h${f1(w)}`;
  }
  return L(s, c, 1, ` stroke-linecap="round" opacity="${o}"`);
};
const water = (y, top, bot, seed, glint = "#fff") =>
  `${vg("wat", y, 300, [[0, top], [1, bot]])}${R(-200, y, 820, 330 - y, "url(#wat)")}${glints(y + 3, 290, 46, glint, seed)}`;

/* 산·언덕 능선: base 를 중심으로 amp 만큼 오르내림. jag 가 크면 뾰족하다 */
const ridge = (base, amp, seed, f, jag = .25, step = 7, a = "") => {
  const r = rnd(seed), p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
  let d = `M-130 330 L-130 ${base}`;
  for (let x = -130; x <= 550; x += step) {
    const y = base - amp * (.55 * Math.sin(x / 61 + p1) + .3 * Math.sin(x / 27 + p2) + .15 * Math.sin(x / 11 + p3) + jag * (r() - .5));
    d += ` L${x} ${f1(y)}`;
  }
  return P(d + " L550 330z", f, a);
};

/* ---- 나무 ---- */
const qpt = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
const leaf = (x, y, deg, len, f, wid = .2) => {
  const a = deg * Math.PI / 180, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len * .55 + len * .32;
  const cx = x + Math.cos(a) * len * .55, cy = y + Math.sin(a) * len * .55 - len * .12;
  return P(`M${f1(x)} ${f1(y)} Q${f1(cx)} ${f1(cy - len * wid)} ${f1(ex)} ${f1(ey)} Q${f1(cx)} ${f1(cy + len * wid * .4)} ${f1(x)} ${f1(y)}z`, f);
};
/* 야자: 휘어진 줄기(마디 무늬), 잎 8장, 열매 */
const palm = (x, y, h = 46, lean = 6, s = 1, dark = "#2a6b37", light = "#3f9a4c", trunk = "#8a6a46") => {
  const tx = x + lean, ty = y - h, mx = x + lean * .15, my = y - h * .55;
  let rings = "";
  for (let t = .12; t < .95; t += .11) rings += `M${f1(qpt(x, mx, tx, t) - 2 * s)} ${f1(qpt(y, my, ty, t))}h${f1(4 * s)}`;
  const len = 26 * s;
  return `<g>${P(`M${x - 2.6 * s} ${y} Q${mx - 1.8 * s} ${my} ${tx - 1.1 * s} ${ty} L${tx + 1.1 * s} ${ty} Q${mx + 1.8 * s} ${my} ${x + 2.6 * s} ${y}z`, trunk)}
    ${L(rings, "#5f4630", .9 * s, ' opacity=".7"')}
    ${[200, 160, 20, 340].map(d => leaf(tx, ty, d, len * .95, dark)).join("")}
    ${[225, 250, 290, 315].map(d => leaf(tx, ty, d, len, light)).join("")}
    ${C(tx - 1.5 * s, ty + 2 * s, 2 * s, "#6b4a22")}${C(tx + 1.8 * s, ty + 2.4 * s, 1.9 * s, "#7a5428")}</g>`;
};
/* 둥근 숲 덩어리 (빛 받는 쪽이 밝다) */
const bush = (x, y, r, dark, light) => `${C(x, y, r, dark)}${C(x - r * .25, y - r * .3, r * .7, light)}`;
const canopy = (x, y, w, h, seed, dark, mid, light) => {
  const rr = rnd(seed); let s = "";
  for (let i = 0; i < 9; i++) { const px = x + (rr() - .5) * w, py = y + (rr() - .3) * h * .5, r = h * (.35 + rr() * .3); s += C(f1(px), f1(py), f1(r), dark); }
  for (let i = 0; i < 7; i++) { const px = x + (rr() - .55) * w * .9, py = y - h * .15 + (rr() - .5) * h * .4, r = h * (.25 + rr() * .2); s += C(f1(px), f1(py), f1(r), mid); }
  for (let i = 0; i < 5; i++) { const px = x - w * .15 + (rr() - .5) * w * .6, py = y - h * .3 + (rr() - .5) * h * .3, r = h * (.12 + rr() * .12); s += C(f1(px), f1(py), f1(r), light); }
  return s;
};
const grass = (y0, y1, n, c, seed, o = .6) => {
  const r = rnd(seed); let d = "";
  for (let i = 0; i < n; i++) { const x = -40 + r() * 500, y = y0 + r() * (y1 - y0), h = 2 + r() * 4; d += `M${f1(x)} ${f1(y)}l-1.2 ${f1(-h)}M${f1(x)} ${f1(y)}l1.4 ${f1(-h * .8)}`; }
  return L(d, c, .8, ` opacity="${o}"`);
};

/* ---- 집 ---- */
/* 둥근 흙벽 + 원뿔 초가 (모잠비크) */
const hutRound = (x, y, s = 1) => {
  const w = 12 * s, wh = 12 * s, rh = 18 * s;
  let thatch = "";
  for (let i = -3; i <= 3; i++) thatch += `M${f1(x + i * 1.2 * s)} ${f1(y - wh - rh + 2 * s)}L${f1(x + i * 4.6 * s)} ${f1(y - wh + 2 * s)}`;
  return `<g>${E(x, y, w + 4 * s, 2.4 * s, "#000", ' opacity=".15"')}
    ${P(`M${x - w} ${y - wh} V${y} Q${x} ${y + 3 * s} ${x + w} ${y} V${y - wh}z`, "url(#mud)")}
    ${R(x - 2.8 * s, y - 8 * s, 5.6 * s, 8.5 * s, "#4a3420", ` rx="${2.8 * s}"`)}
    ${P(`M${x - w - 4 * s} ${y - wh + 2 * s} Q${x} ${y - wh + 5 * s} ${x + w + 4 * s} ${y - wh + 2 * s} L${x + 1 * s} ${y - wh - rh} L${x - 1 * s} ${y - wh - rh}z`, "url(#thatch)")}
    ${L(thatch, "#6e5326", .7, ' opacity=".55"')}</g>`;
};
/* 가파른 초가 지붕 오두막 (피지 부레, 바누아투) */
const bure = (x, y, s = 1, wall = "#cdb084") => {
  const w = 13 * s;
  let t = "";
  for (let i = -4; i <= 4; i++) t += `M${f1(x + i * .8 * s)} ${f1(y - 34 * s)}L${f1(x + i * 4.2 * s)} ${f1(y - 9 * s)}`;
  return `<g>${E(x, y + 1, w + 6 * s, 2.4 * s, "#000", ' opacity=".14"')}
    ${R(x - w, y - 11 * s, w * 2, 11 * s, wall)}${R(x + w * .2, y - 11 * s, w * .8, 11 * s, "#000", ' opacity=".12"')}
    ${R(x - 3 * s, y - 8 * s, 6 * s, 8 * s, "#3e2c1a")}
    ${P(`M${x - w - 5 * s} ${y - 9 * s} L${x - 2 * s} ${y - 36 * s} L${x + 2 * s} ${y - 36 * s} L${x + w + 5 * s} ${y - 9 * s} Q${x} ${y - 6 * s} ${x - w - 5 * s} ${y - 9 * s}z`, "url(#thatch)")}
    ${L(t, "#6a4e22", .7, ' opacity=".5"')}${L(`M${x - 3 * s} ${y - 37 * s} H${x + 3 * s}`, "#5a3f1c", 2 * s)}</g>`;
};
/* 물 위 기둥집, 니파 지붕 (필리핀) */
const stiltHut = (x, y, s = 1) => `<g>
  ${[-11, -4, 4, 11].map(dx => R(x + dx * s, y - 6 * s, 1.6 * s, 22 * s, "#5b4128")).join("")}
  ${R(x - 15 * s, y - 7 * s, 30 * s, 2.4 * s, "#7a5a36")}
  ${R(x - 12 * s, y - 20 * s, 24 * s, 13 * s, "#d8bf8a")}
  ${L(`M${x - 12 * s} ${y - 16 * s}h${24 * s}M${x - 12 * s} ${y - 12 * s}h${24 * s}`, "#b49867", .7)}
  ${R(x + 4 * s, y - 17 * s, 5 * s, 5 * s, "#4a3420")}
  ${P(`M${x - 17 * s} ${y - 19 * s} L${x - 8 * s} ${y - 31 * s} H${x + 8 * s} L${x + 17 * s} ${y - 19 * s}z`, "url(#thatch)")}</g>`;
/* 흰 돌벽 + 슬레이트 지붕 (네팔 산마을) */
const stoneHouse = (x, y, s = 1, roof = "#55708a") => `<g>
  ${R(x - 10 * s, y - 12 * s, 20 * s, 12 * s, "#EEE6D8")}${R(x + 4 * s, y - 12 * s, 6 * s, 12 * s, "#C9BFAE")}
  ${R(x - 7 * s, y - 9 * s, 3.2 * s, 3.6 * s, "#5a3a24")}${R(x - 1 * s, y - 9 * s, 3.2 * s, 3.6 * s, "#5a3a24")}
  ${P(`M${x - 12 * s} ${y - 11 * s} L${x - 4 * s} ${y - 19 * s} H${x + 6 * s} L${x + 12 * s} ${y - 11 * s}z`, roof)}
  ${P(`M${x + 6 * s} ${y - 19 * s} L${x + 12 * s} ${y - 11 * s} H${x + 4 * s}z`, "#000", ' opacity=".18"')}</g>`;
/* 흙벽돌 평지붕 집, 옆면이 보이게 (파키스탄) */
const mudBox = (x, y, w, h, s = 1) => `<g>
  ${E(x + w / 2 + 6, y + 1, w * .7, 2.5, "#000", ' opacity=".12"')}
  ${R(x, y - h, w, h, "#C99D66")}${P(`M${x + w} ${y - h} l${8 * s} ${-4 * s} v${h} l${-8 * s} ${4 * s}z`, "#A47A48")}
  ${P(`M${x} ${y - h} l${8 * s} ${-4 * s} h${w} l${-8 * s} ${4 * s}z`, "#DDBA86")}
  ${R(x - 1, y - h - 2.4, w + 2, 2.6, "#B88A55")}
  ${R(x + w * .38, y - h * .62, w * .2, h * .62, "#5a3d22")}${R(x + w * .1, y - h * .7, w * .14, h * .2, "#6b4a2a")}</g>`;
/* 흙단 위 함석지붕 집 (방글라데시) */
const tinHouse = (x, y, s = 1) => {
  let rib = ""; for (let i = 0; i < 9; i++) rib += `M${f1(x - 13 * s + i * 3.2 * s)} ${f1(y - 25 * s + i * .1)}L${f1(x - 16 * s + i * 3.6 * s)} ${f1(y - 15 * s)}`;
  return `<g>${R(x - 12 * s, y - 15 * s, 24 * s, 15 * s, "#C7AE86")}${R(x + 3 * s, y - 15 * s, 9 * s, 15 * s, "#000", ' opacity=".12"')}
  ${R(x - 4 * s, y - 10 * s, 6 * s, 10 * s, "#4d3b28")}
  ${P(`M${x - 16 * s} ${y - 15 * s} L${x - 12 * s} ${y - 25 * s} H${x + 12 * s} L${x + 16 * s} ${y - 15 * s}z`, "url(#tin)")}
  ${L(rib, "#7e8a90", .6, ' opacity=".7"')}</g>`;
};
/* 물 위 빌라 (몰디브) */
const waterVilla = (x, y, s = 1) => `<g>
  ${E(x, y + 9 * s, 18 * s, 2 * s, "#0b5f86", ' opacity=".35"')}
  ${[-12, -5, 5, 12].map(dx => R(x + dx * s, y - 2 * s, 1.4 * s, 11 * s, "#6b4f2d")).join("")}
  ${R(x - 16 * s, y - 3 * s, 32 * s, 2.2 * s, "#9a7448")}
  ${R(x - 11 * s, y - 13 * s, 22 * s, 10 * s, "#F3EBDC")}${R(x - 7 * s, y - 11 * s, 8 * s, 7 * s, "#7FB9C9")}
  ${P(`M${x - 15 * s} ${y - 12 * s} Q${x} ${y - 30 * s} ${x + 15 * s} ${y - 12 * s}z`, "url(#thatch)")}</g>`;

/* ---- 배 ---- */
/* 다우선: 큰 삼각돛 (모잠비크) */
const dhow = (x, y, s = 1) => `<g class="drift">
  ${P(`M${x - 26 * s} ${y - 4 * s} Q${x} ${y + 8 * s} ${x + 28 * s} ${y - 6 * s} L${x + 22 * s} ${y + 2 * s} Q${x} ${y + 9 * s} ${x - 20 * s} ${y + 2 * s}z`, "#6e3f1c")}
  ${L(`M${x - 24 * s} ${y - 2 * s} Q${x} ${y + 7 * s} ${x + 26 * s} ${y - 4 * s}`, "#c99b5e", 1.2 * s)}
  ${L(`M${x - 2 * s} ${y + 1 * s} L${x + 2 * s} ${y - 42 * s}`, "#4a3018", 1.6 * s)}
  ${P(`M${x - 22 * s} ${y - 8 * s} L${x + 12 * s} ${y - 52 * s} Q${x + 14 * s} ${y - 26 * s} ${x + 6 * s} ${y - 4 * s}z`, "url(#sail)")}
  ${L(`M${x - 22 * s} ${y - 8 * s} L${x + 12 * s} ${y - 52 * s}`, "#5a3c1e", 1.1 * s)}
  ${E(x, y + 6 * s, 28 * s, 2 * s, "#0e4f6e", ' opacity=".3"')}</g>`;
/* 방카: 흰 배, 대나무 아우트리거 (필리핀) — 바누아투 카누도 같은 틀 */
const outrigger = (x, y, s = 1, hull = "#F2EFE6", stripe = "#2D6FB0") => `<g class="bob">
  ${L(`M${x - 34 * s} ${y + 3 * s} H${x + 34 * s}`, "#d9cba5", 1.6 * s)}
  ${L(`M${x - 18 * s} ${y - 3 * s} L${x - 26 * s} ${y + 3 * s} M${x + 18 * s} ${y - 3 * s} L${x + 26 * s} ${y + 3 * s}`, "#b8a57a", 1.3 * s)}
  ${P(`M${x - 28 * s} ${y - 7 * s} Q${x} ${y + 6 * s} ${x + 30 * s} ${y - 8 * s} L${x + 22 * s} ${y + 1 * s} Q${x} ${y + 6 * s} ${x - 21 * s} ${y + 1 * s}z`, hull)}
  ${L(`M${x - 25 * s} ${y - 3 * s} Q${x} ${y + 5 * s} ${x + 27 * s} ${y - 4 * s}`, stripe, 1.6 * s)}
  ${R(x - 10 * s, y - 13 * s, 18 * s, 2 * s, "#C9473A")}${L(`M${x - 8 * s} ${y - 11 * s} V${y - 2 * s} M${x + 6 * s} ${y - 11 * s} V${y - 2 * s}`, "#7a5a36", 1)}
  ${E(x, y + 6 * s, 34 * s, 2 * s, "#0b4f72", ' opacity=".28"')}</g>`;
/* 노우카: 양끝이 높이 휜 나무배와 대나무 지붕 (방글라데시) */
const nouka = (x, y, s = 1) => `<g class="bob">
  ${P(`M${x - 34 * s} ${y - 14 * s} Q${x - 28 * s} ${y + 4 * s} ${x} ${y + 4 * s} Q${x + 28 * s} ${y + 4 * s} ${x + 34 * s} ${y - 14 * s} Q${x + 24 * s} ${y - 2 * s} ${x} ${y - 2 * s} Q${x - 24 * s} ${y - 2 * s} ${x - 34 * s} ${y - 14 * s}z`, "#3d2f22")}
  ${P(`M${x - 12 * s} ${y - 3 * s} Q${x} ${y - 16 * s} ${x + 12 * s} ${y - 3 * s}z`, "#B48C52")}
  ${L(`M${x - 10 * s} ${y - 5 * s} Q${x} ${y - 14 * s} ${x + 10 * s} ${y - 5 * s}`, "#8a6a3a", .8)}
  ${E(x, y + 6 * s, 32 * s, 2 * s, "#2e4a46", ' opacity=".3"')}</g>`;

/* 흙·초가·함석·돛 그라데이션 (집·배가 공통으로 씀) */
const kit = `${hg("mud", [[0, "#D8B27C"], [.6, "#C59A62"], [1, "#9C7344"]])}
  ${vg("thatch", 120, 210, [[0, "#C9A35E"], [1, "#8D6A32"]])}
  ${hg("tin", [[0, "#B9C3C8"], [.5, "#8E9AA0"], [1, "#6E7A80"]])}
  ${hg("sail", [[0, "#FBF5E8"], [1, "#E2D6BE"]])}`;
const defs = s => `<defs>${kit}${s}</defs>`;

/* ---- 지역 8곳 ----
   sky: [위, 아래] (SVG 를 못 그릴 때만 보이는 바탕) / water / hazard: storm | flood | sea / wall: seawall | levee */
export const SCENES = {
  /* 1 모잠비크 — 해 질 녘 사바나 해안, 바오바브, 둥근 초가 마을, 다우선 */
  1: {
    sky: ["#F0A964", "#FCE6C4"], water: "#2A8FB0", hazard: "storm", wall: "seawall",
    art: () => {
      const baobab = (x, y, s) => `<g>
        ${P(`M${x - 9 * s} ${y} Q${x - 12 * s} ${y - 22 * s} ${x - 6 * s} ${y - 40 * s} L${x + 6 * s} ${y - 40 * s} Q${x + 12 * s} ${y - 22 * s} ${x + 9 * s} ${y}z`, "#8E6E52")}
        ${P(`M${x + 2 * s} ${y} Q${x + 10 * s} ${y - 20 * s} ${x + 6 * s} ${y - 40 * s} L${x} ${y - 40 * s} Q${x + 5 * s} ${y - 20 * s} ${x - 1 * s} ${y}z`, "#6E5340", ' opacity=".7"')}
        ${L(`M${x - 5 * s} ${y - 39 * s} l-10 -9 l-6 -2 M${x - 2 * s} ${y - 40 * s} l-3 -12 M${x + 2 * s} ${y - 40 * s} l5 -11 l5 -3 M${x + 5 * s} ${y - 39 * s} l12 -6`, "#6E5340", 2.4 * s, ' stroke-linecap="round"')}
        ${[[-20, -50, 8], [-6, -54, 7], [8, -53, 8], [18, -46, 7]].map(([dx, dy, r]) => C(x + dx * s, y + dy * s, r * s, "#5D7F3A", ' opacity=".92"') + C(x + dx * s - 2, y + dy * s - 2, r * .6 * s, "#7C9A48")).join("")}</g>`;
      const acacia = (x, y, s) => `${L(`M${x} ${y} L${x + 1} ${y - 10 * s} M${x} ${y - 6 * s} l-5 -5`, "#5a4632", 1.4)}${E(x, y - 12 * s, 13 * s, 3 * s, "#6C7E3E")}`;
      return `${defs(sky("#EC9D5E", "#F7C98E", "#FDE9C6", 175) + vg("sav", 160, 215, [[0, "#D6AE6A"], [1, "#B88646"]]) + vg("sand", 202, 218, [[0, "#F2DFB4"], [1, "#DCC08A"]]))}
      ${skyRect(175)}${sun(318, 118, 15, "#FFF4DA", "#FFD58E")}
      ${streak(110, 92, 70, "#FCE3BE", .6)}${streak(70, 100, 40, "#FCE3BE", .5)}${streak(250, 84, 55, "#FDE8C8", .45)}
      ${ridge(168, 6, 11, "#E2B585", .1, 9, ' opacity=".75"')}
      ${ridge(176, 5, 12, "url(#sav)", .1)}
      ${acacia(372, 172, 1)}${acacia(30, 174, .8)}${acacia(250, 170, .7)}
      ${grass(178, 204, 120, "#8C6A36", 5, .5)}
      ${baobab(62, 196, 1.15)}${baobab(338, 190, .8)}
      ${hutRound(150, 198, 1)}${hutRound(186, 200, .82)}${hutRound(250, 197, .95)}${hutRound(283, 199, .7)}
      ${R(-200, 202, 820, 16, "url(#sand)")}
      ${palm(400, 210, 54, -8)}${palm(14, 212, 46, 8, .95)}
      ${water(214, "#4FB8C2", "#1D6E97", 101, "#FFE9C8")}
      ${L("M-200 215 Q-40 212 100 216 T360 214 T620 216", "#F6F0E0", 1.6, ' opacity=".8"')}
      ${dhow(262, 250, 1)}`;
    },
  },
  /* 2 필리핀 — 팔라완식 석회암 섬, 수상 가옥, 방카 */
  2: {
    sky: ["#62BCE9", "#DDF2FA"], water: "#1F7FA8", hazard: "storm", wall: "seawall",
    art: () => {
      const karst = (x, w, h, base, seed, body, cliff, top) => {
        const r = rnd(seed); let d = `M${x - w / 2} ${base}`;
        const n = 9;
        for (let i = 0; i <= n; i++) {
          const t = i / n, px = x - w / 2 + w * t, edge = Math.sin(Math.PI * t);
          const py = base - h * Math.pow(edge, .35) * (.82 + r() * .3);
          d += ` L${f1(px + (r() - .5) * 5)} ${f1(py)}`;
        }
        d += ` L${x + w / 2} ${base}z`;
        let streaks = "";
        for (let i = 0; i < 5; i++) { const sx = x - w * .35 + r() * w * .7; streaks += `M${f1(sx)} ${f1(base - h * (.25 + r() * .4))}v${f1(h * (.15 + r() * .2))}`; }
        return `${P(d, body)}${L(streaks, cliff, 2.2, ' opacity=".55" stroke-linecap="round"')}${P(d, top, ' opacity=".35" transform="translate(' + f1(x * .04) + ' 1) scale(.96 1)"')}`;
      };
      return `${defs(sky("#4FB2E6", "#9CD6F1", "#E3F4FA", 205))}
      ${skyRect(205)}${sun(70, 54, 11, "#FFFDF2", "#FFF6CF")}
      ${cloud(310, 70, 1.2, "#fff", .95)}${cloud(150, 92, .8, "#fff", .85)}${cloud(30, 110, .6, "#fff", .7)}
      ${karst(120, 70, 46, 206, 21, "#A7CBCB", "#8FB2B4", "#BFDCDA")}${karst(190, 50, 34, 206, 22, "#A7CBCB", "#8FB2B4", "#BFDCDA")}
      ${karst(300, 120, 92, 208, 23, "#4F8C68", "#8C9A90", "#6FAE7A")}${karst(380, 70, 64, 209, 24, "#3F7D57", "#8C9A90", "#5E9E68")}
      ${karst(225, 44, 40, 208, 25, "#5A9670", "#8C9A90", "#7AB884")}
      ${water(205, "#4CC4C8", "#0F76A3", 202)}
      ${E(300, 211, 64, 4, "#2C6A5A", ' opacity=".35"')}${E(380, 212, 36, 3, "#2C6A5A", ' opacity=".35"')}
      ${E(-10, 214, 90, 7, "#EADDB6")}${palm(14, 214, 42, 6, .9)}${palm(40, 212, 36, -5, .8)}
      ${stiltHut(70, 228, 1.05)}${stiltHut(108, 232, .85)}${L("M84 222 H96", "#7a5a36", 2)}
      ${outrigger(220, 254, 1.05)}`;
    },
  },
  /* 3 피지 — 산호초 라군, 흰 모래섬, 야자, 부레 */
  3: {
    sky: ["#4FC0EE", "#E6F8FD"], water: "#25A3B8", hazard: "sea", wall: "seawall",
    art: () => `${defs(sky("#3DB6EC", "#8FD7F4", "#EAF8FD", 192) + vg("lag", 192, 300, [[0, "#1873AE"], [.08, "#1E8DBA"], [.22, "#46CACF"], [.5, "#6ADDD6"], [1, "#2AA6BF"]]) + rg("shoal", [[0, "#C9F4E9"], [.55, "#8EE6DA", .8], [1, "#6ADDD6", 0]]))}
      ${skyRect(192)}
      ${cloud(320, 78, 1.5, "#fff", .97)}${cloud(90, 70, 1.1, "#fff", .92)}${cloud(200, 120, .7, "#fff", .8)}
      ${ridge(186, 18, 31, "#6E9FA0", .2, 7, ' opacity=".55"')}
      ${R(-200, 190, 820, 140, "url(#lag)")}
      ${glints(196, 290, 40, "#fff", 303)}
      ${L("M-200 199 Q0 196 140 200 T420 198 T620 200", "#fff", 1.4, ' stroke-dasharray="3 5 1 6" opacity=".85"')}
      ${E(250, 212, 170, 22, "url(#shoal)")}
      ${E(250, 210, 120, 8, "#F6EBCF")}${E(250, 209, 100, 5, "#FCF5E3")}
      ${palm(165, 210, 52, -12)}${palm(200, 208, 60, 6, 1.05)}${palm(318, 210, 46, 12, .95)}${palm(348, 211, 38, -6, .8)}
      ${bure(250, 206, .95)}${bure(290, 207, .7)}
      ${outrigger(90, 262, .8, "#7A4A26", "#C99B5E")}`,
  },
  /* 4 네팔 — 안나푸르나식 설산, 계단밭, 흰 돌집 마을, 빙하 강 */
  4: {
    sky: ["#4E9BDB", "#E1EFFA"], water: "#5D8FA8", hazard: "flood", wall: "levee",
    art: () => {
      const peak = (x, y, w, h, shade) => `${P(`M${x - w} ${y + h} L${x} ${y} L${x + w} ${y + h}z`, "#EEF3FA")}
        ${P(`M${x} ${y} L${x + w} ${y + h} L${x + w * .15} ${y + h} Q${x + w * .2} ${y + h * .5} ${x} ${y}z`, shade)}`;
      const terraces = (y0, n, x0, x1, seed) => {
        const r = rnd(seed); let s = "";
        for (let i = 0; i < n; i++) {
          const y = y0 + i * 5.2, sx = x0 + i * 3, ex = x1 - i * 2;
          s += P(`M${sx} ${y} Q${(sx + ex) / 2} ${y - 7 - r() * 3} ${ex} ${y} L${ex} ${y + 5} Q${(sx + ex) / 2} ${y - 2} ${sx} ${y + 5}z`, i % 3 === 1 ? "#C7BE5E" : i % 2 ? "#8DB255" : "#A6C565");
          s += L(`M${sx} ${y + 5} Q${(sx + ex) / 2} ${y - 2} ${ex} ${y + 5}`, "#6C8A3E", .8);
        }
        return s;
      };
      return `${defs(sky("#3F8ED6", "#8EC2EC", "#E6F2FB", 150) + vg("haze", 120, 200, [[0, "#E6F2FB", 0], [1, "#E6F2FB", .7]]))}
      ${skyRect(150)}${cloud(60, 66, .7, "#fff", .7)}
      ${peak(40, 84, 70, 76, "#CBD7E8")}${peak(360, 54, 92, 106, "#C2CFE2")}${peak(130, 62, 86, 98, "#C9D5E6")}${peak(250, 34, 110, 126, "#C2CFE2")}
      ${ridge(132, 12, 40, "#8494AC", 1.4, 5)}${ridge(140, 8, 39, "#6F8099", 1.2, 5, ' opacity=".7"')}
      ${R(-200, 110, 820, 90, "url(#haze)")}
      ${ridge(150, 14, 41, "#7D9DB4", .2, 6, ' opacity=".85"')}
      ${ridge(168, 16, 42, "#5D8A73", .3, 6)}
      ${ridge(186, 12, 43, "#4A7A4E", .3, 6)}
      ${terraces(170, 7, 230, 470, 44)}${terraces(182, 5, -60, 120, 45)}
      ${canopy(160, 186, 60, 18, 46, "#3A6A40", "#4D8350", "#6A9E5C")}
      ${stoneHouse(270, 182, 1, "#55708A")}${stoneHouse(298, 186, .9, "#4E6A84")}${stoneHouse(322, 181, .85, "#A0503A")}${stoneHouse(350, 188, 1, "#55708A")}
      ${stoneHouse(60, 196, .9, "#A0503A")}${stoneHouse(90, 199, .8, "#55708A")}
      ${ridge(208, 4, 47, "#5E7F4A", .2, 8)}
      ${water(212, "#9FC3CF", "#4C7D92", 404, "#fff")}
      ${L("M-200 222 q20 -3 40 0 t40 0 M60 240 q20 -3 40 0 t40 0 M240 230 q20 -3 40 0 t40 0", "#fff", 1.2, ' opacity=".55"')}`;
    },
  },
  /* 5 파키스탄 — 인더스 평야, 먼 산, 밀밭, 흙벽돌 마을, 대추야자, 흙빛 강 */
  5: {
    sky: ["#E2B985", "#F7EBD3"], water: "#7A8F7E", hazard: "flood", wall: "levee",
    art: () => `${defs(sky("#D9AE7C", "#EED0A2", "#F8EDD8", 160))}
      ${skyRect(160)}${sun(300, 96, 18, "#FFF2D8", "#FBE1B0")}
      ${streak(140, 80, 90, "#F6E1C0", .5)}${streak(330, 70, 60, "#F6E1C0", .45)}
      ${ridge(140, 18, 51, "#C9A783", .35, 6, ' opacity=".55"')}
      ${ridge(152, 10, 52, "#B48C66", .3, 6, ' opacity=".8"')}
      ${R(-200, 158, 820, 60, "#D4B465")}
      ${[[160, 4, "#E2C676"], [166, 5, "#B7A24E"], [173, 6, "#DDBF6A"], [181, 7, "#9FAA58"], [190, 8, "#D8B860"], [200, 9, "#C6A24C"]].map(([y, h, c]) => R(-200, y, 820, h, c)).join("")}
      ${grass(186, 212, 140, "#8E7A3A", 52, .45)}
      ${palm(60, 186, 40, 3, .95, "#3E6A33", "#58884A", "#7c6044")}${palm(210, 190, 46, -4, 1, "#3E6A33", "#58884A", "#7c6044")}${palm(236, 192, 36, 5, .85, "#3E6A33", "#58884A", "#7c6044")}${palm(392, 188, 44, -6, .95, "#3E6A33", "#58884A", "#7c6044")}
      ${mudBox(84, 196, 30, 16)}${mudBox(122, 198, 22, 12, .8)}${mudBox(286, 196, 34, 17)}${mudBox(330, 199, 22, 12, .8)}
      ${R(-200, 204, 820, 10, "#A88A5A")}${R(-200, 204, 820, 2, "#C6A674")}
      ${water(213, "#A6A486", "#6A7C6C", 505, "#F3E6CA")}
      ${L("M-200 236 Q60 230 210 238 T620 234", "#B7B494", 1.4, ' opacity=".6"')}
      <g class="bob">${P("M270 252 L276 258 H330 L336 252z", "#6b4a2a")}${L("M272 253 H334", "#a07a48", 1)}${L("M318 252 L326 226", "#4a3018", 1.4)}${E(303, 261, 34, 2, "#3e4e44", ' opacity=".3"')}</g>`,
  },
  /* 6 몰디브 — 수평선까지 바다, 산호섬, 물 위 빌라와 나무다리 */
  6: {
    sky: ["#2FAEEC", "#E0F6FE"], water: "#1FA6C2", hazard: "sea", wall: "seawall",
    art: () => `${defs(sky("#219FE4", "#7FD0F4", "#E4F7FE", 176) + vg("sea6", 176, 300, [[0, "#0D5E9C"], [.06, "#1584B8"], [.16, "#2AB6CC"], [.32, "#5ED8D4"], [.48, "#39BFCB"], [1, "#127FAE"]]))}
      ${skyRect(176)}${sun(350, 46, 10, "#FFFFF6", "#FFF8D8")}
      ${cloud(110, 110, 1.1, "#fff", .95)}${cloud(260, 136, .6, "#fff", .85)}${cloud(30, 150, .5, "#fff", .7)}${cloud(380, 120, .8, "#fff", .9)}
      ${R(-200, 176, 820, 160, "url(#sea6)")}
      ${glints(180, 290, 50, "#fff", 606)}
      ${E(70, 196, 110, 16, "#9BEBDF", ' opacity=".7"')}${E(70, 194, 76, 6, "#F7EED6")}
      ${canopy(70, 184, 70, 16, 61, "#2E7A44", "#3E9150", "#5BAE5E")}
      ${palm(30, 194, 38, -6, .85)}${palm(58, 192, 44, 4, .9)}${palm(96, 193, 40, 8, .85)}${palm(118, 195, 30, -3, .7)}
      ${E(395, 181, 34, 3, "#F7EED6")}${canopy(395, 176, 30, 7, 62, "#2E7A44", "#3E9150", "#5BAE5E")}
      ${L("M140 198 Q190 214 250 208 T360 214", "#8a6a40", 2.4)}
      ${waterVilla(180, 212, .95)}${waterVilla(232, 212, .95)}${waterVilla(284, 214, .95)}${waterVilla(336, 216, .95)}
      ${outrigger(130, 262, .7, "#fff", "#1E6FA8")}`,
  },
  /* 7 방글라데시 — 장마 구름, 삼각주 논, 흙단 위 마을, 맹그로브, 노우카 */
  7: {
    sky: ["#93ABBD", "#E0E8EE"], water: "#5E8E8C", hazard: "flood", wall: "levee",
    art: () => {
      const banana = (x, y, s) => `${L(`M${x} ${y} V${y - 18 * s}`, "#6b8a3a", 2.2 * s)}${[200, 240, 300, 340].map(d => leaf(x, y - 18 * s, d, 14 * s, d < 270 ? "#5F9A3E" : "#77AE4C", .35)).join("")}`;
      return `${defs(sky("#8AA2B6", "#B9CAD6", "#E2EAEF", 170))}
      ${skyRect(170)}
      ${cloud(80, 60, 2, "#C9D4DD", .9, "#9EAFBD")}${cloud(300, 50, 2.3, "#D3DCE3", .9, "#A6B5C2")}${cloud(200, 104, 1.2, "#E3E9EE", .8, "#B6C3CD")}
      ${ridge(168, 5, 71, "#577F5C", .6, 5, ' opacity=".55"')}
      ${R(-200, 170, 820, 46, "#7DAE5C")}
      ${[[172, "#8EBC67"], [178, "#A9CF7C"], [185, "#BFD6CF"], [191, "#93C06B"], [198, "#B3D2C8"], [204, "#86B861"]].map(([y, c], i) => R(-200, y, 820, 4 + i * .8, c)).join("")}
      ${L("M-200 187 h820 M-200 200 h820", "#fff", .7, ' opacity=".5"')}
      ${P("M20 206 L40 186 H140 L162 206z", "#8C7150")}${P("M40 186 H140 L146 192 H34z", "#A68A62")}
      ${banana(36, 190, 1)}${palm(150, 190, 40, 5, .9)}${palm(28, 190, 34, -4, .8)}
      ${tinHouse(70, 188, 1)}${tinHouse(112, 189, .85)}
      ${canopy(360, 190, 150, 26, 72, "#244F33", "#2F6440", "#3F7A4C")}
      ${L("M290 206 l6 -12 M300 206 l-4 -12 M318 206 l5 -10 M340 206 l-5 -12 M352 206 l4 -10 M380 206 l-6 -12 M396 206 l5 -12 M418 206 l-4 -10", "#4a3d2c", 1.4)}
      ${ridge(206, 2, 73, "#6E8A5A", .2, 10)}
      ${water(210, "#93A89A", "#4F7672", 707, "#E8EEF0")}
      ${nouka(200, 256, 1)}`;
    },
  },
  /* 8 바누아투 — 연기 나는 화산(야수르식 잿빛 원뿔), 밀림, 반얀나무, 초가, 검은 모래, 카누 (교사 팀) */
  8: {
    sky: ["#78C0E2", "#E6F4F8"], water: "#1E8FB4", hazard: "storm", wall: "seawall",
    art: () => `${defs(sky("#6CB6DE", "#A9D8EC", "#E8F4F7", 190) + hg("ash", [[0, "#8C847C"], [.55, "#706862"], [1, "#544D48"]]) + rg("lava", [[0, "#FFB36B", .9], [1, "#FF7A3A", 0]]) + rg("puff", [[0, "#B8B1AA"], [.55, "#C6C0B9", .85], [1, "#D2CDC7", 0]]))}
      ${skyRect(190)}${cloud(70, 76, 1, "#fff", .9)}${cloud(380, 110, .7, "#fff", .8)}
      <g class="drift">${[[254, 80, 14, .95], [262, 66, 18, .9], [274, 52, 22, .85], [292, 40, 26, .75], [316, 30, 30, .62], [346, 24, 32, .5], [380, 22, 30, .38]].map(([x, y, r, o]) => C(x, y, r * 1.5, "url(#puff)", ` opacity="${o}"`)).join("")}</g>
      ${P("M150 196 Q205 140 236 96 Q250 88 266 92 Q290 124 352 196z", "url(#ash)")}
      ${L("M200 168 q14 -30 32 -56 M262 98 q10 30 30 62 M246 96 q-2 40 -8 84", "#4A4440", 1, ' opacity=".45"')}
      ${E(251, 93, 16, 4, "#3a3330")}${E(251, 90, 26, 14, "url(#lava)")}
      ${ridge(194, 8, 81, "#3E7F45", .5, 5)}
      ${canopy(70, 186, 160, 30, 82, "#245E33", "#2F7440", "#4A9150")}
      ${canopy(380, 188, 120, 24, 83, "#245E33", "#2F7440", "#4A9150")}
      <g>${R(84, 150, 12, 54, "#6b4f2d")}${L("M80 204 V166 M100 204 V164 M74 204 Q76 180 84 168 M106 204 Q104 182 96 166", "#5a4128", 2)}${canopy(90, 148, 70, 26, 84, "#1F5A30", "#2C6E3C", "#42894A")}</g>
      ${bure(150, 202, .95, "#BFA27A")}${bure(188, 204, .75, "#BFA27A")}
      ${palm(20, 206, 46, 7)}${palm(330, 202, 44, -6, .95)}
      ${R(-200, 204, 820, 8, "#4A4542")}${R(-200, 204, 820, 2, "#6A6460")}
      ${water(210, "#3DA6C4", "#126A92", 808)}
      ${L("M-200 211 Q-40 208 100 212 T360 210 T620 212", "#EAF6F8", 1.4, ' opacity=".8"')}
      ${outrigger(310, 254, .95, "#6E3F1C", "#9a6a3a")}`,
  },
};

/* 방파제/제방: 대비율 0~100 → 높이 (un-summit 방벽 그림과 같은 방식). 50% 를 넘으면 위 테두리가 초록으로 바뀐다(game.js). */
export const WALL_FOOT = 292, WALL_RISE = 0.9;
export function wallSVG(kind) {
  const body = kind === "levee" ? "#8C7A5B" : "#8fb3c9", cap = kind === "levee" ? "#6E8F4E" : "#dbe9f1";
  return `<g id="wall">
    <rect x="-100" y="${WALL_FOOT}" width="620" height="9" fill="#3d5c70"/>
    <rect id="wallBody" x="-100" y="${WALL_FOOT - 6}" width="620" height="6" fill="${body}"/>
    <rect id="wallCap" x="-100" y="${WALL_FOOT - 9}" width="620" height="3" fill="${cap}"/>
  </g>`;
}

/* ---------- 지은 시설 (06_infra.sql) ----------
   풍경 위, 방벽 앞에 그린다. lv = { warning, wall, shelter } (0~5)
     조기경보: 오른쪽 철탑. 단계마다 높아지고 사이렌이 늘어난다
     대피소:   튼튼한 2~4층 건물. 단계마다 넓고 높아진다
     방파제:   방벽 발치의 테트라포드(소파블록). 단계마다 늘어난다 */
export function infraSVG(lv = {}) {
  const w = lv.warning | 0, s = lv.shelter | 0, wl = lv.wall | 0;
  let out = "";
  if (s > 0) {
    const bw = 22 + 5 * s, floors = 1 + Math.ceil(s / 2), fh = 9, x = 352 - bw / 2, base = 207, top = base - floors * fh;
    let win = "";
    for (let f = 0; f < floors; f++) for (let i = 0; i < Math.floor(bw / 8); i++)
      win += `<rect x="${x + 4 + i * 8}" y="${top + 3 + f * fh}" width="4" height="4" fill="#9cc6e0"/>`;
    out += `<g class="fac-shelter">
      <ellipse cx="${x + bw / 2 + 4}" cy="${base + 1}" rx="${bw / 2 + 6}" ry="2.4" fill="#000" opacity=".15"/>
      <rect x="${x}" y="${top}" width="${bw}" height="${floors * fh}" fill="#ECEFF1"/>
      <rect x="${x + bw * .65}" y="${top}" width="${bw * .35}" height="${floors * fh}" fill="#000" opacity=".1"/>
      <rect x="${x - 2}" y="${top - 3}" width="${bw + 4}" height="3.5" fill="#2E7D4F"/>
      ${win}
      <rect x="${x + bw / 2 - 3}" y="${base - 7}" width="6" height="7" fill="#37474F"/>
      <rect x="${x + bw / 2 - 7}" y="${top - 10}" width="14" height="6" rx="1.5" fill="#2E7D4F"/>
      <path d="M${x + bw / 2 - 3} ${top - 5.5} l3 -3 l3 3" fill="none" stroke="#fff" stroke-width="1.2"/>
    </g>`;
  }
  if (w > 0) {
    const x = 400, base = 210, h = 34 + 7 * w, top = base - h;
    let lattice = "";
    for (let y = base; y > top + 6; y -= 7) lattice += `M${x - 4} ${y} L${x + 4} ${y - 7} M${x + 4} ${y} L${x - 4} ${y - 7}`;
    let sirens = "";
    for (let i = 0; i < Math.min(w, 3); i++) sirens += `<path d="M${x + 3} ${top + 6 + i * 7} l7 -3 v8 z" fill="#F2B530"/><path d="M${x - 3} ${top + 6 + i * 7} l-7 -3 v8 z" fill="#F2B530"/>`;
    out += `<g class="fac-warning">
      <path d="M${x - 5} ${base} L${x - 1.5} ${top} M${x + 5} ${base} L${x + 1.5} ${top}" stroke="#5b6770" stroke-width="1.6" fill="none"/>
      <path d="${lattice}" stroke="#7d8a93" stroke-width=".7" fill="none"/>
      ${sirens}
      <circle class="blink" cx="${x}" cy="${top - 2}" r="2.4" fill="#ff5a4a"/>
      ${w >= 4 ? `<rect x="${x - 9}" y="${top + 26}" width="18" height="2" fill="#5b6770"/><rect x="${x - 10}" y="${top + 20}" width="8" height="6" fill="#1d2b36"/><rect x="${x + 2}" y="${top + 20}" width="8" height="6" fill="#1d2b36"/>` : ""}
    </g>`;
  }
  if (wl > 0) {
    let pods = "";
    for (let i = 0; i < wl * 3; i++) {
      const cx = 14 + i * 13 + (i % 2) * 4, cy = WALL_FOOT - 2 - (i % 3) * 2;
      pods += `<g transform="translate(${cx} ${cy}) rotate(${(i * 41) % 120})"><path d="M0 0 L0 -6 M0 0 L5.2 3 M0 0 L-5.2 3" stroke="#7f8b92" stroke-width="3.6" stroke-linecap="round"/><path d="M0 0 L0 -5 M0 0 L4.3 2.5" stroke="#b3bec4" stroke-width="1.6" stroke-linecap="round"/></g>`;
    }
    out += `<g class="fac-wall">${pods}</g>`;
  }
  return out;
}
