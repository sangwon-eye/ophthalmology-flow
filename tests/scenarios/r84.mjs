import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 시력방 + 검사실 큰 TV (10-04 사용자 확인): 시력방 2 : 검사실 3, 시력방 앞 5명 같은 크기(1번만 강조 안 함, 5명씩 불러 검사),
// 검사실은 칩 대신 '방 이름 + 검사 이름' 줄, 안내 문구는 제목 옆 (줄 하나 아낌)
const BASE_URL = `${BASE}/api/storage/`;
await fetch(BASE_URL + 'board-notices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: JSON.stringify({ notices: { vision: '예약시간이 빠른 환자부터 먼저 검사합니다', exams: '모든 검사는 큰 복도에서 대기해주세요' }, presets: [] }) }) });
// 시력 대기를 7명으로 (가상 이름)
const d = new Date().toLocaleDateString('sv-SE');
await editKey('daily-patients', list => [...list, ...['배수민', '노지훈', '유하은', '남도현'].map((n, i) => ({ id: String(6300000 + i * 53), name: n, date: d, doctor: '김선웅', reservation: '11:00', checkin: `09:1${i}`, assigned: { visionIop: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 700 + i }))]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
const { errors, ok, W } = tester(page);
await page.goto(`${BASE}/`); await W();
await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
await page.getByRole('button', { name: /\+ 검사실/ }).first().click(); await W(1800);

// 안내 문구는 제목과 같은 줄
const titleBox = await page.getByText('검사실', { exact: true }).first().boundingBox();
const noteBox = await page.getByText('모든 검사는 큰 복도에서 대기해주세요').boundingBox();
ok(!!titleBox && !!noteBox && Math.abs((titleBox.y + titleBox.height / 2) - (noteBox.y + noteBox.height / 2)) < 30 && noteBox.x > titleBox.x, '검사실 안내 문구가 제목 옆');
// 시력방: '다음 순서' 강조 없음, 1~5번 같은 크기, 6번부터 '그다음 순서'
ok(await page.getByText('다음 순서', { exact: true }).count() === 0, '시력방 1번만 강조하지 않음');
const sizes = await page.evaluate(() => [...document.querySelectorAll('span.text-3xl')].map(e => e.textContent));
ok(sizes.length >= 5, `앞 5명 같은 크기 (${sizes.length})`);
ok(await page.getByText('그다음 순서').count() === 1, '6번부터 그다음 순서');
// 시력방 2 : 검사실 3
const cols = await page.evaluate(() => { const g = [...document.querySelectorAll('div.grid')].find(x => (x.style.gridTemplateColumns || '').includes('2fr')); return g ? [...g.children].map(c => c.getBoundingClientRect().width) : []; });
ok(cols.length === 2 && cols[1] / cols[0] > 1.4 && cols[1] / cols[0] < 1.6, `시력방 2 : 검사실 3 (${cols.map(Math.round).join(' : ')})`);
// 검사실: 칩이 아닌 줄 — '정밀검사실'(환자용 이름) 굵게 + 검사 이름
const examCard = page.locator('div.bg-slate-800').filter({ hasText: '정밀검사실' }).first();
ok(await examCard.count() === 1 && /정밀검사실\s*[가-힣A-Za-z]/.test(await examCard.innerText()) && !/정밀검사실:/.test(await examCard.innerText()), '검사실: 방 이름 + 검사 이름 줄');
ok(await page.locator('span.rounded-xl').filter({ hasText: '정밀검사실:' }).count() === 0, '작은 칩 없음');
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '화면 밖으로 넘치지 않음');
await page.screenshot({ path: `${SP}/r84-vision-exam.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
