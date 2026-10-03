import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 동시 사용 (10-03): 설명 완료 창을 두 PC가 함께 열어 둔 경우 — 먼저 누른 쪽의 FU만 저장, 늦게 누른 쪽은 안내만 (덮어쓰지 않음)
const pts0 = (await getKey('daily-patients')).value;
const s = pts0.find(p => p.name === '서준호');
await editKey('daily-patients', list => list.map(p => (p.name === '서준호' ? { ...p, doctor: '김선웅', seen: true, seenAt: Date.now(), calledRoom: null, procedures: [] } : p)));
const browser = await chromium.launch();
const stale = async () => {
  const p = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const t = tester(p);
  await p.route('**/api/events', r => r.abort());
  await p.clock.install();
  await p.goto(`${BASE}/`); await t.W(1200);
  await t.pick('진료실');
  await p.getByRole('button', { name: '김선웅', exact: true }).first().click(); await t.W(600);
  return { p, t, modal: () => p.locator('.fixed.inset-0').last() };
};
const pickTest = async (x, name) => {
  const more = x.modal().getByRole('button', { name: /^나머지 검사 보기/ });
  if (await more.count()) { await more.click(); await x.t.W(200); }
  const box = x.modal().locator('label').filter({ hasText: name }).first().locator('input[type=checkbox]');
  if (!(await box.isChecked())) await box.check();
};
const a = await stale(); const b = await stale();
await a.p.clock.pauseAt(Date.now() + 1000); await b.p.clock.pauseAt(Date.now() + 1000);
await a.t.cardOf('서준호').getByRole('button', { name: '설명 완료', exact: true }).click(); await a.t.W(300);
await b.t.cardOf('서준호').getByRole('button', { name: '설명 완료', exact: true }).click(); await b.t.W(300);
await pickTest(a, 'WFP');
await pickTest(b, 'IDRA');
await a.modal().getByRole('button', { name: '설명 완료', exact: true }).click(); await a.t.W(1500);
await b.modal().getByRole('button', { name: '설명 완료', exact: true }).click(); await b.t.W(1500);
const fu = (await getKey('fu-designations')).value[s.id];
const kfu = fu?.byDoctor?.김선웅 || fu;
a.t.ok(kfu?.wfp === true && !kfu?.idra, '먼저 누른 쪽 FU(WFP)만 저장, 늦게 누른 쪽(IDRA)은 덮어쓰지 않음');
a.t.ok(await b.p.getByText(/이미 다른 곳에서 설명 완료되었습니다/).count() === 1, '늦게 누른 쪽에 안내');
const rec = (await getKey('daily-patients')).value.find(p => p.name === '서준호');
a.t.ok(rec.consultDone === true, '설명 완료 상태');
a.t.ok(a.t.errors.length === 0 && b.t.errors.length === 0, '페이지 오류 없음');
await browser.close();
