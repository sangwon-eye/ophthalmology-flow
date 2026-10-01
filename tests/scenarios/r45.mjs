import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 처치실: 검사 지정 대기·예진 대기에서 History [수정]/[입력]
const now = Date.now();
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '강서윤') return { ...p, firstVisit: true, done: { visionIop: true }, doneAt: { visionIop: now }, hx: { at: now, htn: true, dm: false, dmYears: '', pmh: '', surgery: '', cc: '흐려 보임' } };
  if (p.name === '정대현') return { ...p, firstVisit: true, assigned: { visionIop: true }, done: { visionIop: true }, doneAt: { visionIop: now }, triageAssigned: true, triageAssignedAt: now, triageRequired: true, hxMissing: true };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
await page.goto(`${BASE}/`); await W();
await pick('처치실');
// 검사 지정 대기: 수정
ok(/흐려 보임/.test(await cardOf('강서윤').innerText()), '검사 지정 대기 카드에 History');
await page.getByRole('button', { name: '강서윤 History 수정' }).click(); await W(300);
await page.getByLabel('주호소').fill('눈부심');
await page.getByRole('button', { name: '확인', exact: true }).click(); await W(800);
ok((await pt('강서윤')).hx.cc === '눈부심', '검사 지정 대기에서 History 수정 저장');
ok(/눈부심/.test(await cardOf('강서윤').innerText()), '카드에 바로 반영');
// 예진 대기: 미입력 → 입력
ok(await cardOf('정대현').getByRole('button', { name: '정대현 History 입력' }).count() === 1, '예진 대기 카드에 [History 입력]');
await page.getByRole('button', { name: '정대현 History 입력' }).click(); await W(300);
await page.getByRole('button', { name: '고혈압 있음' }).click();
await page.getByLabel('주호소').fill('충혈');
await page.getByRole('button', { name: '확인', exact: true }).click(); await W(800);
const j = await pt('정대현');
ok(j.hx?.htn === true && j.hx?.cc === '충혈' && !j.hxMissing, '예진 대기에서 History 입력 저장');
await cardOf('정대현').screenshot({ path: `${SP}/r45-triage.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
