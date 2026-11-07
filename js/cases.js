/* ==========================================================
   cases.js — 지역마다 실제 재난 사례 한 줄 + 실제로 효과가 있었던 대비 한 줄, 출처
   재난 카드(지원 탭)에 보인다. 숫자는 출처 페이지에서 확인한 것만 적었다(2026-11 조사).
   한 줄의 숫자는 한 출처에서만 가져왔다. 바꾸거나 더하려면 이 파일만 고친다.
   ========================================================== */
export const CASES = {
  1: {
    event: "2019년 사이클론 이다이: 600여 명 사망, 180만여 명 지원 필요",
    measure: "2023년 사이클론 프레디: 지역 라디오 70곳·문자·주민 대피조로 미리 경보",
    src: [
      ["OCHA, 100 days after Cyclone Idai", "https://reliefweb.int/report/mozambique/100-days-after-cyclone-idai-six-reasons-why-mozambique-still-crisis"],
      ["World Bank, 2023", "https://www.worldbank.org/en/news/feature/2023/09/11/early-warning-system-saves-lives-in-afe-mozambique"],
    ],
  },
  2: {
    event: "2013년 태풍 하이옌: 6,300명 사망, 1,600만 명 피해",
    measure: "주민 1,000명을 미리 대피시킨 툴랑디욧 마을은 집이 다 부서져도 전원 생존",
    src: [
      ["IFRC 최종 보고서", "https://reliefweb.int/report/philippines/philippines-typhoon-haiyan-emergency-appeal-preliminary-final-report-mdrph014"],
      ["WMO, Ten years after Haiyan", "https://wmo.int/node/23416"],
    ],
  },
  3: {
    event: "2016년 사이클론 윈스턴: 44명 사망, 인구 62%(54만 명) 피해",
    measure: "상륙 전 대피소 735곳을 열고 언론으로 경보해 인명 피해를 줄임",
    src: [
      ["피지 정부 재난 후 평가(PDNA)", "https://reliefweb.int/report/fiji/fiji-post-disaster-needs-assessment-may-2016-tropical-cyclone-winston-february-20-2016"],
      ["UNDRR", "https://www.undrr.org/news/unisdr-commends-fiji-government-its-state-preparedness-face-cyclone-winston"],
    ],
  },
  4: {
    event: "2021년 멜람치 홍수: 사망 5명·실종 20명, 주택 337채 전파(초기 집계)",
    measure: "상류 주민이 전화로 알려 미리 대피, 멜람치 시내 인명 피해 없음",
    src: [["ICIMOD", "https://icimod.org/?p=34677"]],
  },
  5: {
    event: "2022년 파키스탄 대홍수: 1,730여 명 사망, 3,300만 명 피해",
    measure: "빙하호 홍수 대비 사업(GLOF-II)의 방호벽 18곳 중 16곳이 온전, 물길을 돌려 마을 보호",
    src: [
      ["UNDP 재난 후 평가 요약", "https://www.undp.org/node/361696"],
      ["UNDP GLOF-II 홍수 보고서", "https://www.adaptation-undp.org/sites/default/files/resources/glof-ii-flood_report.pdf"],
    ],
  },
  6: {
    event: "2004년 인도양 쓰나미: 82명 사망·24명 실종, GDP 62% 피해",
    measure: "일본 지원으로 쌓은 약 6km 방파제 덕에 수도 말레는 사망자 0명",
    src: [
      ["몰디브 국가재난관리청", "https://ndma.gov.mv/en/galleries/tsunami"],
      ["일본 외무성 ODA 백서 2005", "https://www.mofa.go.jp/policy/oda/white/2005/ODA2005/html/column/cl02002.htm"],
    ],
  },
  7: {
    event: "1970년 사이클론 볼라: 30만 명 이상 사망(공식 추정)",
    measure: "조기경보·대피소로 비슷한 폭풍의 사망자가 100분의 1로, 2020년 암판 때 200만여 명 대피",
    src: [["World Bank, Bangladesh's 50 years journey to climate resilience", "https://blogs.worldbank.org/en/endpovertyinsouthasia/bangladeshs-50-years-journey-climate-resilience"]],
  },
  8: {
    event: "2015년 사이클론 팜: 11명 사망, 피해액 GDP의 64.1%",
    measure: "며칠 전 경보·약 4,000명 사전 대피·전통 지식으로 사망자를 줄임",
    src: [
      ["바누아투 정부 재난 후 평가(PDNA)", "https://reliefweb.int/report/vanuatu/post-disaster-needs-assessment-tropical-cyclone-pam-march-2015"],
      ["Australian Journal of Emergency Management, 2017", "https://knowledge.aidr.org.au/resources/ajem-apr-2017-cyclone-pam-in-vanuatu-learning-from-the-low-death-toll/"],
    ],
  },
};
