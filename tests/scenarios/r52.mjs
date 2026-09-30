import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 메인 화면 방별 대기 인원 = 각 화면 위쪽 '대기 N명', 진료실은 교수님별 한 줄, 변동이 바로 반영
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, back } = tester(page);
const tile = (key) => page.locator(`[data-count="${key}"]`);
const tileN = async (key) => Number((await tile(key).innerText()).match(/\d+/)[0]);
const headerN = async () => Number(((await page.locator('h1').first().innerText()).match(/대기 (\d+)명/) || [])[1]);
await page.goto(`${BASE}/`); await W();
for (const key of ['vision', 'room:B', 'room:C', 'procedure']) {
  const n = await tileN(key);
  await page.locator(`[data-tile="${key}"]`).click(); await W(800);
  const h = await headerN();
  ok(n === h, `${key}: 메인 화면 ${n} = 화면 위쪽 ${h}`);
  await back(); await W(300);
}
// 진료실: 합계 + 교수님별
const line = await page.locator('[data-count-detail="consult"]').innerText();
const per = Object.fromEntries([...line.matchAll(/(김선웅|나상훈|이종혁) (\d+)/g)].map(m => [m[1], Number(m[2])]));
ok(Object.keys(per).length === 3, `진료실 칸에 교수님별 인원 (${JSON.stringify(per)})`);
ok(await tileN('consult') === Object.values(per).reduce((a, b) => a + b, 0), '진료실 대기 = 교수님별 합계');
await page.locator('[data-tile="consult"]').click(); await W(600);
for (const d of Object.keys(per)) {
  await page.getByRole('button', { name: d, exact: true }).first().click(); await W(400);
  ok(await headerN() === per[d], `${d}: 메인 화면 ${per[d]} = 진료실 화면 대기`);
}
await back(); await W(300);
// 변동이 바로 반영 (다른 PC에서 접수)
const v0 = await tileN('vision');
await editKey('daily-patients', list => list.map(p => (p.name === '원성옥' ? { ...p, checkin: '09:00' } : p)));
await W(2500);
ok(await tileN('vision') === v0 + 1, '다른 PC에서 접수 → 메인 화면 시력방 대기 +1');
await page.screenshot({ path: `${SP}/r52-main.png` });
ok(await page.locator('[data-tile="vision"]').locator('[data-count]').count() === 0, '대기 인원은 칸 밖 아래에 따로');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
