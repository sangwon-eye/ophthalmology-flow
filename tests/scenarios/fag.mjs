import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES } from '../lib.mjs';
// 설정: FAG 준비 단계, 처치실에 OSDI(바로)·Syringing(나중)
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  const tests = s.tests.map(t => t.id === 'fag' ? { ...t, prepOn: true, prepName: '동의서 · skin test', prepWaitMin: 20 } : t);
  tests.push({ id: 'osdi', name: 'OSDI 설문', short: 'OSDI', roomId: 'treat', order: 0, options: [], popupOnClick: false, machine: '', withExams: true });
  tests.push({ id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 2, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: 'Schirmer strip', prepWaitMin: 5, prepCompletes: true, withExams: true, noOrder: true });
  tests.push({ id: 'mmp', name: 'MMP', short: 'MMP', roomId: 'treat', order: 3, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: 'MMP', prepWaitMin: 10, prepMode: 'go', withExams: true, noOrder: true });
  tests.push({ id: 'syr', name: 'Syringing', short: 'Syringing', roomId: 'treat', order: 1, options: [], popupOnClick: false, machine: '' });
  return { ...s, rooms, tests };
});
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '조현우') return { ...p, assigned: { ...p.assigned, fag: true, osdi: true, syr: true } };
  if (p.name === '한지훈') return { ...p, assigned: { ...p.assigned, fag: true } };
  if (p.name === '임수빈') return { ...p, assigned: { ...p.assigned, sch: true } };
  if (p.name === '장민호') return { ...p, assigned: { ...p.assigned, mmp: true } };
  return p;
}));
const backdate = async (name, id, min) => editKey('daily-patients', list => list.map(p => (p.name === name ? { ...p, prep: { ...p.prep, [id]: { ...p.prep[id], startedAt: Date.now() - min * 60000 } } } : p)));
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
ok(await page.getByText(/^검사 준비 · 2명/).count() === 1, '처치실: 검사 준비는 FAG만 2명 (Schirmer·MMP는 진료 전 검사 칸에서)');
ok(await page.getByRole('button', { name: /^Schirmer \d+명/ }).count() === 1 && await page.getByRole('button', { name: /^MMP \d+명/ }).count() === 1, '진료 전 검사에 Schirmer·MMP');
// MMP(바로 넘어감): 누르면 시작 시각 기록 + 검사는 완료로 넘어감 → 시간이 되면 '확인할 검사'에서 확인
const mmpCard = page.locator('div.bg-white').filter({ has: page.getByText('장민호', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'MMP', exact: true }) }).first();
await mmpCard.getByRole('button', { name: 'MMP', exact: true }).click(); await W();
ok(await page.getByRole('button', { name: '지금 확인' }).count() >= 1, '시간 전에도 [지금 확인] 있음');
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '장민호').done.mmp === true, 'MMP: 시작하면 바로 넘어감 (검사 완료)'); }
ok(await page.getByText(/^확인할 검사 · 1명/).count() === 1, "처치실 맨 위 '확인할 검사'");
await backdate('장민호', 'mmp', 11);
await page.waitForTimeout(15000);
const chk = page.getByRole('button', { name: /^MMP \d\d:\d\d · 확인$/ });
ok(await chk.count() === 1, '시간이 되면 초록 [MMP 시각 · 확인]');
ok(await page.getByText(/장민호 MMP 확인할 시간/).count() >= 1, '알림 표시');
await page.screenshot({ path: `${SP}/r33-mmp-due.png` });
await chk.click(); await W();
{ const l = (await getKey('daily-patients')).value; ok(!!l.find(p => p.name === '장민호').prep.mmp.checked, 'MMP 확인 기록'); }
ok(await page.getByText(/^확인할 검사/).count() === 0, '확인 후 목록에서 빠짐');
const sch = page.locator('div.bg-white').filter({ has: page.getByText('임수빈', { exact: true }) }).filter({ has: page.getByRole('button', { name: /^Schirmer/ }) }).last();
ok(await sch.getByRole('button', { name: 'Schirmer', exact: true }).count() >= 1, '시간 재기 검사: 칸 이름은 검사 이름');
await sch.getByRole('button', { name: 'Schirmer', exact: true }).first().click(); await W();
ok(await sch.getByRole('button', { name: /^Schirmer \d\d:\d\d$/ }).count() === 1, '누르면 "Schirmer 시작 시각"');
await backdate('임수빈', 'sch', 6);
await page.waitForTimeout(15000);
{ const l = (await getKey('daily-patients')).value; ok(!l.find(p => p.name === '임수빈').done.sch, 'Schirmer: 시간이 돼도 확인 전에는 넘어가지 않음'); }
ok(await sch.getByRole('button', { name: 'Schirmer 끝 · 확인' }).count() === 1, '시간이 되면 초록 [끝 · 확인]');
await sch.getByRole('button', { name: 'Schirmer 끝 · 확인' }).click(); await W();
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '임수빈').done.sch === true, 'Schirmer: 확인하면 검사 완료'); }
ok(await page.getByText(/^진료 전 검사 · 1명/).count() === 1, '처치실: 진료 전 검사에 OSDI 환자(조현우)');
ok(await page.locator('div.bg-white').filter({ has: page.getByText('조현우', { exact: true }) }).getByRole('button', { name: /^OSDI/ }).count() >= 1, 'OSDI는 검사실 대기 중에도 처치실에');
await page.screenshot({ path: `${SP}/r16-treat.png`, fullPage: true });
// 조현우 skin test 시작 → 다시 누르면 시작 취소 → 다시 시작 → 시간 지나 자동 완료
const prepCard = page.locator('div.bg-white').filter({ hasText: '동의서 · skin test' }).filter({ has: page.getByText('조현우', { exact: true }) }).first();
await prepCard.getByRole('button', { name: '동의서 · skin test', exact: true }).click(); await W();
await prepCard.getByRole('button', { name: /^동의서 · skin test \d/ }).click(); await W();
ok(await prepCard.getByRole('button', { name: '동의서 · skin test', exact: true }).count() === 1, '다시 누르면 시작 취소');
await prepCard.getByRole('button', { name: '동의서 · skin test', exact: true }).click(); await W();
await prepCard.screenshot({ path: `${SP}/r32-skin-started.png` });
await backdate('조현우', 'fag', 21);
// 한지훈 시작 → 반응 있음(검사 취소)
const han = page.locator('div.bg-white').filter({ hasText: '동의서 · skin test' }).filter({ has: page.getByText('한지훈', { exact: true }) }).first();
await han.getByRole('button', { name: '동의서 · skin test', exact: true }).click(); await W();
await han.getByRole('button', { name: '검사 취소' }).click(); await W();
await page.waitForTimeout(15000);
await prepCard.screenshot({ path: `${SP}/r32-skin-done.png` });
await prepCard.getByRole('button', { name: '동의서 · skin test 끝 · 확인' }).click(); await W();
{ const l = (await getKey('daily-patients')).value; ok(l.find(p => p.name === '조현우').prep.fag.result === 'neg', 'skin test: 확인하면 검사실로'); }
ok(await page.getByRole('button', { name: '동의서 · skin test', exact: true }).count() === 0, '남은 준비 없음');
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
