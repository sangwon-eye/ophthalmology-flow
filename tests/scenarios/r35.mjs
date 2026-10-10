import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// Schirmer: 대기 중에도 + 진행 중 호출 금지 / 임수빈은 31번방 OCT도 남음
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  return { ...s, rooms, tests: [...s.tests, { id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 2, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: 'Schirmer strip', prepWaitMin: 5, prepCompletes: true, withExams: true, noOrder: true, holdCall: true }] };
});
await editKey('daily-patients', list => list.map(p => (p.name === '임수빈' ? { ...p, assigned: { ...p.assigned, sch: true } } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('처치실');
const card = page.locator('div.bg-white').filter({ has: page.getByText('임수빈', { exact: true }) }).filter({ has: page.getByRole('button', { name: /^Schirmer/ }) }).last();
await card.getByRole('button', { name: 'Schirmer', exact: true }).first().click(); await W();
await back();
await pick('31번방');
let c = cardOf('임수빈');
ok(await c.getByText('처치실 Schirmer 중 · 호출 금지').count() === 1, '검사실: Schirmer 중 호출 금지 표시');
ok(await c.getByRole('button', { name: /^OCT/ }).first().isDisabled(), '검사실: 검사 칸 잠김');
await c.screenshot({ path: `${SP}/r35-hold.png` });
await back();
await pick('처치실');
await page.locator('#treat-check div.bg-white').filter({ has: page.getByText('임수빈', { exact: true }) }).first().getByRole('button', { name: '지금 확인' }).click(); await W(); // 10-10: 시작하면 결과 확인 칸으로
await back();
await pick('31번방');
c = cardOf('임수빈');
ok(await c.getByText(/호출 금지/).count() === 0 && !(await c.getByRole('button', { name: /^OCT/ }).first().isDisabled()), 'Schirmer 확인 후 다시 부를 수 있음');
await back();
await pick('설정');
ok(await page.locator('[data-test-row="Schirmer"]').getByRole('button', { name: /진행 중 호출 금지/ }).getAttribute('aria-pressed') === 'true', '설정: 진행 중 호출 금지 칩');
ok(await page.locator('[data-test-row="Schirmer"]').getByRole('button', { name: /시간 재기/ }).getAttribute('aria-pressed') === 'true' && await page.locator('[data-test-row="Schirmer"]').getByRole('button', { name: /검사 준비/ }).getAttribute('aria-pressed') === 'false', '예전 처치실 시간 재기 → [시간 재기] 칩으로 자동 이동');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
