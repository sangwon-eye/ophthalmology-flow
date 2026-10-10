import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 직원 화면 디자인 (10-09 사용자, 이름은 모두 가상)
// ① 머리줄 '대기 N명' 방 색깔 알약 ③ 이름 크게 ④ 교수님 색 점 ⑦ 구역 제목 굵게 + 왼쪽 막대 (0명은 흐리게)
// 시력방 2열(10-09 사용자): 1920 모니터 100~110%(화면 폭 1700px 이상)만 시력방 카드 두 줄, 같은 줄 두 카드 높이 같게.
// 1280 모니터·125% 이상은 한 줄(사용자: 1280 두 줄은 지저분함). 검사실·명단 관리는 검사 칸이 길어 한 줄 그대로.
// 2열에서도 끌어서 순서 바꾸기 (가로·세로 모두 보고 가장 가까운 자리), 한 줄은 예전 그대로
const today = new Date().toLocaleDateString('sv-SE');
const docs = ['김선웅', '나상훈', '이종혁'];
const names = ['서준호', '신종희', '조현우', '남궁하늘', '임수빈', '장민호', '최민지', '이솔', '한지훈', '오세영', '권나은', '황도윤', '송하린', '박영수', '정대현', '강서윤', '윤지아', '원성옥', '제갈민준', '문가람'];
const seed = () => names.map((name, i) => {
  const resMin = 540 + i * 10;
  const reservation = `${String(Math.floor(resMin / 60)).padStart(2, '0')}:${String(resMin % 60).padStart(2, '0')}`;
  const base = { id: String(6600000 + i * 47), name, date: today, doctor: docs[i % 3], reservation, checkin: `08:${String(20 + i).padStart(2, '0')}`, late: false, assigned: { visionIop: true, oct: true, wfp: i % 2 === 0 }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: resMin + 0.05, firstVisit: false, sex: i % 2 ? 'F' : 'M', age: 40 + i };
  if (i === 1) return { ...base, assigned: { visionIop: true, vf: true, oct: true, wfp: true, gat: true, fag: true, fp: true, specular: true, bscan: true } }; // 오늘 검사가 많은 환자
  if (i === 3) return { ...base, firstVisit: true }; // 초진 (History 설문지 버튼)
  if (i < 10) return base; // 시력방 대기 10명
  if (i < 17) return { ...base, done: { visionIop: true }, measureOk: 1, vaOk: 1, nctOk: 1, measure: { ucva: { od: '0.8', os: '0.6' }, nct: { od: '15', os: '16' } } }; // 검사실 대기
  return { ...base, checkin: '' }; // 접수 전
});
const order = async () => (await getKey('daily-patients')).value.filter(p => p.checkin && !p.done?.visionIop).sort((a, b) => a.queueKey - b.queueKey).map(p => p.name);
const browser = await chromium.launch();
const sizes = [['1280', 1280, 1024, 1], ['1280-125', 1024, 819, 1.25], ['1920-125', 1536, 864, 1.25], ['1920-150', 1280, 720, 1.5], ['1920', 1920, 1080, 1]];
const cols = (page) => page.evaluate(() => {
  const h = document.querySelector('[aria-label="끌어서 순서 바꾸기"]');
  const box = h?.closest('[class*="grid-cols-1"]') || h?.parentElement?.parentElement?.parentElement?.parentElement;
  if (!box) return 0;
  return new Set([...box.children].map(c => Math.round(c.getBoundingClientRect().left))).size;
});
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.rounded-xl')].some(e => e.scrollWidth > e.clientWidth + 1));
await editKey('daily-patients', seed);
await editKey('measure-history', (v) => ({ ...(v || {}), [seed()[0].id]: [{ date: '2026-09-01', ucva: { od: '0.8', os: '0.9' }, bcva: { od: '1.0', os: '1.0' }, nct: { od: '15', os: '16' } }], [seed()[1].id]: [{ date: '2026-09-02', ucva: { od: '0.3', os: '0.4' }, bcva: { od: '0.7', os: '0.8' }, nct: { od: '21', os: '22' }, gat: { od: '20', os: '21' } }] }));
let first = true;
for (const [label, w, h, s] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: s });
  const { errors, ok, W, pick, back } = tester(page);
  await page.goto(`${BASE}/`); await W(900);
  await page.screenshot({ path: `${SP}/r103-main-${label}.png` });
  await pick('시력'); await W(900);
  const n = await cols(page);
  ok(n === (w >= 1700 ? 2 : 1), `${label}: 시력방 카드 ${w >= 1700 ? '두 줄' : '한 줄'} (${n})`);
  ok(!(await overflow(page)), `${label}: 시력방 가로 넘침 없음`);
  if (n === 2) {
    const rowsH = await page.evaluate(() => {
      const box = document.querySelector('[aria-label="끌어서 순서 바꾸기"]').closest('[class*="grid-cols-1"]');
      const cards = [...box.children].map(c => c.querySelector('.rounded-xl').getBoundingClientRect());
      const bad = [];
      for (let i = 0; i + 1 < cards.length; i += 2) if (Math.abs(cards[i].height - cards[i + 1].height) > 1 || Math.abs(cards[i].top - cards[i + 1].top) > 1) bad.push(i + 1);
      return bad;
    });
    ok(rowsH.length === 0, `${label}: 같은 줄 두 카드 높이 같음 (오늘 검사가 많은 환자·이전 시력 있는 환자 포함) ${rowsH.join(',')}`);
    const nameLine = await page.evaluate(() => [...document.querySelectorAll('.t-name')].slice(0, 10).filter(nm => { const row = nm.parentElement; return [...row.children].some(c => c.getBoundingClientRect().top > nm.getBoundingClientRect().bottom); }).map(nm => nm.textContent));
    ok(nameLine.length === 0, `${label}: 이름 줄이 꺾이지 않음 (긴 이름 + 초진 포함) ${nameLine.join(',')}`);
  }
  if (first) {
    first = false;
    const pill = page.locator('[data-wait-count]');
    ok((await pill.innerText()).trim() === '대기 10명' && await pill.evaluate(e => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).color === 'rgb(255, 255, 255)'), "① 머리줄 '대기 10명' 방 색깔 알약 (흰 글씨)");
    ok(await page.locator('.t-name').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 19 && Number(getComputedStyle(e).fontWeight) >= 700), '③ 이름 크게·굵게');
    const dots = await page.locator('[data-doctor-chip]').evaluateAll(es => [...new Set(es.map(e => getComputedStyle(e).backgroundColor))].length);
    ok(dots === 3, `④ 교수님 3명 = 교수님 칸 색 3가지 (10-10: 점 대신 칸 전체를 연하게) (${dots})`);
    const head = page.locator('[data-section-head]').filter({ hasText: /^검사 대기 · 10명$/ });
    ok(await head.count() === 1 && await head.evaluate(e => getComputedStyle(e).borderLeftWidth === '4px' && Number(getComputedStyle(e).fontWeight) >= 700), "⑦ '검사 대기 · 10명' 굵게 + 왼쪽 막대");
  }
  await page.screenshot({ path: `${SP}/r103-vision-${label}.png` });
  // 끌어서 순서 바꾸기: 2열이면 4번(둘째 줄 오른쪽)을 1번 자리로, 한 줄이면 1번을 3번 아래로
  await editKey('daily-patients', seed); await W(1500);
  const rects = await page.evaluate(() => [...document.querySelectorAll('[aria-label="끌어서 순서 바꾸기"]')].map(hd => {
    const c = hd.closest('.pb-3').getBoundingClientRect(); const r = hd.getBoundingClientRect();
    return { hx: r.left + r.width / 2, hy: r.top + r.height / 2, cx: c.left + c.width / 2, cy: c.top + c.height / 2 };
  }));
  const [from, to] = n === 2 ? [3, 0] : [0, 2];
  const a = rects[from], b = rects[to];
  await page.mouse.move(a.hx, a.hy); await page.mouse.down();
  const ex = a.hx + (b.cx - a.cx) + (n === 2 ? 0 : 0), ey = a.hy + (b.cy - a.cy) + (n === 2 ? 0 : 20);
  await page.mouse.move(ex, ey, { steps: 12 }); await W(200); await page.mouse.up(); await W(1200);
  const o = await order();
  const want = n === 2 ? ['남궁하늘', '서준호', '신종희', '조현우'] : ['신종희', '조현우', '서준호', '남궁하늘'];
  ok(o.slice(0, 4).join(',') === want.join(','), `${label}: 끌어서 순서 바꾸기 (${n === 2 ? '4번 → 1번 자리' : '1번 → 3번 자리'}) ${o.slice(0, 4).join(',')}`);
  await editKey('daily-patients', seed);
  await back(); await pick('31번방'); await W(900);
  ok(await cols(page) === 1, `${label}: 검사실 카드는 한 줄 그대로`);
  ok(!(await overflow(page)), `${label}: 검사실 가로 넘침 없음`);
  await page.screenshot({ path: `${SP}/r103-exam-${label}.png` });
  await back(); await pick('관리자');
  await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(900);
  const adminCols = await page.evaluate(() => new Set([...document.querySelectorAll('[data-edge]')].slice(0, 6).map(c => Math.round(c.getBoundingClientRect().left))).size);
  ok(adminCols === 1, `${label}: 명단 관리 카드는 한 줄 그대로 (${adminCols})`);
  ok(!(await overflow(page)), `${label}: 명단 관리 가로 넘침 없음`);
  await page.screenshot({ path: `${SP}/r103-admin-${label}.png` });
  await page.getByRole('button', { name: 'FU 지정 관리', exact: true }).click(); await W(600);
  ok(await page.evaluate(() => document.querySelector('.max-w-6xl')?.getBoundingClientRect().width <= 1152), `${label}: 관리자 화면은 예전 폭 그대로`);
  await back(); await pick('처치실'); await W(900);
  const muted = page.locator('[data-section-head]').filter({ hasText: /^처치 대기 · 0명$/ });
  ok(await muted.count() === 1 && await muted.evaluate(e => Number(getComputedStyle(e).fontWeight) < 700), "⑦ 0명인 구역 제목은 흐리게 ('처치 대기 · 0명')");
  await page.screenshot({ path: `${SP}/r103-treat-${label}.png` });
  await back(); await pick('진료실'); await W(900);
  const picker = await page.getByRole('button', { name: /^(김선웅|나상훈|이종혁)$/ }).evaluateAll(es => new Set(es.map(e => getComputedStyle(e).backgroundColor)).size);
  ok(picker >= 3, `④ 진료실 교수님 고르기 버튼도 교수님 색 (${picker})`);
  await page.screenshot({ path: `${SP}/r103-consult-${label}.png` });
  ok(errors.length === 0, `${label}: 페이지 오류 없음 ${errors.join(' / ')}`);
  await page.close();
}
// 교수님 색 고르기: 설정 > 교수 관리 (교수님별 설정의 새 칸 dotColor, 안 고르면 자동)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } });
  const { errors, ok, W, pick, back } = tester(page);
  await page.goto(`${BASE}/`); await W(900);
  await pick('시력'); await W(800);
  const dotOf = (doc) => page.locator('[data-doctor-chip]').filter({ hasText: new RegExp(`^${doc}$`) }).first().evaluate(e => getComputedStyle(e).backgroundColor);
  const before = await dotOf('이종혁');
  await back(); await pick('설정');
  await page.getByRole('button', { name: '교수 관리', exact: true }).click(); await W(300);
  await page.getByRole('button', { name: `김선웅 색 ${3}`, exact: true }).click(); await W(200);
  await page.getByRole('button', { name: '저장', exact: true }).click(); await W(1000);
  const prefs = (await getKey('doctor-prefs')).value;
  ok(prefs?.['김선웅']?.dotColor === '#0891b2', "설정에서 고른 색이 교수님별 설정 새 칸(dotColor)에 저장");
  await page.screenshot({ path: `${SP}/r103-settings-color.png` });
  await back(); await pick('시력'); await W(800);
  ok(await dotOf('김선웅') === 'rgba(8, 145, 178, 0.14)', '직원 화면 김선웅 점 = 고른 색');
  const after = await dotOf('이종혁');
  ok(after !== 'rgba(8, 145, 178, 0.14)' && before === 'rgba(8, 145, 178, 0.14)', `자동 색이던 교수님(이종혁)은 겹치지 않는 다른 색으로 (${before} → ${after})`);
  await back(); await pick('설정');
  await page.getByRole('button', { name: '교수 관리', exact: true }).click(); await W(300);
  await page.locator('[data-dot-picker="김선웅"]').getByRole('button', { name: '자동', exact: true }).click(); await W(200);
  await page.getByRole('button', { name: '저장', exact: true }).click(); await W(1000);
  ok(!('dotColor' in ((await getKey('doctor-prefs')).value?.['김선웅'] || {})), '[자동]을 누르면 고른 색을 지움 (예전처럼 자동)');
  ok(errors.length === 0, `교수님 색: 페이지 오류 없음 ${errors.join(' / ')}`);
  await page.close();
}
await browser.close();
