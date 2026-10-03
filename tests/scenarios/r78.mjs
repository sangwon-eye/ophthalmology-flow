import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 동시 사용 (10-03, 검사실): '진행 중 호출 금지' 검사 두 개(VF·OCT)를 두 장비 PC가 거의 동시에 같은 환자에게 [▶ 시작]
// → 먼저 누른 검사만 진행 중, 늦게 누른 쪽에 "시작 안 됨 · 이미 VF 검사 중" 안내 (한 환자가 두 장비에 동시에 있지 않게)
await editKey('settings', s => ({ ...s, tests: s.tests.map(t => (t.id === 'oct' ? { ...t, holdCall: true } : t)) }));
await editKey('daily-patients', list => list.map(p => (p.name === '윤지아' ? { ...p, assigned: { ...p.assigned, vf: true, oct: true }, done: { visionIop: true }, measureOk: 1, vfInProgress: null } : p)));
const browser = await chromium.launch();
const stale = async () => {
  const p = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const t = tester(p);
  await p.route('**/api/events', r => r.abort());
  await p.clock.install();
  await p.goto(`${BASE}/`); await t.W(1200);
  await t.pick('31번방');
  await p.clock.pauseAt(Date.now() + 1000);
  return { p, t };
};
const tile = (x, label) => x.t.cardOf('윤지아').locator('div').filter({ hasText: new RegExp(`^${label}`) }).last().getByRole('button', { name: '▶ 시작' });
const a = await stale(); const b = await stale();
await tile(a, 'VF').click(); await a.t.W(1500);
await tile(b, 'OCT').click(); await b.t.W(1500);
const rec = (await getKey('daily-patients')).value.find(p => p.name === '윤지아');
a.t.ok(rec.vfInProgress === 'vf', `먼저 누른 VF만 진행 중 (${rec.vfInProgress})`);
b.t.ok(await b.p.getByText(/OCT 시작 안 됨 · 윤지아 환자는 이미 VF 검사 중입니다/).count() === 1, '늦게 누른 쪽에 안내');
b.t.ok(await b.p.getByText(/VF.*검사 중/).count() >= 1, '늦게 누른 화면도 곧바로 VF 검사 중으로 바뀜');
for (const x of [a, b]) x.t.ok(x.t.errors.length === 0, `페이지 오류 없음 ${x.t.errors.join(' / ')}`);
await browser.close();
