import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES } from '../lib.mjs';
// 강서윤(초진): 시력 끝, History 확인 → 처치실 검사 지정 대기. OCT 완료·WFP 남음으로 지정
await editKey('daily-patients', list => list.map(p => (p.name === '강서윤' ? { ...p, hx: { htn: true }, done: { visionIop: true, oct: true }, assigned: { visionIop: true, oct: true, wfp: true }, detail: {} } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W(1000);
await pick('처치실');
const c = cardOf('강서윤');
ok(await c.getByText('오늘 검사', { exact: true }).count() >= 1, '검사 지정 대기 카드에 오늘 검사');
ok(/OCT, WFP ?\(남음\)/.test(await c.innerText()), '한 검사/남은 검사 구분 (10-10: 참고 줄 한 줄)');
await c.screenshot({ path: `${SP}/r28-treat-tests.png` });
await c.getByRole('button', { name: '검사 지정' }).click(); await W(300);
const m = page.locator('.fixed.inset-0').last();
ok(await m.getByText('WFP (남음)').count() === 1, '검사 지정 창에도 오늘 검사');
await m.getByRole('button', { name: '취소', exact: true }).click(); await W(200);
await back();
// 재진인데 초진으로 잘못 올라온 환자: 관리자에서 재진으로 고치면 History 필요 없어짐
await pick('시력');
ok(await cardOf('정대현').getByRole('button', { name: 'History 필요' }).count() === 0, '재진: History 버튼 없음');
await page.getByRole('button', { name: '재진', exact: true }).first().click().catch(() => {});
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
