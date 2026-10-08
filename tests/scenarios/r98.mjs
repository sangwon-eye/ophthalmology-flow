import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 10-08 사용자 결정 (이름은 모두 가상)
// 1) 시력방에서 QR을 찍으면 접수(직원 [접수]와 같게) + 시력·안압 한 창. Tab으로 칸 이동(AutoV 건너뜀), Enter면 저장·확인
//    창이 열린 채 다른 QR이 찍히면 저장하지 않고 그 칸을 되돌린 뒤 안내
// 2) MR(결과 입력)에 [진행 중 호출 금지]: [종료]를 누르면 결과 창 → 저장하면 검사 종료 + 완료
// 3) 관리자 명단 관리 [검사 없음]: 빨간 '확인 필요' 표시를 끔 (다시 누르면 취소)
await editKey('settings', s => ({ ...s, tests: [...s.tests, { id: 'mr', name: '현성굴절검사 (MR)', short: 'MR', roomId: 'B', order: 20, options: [], popupOnClick: false, machine: '', resultFields: ['s', 'c', 'a', 'add', 'va'], holdCall: true }] }));
await editKey('daily-patients', list => list.map(p => (p.name === '조현우' ? { ...p, assigned: { ...p.assigned, mr: true } } : p)));
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const modal = () => page.locator('[data-measure-modal]');
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await W(900); };
await page.goto(`${BASE}/`); await W();

// 1) 시력방 QR
await pick('시력');
await scan('6100000'); // 원성옥: 접수 전
ok(!!(await pt('원성옥')).checkin && !(await pt('원성옥')).late, 'QR → 접수 (직원 [접수]처럼 자동 지각 없음)');
ok(await modal().count() === 1 && /원성옥님 오늘 시력·안압/.test(await modal().innerText()), 'QR → 바로 시력·안압 한 창');
ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === '나안 OD', '처음 커서는 나안 OD');
await page.screenshot({ path: `${SP}/r98-vision-modal.png` });
// 창이 열린 채 다른 QR → 되돌리고 안내
await page.keyboard.type('0.6'); await W(400); await scan('6100444');
ok(await modal().getByRole('alert').count() === 1 && await modal().getByLabel('나안 OD').inputValue() === '0.6', '창이 열린 채 다른 QR: 저장 안 함 + 찍힌 번호 지움 + 안내');
await page.keyboard.press('Tab'); await page.keyboard.type('0.7');
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'NCT OD', 'Tab: 나안 OD→OS→교정 OD→OS→NCT OD (AutoV 건너뜀)');
await page.keyboard.type('14'); await page.keyboard.press('Tab'); await page.keyboard.type('15'); await page.keyboard.press('Enter'); await W(1500);
let w = await pt('원성옥');
ok(w.measureOk && w.measure.ucva.od === '0.6' && w.measure.ucva.os === '0.7' && w.measure.nct.od === '14' && w.measure.nct.os === '15', 'Enter → 저장·확인 (측정 완료)');
await scan('6100111'); // 최민지: 이미 접수 → 창만
ok(await modal().count() === 1 && /최민지님/.test(await modal().innerText()), '이미 접수한 환자 QR → 창만 열림');
await modal().getByRole('button', { name: '취소', exact: true }).click(); await W(300);
await scan('9999999');
ok(await page.getByText(/오늘 명단에서 찾지 못했습니다/).count() >= 1, '명단에 없는 번호 → 안내');
await back();

// 2) MR [진행 중 호출 금지] → [종료] → 결과 창
await pick('31번방');
const c = cardOf('조현우');
await c.getByRole('button', { name: '▶ 시작' }).click(); await W(1000); // 조현우는 MR만 '진행 중 호출 금지'
ok((await pt('조현우')).vfInProgress === 'mr', 'MR 시작 (진행 중)');
await c.getByRole('button', { name: '종료', exact: true }).click(); await W(400);
const rm = page.locator('.fixed.inset-0').last();
ok(await rm.getByLabel('R S').count() === 1, 'MR [종료] → 결과 입력 창');
await rm.getByLabel('R S').fill('-1.00');
await rm.getByRole('button', { name: 'MR 완료' }).click(); await W(1500);
const j = await pt('조현우');
ok(j.done.mr === true && !j.vfInProgress && j.results.mr.od.s === '-1.00', '저장 → 검사 종료 + 완료 + 결과');
await back();

// 3) 명단 관리 [검사 없음]
await pick('관리자');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(800);
const card = () => page.locator('[data-edge]').filter({ has: page.getByText('신종희', { exact: true }) }).first();
ok(await card().getAttribute('data-edge') === 'check', '검사 미지정: 빨간 테두리');
await card().getByRole('button', { name: '검사 없음', exact: true }).click(); await W(800);
ok((await pt('신종희')).noTests === true && await card().getAttribute('data-edge') !== 'check' && await card().getByRole('button', { name: '검사 없음 ✓' }).count() === 1, '[검사 없음] → 빨간 표시 꺼짐');
await card().getByRole('button', { name: '검사 없음 ✓' }).click(); await W(800);
ok(!(await pt('신종희')).noTests && await card().getAttribute('data-edge') === 'check', '다시 누르면 취소');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
