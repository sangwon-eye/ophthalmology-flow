import { chromium, SP, getKey, tester, BASE } from '../lib.mjs';
// 진료실 대기 명단 (전체) + QR 접수 (10-08 사용자 결정, 이름은 모두 가상)
// - 환자용 화면에 새 화면: 평소엔 복도 끝 명단 + 맨 아래 'QR 코드를 찍으면 바로 접수됩니다' 한 줄
// - QR을 찍으면 가운데 큰 흰 창으로 QR 접수와 같은 결과 → 5초 뒤 사라지고 명단으로
// - 리더기 키 입력으로 직원용 버튼이 뜨지 않음, 기존 'QR 접수'·'진료실 대기 명단 (전체)'는 그대로
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const { errors, ok, W } = tester(page);
await page.goto(`${BASE}/`); await W();
await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
await page.getByRole('button', { name: /^진료실 대기 명단 \(전체\) \+ QR 접수/ }).click(); await W(1500);
ok(await page.locator('[data-qr-band]').getByText('진료카드 QR 코드를 찍으면 바로 접수됩니다').count() === 1, '맨 아래 QR 안내 한 줄');
ok(await page.getByText('진료 대기 순서', { exact: true }).count() === 1 && await page.getByText(/^서준호 \(\d{4}\)$/).count() >= 1, '평소엔 진료실 대기 명단');
await page.screenshot({ path: `${SP}/r96-board.png` });
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await W(900); };
const popup = () => page.locator('[role=status]');
// 1) 접수 전 환자 → 접수 + 큰 흰 창
await scan('6100000');
ok(/원성옥 \(0000\)님 접수되었습니다/.test(await popup().innerText().catch(() => '')), 'QR 찍으면 가운데 큰 창: 접수되었습니다');
ok(!!(await getKey('daily-patients')).value.find(p => p.name === '원성옥').checkin, '실제로 접수됨');
ok(await page.locator('[data-staff-controls]').evaluate(el => el.className.includes('opacity-0')), '리더기 입력으로 직원용 버튼이 뜨지 않음');
await page.screenshot({ path: `${SP}/r96-popup.png` });
await W(5000);
ok(await popup().count() === 0 && await page.locator('[data-qr-band]').count() === 1, '5초 뒤 사라지고 다시 명단');
// 2) 이미 접수한 환자 → 갈 곳 안내, 명단에 없는 번호 → 빨간 안내
await scan('6100444');
ok(/이미 접수되었습니다/.test(await popup().innerText().catch(() => '')), '다시 찍기: 이미 접수 + 갈 곳 안내');
await scan('9999999');
ok(/오늘 예약 명단에서 찾지 못했습니다/.test(await popup().innerText().catch(() => '')), '명단에 없는 번호: 찾지 못함 (다음 찍기가 바로 바꿔 보여 줌)');
await page.screenshot({ path: `${SP}/r96-popup-notfound.png` });
// 3) 작은 화면에서도 창이 화면 안에 들어감
await page.setViewportSize({ width: 1366, height: 768 }); await scan('6100444');
const box = await page.locator('[role=status]').boundingBox();
ok(box && box.y >= 0 && box.y + box.height <= 768 && box.x >= 0 && box.x + box.width <= 1366, `1366×768에서도 창이 화면 안 (${JSON.stringify(box)})`);
await page.screenshot({ path: `${SP}/r96-popup-1366.png` });
// 4) 나가기: 마우스를 움직이면 직원용 버튼 → [메인 화면] (접속 비밀번호가 없으면 바로)
await W(5500);
await page.mouse.move(600, 400); await page.mouse.move(700, 450); await W(300);
await page.locator('[data-staff-controls]').getByRole('button', { name: '메인 화면' }).click(); await W(600);
ok(await page.getByText('환자용 화면 선택').count() === 1, '[메인 화면] → 환자용 화면 고르기로');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
