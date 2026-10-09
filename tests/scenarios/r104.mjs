import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 진료실 앞 모니터 (10-09 사용자 B안, 이름은 모두 가상): 진료 중(회색) · 다음 순서(가장 크게) · 2번부터 모두 같은 크기 두 줄.
// 화면에 다 안 들어가면 마지막 칸 '외 N명 대기' + '순서는 복도 끝 모니터에서 확인' — 화면이 넘치지 않아 '다음 순서'가 자동 스크롤로 밖에 나가지 않음.
// 모니터 1280×1024·1920×1080, 크롬 배율 100·125·150%, 대기 화면 '글씨' 125·150%에서 확인
const today = new Date().toLocaleDateString('sv-SE');
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const names = ['문가람', '백승우', '유채원', '제갈민준', '노지훈', '배수민', '전하은', '고은비', '류태양', '안다인', '남궁서연', '홍길순', '서준호', '신종희'];
const seed = (count) => names.slice(0, count + 1).map((name, i) => {
  const p = { id: String(6900000 + i * 61), name, date: today, doctor: '김선웅', reservation: hm(570 + i * 10), checkin: '08:30', late: false, assigned: { visionIop: true, oct: true }, done: { visionIop: true, oct: true }, doneAt: {}, drops: [], procedures: [], queueKey: 570 + i * 10 + 0.051, measureOk: 1 };
  if (i === 0) p.calledRoom = '김선웅';
  if (i === 2 || i === 5) p.consultHold = true; // 재진료 (모서리 표)
  if (i === 7) { p.late = true; p.checkin = '10:20'; p.queueKey = 700.06; }
  return p;
});
await editKey('doctor-prefs', (v) => ({ ...(v || {}), 김선웅: { ...(v?.김선웅 || {}), roomNo: '3' } }));
const browser = await chromium.launch();
const check = (page) => page.evaluate(() => {
  const sc = document.querySelector('.board-scroll');
  const grid = document.querySelector('[data-front-rest]');
  const cells = grid ? [...grid.children] : [];
  const hs = cells.map(c => Math.round(c.getBoundingClientRect().height));
  const nums = cells.filter(c => !c.hasAttribute('data-front-more')).map(c => Number(c.querySelector('.rounded-full')?.textContent));
  const moreEl = grid?.querySelector('[data-front-more]');
  const more = moreEl ? moreEl.firstElementChild.textContent : '';
  const moreHint = moreEl ? /순서는 복도 끝 모니터에서 확인/.test(moreEl.textContent) : true;
  const next = [...document.querySelectorAll('.rounded-2xl')].find(e => /다음 순서/.test(e.textContent));
  const foot = document.querySelector('[data-board-foot]');
  return {
    fits: sc.scrollHeight <= sc.clientHeight + 1,
    cols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
    same: hs.length ? Math.max(...hs) - Math.min(...hs) <= 1 : true,
    nums, more, moreHint,
    nextBig: next ? parseFloat(getComputedStyle(next.querySelector('span.whitespace-nowrap:not(.rounded-full)') || next).fontSize) : 0,
    restName: cells[0] ? parseFloat(getComputedStyle(cells[0].querySelector('span.whitespace-nowrap:not(.rounded-full)') || cells[0]).fontSize) : 0,
    footVisible: !!foot && foot.getBoundingClientRect().bottom <= sc.getBoundingClientRect().bottom + 1,
    wide: [...document.querySelectorAll('.rounded-2xl')].some(e => e.scrollWidth > e.clientWidth + 1),
  };
});
const cases = [
  ['1280×1024', 1280, 1024, 1, '1'], ['1280×1024 배율125', 1280, 1024, 1.25, '1'], ['1280×1024 배율150', 1280, 1024, 1.5, '1'],
  ['1920×1080', 1920, 1080, 1, '1'], ['1920×1080 배율125', 1920, 1080, 1.25, '1'], ['1920×1080 배율150', 1920, 1080, 1.5, '1'],
  ['1920×1080 글씨125', 1920, 1080, 1, '1.25'], ['1920×1080 글씨150', 1920, 1080, 1, '1.5'], ['1280×1024 글씨150', 1280, 1024, 1, '1.5'],
];
for (const count of [13, 3]) {
  await editKey('daily-patients', () => seed(count));
  for (const [label, w, h, zoom, text] of count === 3 ? cases.slice(0, 1) : cases) {
    const page = await browser.newPage({ viewport: { width: Math.round(w / zoom), height: Math.round(h / zoom) }, deviceScaleFactor: zoom });
    const { errors, ok, W } = tester(page);
    await page.addInitScript((t) => { try { localStorage.setItem('ui-text-size', t); } catch { /* 없음 */ } }, text);
    await page.goto(`${BASE}/`); await W(700);
    await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
    await page.getByRole('button', { name: /^김선웅 진료실/ }).first().click(); await W(1800);
    const r = await check(page);
    const tag = `${label} 대기 ${count}명`;
    if (count === 3) {
      ok(r.fits && !r.more && r.nums.join(',') === '2,3', `${tag}: 적으면 '외 N명' 없이 2·3번 (${r.nums.join(',')})`);
    } else {
      const shown = r.nums.length;
      ok(r.fits && r.footVisible, `${tag}: 화면이 넘치지 않음 (아래 안내 줄까지 보임)`);
      ok(r.cols === 2, `${tag}: 2번부터 두 줄 (${r.cols})`);
      ok(r.same, `${tag}: 2번부터 칸 크기가 모두 같음`);
      ok(r.nums.every((n, i) => n === i + 2) && (shown === 12 ? !r.more : r.more === `외 ${12 - shown}명 대기`), `${tag}: 번호 2~${shown + 1} + ${r.more || '모두 보임'}`);
      ok(r.nextBig > r.restName * 1.3, `${tag}: 다음 순서가 가장 큼 (${r.nextBig} > ${r.restName})`);
      ok(!r.wide, `${tag}: 글자가 칸 밖으로 넘치지 않음`);
      ok(r.moreHint, `${tag}: '외 N명' 칸에 '순서는 복도 끝 모니터에서 확인'`);
      if (/^1280×1024( 배율125| 글씨150)?$|^1920×1080( 배율150)?$/.test(label)) await page.screenshot({ path: `${SP}/r104-${label.replace(/[×\s]/g, '-')}.png` });
    }
    ok(errors.length === 0, `${tag}: 페이지 오류 없음 ${errors.join(' / ')}`);
    await page.close();
  }
}
await browser.close();
