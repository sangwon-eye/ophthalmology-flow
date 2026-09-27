import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 교수 관리: 고치면 '저장하지 않은 변경사항' + [저장], 저장 전에는 적용 안 됨
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('설정');
await page.getByRole('button', { name: '교수 관리', exact: true }).click(); await W(300);
ok(await page.getByText(/주요 검사 · 체크한 검사만 먼저/).count() === 1, '주요 검사 설명은 위에 한 번만');
ok(await page.getByText(/다음 내원 검사\(설명 완료 창\)와/).count() === 0, '교수마다 반복되던 문장 없음');
await page.getByRole('checkbox').filter({ has: page.locator('xpath=.') }).first().click().catch(() => {});
await page.locator('label').filter({ hasText: '기본 산동' }).first().locator('input').check(); await W(300);
ok(await page.getByText('저장하지 않은 변경사항이 있어요').count() === 1, '고치면 저장 안내 줄');
{ const v = (await getKey('doctor-prefs')).value; ok(!v?.['김선웅']?.dilate, '저장 전에는 적용 안 됨'); }
await page.screenshot({ path: `${SP}/r39-doctors.png` });
await page.getByRole('button', { name: '저장', exact: true }).click(); await W(1000);
{ const v = (await getKey('doctor-prefs')).value; ok(v?.['김선웅']?.dilate === true, '[저장] 하면 적용'); }
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
