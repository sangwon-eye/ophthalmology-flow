import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 진료 대기 순서 (10-07 사용자 결정, 이름은 모두 가상)
// - 앞 N명 보호: N = 설정 '진료 순서 보호 인원'(10-07에 '진료실 앞으로 안내할 인원'과 분리). 앞 N명은 밀리지 않음 (예전 '1번 보호'를 넓힘)
// - 예약시간이 같으면 진료 대기에 먼저 들어온(검사가 먼저 끝난) 사람이 앞 (접수 순서 아님)
// - 환자용 진료실 명단에 '9:00 예약' (지각·예약 없음은 표시 안 함)
const testing = (p, extra) => ({ ...p, doctor: '김선웅', assigned: { visionIop: true, wfp: true }, done: { visionIop: true }, measureOk: 1, calledRoom: null, seen: false, consultDone: false, procedures: [], late: false, ...extra });
const waiting = (p, extra) => ({ ...testing(p, extra), done: { visionIop: true, wfp: true } });
await editKey('settings', s => ({ ...s, consultFrontCount: 3, consultProtectCount: 3 }));
await editKey('daily-patients', list => list.map(p => {
  if (p.doctor === '김선웅' && !['서준호', '신종희', '조현우', '최민지', '임수빈', '정대현', '장민호'].includes(p.name)) return { ...p, doctor: '나상훈' };
  if (p.name === '서준호') return waiting(p, { reservation: '09:00', checkin: '08:30', queueKey: 540.0510 });
  if (p.name === '신종희') return waiting(p, { reservation: '09:30', checkin: '08:30', queueKey: 570.0510, consultHold: true }); // 진료 중 보냈다 돌아옴 → 재진료
  if (p.name === '조현우') return waiting(p, { reservation: '10:00', checkin: '08:30', queueKey: 600.0510 });
  if (p.name === '최민지') return waiting(p, { reservation: '09:10', checkin: '10:20', late: true, queueKey: 100550.062 }); // 지각
  if (p.name === '임수빈') return testing(p, { reservation: '08:20', checkin: '08:10', queueKey: 500.0490 }); // 예약 가장 빠름, 검사 늦게 끝남
  if (p.name === '장민호') return testing(p, { reservation: '10:30', checkin: '08:30', queueKey: 630.0510 }); // 같은 10:30, 접수 먼저
  if (p.name === '정대현') return testing(p, { reservation: '10:30', checkin: '08:31', queueKey: 630.0511 }); // 같은 10:30, 접수 나중
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const order = async (names) => {
  const t = await page.locator('body').innerText();
  const ws = t.indexOf('진료 대기 ·');
  const at = names.map(n => t.indexOf(n, ws));
  return at.every((v, i) => v > ws && (i === 0 || v > at[i - 1]));
};
const wfp = async (name) => { await pick('31번방'); await cardOf(name).getByRole('button', { name: /^WFP/ }).first().click(); await W(1200); await back(); };
const consult = async () => { await pick('진료실'); await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200); };
await page.goto(`${BASE}/`); await W();

// 1) 예약이 가장 빠른 임수빈이 늦게 끝남 → 앞 3명(진료실 앞)은 그대로, 4번째로
await wfp('임수빈');
await consult();
ok(await order(['서준호', '신종희', '조현우', '임수빈', '최민지']), '앞 3명은 밀리지 않음 → 임수빈은 4번째 (지각 최민지는 맨 뒤)');
await back();
// 2) 같은 10:30 예약: 접수가 늦은 정대현이 먼저 끝남 → 접수가 빠른 장민호가 나중에 끝나도 정대현 뒤
await wfp('정대현');
await wfp('장민호');
await consult();
ok(await order(['서준호', '신종희', '조현우', '임수빈', '정대현', '장민호', '최민지']), '같은 예약시간이면 검사가 끝난 순서 (접수가 빨라도 뒤)');
await page.screenshot({ path: `${SP}/r90-consult.png` });
await back();

// 3) 환자용 진료실 명단: 이름 옆 '9:00 예약', 지각은 시간 없음
await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
await page.getByRole('button', { name: /^진료실 대기 명단 \(전체\)\s*교수님별/ }).click(); await W(1500);
const row = (masked) => page.getByText(new RegExp(`^${masked.replace('*', '\\*')} \\(\\d{4}\\)$`)).first().locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
ok(/9:00 예약/.test(await row('서준호').innerText()), '복도 끝 모니터: 서준호 9:00 예약');
ok(/10:30 예약/.test(await row('장민호').innerText()), '복도 끝 모니터: 장민호 10:30 예약');
ok(!/예약/.test(await row('최민지').innerText()), '지각 환자는 예약시간 표시 안 함');
ok(/재진료/.test(await row('신종희').innerText()) && !/재진료/.test(await row('서준호').innerText()), '진료 중 보냈다 돌아온 환자만 "재진료"');
const t1 = await row('서준호').innerText();
ok(t1.indexOf('9:00') < t1.indexOf('서준호') && t1.indexOf('서준호') < t1.indexOf('(0444)'), `한 줄 배열: 예약시간 · 이름 · 번호 뒷 4자리 (${t1.replace(/\n/g, ' ')})`);
await page.screenshot({ path: `${SP}/r90-board-all.png` });
await page.setViewportSize({ width: 1536, height: 864 }); await W(400);
await page.screenshot({ path: `${SP}/r90-board-all-1536.png` }); // 병원 큰 TV(1920, 125%)
await page.setViewportSize({ width: 1366, height: 900 });
await page.goto(`${BASE}/`); await W();
await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
await page.getByRole('button', { name: /^김선웅 진료실/ }).click(); await W(1500);
ok(await page.getByText('9:00 예약', { exact: true }).count() >= 1, '진료실 앞 모니터에도 예약시간');
await page.screenshot({ path: `${SP}/r90-board-doctor.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
