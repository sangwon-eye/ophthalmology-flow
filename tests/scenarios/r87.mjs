import * as XLSX from 'xlsx';
import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 명단 엑셀의 성별·나이 → 직원 화면 이름 옆 'M/80' (10-07 사용자 결정, 이름은 모두 가상)
// - 병원 엑셀은 성별 '남'/'여', 나이 '80세', 아이는 '11세5개월' → 'F/11' (개월은 버림)
// - 제목은 '성별'·'나이' 두 칸 또는 '성별/나이' 한 칸, 칸이 없으면 표시 없음(결과 창에 한 줄 안내)
// - 이미 올라가 있던 환자도 다시 올리면 채워지고, 같은 날 2차 진료 기록에도 같은 값
const d = new Date().toLocaleDateString('sv-SE');
const xlsx = (rows, file) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '명단');
  XLSX.writeFile(wb, `${SP}/${file}`);
  return `${SP}/${file}`;
};
const row = (id, name, sexAge, time, doctor) => ({ 예약: time, 환자번호: id, 환자명: name, ...sexAge, 초재진: '재진', 진료의: doctor });
const fileA = xlsx([
  row('7300001', '가나연', { 성별: '남', 나이: '80세' }, '13:00', '김선웅'),
  row('7300002', '다라연', { 성별: '여', 나이: '11세5개월' }, '13:10', '나상훈'),
  row('7300003', '마바연', { 성별: '여', 나이: '0세3개월' }, '13:20', '이종혁'),
  row('7300004', '사아연', { 성별: '', 나이: '' }, '13:30', '김선웅'),
  row('7300001', '가나연', { 성별: '남', 나이: '80세' }, '14:00', '이종혁'), // 같은 날 두 교수님 → 2차 진료
  row('6100000', '원성옥', { 성별: '여', 나이: '72세' }, '09:00', '김선웅'), // 이미 있던 환자 (성별·나이 없던 기록)
], 'r87-a.xlsx');
const fileB = xlsx([{ 예약: '15:00', 환자번호: '7300005', 환자명: '자차연', '성별/나이': '남/65세', 초재진: '초진', 진료의: '김선웅' }], 'r87-b.xlsx');
const fileC = xlsx([{ 예약: '15:30', 환자번호: '7300006', 환자명: '카타연', 초재진: '재진', 진료의: '나상훈' }], 'r87-c.xlsx');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const list = async () => (await getKey('daily-patients')).value.filter(p => p.date === d);
await page.goto(`${BASE}/`); await W();
await pick('관리자');
await page.locator('input[type=file]').setInputFiles(fileA); await W(1500);
let l = await list();
const rec = (id, doctor) => l.find(p => p.id === id && (!doctor || p.doctor === doctor));
ok(rec('7300001', '김선웅')?.sex === 'M' && rec('7300001', '김선웅')?.age === 80, `남 · 80세 → M, 80 (${JSON.stringify([rec('7300001', '김선웅')?.sex, rec('7300001', '김선웅')?.age])})`);
ok(rec('7300002')?.sex === 'F' && rec('7300002')?.age === 11, '여 · 11세5개월 → F, 11 (개월은 버림)');
ok(rec('7300003')?.age === 0, '0세3개월 → 0');
ok(rec('7300004') && !('sex' in rec('7300004')) && !('age' in rec('7300004')), '빈칸이면 저장 안 함');
ok(rec('7300001', '이종혁')?.sex === 'M' && rec('7300001', '이종혁')?.age === 80 && !!rec('7300001', '이종혁')?.primaryKey, '2차 진료 기록에도 같은 성별·나이');
ok(rec('6100000')?.sex === 'F' && rec('6100000')?.age === 72 && rec('6100000')?.reservation === '09:00', '이미 있던 환자도 다시 올리면 성별·나이가 채워짐 (진행 상황 그대로)');
ok(await page.getByText("'성별'·'나이' 칸이 없어").count() === 0, '칸이 있으면 안내 줄 없음');
// 제목 '성별/나이' 한 칸
await page.locator('input[type=file]').setInputFiles(fileB); await W(1500);
l = await list();
ok(rec('7300005')?.sex === 'M' && rec('7300005')?.age === 65, "'성별/나이' 한 칸 (남/65세) → M, 65");
// 칸이 없는 명단: 등록은 그대로, 결과 창에 한 줄 안내
await page.locator('input[type=file]').setInputFiles(fileC); await W(1500);
l = await list();
ok(!!rec('7300006') && !('sex' in rec('7300006')), '성별·나이 칸이 없는 명단도 그대로 등록');
ok(await page.getByText("'성별'·'나이' 칸이 없어").count() === 1, '결과 창: 성별·나이 칸 없음 안내');
ok(await page.getByText(/성별 · 나이 칸\(또는 '성별\/나이' 한 칸\)/).count() === 1, '엑셀 안내 문구에 성별·나이');
// 데모 샘플에도 성별·나이 (10-07 사용자 요청)
await page.getByRole('button', { name: '데모 샘플 넣기' }).click(); await W(1500);
l = await list();
ok(rec('10001')?.sex === 'M' && rec('10001')?.age === 72 && rec('10005')?.sex === 'F' && rec('10005')?.age === 11, '데모 샘플: 성별·나이 들어감');
// 환자 추가 창: 성별·나이 칸 (비워도 됨, 나이는 엑셀과 같은 규칙)
await page.getByRole('button', { name: '환자 추가', exact: true }).click(); await W(300);
const ageBox = page.getByPlaceholder(/^나이/);
const sexBox = page.getByLabel('성별', { exact: true });
await page.getByPlaceholder('환자번호', { exact: true }).fill('7300007');
await page.getByPlaceholder('이름', { exact: true }).fill('파하연');
await sexBox.selectOption('F');
await ageBox.fill('11세5개월');
await page.getByRole('button', { name: '명단에 추가', exact: true }).click(); await W(1200);
l = await list();
ok(rec('7300007')?.sex === 'F' && rec('7300007')?.age === 11, '환자 추가: 여 · 11세5개월 → F, 11');
ok(await ageBox.inputValue() === '' && await sexBox.inputValue() === '', '추가한 뒤 성별·나이 칸 비움');
await page.getByPlaceholder('환자번호', { exact: true }).fill('7300008');
await page.getByPlaceholder('이름', { exact: true }).fill('거너연');
await ageBox.fill('모름');
await page.getByRole('button', { name: '명단에 추가', exact: true }).click(); await W(800);
l = await list();
ok(!rec('7300008') && await page.getByText(/나이는 숫자로 적어주세요/).count() === 1, '나이를 잘못 적으면 추가하지 않고 안내');
await ageBox.fill('');
await page.getByRole('button', { name: '명단에 추가', exact: true }).click(); await W(1200);
l = await list();
ok(!!rec('7300008') && !('sex' in rec('7300008')) && !('age' in rec('7300008')), '성별·나이를 비워도 추가');
await page.screenshot({ path: `${SP}/r87-manual.png` });

// 화면 표시: 명단 관리
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(800);
ok(await cardOf('가나연').getByText('M/80', { exact: true }).count() >= 1, '명단 관리: 가나연 M/80');
ok(await cardOf('다라연').getByText('F/11', { exact: true }).count() === 1, '명단 관리: 다라연 F/11');
ok(await cardOf('사아연').getByText(/^[MF]\/\d+$/).count() === 0, '명단 관리: 칸이 없으면 표시 없음');
await page.screenshot({ path: `${SP}/r87-admin.png` });
// [정보 수정]에서도 성별·나이 (10-07 사용자): 넣기 / 같은 날 그 환자 모든 기록(2차 진료 포함) / 비우면 지움 / 잘못 적으면 안내
const editInfo = async (name, sex, age) => {
  await cardOf(name).getByRole('button', { name: '정보 수정', exact: true }).first().click(); await W(300);
  const m = page.locator('.fixed.inset-0').last();
  await m.getByLabel('성별', { exact: true }).selectOption(sex);
  await m.getByLabel('나이', { exact: true }).fill(age);
  await m.getByRole('button', { name: '저장', exact: true }).click(); await W(1200);
};
await editInfo('사아연', 'F', '45세');
l = await list();
ok(rec('7300004')?.sex === 'F' && rec('7300004')?.age === 45, '정보 수정: 사아연 F/45');
ok(await cardOf('사아연').getByText('F/45', { exact: true }).count() === 1, '정보 수정 후 바로 표시');
await editInfo('가나연', 'M', '81');
l = await list();
ok(rec('7300001', '김선웅')?.age === 81 && rec('7300001', '이종혁')?.age === 81, '정보 수정: 같은 날 2차 진료 기록도 함께');
await editInfo('사아연', '', '');
l = await list();
ok(!rec('7300004')?.sex && rec('7300004')?.age === undefined, '정보 수정: 비우면 지움');
await editInfo('사아연', 'M', '모름');
ok(await page.getByText(/나이는 숫자로 적어주세요/).count() === 1 && !(await list()).find(p => p.id === '7300004')?.sex, '정보 수정: 나이를 잘못 적으면 저장 안 함');
await page.keyboard.press('Escape');
const left = page.locator('.fixed.inset-0').last().getByRole('button', { name: '취소', exact: true });
if (await left.count()) { await left.click(); await W(200); }
await back();
// 시력방(접수 전 명단)·검사실 카드
await pick('시력');
ok(await cardOf('원성옥').getByText('F/72', { exact: true }).count() === 1, '시력방 접수 전 명단: 원성옥 F/72');
await cardOf('원성옥').getByRole('button', { name: '접수', exact: true }).click(); await W(800);
ok(await cardOf('원성옥').getByText('F/72', { exact: true }).count() === 1, '시력방 대기 카드: 원성옥 F/72');
await page.screenshot({ path: `${SP}/r87-vision.png` });
await back();
// 진료실: 진료 중 큰 제목에도 (가상 명단의 오세영 = 이종혁 교수님 진료 중)
await editKey('daily-patients', all => all.map(p => (p.name === '오세영' ? { ...p, sex: 'M', age: 47 } : p)));
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W(1500);
const inRoom = page.locator('div.border-amber-300').filter({ hasText: '현재 진료 중' }).first();
ok(await inRoom.getByText('M/47', { exact: true }).count() === 1, '진료실 진료 중: 오세영 M/47');
await page.screenshot({ path: `${SP}/r87-consult.png` });
// 환자용 화면에는 성별·나이를 보이지 않음
await back();
await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
await page.getByRole('button', { name: /^시력검사실/ }).first().click(); await W(1500);
ok(!/[MF]\/\d+/.test(await page.locator('body').innerText()), '환자용 화면에는 성별·나이 없음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
