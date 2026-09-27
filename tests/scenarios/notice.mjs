import { execSync } from 'child_process';
import { chromium, SP, DATA, BASE, FIXTURES } from '../lib.mjs';
const browser = await chromium.launch();
const admin = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const board = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = []; for (const p of [admin, board]) p.on('pageerror', e => errors.push(e.message));
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const W = (p, ms = 500) => p.waitForTimeout(ms);
await admin.goto(`${BASE}/`); await board.goto(`${BASE}/`); await W(admin);
await admin.getByRole('button', { name: /^관리자/ }).first().click(); await W(admin);
await admin.getByRole('button', { name: '대기 화면 안내' }).click(); await W(admin);
// 시력방: 목록에서 고르기
await admin.getByLabel('시력검사실 자주 쓰는 문구').selectOption('예약시간이 빠른 환자부터 먼저 검사합니다'); await W(admin, 800);
// 검사실 전체: 방 이름 없이 표시
await admin.getByLabel('검사실 전체 안내 문구').fill('이름이 불리면 안내된 검사실로 와주세요');
await admin.keyboard.press('Enter'); await W(admin, 800);
// 31번방(정밀검사실): 직접 입력
await admin.getByLabel('정밀검사실 안내 문구').fill('현재 30분 정도 지연이 발생 중입니다');
await admin.keyboard.press('Enter'); await W(admin, 800);
await admin.getByLabel('김선웅 진료실 안내 문구').fill('김선웅 교수님 진료가 약 20분 지연 중입니다');
await admin.keyboard.press('Enter'); await W(admin, 800);
// 자주 쓰는 문구 추가
await admin.getByLabel('새 자주 쓰는 문구').fill('검사실 장비 점검 중입니다'); await admin.keyboard.press('Enter'); await W(admin, 600);
ok(await admin.getByText('검사실 장비 점검 중입니다', { exact: true }).count() >= 1, '자주 쓰는 문구 추가');
await admin.screenshot({ path: `${SP}/r13-admin.png`, fullPage: true });
// 다른 브라우저(환자용 화면)
await board.getByRole('button', { name: /^환자용 화면/ }).click(); await W(board);
await board.getByRole('button', { name: /^통합 화면/ }).click();
await W(board, 5000);
const text = await board.locator('body').innerText();
ok(text.includes('예약시간이 빠른 환자부터 먼저 검사합니다'), '환자용: 시력방 안내');
ok(text.includes('이름이 불리면 안내된 검사실로 와주세요') && !text.includes('검사실 전체:'), '환자용: 검사실 전체 안내 (방 이름 없이)');
ok(!text.includes('검사 순서는 기계 상황에 따라'), '예전 고정 문구는 없음');
ok(text.includes('정밀검사실: 현재 30분 정도 지연이 발생 중입니다'), '환자용: 검사실 안내');
ok(text.includes('김선웅 교수님 진료가 약 20분 지연 중입니다'), '환자용: 김선웅 진료실 안내');
await board.screenshot({ path: `${SP}/r13-board.png` });
// 지우기
await admin.getByRole('button', { name: '지우기' }).first().click(); await W(admin, 800);
await W(board, 5000);
ok(!(await board.locator('body').innerText()).includes('예약시간이 빠른 환자부터 먼저 검사합니다'), '지우기 → 사라짐');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
