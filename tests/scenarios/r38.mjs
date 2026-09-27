import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// Schirmer: 처치실 시간 재기, 이름 비움, '확인하면 검사 완료' 끔 → [확인]하면 검사 완료, 진료 전 검사에 안 남음
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  return { ...s, rooms, tests: [...s.tests, { id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 2, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: '', prepWaitMin: 5, prepCompletes: false, withExams: true, noOrder: true }] };
});
// 예전 상태: 확인만 되고 완료 안 된 환자
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '임수빈') return { ...p, assigned: { ...p.assigned, sch: true } };
  if (p.name === '한지훈') return { ...p, assigned: { ...p.assigned, sch: true }, prep: { sch: { startedAt: Date.now() - 600000, result: 'neg', at: Date.now() - 300000 } } };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W(1500);
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '한지훈').done.sch === true, '예전에 확인만 된 환자: 자동으로 완료 처리'); }
await pick('처치실');
const card = page.locator('div.bg-white').filter({ has: page.getByText('임수빈', { exact: true }) }).filter({ hasText: 'Schirmer' }).first();
ok(await card.getByRole('button', { name: 'Schirmer', exact: true }).count() >= 1, '이름을 비우면 버튼은 검사 이름 [Schirmer]');
await card.getByRole('button', { name: 'Schirmer', exact: true }).first().click(); await W();
await card.getByRole('button', { name: '지금 확인' }).click(); await W(800);
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '임수빈').done.sch === true, '처치실 검사: [확인] = 검사 완료'); }
ok(await page.getByRole('button', { name: /^Schirmer \d+명/ }).count() === 0, '진료 전 검사 위 버튼에 Schirmer 없음');
ok(await page.getByText(/^진료 전 검사/).count() === 0 || await page.locator('div.bg-white').filter({ has: page.getByText('임수빈', { exact: true }) }).getByRole('button', { name: /^Schirmer$/ }).count() === 0, '진료 전 검사에 Schirmer 안 남음');
await page.screenshot({ path: `${SP}/r38-treat.png`, fullPage: true });
await pick('메인 화면').catch(() => {});
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
