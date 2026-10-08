import { chromium, SP, tester, BASE } from '../lib.mjs';
// 관리자 [명단 관리] 카드 테두리 (10-08 사용자 결정, 이름은 모두 가상)
// - 확인 필요(검사 미지정·지난 진료 FU 미지정) = 빨간 테두리 (예전 주황), 초진 = 하늘색 테두리, 보통 = 회색
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('관리자');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(800);
const card = (name) => page.locator('[data-edge]').filter({ has: page.getByText(name, { exact: true }) }).first();
const cls = async (name) => (await card(name).getAttribute('class')) || '';
ok(await card('강서윤').getAttribute('data-edge') === 'first' && /border-sky-400/.test(await cls('강서윤')), '초진(강서윤): 하늘색 테두리');
ok(await card('원성옥').getAttribute('data-edge') === 'check' && /border-red-400/.test(await cls('원성옥')) && await card('원성옥').getByText('검사 미지정 · 확인 필요').count() === 1, '검사 미지정(원성옥): 빨간 테두리');
ok(await card('조현우').getAttribute('data-edge') === '' && /border-slate-200/.test(await cls('조현우')), '검사 지정된 재진(조현우): 보통 회색');
ok(!/orange/.test(await page.locator('main, body').first().innerHTML().then(h => (h.match(/data-edge="check"[^>]*/g) || []).join(''))), '확인 필요 카드에 주황색 없음');
await page.screenshot({ path: `${SP}/r97-admin-list.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
