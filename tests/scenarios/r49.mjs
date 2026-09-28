import { chromium, BASE, editKey, tester } from '../lib.mjs';
// 검사실 화면을 띄워 둔 채 설정에서 그 검사실을 지우면: 흰 화면으로 멈추지 않고 '삭제되었습니다' 안내
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('6번방'); await W(800);
ok(await page.getByText(/대기 \d+명/).count() > 0, '6번방 화면 열림');
await editKey('settings', s => ({ ...s, rooms: s.rooms.filter(r => r.id !== 'C'), tests: s.tests.filter(t => t.roomId !== 'C') }));
await W(3000);
ok(await page.getByText('이 검사실은 설정에서 삭제되었습니다').count() === 1, '지워지면 안내가 보임 (흰 화면 아님)');
await page.getByRole('button', { name: '메인 화면' }).click(); await W(500);
ok(await page.getByText('진료 흐름').count() > 0 || await page.getByRole('button', { name: /^시력/ }).count() > 0, '메인 화면으로 돌아갈 수 있음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
