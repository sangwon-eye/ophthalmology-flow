import { chromium, SP, tester, editKey, BASE } from '../lib.mjs';
// 환자용 화면 어두운 바탕 · 안내 문구는 그림(이모지 없음) · 스크롤 막대 숨김 · 한글 글꼴(맑은 고딕) · 태블릿(터치)에서 띵동 소리 준비
await editKey('board-notices', v => ({ ...(v || {}), notices: { vision: '예약시간이 빠른 환자부터 먼저 검사합니다' } }));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const { errors, ok, W } = tester(page);
await page.goto(`${BASE}/`); await W();
ok((await page.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('Malgun Gothic'), '한글 글꼴: 맑은 고딕을 정해 둠 (윈도우 7·10 같은 모양)');
await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
await page.getByRole('button', { name: /^통합 화면/ }).click(); await W(1500);
// 색 표기(rgb·lab 등)와 관계없이 실제 색을 읽기 위해 캔버스에 칠해서 확인
const rgbOf = (which, prop) => page.evaluate(([which, prop]) => {
  const target = which === 'board' ? document.querySelector('[aria-label="환자 대기 명단"]').parentElement : [...document.querySelectorAll('div.relative.flex.items-center div')][1];
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = getComputedStyle(target)[prop]; c.fillRect(0, 0, 1, 1);
  return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
}, [which, prop]);
const [r, g, b] = await rgbOf('board', 'backgroundColor');
const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
ok(lum < 0.15, `환자용 화면은 어두운 바탕 (밝기 ${lum.toFixed(2)})`);
const nameColor = await rgbOf('name', 'color');
ok(nameColor.every(v => v > 240), `이름은 흰 글씨 (${nameColor.join(',')})`);
const notice = page.getByRole('status').filter({ hasText: '예약시간이 빠른 환자부터 먼저 검사합니다' });
ok(await notice.count() === 1 && await notice.locator('svg').count() === 1, '안내 문구: 확성기 그림 (그림 글자 대신)');
ok(!(await notice.innerText()).includes('📢'), '안내 문구에 이모지 없음 (윈도우 7에서 네모로 보일 수 있음)');
ok(await page.evaluate(() => getComputedStyle(document.querySelector('[aria-label="환자 대기 명단"]')).scrollbarWidth) === 'none', '명단 스크롤 막대 숨김');
await page.screenshot({ path: `${SP}/r56-board-dark.png` });
// 태블릿 흉내 (터치): 손가락으로 누르면 소리 장치가 켜지고 '소리를 켜려면' 안내가 없어짐
const tab = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
const tp = await tab.newPage();
const tErrors = []; tp.on('pageerror', e => tErrors.push(e.message));
await tp.goto(`${BASE}/`); await tp.waitForTimeout(1200);
ok(await tp.evaluate(() => window.__ophAudioState()) === 'none', '처음에는 소리 장치 없음');
await tp.tap('[data-tile="vision"]'); await tp.waitForTimeout(2600); // 직접 누른 뒤 2초는 소리 생략이라 기다림
ok(await tp.evaluate(() => window.__ophAudioState()) === 'running', '태블릿: 손가락으로 누른 뒤 소리 장치 켜짐');
ok(await tp.getByText('소리를 켜려면').count() === 0, '태블릿: 소리 막힘 안내 없음');
const before = await tp.evaluate(() => window.__ophChimes || 0);
await editKey('daily-patients', list => list.map(p => (p.name === '원성옥' ? { ...p, checkin: '09:00' } : p)));
await tp.waitForTimeout(3000);
ok(await tp.evaluate(() => window.__ophChimes || 0) === before + 1, '태블릿: 새 접수 → 띵동');
ok(errors.length === 0 && tErrors.length === 0, `페이지 오류 없음 ${[...errors, ...tErrors].join(' / ')}`);
await browser.close();
