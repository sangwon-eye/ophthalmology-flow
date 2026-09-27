import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES } from '../lib.mjs';
// 설정: FAG 준비 단계, 처치실에 OSDI(바로)·Syringing(나중)
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  const tests = s.tests.map(t => t.id === 'fag' ? { ...t, prepOn: true, prepName: '동의서 · skin test', prepWaitMin: 20 } : t);
  tests.push({ id: 'osdi', name: 'OSDI 설문', short: 'OSDI', roomId: 'treat', order: 0, options: [], popupOnClick: false, machine: '', withExams: true });
  tests.push({ id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 2, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: 'Schirmer strip', prepWaitMin: 5, prepCompletes: true, withExams: true, noOrder: true });
  tests.push({ id: 'syr', name: 'Syringing', short: 'Syringing', roomId: 'treat', order: 1, options: [], popupOnClick: false, machine: '' });
  return { ...s, rooms, tests };
});
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '조현우') return { ...p, assigned: { ...p.assigned, fag: true, osdi: true, syr: true } };
  if (p.name === '한지훈') return { ...p, assigned: { ...p.assigned, fag: true } };
  if (p.name === '임수빈') return { ...p, assigned: { ...p.assigned, sch: true } };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('31번방');
let c = cardOf('조현우');
ok(await c.getByText('동의서 · skin test 전').count() === 1, '31번방: FAG 칸 잠김 (준비 전)');
await c.screenshot({ path: `${SP}/r16-fag-locked.png` });
await back();
await pick('처치실');
ok(await page.getByText(/^검사 준비 · 3명/).count() === 1, '처치실: 검사 준비 3명 (FAG 2, Schirmer 1)');
const sch = page.locator('div.bg-white').filter({ hasText: 'Schirmer strip' }).filter({ has: page.getByText('임수빈', { exact: true }) }).first();
await sch.getByRole('button', { name: 'Schirmer strip 시작' }).click(); await W();
await sch.getByRole('button', { name: '확인', exact: true }).click(); await W();
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '임수빈').done.sch === true, 'Schirmer: 확인하면 검사 완료'); }
ok(await page.getByText(/^진료 전 검사 · 1명/).count() === 1, '처치실: 진료 전 검사에 OSDI 환자(조현우)');
const emb = cardOf('조현우');
ok(await page.locator('div.bg-white').filter({ has: page.getByText('조현우', { exact: true }) }).getByRole('button', { name: /^OSDI/ }).count() >= 1, 'OSDI는 검사실 대기 중에도 처치실에');
await page.screenshot({ path: `${SP}/r16-treat.png`, fullPage: true });
// 조현우 준비 시작 → 음성
const prepCard = page.locator('div.bg-white').filter({ hasText: '동의서 · skin test' }).filter({ has: page.getByText('조현우', { exact: true }) }).first();
await prepCard.getByRole('button', { name: '동의서 · skin test 시작' }).click(); await W();
ok(await prepCard.getByText(/시작 · 0분 \/ 20분/).count() === 1, 'skin test 타이머 표시');
await prepCard.getByRole('button', { name: '확인', exact: true }).click(); await W();
// 한지훈 시작 → 양성
const han = page.locator('div.bg-white').filter({ hasText: '동의서 · skin test' }).filter({ has: page.getByText('한지훈', { exact: true }) }).first();
await han.getByRole('button', { name: '동의서 · skin test 시작' }).click(); await W();
await han.getByRole('button', { name: '검사 취소' }).click(); await W();
ok(await page.getByText(/^검사 준비 · /).count() === 0, '확인/취소 후 검사 준비 목록에서 빠짐');
await back();
await pick('31번방');
c = cardOf('조현우');
ok(await c.getByText('동의서 · skin test 전').count() === 0 && await c.getByRole('button', { name: /^FAG/ }).count() >= 1, '음성 → 31번방 FAG 칸 열림');
const h = cardOf('한지훈');
ok(await h.getByText('FAG 검사 취소').count() >= 1, '양성 → 한지훈 카드에 보류 표시');
// 한지훈 나머지 검사(OCT, WFP) 완료 → 진료 대기로
for (const n of ['OCT', 'WFP']) { const b = h.getByRole('button', { name: new RegExp(`^${n}`) }).first(); if (await b.count()) { await b.click(); await W(400); } }
await back();
await pick('진료실');
await page.getByRole('button', { name: '나상훈', exact: true }).first().click(); await W();
ok(await cardOf('한지훈').getByText('FAG 검사 취소').count() >= 1, '양성이어도 나머지 검사 끝나면 진료 대기 + 표시');
await back();
// 조현우: OCT·WFP·FAG 완료 → Syringing 처치실에 뜸
await pick('31번방');
c = cardOf('조현우');
for (const n of ['OCT', 'WFP', 'FAG']) { const b = c.getByRole('button', { name: new RegExp(`^${n}`) }).first(); if (await b.count()) { await b.click(); await W(400); } }
await back();
await pick('처치실');
const z = page.locator('div.bg-white').filter({ has: page.getByText('조현우', { exact: true }) }).last();
ok(await z.getByRole('button', { name: /^Syringing/ }).count() >= 1, '다른 검사 끝나면 Syringing도 처치실에');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
