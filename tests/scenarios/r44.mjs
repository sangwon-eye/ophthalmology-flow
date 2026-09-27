import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// Schirmer([끝 · 확인] 방식): 시간이 되면 '결과 확인'에도 올라오고, 어느 쪽에서 확인해도 둘 다에서 빠짐
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  return { ...s, rooms, tests: [...s.tests,
    { id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 2, options: [], popupOnClick: false, machine: '', timed: true, prepWaitMin: 5, withExams: true, noOrder: true },
    { id: 'tb', name: 'TBUT', short: 'TBUT', roomId: 'C', order: 5, options: [], popupOnClick: false, machine: '', timed: true, prepWaitMin: 5, noOrder: true }] };
});
const now = Date.now();
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '임수빈' || p.name === '한지훈') return { ...p, assigned: { ...p.assigned, sch: true }, prep: { sch: { startedAt: now - 6 * 60000, name: 'Schirmer' } } };
  if (p.name === '장민호') return { ...p, assigned: { ...p.assigned, sch: true }, prep: { sch: { startedAt: now - 60000, name: 'Schirmer' } } };
  if (p.name === '윤지아') return { ...p, assigned: { ...p.assigned, tb: true }, prep: { tb: { startedAt: now - 6 * 60000, name: 'TBUT' } } };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('처치실');
const res = page.locator('#treat-check');
const resText = async () => ((await res.count()) ? await res.innerText() : '');
let t = await resText();
ok(/임수빈/.test(t) && /한지훈/.test(t), '시간이 된 Schirmer 2명이 결과 확인에 올라옴');
ok(!/장민호/.test(t), '아직 시간이 안 된 환자는 없음');
ok(!/윤지아|TBUT/.test(t), '다른 검사실의 시간 재기 검사는 올라오지 않음');
ok(/결과 확인 2/.test(await page.locator('[data-summary="treat-check"]').innerText()), '요약 줄: 결과 확인 2');
await page.screenshot({ path: `${SP}/r44-check.png` });
// 결과 확인에서 확인 → 검사 완료, 진료 전 검사 칸에서도 사라짐
await res.locator('div.bg-white').filter({ hasText: '임수빈' }).getByRole('button', { name: /Schirmer \d\d:\d\d · 확인/ }).click(); await W(800);
let pt = (await getKey('daily-patients')).value.find(p => p.name === '임수빈');
ok(pt.done.sch === true, '결과 확인에서 [확인] → Schirmer 완료');
ok(await page.locator('#treat-exams').getByRole('button', { name: /Schirmer 끝 · 확인/ }).count() === 1, '진료 전 검사 칸에는 한지훈 것만 남음');
// 진료 전 검사 칸에서 확인 → 결과 확인에서도 빠짐
await page.locator('#treat-exams').getByRole('button', { name: /Schirmer 끝 · 확인/ }).click(); await W(800);
pt = (await getKey('daily-patients')).value.find(p => p.name === '한지훈');
ok(pt.done.sch === true, '진료 전 검사 칸에서 확인 → 완료');
ok(!/한지훈/.test(await resText()), '결과 확인에서도 빠짐');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
