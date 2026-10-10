import { execSync } from 'child_process';
import { chromium, SP, DATA, BASE, FIXTURES } from '../lib.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const wait = (ms = 400) => page.waitForTimeout(ms);
const pick = async (name) => { await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click(); await wait(500); };
const back = async () => { await page.getByRole('button', { name: '메인 화면' }).click(); await wait(300); };
const cardOf = (name) => page.locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();

await page.goto(`${BASE}/`);
await wait(600);

/* 31번방: 처방 완료, 산동, VF 시작→종료, 메모 */
await pick('31번방');
let c = cardOf('윤지아');
await c.getByRole('button', { name: '처방 전', exact: true }).click(); await wait();
ok(await c.getByText('처방 완료', { exact: true }).count() === 1, '처방 완료 표시');
await c.getByRole('button', { name: '검사 변경' }).click(); await wait(200);
await c.getByRole('button', { name: '산동 안 함' }).click(); await wait();
ok(await c.getByRole('button', { name: '산동', exact: true }).count() >= 1, '펼친 칸에서 산동 켜기');
await c.getByRole('button', { name: '접기' }).click(); await wait(200);
ok(await c.getByText(/^산동 · VF 끝난 뒤$/).count() === 1, '접은 뒤 카드에 산동 표시 (VF 전이라 잠김)');
await c.getByRole('button', { name: '▶ 시작' }).click(); await wait();
await c.getByRole('button', { name: '종료', exact: true }).click(); await wait();
ok(await c.getByText(/VF 검사 중/).count() === 0 && await c.getByRole('button', { name: '▶ 시작' }).count() === 0, 'VF 종료 → 완료');
await c.screenshot({ path: `${SP}/r2-flow-card.png` });
// 메모
c = cardOf('조현우');
await c.getByRole('button', { name: '직원 메모 추가' }).click(); await wait(200);
await page.keyboard.type('YAG 후 10:30 IOP 확인'); await page.keyboard.press('Enter'); await wait();
ok(await cardOf('조현우').getByText('YAG 후 10:30 IOP 확인').count() === 1, '직원 메모 저장');
await back();

/* 진료실 김선웅: 처치 중인 환자 설명 완료 */
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await wait();
c = cardOf('송하린');
await c.getByRole('button', { name: '설명 완료', exact: true }).click(); await wait(300);
const modal = page.locator('.fixed.inset-0').last();
await modal.getByRole('button', { name: '설명 완료', exact: true }).click(); await wait(600);
c = cardOf('송하린');
ok(await c.getByText(/^설명 완료/).count() >= 1 && await c.locator('[data-task-line="처치실"]').count() === 1, "설명 완료 + 점선 '처치실' 줄 (10-10: 처치 중 배지 대신)");
ok(await c.getByRole('button', { name: '귀가', exact: true }).isDisabled(), '처치 끝나기 전에는 회색 [귀가] (누를 수 없음)');
await c.screenshot({ path: `${SP}/r2-flow-explained.png` });
await back();

/* 처치실: 처치 완료 */
await pick('처치실');
c = cardOf('송하린');
await c.getByRole('button', { name: '처치 완료', exact: true }).click(); await wait(600);
ok(await page.getByText('송하린', { exact: true }).count() === 0 || await cardOf('송하린').getByRole('button', { name: '처치 완료', exact: true }).count() === 0, '처치실 처치 완료');
await back();

/* 진료실: 처치 완료 → 귀가 */
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await wait();
c = cardOf('송하린');
ok(/한 처치\s*전공의 처치/.test(await c.innerText()) && await c.getByText('처치 완료', { exact: true }).count() === 0, "설명 대기 카드: 참고 줄 '한 처치' (10-10: 같은 정보의 '처치 완료' 표시는 없앰)");
await c.getByRole('button', { name: '귀가', exact: true }).click(); await wait(600);
ok(await page.locator('div.bg-white').filter({ has: page.getByRole('button', { name: '귀가', exact: true }) }).filter({ hasText: '송하린' }).count() === 0, '귀가 처리');
await back();

ok(errors.length === 0, `페이지 오류 없음${errors.length ? ': ' + errors.join(' / ') : ''}`);
await browser.close();
