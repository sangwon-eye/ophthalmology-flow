import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 환자 찾기 (10-03 사용자 요청): 진료실 진료 대기 카드 [환자 찾기] → 복도 끝 모니터(진료실 대기 명단 전체)에
// '○○○님 3번 진료실 앞으로 오세요' 큰 팝업 + 띵동, 10초 뒤 사라짐. 화면을 열기 전에 있던 요청은 다시 안 띄움.
// 진료실 고르기: 복도 끝 모니터 직원용 버튼 [진료실 고르기]로 보일 진료실만 (PC마다 기억)
// 화면을 열기 전에 있던 예전 '찾기' 기록 (다시 띄우면 안 됨)
await editKey('daily-patients', list => list.map(p => (p.name === '권나은' ? { ...p, boardCall: { at: Date.now() - 60000 } } : p)));
const browser = await chromium.launch();
const board = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const b = tester(board, { keepRole: true });
await board.goto(`${BASE}/`); await b.W();
await board.getByRole('button', { name: /^환자용 화면/ }).click(); await b.W(300);
await board.getByRole('button', { name: /^진료실 대기 명단/ }).first().click(); await b.W(1500);
const popup = board.locator('[data-find-popup]');
b.ok(await popup.count() === 0, '화면을 열기 전에 있던 찾기 요청은 다시 띄우지 않음');

// 진료실(김선웅): 서준호 [환자 찾기]
const staff = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const s = tester(staff);
await staff.goto(`${BASE}/`); await s.W();
await s.pick('진료실');
await staff.getByRole('button', { name: '김선웅', exact: true }).first().click(); await s.W(600);
const chimes0 = await board.evaluate(() => window.__ophChimes || 0);
await s.cardOf('서준호').getByRole('button', { name: /^환자 찾기/ }).click(); await s.W(1500);
s.ok(await staff.getByText(/서준호 환자 찾기 · 복도 끝 모니터에 띄웠습니다/).count() === 1, '진료실: 안내 알림');
s.ok(await s.cardOf('서준호').getByRole('button', { name: /^환자 찾기 · \d\d:\d\d/ }).count() === 1, '진료실: 찾은 시각 표시');
b.ok(await popup.count() === 1 && await popup.getByText('서준호 (0444)님', { exact: true }).count() === 1 && await popup.getByText('3번 진료실 앞으로 오세요', { exact: true }).count() === 1, '복도 끝 모니터: 이름 · 진료실 팝업');
b.ok(await board.evaluate(() => window.__ophChimes || 0) > chimes0, '복도 끝 모니터: 띵동');
await board.screenshot({ path: `${SP}/r82-find-popup.png` });
await board.waitForTimeout(10500);
b.ok(await popup.count() === 0, '10초 뒤 사라짐');
// 다시 열어도 (자동 새로고침 등) 예전 요청은 다시 안 띄움
await board.reload(); await b.W(2500);
b.ok(await popup.count() === 0, '새로고침해도 다시 안 띄움');

// 진료 대기가 아닌 환자(그사이 진료 호출)는 띄우지 않고 안내: 화면은 아직 진료 대기로 보이는 상태
await editKey('daily-patients', list => list.map(p => (p.name === '권나은' ? { ...p, calledRoom: '나상훈' } : p)));
await staff.getByRole('button', { name: '나상훈', exact: true }).first().click(); await s.W(300);
const stale = s.cardOf('권나은').getByRole('button', { name: /^환자 찾기/ });
if (await stale.count()) {
  await stale.click(); await s.W(1500);
  s.ok(await staff.getByText(/환자 찾기 안 됨 · 권나은/).count() === 1, '그사이 진료 호출된 환자 → 띄우지 않고 안내');
}
b.ok(await popup.count() === 0, '진료 대기가 아닌 환자는 팝업 없음');

// 진료실 고르기: 이종혁 칸 빼기 → 사라짐, 새로고침해도 그대로
// 교수님 이름 옆에 진료실 번호 배지가 붙어 있어 부분 일치로 찾음
b.ok(await board.getByText('이종혁').count() >= 1, '처음에는 이종혁 칸 있음');
await board.getByRole('button', { name: '진료실 고르기' }).click(); await b.W(200);
await board.getByLabel('이종혁 보이기').uncheck(); await b.W(500);
await board.getByRole('button', { name: '닫기' }).click(); await b.W(300);
b.ok(await board.getByText('이종혁').count() === 0 && await board.getByText('김선웅').count() >= 1, '고른 진료실만 보임');
await board.reload(); await b.W(2500);
b.ok(await board.getByText('이종혁').count() === 0, '이 PC가 기억 (새로고침해도 그대로)');
await board.screenshot({ path: `${SP}/r82-board-picked.png` });
for (const x of [b, s]) x.ok(x.errors.length === 0, `페이지 오류 없음 ${x.errors.join(' / ')}`);
await browser.close();
