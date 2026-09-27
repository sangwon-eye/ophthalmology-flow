import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 진료 전 검사: 완료된 MMP·Schirmer 칸을 다시 누르면 시작 시각 없이 미시행으로
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  return { ...s, rooms, tests: [...s.tests,
    { id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 2, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: '', prepWaitMin: 5, withExams: true, noOrder: true },
    { id: 'mmp', name: 'MMP-9', short: 'MMP-9', roomId: 'treat', order: 3, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: '', prepWaitMin: 10, prepMode: 'go', withExams: true, noOrder: true }] };
});
await editKey('daily-patients', list => list.map(p => (p.name === '임수빈' ? { ...p, assigned: { ...p.assigned, sch: true, mmp: true } } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
const pt = async () => (await getKey('daily-patients')).value.find(p => p.name === '임수빈');
await page.goto(`${BASE}/`); await W();
await pick('처치실');
const c = () => page.locator('div.bg-white').filter({ has: page.getByText('임수빈', { exact: true }) }).filter({ has: page.getByRole('button', { name: /^Schirmer/ }) }).last();
// MMP: 시작 → 완료 → 다시 누르면 MMP-9 로 (시작 시각 없음)
await c().getByRole('button', { name: 'MMP-9', exact: true }).first().click(); await W(800);
ok((await pt()).done.mmp === true, 'MMP 시작 → 완료');
await c().getByRole('button', { name: /MMP-9/ }).first().click(); await W(800);
let x = await pt();
ok(!x.done.mmp && !x.prep?.mmp, '다시 누르면 미시행 + 시작 시각 지워짐');
ok(await c().getByRole('button', { name: 'MMP-9', exact: true }).count() >= 1 && await c().getByRole('button', { name: /^MMP-9 \d\d:\d\d/ }).count() === 0, '칸이 [MMP-9] 로 돌아옴');
ok(await page.locator('#treat-check').count() === 0, '결과 확인에서도 빠짐');
// Schirmer: 시작 → 지금 확인 → 완료 → 다시 누르면 미시행으로 유지
await c().getByRole('button', { name: 'Schirmer', exact: true }).first().click(); await W(600);
await c().getByRole('button', { name: '지금 확인' }).click(); await W(800);
ok((await pt()).done.sch === true, 'Schirmer 완료');
await c().getByRole('button', { name: /Schirmer/ }).first().click(); await W(6000);
x = await pt();
ok(!x.done.sch && !x.prep?.sch, 'Schirmer 다시 누르면 미시행으로 돌아가고 유지됨');
await c().screenshot({ path: `${SP}/r40-undone.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
