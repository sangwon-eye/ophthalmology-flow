import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 대기 시간 안내: 계산(5분 올림) · 반자동 [띄우기]/[내리기] · 자동(기준 이상일 때만)
const now = Date.now();
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const visDone = ['원성옥', '신종희', '박영수'];     // 접수 12분 전 → 2분 전 시력 완료 (약 10분)
const visWait = ['최민지', '정대현', '강서윤'];     // 접수 12분 전, 아직 시력검사 대기 (12분)
const examWait = ['조현우', '윤지아', '장민호'];    // 24분 전 시력 완료, 첫 검사 아직 (24분 → 올림 25분)
await editKey('daily-patients', list => list.map(p => {
  if (visDone.includes(p.name)) return { ...p, checkin: hhmm(now - 12 * 60000), done: { visionIop: true }, doneAt: { visionIop: now - 2 * 60000 } };
  if (visWait.includes(p.name)) return { ...p, checkin: hhmm(now - 12 * 60000), firstVisit: false };
  if (examWait.includes(p.name)) return { ...p, checkin: hhmm(now - 40 * 60000), doneAt: { visionIop: now - 24 * 60000 } };
  return p;
}));
const browser = await chromium.launch();
const admin = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const board = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const { errors, ok, W } = tester(admin);
board.on('pageerror', e => errors.push(e.message));
await admin.goto(`${BASE}/`); await board.goto(`${BASE}/`); await W();
await admin.getByRole('button', { name: /^관리자/ }).first().click(); await W();
await admin.getByRole('button', { name: '대기 화면 안내' }).click(); await W();
const row = (k) => admin.locator(`[data-wait="${k}"]`);
ok(/약 15분/.test(await row('vision').innerText()), `시력: 10분·12분 → 약 15분 (${(await row('vision').innerText()).replace(/\n/g, ' ')})`);
ok(/약 25분/.test(await row('exams').innerText()), `검사: 25분 → 약 25분 (${(await row('exams').innerText()).replace(/\n/g, ' ')})`);
// 반자동: 띄우기
await row('vision').getByRole('button', { name: '띄우기' }).click(); await W(800);
ok((await getKey('board-notices')).value.waits.vision.shown === 15, '시력 대기 15분 띄움');
await board.getByRole('button', { name: /^환자용 화면/ }).click(); await W();
await board.getByRole('button', { name: /^통합 화면/ }).click(); await W(5000);
let text = await board.locator('body').innerText();
ok(text.includes('현재 시력검사 대기 약 15분'), '환자 화면: 현재 시력검사 대기 약 15분');
ok(!text.includes('현재 검사 대기'), '검사실은 반자동이라 띄우기 전엔 안 보임');
// 자동: 기준 20분 이상이면 표시
await row('exams').getByRole('button', { name: '자동', exact: true }).click(); await W(800);
await W(5000);
text = await board.locator('body').innerText();
ok(text.includes('현재 검사 대기 약 25분'), '자동: 25분 ≥ 20분 → 표시');
await board.screenshot({ path: `${SP}/r42-board.png` });
await admin.getByLabel('자동 표시 기준').fill('30'); await admin.keyboard.press('Enter'); await W(800);
await W(5000);
text = await board.locator('body').innerText();
ok(!text.includes('현재 검사 대기'), '기준 30분이면 표시 안 함');
// 내리기
await row('vision').getByRole('button', { name: '내리기' }).click(); await W(800);
await W(5000);
ok(!(await board.locator('body').innerText()).includes('현재 시력검사 대기'), '내리기 → 사라짐');
await admin.screenshot({ path: `${SP}/r42-admin.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
