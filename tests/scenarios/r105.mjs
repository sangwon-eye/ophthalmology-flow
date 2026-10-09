import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 시력방 TV 6번부터 글씨 (10-09 사용자: 1~5번과 차이가 너무 크지 않게, 시력방 대기는 20명을 넘지 않음, 이름은 모두 가상)
// '시력방 대기 명단': 1번 60px · 2~5번 48px · 6번부터 36px(예전 18px) / '시력방 + 검사실': 1~5번 30px · 6번부터 24px(예전 18px)
// 1920×1080에서 20명이 스크롤 없이 한 화면에
const today = new Date().toLocaleDateString('sv-SE');
const names = ['서준호', '신종희', '조현우', '남궁하늘', '임수빈', '장민호', '최민지', '이솔', '한지훈', '오세영', '권나은', '황도윤', '송하린', '박영수', '제갈민준', '강서윤', '윤지아', '원성옥', '문가람', '남궁서연'];
await editKey('daily-patients', () => names.map((name, i) => ({ id: String(6950000 + i * 67), name, date: today, doctor: '김선웅', reservation: `${String(9 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`, checkin: '08:30', late: false, assigned: { visionIop: true, oct: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 540 + i * 10 + 0.05 })));
const browser = await chromium.launch();
const nameSize = (page, n) => page.evaluate((nm) => {
  const el = [...document.querySelectorAll('span, div')].find(e => !e.children.length && e.textContent.trim() === nm);
  return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
}, n);
for (const [btn, label, file, want] of [[/^시력.*대기 명단/, '시력방 대기 명단', 'vision', { first: '서준호', firstPx: 60, mid: '신종희', midPx: 48, restPx: 36 }], [/^시력.*\+ 검사실/, '시력방 + 검사실', 'vision-exam', { first: '서준호', firstPx: 30, mid: '임수빈', midPx: 30, restPx: 24 }]]) {
  for (const [w, h] of [[1920, 1080], [1280, 1024]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const { errors, ok, W } = tester(page);
    await page.goto(`${BASE}/`); await W(700);
    await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
    await page.getByRole('button', { name: btn }).first().click(); await W(1500);
    const tag = `${label} ${w}×${h}`;
    const rest = await nameSize(page, '장민호');
    if (w === 1920) {
      ok(await nameSize(page, want.first) === want.firstPx && await nameSize(page, want.mid) === want.midPx, `${tag}: 앞 순서 글씨 그대로 (${want.firstPx}·${want.midPx}px)`);
      ok(rest === want.restPx, `${tag}: 6번부터 ${want.restPx}px (${rest}px, 예전 18px)`);
      ok(await page.evaluate(() => { const sc = document.querySelector('.board-scroll'); return sc.scrollHeight <= sc.clientHeight + 1; }), `${tag}: 20명이 스크롤 없이 한 화면에`);
    }
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && ![...document.querySelectorAll('[data-small-rest] .rounded-2xl, [data-small-rest] .rounded-lg')].some(e => e.scrollWidth > e.clientWidth + 1)), `${tag}: 글자가 칸 밖으로 넘치지 않음`);
    await page.screenshot({ path: `${SP}/r105-${file}-${w}.png` });
    ok(errors.length === 0, `${tag}: 페이지 오류 없음 ${errors.join(' / ')}`);
    await page.close();
  }
}
await browser.close();
