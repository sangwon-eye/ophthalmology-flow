import { chromium, getKey, tester, BASE } from '../lib.mjs';
// 저장 중에 시작한 새로 받기가 늦게 도착해도, 방금 넣은 내용이 잠깐 사라지지 않음
// (관리자 '데모 샘플 넣기' 뒤 몇 초 만에 명단이 사라졌다가 다시 나타나던 문제)
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('관리자');
// 바쁜 병원망 흉내: 서버는 바로 답하지만 명단 읽기 답이 1.5초 늦게 도착
await page.route('**/api/storage/daily-patients*', async route => {
  if (route.request().method() !== 'GET') return route.continue();
  const res = await route.fetch();
  await new Promise(r => setTimeout(r, 1500));
  await route.fulfill({ response: res });
});
await page.getByRole('button', { name: '명단 업로드', exact: true }).click(); await W(200);
const t0 = Date.now();
await page.getByRole('button', { name: '데모 샘플 넣기' }).click();
await page.getByRole('button', { name: '명단 관리', exact: true }).click();
const seen = [];
while (Date.now() - t0 < 9000) {
  seen.push(await page.getByText('김민수', { exact: true }).count());
  await page.waitForTimeout(100);
}
const first = seen.indexOf(1);
ok(first >= 0, '샘플 환자가 바로 보임');
ok(first >= 0 && seen.slice(first).every(n => n === 1), `한 번 보인 뒤 사라지지 않음 (${seen.join('')})`);
const server = ((await getKey('daily-patients')).value || []).filter(p => ['10001', '10002', '10003', '10004', '10005'].includes(p.id)).length;
ok(server === 5, '서버에도 5명 저장');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
