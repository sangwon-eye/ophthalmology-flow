import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 10-08 사용자: '시력방 + 검사실'의 검사실 모양(이름 굵게 + '검사실 이름 할 검사' 줄)을
// '검사실 대기 명단'·검사실별 앞 모니터에도 같게. '○○ 검사 중'은 이름에 '검사'가 있으면 '중'만 ('시야 검사 검사 중' 방지)
await editKey('settings', s => ({ ...s, tests: s.tests.map(t => (t.id === 'vf' ? { ...t, name: '시야 검사' } : t)) }));
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '조현우') return { ...p, assigned: { ...p.assigned, vf: true }, done: { ...p.done, visionIop: true }, vfInProgress: 'vf', vfStartedAt: Date.now() };
  if (p.name === '윤지아') return { ...p, assigned: { ...p.assigned, oct: true }, done: { ...p.done, visionIop: true, oct: false }, vfInProgress: 'oct', vfStartedAt: Date.now() };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const { errors, ok, W } = tester(page);
const open = async (name) => {
  await page.goto(`${BASE}/`); await W(600);
  await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
  await page.getByRole('button', { name }).first().click(); await W(1200);
};
const card = (n) => page.locator('div.bg-slate-800').filter({ hasText: n }).first();
for (const [name, label, file] of [[/^검사실 대기 명단/, '검사실 대기 명단', 'exam'], [/^정밀검사실 대기 명단/, '정밀검사실 앞', 'room']]) {
  await open(name);
  const body = await page.locator('body').innerText();
  ok(/시야 검사 중/.test(body) && !/검사 검사/.test(body), `${label}: '시야 검사 중' (겹친 '검사 검사' 없음)`);
  ok(/OCT 검사 중/.test(body), `${label}: 이름에 '검사'가 없으면 'OCT 검사 중'`);
  ok(await card('조현우').locator('.text-3xl span.font-extrabold').count() === 1, `${label}: 이름 굵은 큰 글씨 (시력방 + 검사실과 같은 모양)`);
  ok(await page.locator('div.bg-slate-800 span.rounded-xl').count() === 0, `${label}: 칩 없이 줄 모양`);
  ok(!/시야 검사,/.test(await card('조현우').innerText()), `${label}: 검사 중이면 '검사 중' 줄만 (남은 검사 목록 겹치지 않음)`);
  await page.screenshot({ path: `${SP}/r100-${file}.png` });
}
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
