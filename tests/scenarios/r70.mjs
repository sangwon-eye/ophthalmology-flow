import fs from 'node:fs';
import path from 'node:path';
import { chromium, getKey, editKey, tester, BASE, DATA } from '../lib.mjs';
// 지난 날짜(그저께 이전, 서버가 월별 보관 파일로 옮긴 명단): 메인 화면 날짜를 그날로 바꿔도
// 명단 관리·전체 환자 명단에서 보관 명단이 그대로 보이고, 보관 파일·실시간 명단은 하나도 바뀌지 않음.
// 메인 화면 날짜는 어제보다 앞으로는 못 바꿈 (예전에 정해 둔 지난 날짜도 무시)
const day = (n) => { const d = new Date(Date.now() + n * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const old = day(-5);
const key = `patients-archive-${old.slice(0, 7)}`;
const arch = [1, 2, 3].map(i => ({ id: `77000${i}`, name: `보관환자${i}`, date: old, doctor: '김선웅', reservation: '09:00', checkin: '08:50', assigned: { visionIop: true }, done: { visionIop: true }, consultDone: true, procedures: [], drops: [] }));
await editKey(key, () => arch);
const before = { arch: fs.readFileSync(path.join(DATA, 'keys', `${key}.json`), 'utf8'), live: (await getKey('daily-patients')).value.length };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back } = tester(page);
await page.goto(`${BASE}/`); await W();
// 1) 명단 관리에서 지난 날짜 → 보관 명단
await pick('관리자');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(300);
const manageDate = page.locator('input[type=date]').first();
await manageDate.fill(old); await W(1500);
ok(await page.getByText('보관환자1').count() >= 1, '명단 관리: 지난 날짜 보관 명단 보임');
await back();
// 2) 메인 화면 날짜를 지난 날짜로 → 바뀌지 않고 안내
await page.getByLabel('오늘 날짜').fill(old); await W(500);
ok(await page.getByRole('button', { name: /바꾸기$/ }).count() === 0 && await page.getByText(/어제보다 앞 날짜/).count() === 1, '메인 화면: 어제보다 앞 날짜는 고를 수 없음 (안내)');
ok((await getKey('today-override')).value === null || !(await getKey('today-override')).value?.date, '날짜 설정은 그대로');
// 3) 예전에 지난 날짜로 정해 둔 값이 있어도 무시 → 오늘 명단 그대로
await editKey('today-override', () => ({ date: old, setOn: day(0) }));
await W(4500);
ok(await page.getByLabel('오늘 날짜').inputValue() === day(0), '예전에 정해 둔 지난 날짜는 무시 (오늘 명단)');
// 4) 그래도 명단 관리·전체 환자 명단에서 보관 명단 보임
await pick('관리자');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(300);
await page.locator('input[type=date]').first().fill(old); await W(1500);
ok(await page.getByText('보관환자2').count() >= 1, '다시 들어가도 보관 명단 보임');
await back();
await pick('전체 환자 명단');
const dirDate = page.locator('input[type=date]').first();
await dirDate.fill(old); await W(1500);
ok(await page.getByText('보관환자3').count() >= 1, '전체 환자 명단에서도 보관 명단 보임');
await back();
// 5) 데이터는 하나도 바뀌지 않음
ok(fs.readFileSync(path.join(DATA, 'keys', `${key}.json`), 'utf8') === before.arch, '보관 파일은 그대로');
ok((await getKey('daily-patients')).value.length === before.live, '실시간 명단 인원 그대로');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
