import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 시간 전 강제 완료: FAG skin test(확인 후 넘어감) · MMP(바로 넘어감)
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  const tests = s.tests.map(t => t.id === 'fag' ? { ...t, prepOn: true, prepName: 'skin test', prepWaitMin: 20 } : t);
  tests.push({ id: 'mmp', name: 'MMP', short: 'MMP', roomId: 'treat', order: 3, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: 'MMP', prepWaitMin: 10, prepMode: 'go', withExams: true, noOrder: true });
  return { ...s, rooms, tests };
});
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '조현우') return { ...p, assigned: { ...p.assigned, fag: true } };
  if (p.name === '장민호') return { ...p, assigned: { ...p.assigned, mmp: true } };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('처치실');
const fag = page.locator('div.bg-white').filter({ has: page.getByText('조현우', { exact: true }) }).filter({ hasText: 'skin test' }).first();
await fag.getByRole('button', { name: 'skin test', exact: true }).click(); await W();
await fag.screenshot({ path: `${SP}/r34-force.png` });
await fag.getByRole('button', { name: '지금 확인' }).click(); await W();
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '조현우').prep.fag.result === 'neg', 'skin test: 시간 전 [지금 확인] → 검사실로'); }
const mmp = page.locator('div.bg-white').filter({ has: page.getByText('장민호', { exact: true }) }).filter({ hasText: 'MMP' }).first();
await mmp.getByRole('button', { name: 'MMP', exact: true }).click(); await W();
await page.getByRole('button', { name: '지금 확인' }).click(); await W();
{ const l = (await getKey('daily-patients')).value; ok(!!l.find(p => p.name === '장민호').prep.mmp.checked, 'MMP: 시간 전 [지금 확인] → 확인 기록'); }
ok(await page.locator('#treat-check').count() === 0 && await page.locator('#treat-prep').count() === 0, '둘 다 목록에서 빠짐');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
