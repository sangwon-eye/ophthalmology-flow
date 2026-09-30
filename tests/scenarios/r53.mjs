import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 띵동: 시력방=새 접수 · 검사실=묶음 안 어느 방이든 새 환자 · 처치실=새 일 · 진료실=그 교수님 진료 호출
// 이 PC에서 방금 누른 변화는 생략, 소리 끄기 버튼
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const chimes = () => page.evaluate(() => window.__ophChimes || 0);
const quiet = () => W(2600); // 직접 누른 뒤 2초는 소리 생략이라 기다림
const setP = (name, fn) => editKey('daily-patients', list => list.map(p => (p.name === name ? { ...p, ...fn(p) } : p)));
await page.goto(`${BASE}/`); await W();
// 시력방
await pick('시력'); await quiet();
await page.locator('.sticky').first().screenshot({ path: `${SP}/r53-header.png` });
let c = await chimes();
await setP('원성옥', () => ({ checkin: '09:00' })); await W(2000);
ok(await chimes() === c + 1, '시력방: 다른 PC에서 접수 → 띵동');
ok(await page.getByText('소리를 켜려면').count() === 0, '화면을 누른 뒤에는 소리 막힘 안내 없음');
c = await chimes();
await cardOf('신종희').getByRole('button', { name: '접수', exact: true }).click(); await W(2000);
ok(await chimes() === c, '이 PC에서 직접 [접수] → 소리 생략');
await page.getByRole('button', { name: '띵동 소리 끄기' }).click(); await quiet();
c = await chimes();
await setP('박영수', () => ({ checkin: '09:05' })); await W(2000);
ok(await chimes() === c, '소리 끄기 → 띵동 없음');
await page.getByRole('button', { name: '띵동 소리 켜기' }).click();
ok(await page.getByRole('button', { name: '띵동 소리 끄기' }).count() === 1, '다시 켜기');
await back();
// 검사실 묶음: 6번방 화면에서 31번방에 새 환자가 들어와도 띵동
await pick('6번방'); await quiet();
c = await chimes();
await setP('최민지', p => ({ done: { ...p.done, visionIop: true }, doneAt: { ...(p.doneAt || {}), visionIop: Date.now() }, assigned: { ...p.assigned, oct: true } })); await W(2000);
ok(await chimes() === c + 1, '6번방 화면: 31번방 대기 명단에 새 환자 → 띵동');
await back();
// 진료실: 김선웅 화면에서 김선웅 진료 호출 → 띵동, 나상훈 호출은 소리 없음
await pick('진료실'); await W(300);
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await quiet();
c = await chimes();
await setP('서준호', () => ({ calledRoom: '김선웅', calledAt: Date.now() })); await W(2000);
ok(await chimes() === c + 1, '진료실(김선웅): 진료 호출 → 띵동');
await W(1600);
c = await chimes();
await setP('권나은', () => ({ calledRoom: '나상훈', calledAt: Date.now() })); await W(2000);
ok(await chimes() === c, '다른 교수님 호출은 소리 없음');
await back();
// 처치실: 새 일(진료실 요청)
await pick('처치실'); await quiet();
c = await chimes();
await setP('권나은', () => ({ calledRoom: null, treatRequest: { at: Date.now(), from: '나상훈' } })); await W(2000);
ok(await chimes() === c + 1, '처치실: 새 일(진료실 요청) → 띵동');
await back();
// 메인 화면에서는 소리 없음
await quiet();
c = await chimes();
await setP('정대현', p => ({ done: { ...p.done, visionIop: true }, doneAt: { ...(p.doneAt || {}), visionIop: Date.now() }, assigned: { ...p.assigned, oct: true } })); await W(2000);
ok(await chimes() === c, '메인 화면에서는 소리 없음 (검사실 화면이면 울릴 변화)');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
