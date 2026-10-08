import { execSync } from 'child_process';
import { chromium, SP, DATA, BASE, FIXTURES } from '../lib.mjs';
const api = `${BASE}/api/storage/`;
const getList = async () => { const c = await (await fetch(api + 'daily-patients')).json(); return { list: JSON.parse(c.value), version: c.version }; };
// 원성옥 예약 00:01 (바코드 자동 지각 확인용)
{ const { list, version } = await getList(); list.find(p => p.name === '원성옥').reservation = '00:01';
  await fetch(api + 'daily-patients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: JSON.stringify(list), version }) }); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const wait = (ms = 500) => page.waitForTimeout(ms);
const pick = async (n) => { await page.getByRole('button', { name: new RegExp(`^${n}`) }).first().click(); await wait(); };
const back = async () => { await page.getByRole('button', { name: '메인 화면' }).click(); await wait(300); };
const cardOf = (name) => page.locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await wait(800); };
await page.goto(`${BASE}/`); await wait();
// 관리자: 신종희에게 안내 문구 + 시력검사 건너뛰기
await pick('관리자');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await wait();
const sin = cardOf('신종희');
await sin.getByRole('button', { name: '접수 안내 추가' }).click();
await sin.getByPlaceholder(/바코드 접수 때 보여줄 문구/).fill('시력검사 없이 바로 5번 진료실 앞으로 오세요');
await sin.getByLabel('시력검사 없이 바로 진료').check();
await sin.getByRole('button', { name: '저장', exact: true }).click(); await wait(600);
ok(await cardOf('신종희').getByText(/접수 안내 · 시력검사 없이 바로 진료: 시력검사 없이 바로 5번/).count() === 1, '명단 관리: 접수 안내 저장');
await back();
// 바코드 화면
await pick('QR 접수');
ok(await page.getByText('찍으면 바로 접수됩니다').count() === 1, '바코드 화면');
ok(await page.getByRole('button', { name: '메인 화면' }).count() === 0, '화면 전환 버튼 없음');
await scan('6100000');
ok(await page.getByText('원성옥 (0000)님 접수되었습니다').count() === 1, '바코드 → 접수, 이름 가림');
await page.screenshot({ path: `${SP}/r12-kiosk-ok.png` });
await scan('6100000');
ok(await page.getByText('원성옥 (0000)님은 이미 접수되었습니다').count() === 1, '다시 찍으면 이미 접수');
await scan('9999999');
ok(await page.getByText('오늘 예약 명단에서 찾지 못했습니다').count() === 1, '없는 번호');
await page.screenshot({ path: `${SP}/r12-kiosk-fail.png` });
await scan('06100037');
ok(await page.getByText('신종희 (0037)님 접수되었습니다').count() === 1 && await page.getByText('시력검사 없이 바로 5번 진료실 앞으로 오세요').count() === 1, '앞자리 0 차이 인식 + 안내 문구');
await page.screenshot({ path: `${SP}/r12-kiosk-note.png` });
await page.waitForTimeout(8600);
ok(await page.getByText('찍으면 바로 접수됩니다').count() === 1, '안내 문구가 있으면 8초 뒤 처음 화면');
await page.getByRole('button', { name: '관리' }).click(); await wait();
ok(await page.getByText('이 컴퓨터의 화면을 선택하세요').count() === 1, '관리 → 메인 (비밀번호 없음)');
const { list } = await getList();
const won = list.find(p => p.name === '원성옥'), s2 = list.find(p => p.name === '신종희');
ok(won.checkin && won.late === true, '바코드 접수 + 예약 지남 → 자동 지각');
ok(s2.done.visionIop === true && s2.visionSkipped, '시력검사 건너뜀');
// 시력실: 원성옥 대기에 있음, 신종희 없음; 직원 접수(박영수 예약 09:30, 현재 이후라면 지각 아님)
await pick('시력');
ok(await cardOf('원성옥').getByRole('button', { name: '지각', exact: true }).getAttribute('aria-pressed') === 'true', '시력실: 원성옥 지각 표시');
ok(await page.getByText('신종희', { exact: true }).count() === 0, '시력실에 신종희 없음 (건너뜀)');
await cardOf('원성옥').getByRole('button', { name: '지각', exact: true }).click(); await wait();
ok(await cardOf('원성옥').getByRole('button', { name: '지각', exact: true }).getAttribute('aria-pressed') === 'false', '직원이 지각 끄기 가능');
await cardOf('박영수').getByRole('button', { name: '접수', exact: true }).click(); await wait();
ok(await cardOf('박영수').getByRole('button', { name: '지각', exact: true }).getAttribute('aria-pressed') === 'false', '직원 [접수]는 자동 지각 없음');
await back();
// 진료실: 신종희 진료 대기 (나상훈)
await pick('진료실');
await page.getByRole('button', { name: '나상훈', exact: true }).first().click(); await wait();
ok(await page.getByText('신종희', { exact: true }).count() === 1, '신종희 바로 진료 대기');
// 설명 대기 카드 접수시간
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await wait();
ok(await cardOf('송하린').getByText(/예약 \d\d:\d\d · 접수 \d\d:\d\d/).count() === 1, '설명 대기 카드에 접수시간');
await back();
await pick('처치실');
ok(await cardOf('황도윤').getByText(/예약 \d\d:\d\d · 접수 \d\d:\d\d/).count() === 1, '처치실 카드에 접수시간');
await back();
// 설정: 유예시간 칸
await pick('설정');
await page.getByRole('button', { name: '기타', exact: true }).click(); await wait(300);
ok(await page.getByLabel('지각 유예 시간').count() === 1, '설정에 지각 유예 시간');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
