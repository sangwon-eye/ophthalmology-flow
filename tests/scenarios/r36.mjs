import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 일반 검사(OSDI, 처치실)에 진행 중 호출 금지 → [▶ 시작]·[종료], 그동안 31번방 잠김
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  return { ...s, rooms, tests: [...s.tests, { id: 'osdi', name: 'OSDI 설문', short: 'OSDI', roomId: 'treat', order: 0, options: [], popupOnClick: false, machine: '', withExams: true, noOrder: true, holdCall: true }] };
});
await editKey('daily-patients', list => list.map(p => (p.name === '임수빈' ? { ...p, assigned: { ...p.assigned, osdi: true } } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('설정');
ok(await page.locator('[data-test-row="OCT"]').getByRole('button', { name: /진행 중 호출 금지/ }).count() === 1, '설정: 일반 검사(OCT)에도 칩');
ok(await page.locator('[data-test-row="VF"]').getByRole('button', { name: /진행 중 호출 금지/ }).getAttribute('aria-pressed') === 'true', 'VF도 같은 칩 (처음부터 켜짐)');
ok(await page.locator('[data-test-row="FAG"]').getByRole('button', { name: /검사 준비/ }).count() === 1 && await page.locator('[data-test-row="FAG"]').getByRole('button', { name: /시간 재기/ }).count() === 1, '검사 준비·시간 재기 칩이 따로');
await back();
await pick('처치실');
let c = cardOf('임수빈');
await c.getByRole('button', { name: '▶ 시작' }).click(); await W();
ok(await c.getByText(/OSDI.*검사 중/).count() >= 1, '처치실: OSDI 검사 중');
await back();
await pick('31번방');
c = cardOf('임수빈');
ok(await c.getByText('처치실 OSDI 중 · 호출 금지').count() === 1, '31번방: 처치실 OSDI 중 · 호출 금지');
ok(await c.getByRole('button', { name: /^OCT/ }).first().isDisabled(), '31번방: 검사 칸 잠김');
await c.screenshot({ path: `${SP}/r36-hold-general.png` });
await back();
await pick('처치실');
await cardOf('임수빈').getByRole('button', { name: '종료', exact: true }).click(); await W();
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '임수빈').done.osdi === true, '종료 → OSDI 완료'); }
await back();
await pick('31번방');
ok(!(await cardOf('임수빈').getByRole('button', { name: /^OCT/ }).first().isDisabled()), '종료 후 다시 부를 수 있음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
