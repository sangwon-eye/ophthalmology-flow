import { chromium, SP, tester, BASE } from '../lib.mjs';
// 역할별 안내문 (10-03 새로 정리): 흐름 그림 1장 + 자리별 1장(하는 일 5줄 이내 + 이럴 땐), 인쇄하면 한 장씩
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('관리자');
await page.getByRole('button', { name: '역할별 안내문', exact: true }).click(); await W(500);
ok(await page.getByText('환자는 이렇게 움직입니다').count() === 1, '흐름 그림 1장');
ok(await page.locator('section').filter({ hasText: '이 자리 사용법' }).count() === 5, '자리별 안내 5장 (시력방·검사실·처치실·진료실·관리자)');
const counts = await page.locator('section').filter({ hasText: '이 자리 사용법' }).evaluateAll(ss => ss.map(s => s.querySelectorAll('ol li').length));
ok(counts.every(n => n >= 1 && n <= 5), `하는 일은 5줄 이내 (${counts.join(',')})`);
ok(await page.getByText('History 설문지 드리기', { exact: false }).count() >= 1 && await page.getByText(/History 필요/).count() === 0, '최신 내용 (시력방은 설문지만)');
await page.screenshot({ path: `${SP}/r79-guide.png`, fullPage: true });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: `${SP}/r79-guide.pdf`, format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
