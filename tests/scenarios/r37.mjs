import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 처치실 검사 준비 카드에서도 [검사 변경]
await editKey('settings', s => ({ ...s, tests: s.tests.map(t => t.id === 'fag' ? { ...t, prepOn: true, prepName: 'skin test', prepWaitMin: 20 } : t) }));
await editKey('daily-patients', list => list.map(p => (p.name === '조현우' ? { ...p, assigned: { ...p.assigned, fag: true } } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('처치실');
const card = page.locator('div.bg-white').filter({ has: page.getByText('조현우', { exact: true }) }).filter({ hasText: 'skin test' }).first();
await card.getByRole('button', { name: '검사 변경' }).click(); await W(200);
await card.getByRole('button', { name: /^\+?\s*VF$/ }).first().click(); await W(800);
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '조현우').assigned.vf === true, '검사 준비 카드에서 VF 추가'); }
await card.screenshot({ path: `${SP}/r37-prep-picker.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
