import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 진료실 명단(진료실 앞 모니터·복도 끝 모니터)이 작은 화면·높은 배율·큰 글씨에서도 넘치거나 겹치지 않음 (10-07 사용자)
// 한 줄 = 예약시간 · 이름 · 번호 뒷 4자리 · 재진료 — 넘치면 겹치지 않고 다음 줄로 (이름은 가장 큰 칸도 화면 폭을 넘지 않게)
const testing = (p, extra) => ({ ...p, doctor: '김선웅', assigned: { visionIop: true, wfp: true }, done: { visionIop: true, wfp: true }, measureOk: 1, calledRoom: null, seen: false, consultDone: false, procedures: [], late: false, ...extra });
await editKey('daily-patients', list => list.map(p => {
  if (p.doctor === '김선웅' && !['서준호', '신종희', '조현우', '최민지', '임수빈', '정대현', '장민호'].includes(p.name)) return { ...p, doctor: '나상훈' };
  if (p.name === '서준호') return testing(p, { reservation: '10:30', checkin: '08:30', queueKey: 630.0510, consultHold: true }); // 다음 순서 + 재진료 (가장 긴 줄)
  if (p.name === '신종희') return testing(p, { reservation: '10:40', checkin: '08:30', queueKey: 640.0510, consultHold: true });
  if (p.name === '조현우') return testing(p, { reservation: '11:00', checkin: '08:30', queueKey: 660.0510 });
  if (p.name === '최민지') return testing(p, { reservation: '09:10', checkin: '10:20', late: true, queueKey: 100550.062 });
  if (p.name === '임수빈') return testing(p, { reservation: '11:20', checkin: '08:10', queueKey: 680.0490, consultHold: true });
  if (p.name === '장민호') return testing(p, { reservation: '11:30', checkin: '08:30', queueKey: 690.0510 });
  if (p.name === '정대현') return testing(p, { reservation: '11:40', checkin: '08:31', queueKey: 700.0511 });
  return p;
}));
const browser = await chromium.launch();
const { ok } = tester(await browser.newPage());
const sizes = [[1920, 1080, '1920 100%'], [1280, 720, '1920 150%'], [1093, 614, '1366 125%'], [911, 512, '1366 150%'], [683, 384, '1366 200%']];
for (const screen of [/^김선웅 진료실/, /^진료실 대기 명단 \(전체\)/]) {
  for (const [w, h, label] of sizes) {
    for (const ts of ['auto', '1.5']) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = []; page.on('pageerror', e => errs.push(e.message));
      await page.addInitScript((v) => { try { localStorage.removeItem('oph-role'); localStorage.setItem('ui-text-size', v); } catch { /* 없음 */ } }, ts);
      await page.goto(`${BASE}/`); await page.waitForTimeout(600);
      await page.getByRole('button', { name: /^환자용 화면/ }).click(); await page.waitForTimeout(300);
      await page.getByRole('button', { name: screen }).click(); await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({
        over: [...document.querySelectorAll('div.rounded-2xl.border-2, [data-consult-row]')].filter(e => e.scrollWidth > e.clientWidth + 1).length,
        page: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      ok(r.over === 0 && !r.page && errs.length === 0, `${String(screen).includes('전체') ? '복도 끝' : '진료실 앞'} ${label} 글씨 ${ts}: 넘침 없음 (${r.over})`);
      if (w === 911 && ts === '1.5') await page.screenshot({ path: `${SP}/r91-${String(screen).includes('전체') ? 'all' : 'doctor'}-911-150.png` });
      await page.close();
    }
  }
}
await browser.close();
