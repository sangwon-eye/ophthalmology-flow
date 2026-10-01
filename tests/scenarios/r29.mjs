import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES , measureVision } from '../lib.mjs';
// 최민지(재진) 산동 예정 / 정대현(재진) 산동 예정 + VF 지정 / 강서윤(초진)
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '최민지') return { ...p, dilateOverride: true };
  if (p.name === '정대현') return { ...p, dilateOverride: true, assigned: { ...p.assigned, vf: true } };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const measure = async (n) => {
  await cardOf(n).getByRole('button', { name: '시력', exact: true }).click(); await W(300);
  ok(await page.locator('.fixed.inset-0').last().getByRole('button', { name: '저장', exact: true }).count() === 0, '측정 창: [저장] 없이 [확인] 하나');
  await page.keyboard.press('Escape'); await page.locator('.fixed.inset-0').last().getByRole('button', { name: '취소', exact: true }).click().catch(() => {}); await W(200);
  await measureVision(page, cardOf(n), '0.5');
  await W(1200);
};
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
await page.goto(`${BASE}/`); await W(1000);
await pick('시력');
// 재진 + 산동: 측정 후에도 점안 전이라 남음 → 점안하면 넘어감
await measure('최민지');
ok(!(await pt('최민지')).done?.visionIop, '산동 예정: 점안 전엔 시력방에 남음');
await cardOf('최민지').screenshot({ path: `${SP}/r29-drop-left.png` });
await cardOf('최민지').getByRole('button', { name: '산동', exact: true }).click(); await W(1200);
ok((await pt('최민지')).done?.visionIop === true, '점안하면 자동으로 넘어감');
// 되돌리기 → 측정 확인이 풀리고 다시 시력방
await page.getByRole('button', { name: '되돌리기' }).first().click(); await W(1200);
const back1 = await pt('최민지');
ok(!back1.done?.visionIop && !back1.measureOk && back1.measure?.ucva, '되돌리기: 시력방으로, 측정값은 남고 [확인]만 다시');
// 점안 기록 취소 후 점안 없이 넘기기
await cardOf('최민지').getByRole('button', { name: /^산동 \d/ }).click(); await W(600);
await measure('최민지');
await cardOf('최민지').getByRole('button', { name: '점안 없이 넘기기' }).click(); await W(1200);
const f = await pt('최민지');
ok(f.done?.visionIop === true && f.dilateSkip === true && !(f.drops || []).some(Boolean), '점안 없이 넘기기 → 넘어감 (산동 예정은 그대로)');
// VF 남은 산동 환자: 점안 못 하니 측정만으로 넘어감
await measure('정대현');
ok((await pt('정대현')).done?.visionIop === true, 'VF 남은 산동 환자: 점안 없이 넘어감');
// 초진: 측정만으로는 안 넘어감
await measure('강서윤');
ok(!(await pt('강서윤')).done?.visionIop, '초진: History 설문지 드리기 전엔 남음');
await page.screenshot({ path: `${SP}/r29-vision.png`, fullPage: true });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
