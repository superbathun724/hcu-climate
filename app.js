/* 게임 화면. 아직 서버 없음, 숫자는 예시 (3단계부터 서버로 바뀐다).
   un-summit과 같이 일반 스크립트(모듈 아님). 로그인은 js/auth.js(모듈)가 맡는다. */

const $=id=>document.getElementById(id);

/* ---- 반 ↔ 지역 (2026-10-28 무작위 배정) ---- */
const REGIONS=[
  {cls:1,n:"모잠비크",haz:"사이클론",shield:31,col:"#2E8B57"},
  {cls:2,n:"필리핀",haz:"태풍·해일",shield:43,col:"#0F4C9C"},
  {cls:3,n:"피지",haz:"사이클론·해수면",shield:58,col:"#1FA2B8"},
  {cls:4,n:"네팔",haz:"홍수·빙하호 붕괴",shield:22,col:"#7A5BB5"},
  {cls:5,n:"파키스탄",haz:"대홍수",shield:47,col:"#4E9F5C"},
  {cls:6,n:"몰디브",haz:"해수면 상승",shield:64,col:"#E08A2E"},
  {cls:7,n:"방글라데시",haz:"홍수·사이클론",shield:18,col:"#C0504D"},
];
const MY_CLASS=2;
const EMG={region:"방글라데시",left:"2:41"};   // 재난 중인 지역 (서버가 정한다)
const CLUBS=["MEME","GeNiUS","SIN","INTERPOL","라포르","CUBE","SAMDI","동물의 숲","시나브로","AIM","it",
  "강약중강약","CELLS","Liberte","STEM","SYNAPSE","DM","LUCID","EBS","DNT","GIGA"];
const MY_CLUB="MEME";

/* ---- 탭 수입 차감: 구간마다 길이 2배, 효율 ½. 구간마다 300코인. ---- */
const BAND=300;
function bandOf(taps){            // 몇 번째 구간인가 (0부터)
  let k=0, start=0, len=BAND;
  while(taps>=start+len){start+=len;len*=2;k++;}
  return {k,start,len};
}
const rateAt=taps=>1/Math.pow(2,bandOf(taps).k);

/* ---- 화면 전환 ---- */
const SECTIONS=["game","word","send","rank","voice","admin"];
function show(id){
  SECTIONS.forEach(s=>$(s).classList.toggle("on",s===id));
  document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===id));
  window.scrollTo(0,0);
}
document.querySelectorAll("#tabs button").forEach(b=>b.onclick=()=>show(b.dataset.tab));
document.addEventListener("click",e=>{
  const o=e.target.closest("[data-open]"); if(o){e.preventDefault();
    const t=o.dataset.open;
    if(t==="quiz") $("quiz").hidden=false;
    else show(t);
  }
  const c=e.target.closest("[data-close]"); if(c) $(c.dataset.close).hidden=true;
});

/* ---- 가입·로그인: js/auth.js 가 맡는다 ---- */

/* ---- 게임 ---- */
let taps=412, coins=186, frac=0;
function drawGame(){
  const b=bandOf(taps), r=rateAt(taps);
  $("taps").textContent=taps.toLocaleString();
  $("rate").textContent=(r>=1?"1":r>=0.01?r:"0.01 미만")+"코인";
  $("bandBar").style.width=((taps-b.start)/b.len*100)+"%";
  $("bandTxt").textContent=`${(b.start+b.len-taps).toLocaleString()}번 더 누르면 효율이 바뀌어요`;
  $("coins").textContent=coins.toLocaleString();
  document.querySelectorAll(".band div").forEach((d,i)=>d.classList.toggle("now",i===Math.min(b.k,3)));
  $("smog").style.opacity=Math.max(.1,.6-taps/4000);
}
$("scene").addEventListener("pointerdown",e=>{
  const r=rateAt(taps); taps++; frac+=r;
  const got=Math.floor(frac); frac-=got; coins+=got;
  const p=document.createElement("div"); p.className="pop";
  p.textContent=r>=1?"+1":"+"+r;
  const box=$("scene").getBoundingClientRect();
  p.style.left=(e.clientX-box.left-10)+"px"; p.style.top=(e.clientY-box.top-20)+"px";
  $("scene").appendChild(p); setTimeout(()=>p.remove(),700);
  drawGame();
});
drawGame();

/* ---- 단어 ---- */
const SETS=[["Day 01",40,[2,6,10,12,6,4]],["Day 02",40,[8,10,12,6,4,0]],["Day 03",40,[20,12,6,2,0,0]],["Day 04",40,[40,0,0,0,0,0]]];
const LVCOL=["#cfd9e3","#A8C6D8","#7FA9C9","#4E86B5","#2B66A0","#0F4C9C"];
$("sets").className="sets";
$("sets").innerHTML=SETS.map(([n,tot,lv])=>`
  <div class="row"><div class="m"><div class="t">${n}</div>
    <div class="d">${tot}단어 · 오늘 복습 ${lv[0]>=20?lv[0]:Math.round(lv[1]/2)}개</div>
    <div class="lvbar">${lv.map((x,i)=>`<i style="width:${x/tot*100}%;background:${LVCOL[i]}"></i>`).join("")}</div></div>
    <button class="btn ghost" data-open="quiz">풀기</button></div>`).join("");

/* ---- 지원 ---- */
function regionCard(r,kind){
  const tag=kind==="emg"?`<span class="tag red">재난 발생 · ${EMG.left} 남음</span> <span class="tag x2">지원 2배</span>`
           :kind==="mine"?`<span class="tag blue">우리 반이 돕는 곳</span>`
           :`<span class="tag" style="background:var(--mist)">${r.cls}반이 돕는 곳</span>`;
  return `<div class="row ${kind}" data-r="${r.n}">
    <div class="rtop"><div class="t">${r.n}</div><div>${tag}</div></div>
    <div class="d">${r.haz}</div>
    <div class="shield"><div class="bar"><i style="width:${r.shield}%"></i><span class="safe"></span></div>
    <div class="d sv">${shieldTxt(r.shield)}</div></div>
    <div class="give"><button class="btn coin" data-amt="10">10</button><button class="btn coin" data-amt="50">50</button><button class="btn coin" data-amt="100">100</button></div>
    <div class="give own"><input type="number" inputmode="numeric" min="1" step="1" placeholder="직접 입력"><button class="btn" data-amt="own">보내기</button></div>
  </div>`;
}
const pct=v=>Math.round(v*10)/10;   // 소수점 한 자리. 0.1+0.2 같은 부동소수 꼬리가 화면에 나오지 않게
const shieldTxt=v=>`대비율 ${pct(v)}% · `+(v>=50?"재난을 버틸 수 있어요":`50%까지 ${pct(50-v)}%`);
const emgR=REGIONS.find(r=>r.n===EMG.region), mine=REGIONS.find(r=>r.cls===MY_CLASS);
$("sendList").innerHTML=regionCard(emgR,"emg")+regionCard(mine,"mine")
  +REGIONS.filter(r=>r!==emgR&&r!==mine).map(r=>regionCard(r,"reg")).join("");

/* 목업: 코인 20개 = 대비율 1%. 실제 비율은 서버가 정한다(un-summit DEF_PER_PCT 20을 가져옴). */
$("sendList").addEventListener("click",e=>{
  const b=e.target.closest("[data-amt]"); if(!b) return;
  const card=b.closest(".row"), r=REGIONS.find(x=>x.n===card.dataset.r);
  let amt=b.dataset.amt==="own"?parseInt(card.querySelector(".own input").value,10):+b.dataset.amt;
  if(!(amt>0)) {card.querySelector(".own input").focus();return;}
  if(amt>coins){ $("ticker").textContent=`코인이 부족해요. 지금 ${coins}코인 있어요.`; return; }
  coins-=amt;
  const x2=card.classList.contains("emg")?2:1;
  r.shield=Math.min(100,Math.round((r.shield+amt*x2/20)*10)/10);
  card.querySelector(".bar i").style.width=r.shield+"%";
  card.querySelector(".sv").textContent=shieldTxt(r.shield);
  card.querySelector(".own input").value="";
  $("ticker").textContent=`${r.n}에 ${amt}코인을 보냈어요${x2>1?" (재난 지원이라 2배)":""}.`;
  drawGame();
});

/* ---- 순위 ---- */
const CLASS_RANK=[[5,412,28],[2,388,30],[7,371,26],[1,340,29],[3,301,31],[6,287,27],[4,240,30]];
const CLUB_RANK=CLUBS.map((c,i)=>[c,Math.round(520-i*19+(i%3)*7),3+((i*7)%14)]);
function drawRank(kind){
  const rows=kind==="class"
    ?CLASS_RANK.map(([c,v,n],i)=>({n:i+1,t:`${c}반 · ${REGIONS[c-1].n}`,d:`${n}명 참여`,v,me:c===MY_CLASS}))
    :CLUB_RANK.map(([c,v,n],i)=>({n:i+1,t:c,d:`${n}명 참여`,v,me:c===MY_CLUB}));
  $("rankList").innerHTML=rows.map(r=>`<div class="rk${r.me?" me":""}"><span class="n">${r.n}</span>
    <div class="m"><div class="t">${r.t}</div><div class="d">${r.d}</div></div><span class="v">${r.v}</span></div>`).join("");
}
document.querySelectorAll("#rankSeg button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#rankSeg button").forEach(x=>x.classList.toggle("on",x===b)); drawRank(b.dataset.r);
});
drawRank("class");

/* ---- 건의 ---- */
const POSTS=[
  {b:"급식실 줄이 너무 길어요. 학년별로 시간을 나눴으면 좋겠습니다.",up:87,ago:"3일 전",ans:"급식 시간 학년별 5분 간격 시범 운영을 다음 달부터 검토하기로 했습니다."},
  {b:"자습실 에어컨이 저녁에 꺼져요.",up:54,ago:"어제",mine:true},
  {b:"체육관 공 대여 시간을 점심에도 열어 주세요.",up:31,ago:"5시간 전"},
];
$("posts").innerHTML=POSTS.map(p=>`<div class="post"><button class="up${p.mine?" on":""}">▲<span>${p.up}</span><small>공감</small></button>
  <div class="b">${p.b}<div class="meta">익명 · ${p.ago}${p.ans?" · 답변 완료":""}</div>
  ${p.ans?`<div class="ans"><b>학생회 답변</b>${p.ans}</div>`:""}</div></div>`).join("");

/* 목업 확인용: ?tab=send 처럼 열면 그 화면부터 */
const q=location.search.match(/[?&]tab=(\w+)/); if(q) show(q[1]);
if(/[?&]quiz=1/.test(location.search)){show("word");$("quiz").hidden=false;}
