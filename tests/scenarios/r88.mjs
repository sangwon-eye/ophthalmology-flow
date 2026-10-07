import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 시범 운영 '시력방 건너뛰기' (10-07 사용자 결정, 이름은 모두 가상)
// - 설정 > 기타에서 켜고 끄기, 켜 두면 접수(QR·직원 [접수]) 모든 환자가 프로그램에서 시력방을 건너뜀 (기존 '시력검사 없이 바로 진료'와 같은 방식)
// - QR 처음 찍을 때도 다시 찍었을 때와 같은 '갈 곳' 안내 (켰을 때만, 끄면 지금과 같음)
// - 시력방 화면에 한 줄 안내, 직원 [접수] 알림에 '시범 운영: 시력방 건너뜀', [되돌리기]는 그대로
const d = new Date().toLocaleDateString('sv-SE');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const rec = async (name) => (await getKey('daily-patients')).value.find(p => p.name === name);
await page.goto(`${BASE}/`); await W();

// 1) 설정 > 기타: 켜기
await pick('설정');
await page.getByRole('button', { name: '기타', exact: true }).click(); await W(300);
const box = page.getByLabel('시력방 건너뛰기 켜기');
ok(!(await box.isChecked()), '설정: 처음엔 꺼짐');
await box.check();
await page.screenshot({ path: `${SP}/r88-settings.png` });
await page.getByRole('button', { name: '저장', exact: true }).click(); await W(1200);
ok((await getKey('settings')).value.pilotSkipVision === true, '설정: 켜짐 저장');
await back();

// 2) 상황 만들기: 원성옥 OCT(정밀검사실 한 곳) + ARK(시력방 검사), 신종희 OCT·IDRA(두 곳), 새 초진 마바사, 끈 뒤 확인용 나다라
await editKey('daily-patients', list => [...list.map(p => {
  if (p.name === '원성옥') return { ...p, assigned: { visionIop: true, ark: true, oct: true } };
  if (p.name === '신종희') return { ...p, assigned: { visionIop: true, oct: true, idra: true } };
  return p;
}), ...[['7400001', '나다라', false], ['7400002', '마바사', true]].map(([id, name, firstVisit], i) => ({
  id, name, date: d, doctor: '김선웅', reservation: `11:0${i}`, checkin: '', firstVisit,
  assigned: { visionIop: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 660 + i,
}))]);
await page.reload(); await W();

// 3) QR 접수: 처음 찍어도 갈 곳 안내
await pick('QR 접수');
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await W(1200); };
const shows = async (...texts) => { const s = await page.locator('[role=status]').innerText().catch(() => ''); return texts.every(x => s.includes(x)); };
await scan('6100000');
ok(await shows('원*옥 (0000)님 접수되었습니다', '검사가 한 곳 남았습니다', '정밀검사실로 이동해 주세요'), 'QR 처음: 검사 한 곳 → 그 검사실로');
await page.screenshot({ path: `${SP}/r88-kiosk.png` });
const won = await rec('원성옥');
ok(!!won.checkin && won.done?.visionIop === true && won.visionSkipped === true, 'QR 접수 → 시력방 건너뜀 (시력/안압 완료로)');
ok(won.assigned?.ark === false && won.assigned?.oct === true, '시력방 검사(ARK)는 빠지고 검사실 검사는 그대로');
await scan('6100037');
ok(await shows('신*희 (0037)님 접수되었습니다', '검사가 남았습니다', '큰 복도에서 기다려 주세요'), 'QR 처음: 검사 두 곳 → 큰 복도');
await scan('7400002');
ok(await shows('마*사 (0002)님 접수되었습니다', '다음은 처치실입니다', '처치실로 이동해 주세요'), 'QR 처음: 초진 → 처치실 (검사 지정)');
await scan('6100000');
ok(await shows('원*옥 (0000)님은 이미 접수되었습니다', '정밀검사실로 이동해 주세요'), '다시 찍기 안내는 그대로');
await page.getByRole('button', { name: '관리' }).click(); await W();

// 4) 시력방: 한 줄 안내, 접수한 환자는 시력방에 없음, 직원 [접수]도 건너뜀 + [되돌리기]
await pick('시력');
ok(await page.getByTestId('pilot-skip-vision').count() === 1, '시력방 화면: 시범 운영 안내 한 줄');
ok(await page.getByText('원성옥', { exact: true }).count() === 0 && await page.getByText('마바사', { exact: true }).count() === 0, '시력방에 QR 접수 환자 없음');
await cardOf('박영수').getByRole('button', { name: '접수', exact: true }).click(); await W(900);
ok(await page.getByText('박영수 접수 (시범 운영: 시력방 건너뜀)').count() === 1, '직원 [접수] 알림: 시범 운영 시력방 건너뜀');
let park = await rec('박영수');
ok(!!park.checkin && park.visionSkipped === true && await page.getByText('박영수', { exact: true }).count() === 0, '직원 [접수]도 시력방 건너뜀');
await page.getByRole('button', { name: '되돌리기' }).first().click(); await W(1200);
park = await rec('박영수');
ok(!park.checkin && !park.done?.visionIop && !park.visionSkipped, '[되돌리기] → 접수 전으로 (시력방 건너뜀도 원래대로)');
await cardOf('박영수').getByRole('button', { name: '접수', exact: true }).click(); await W(1200);
await page.screenshot({ path: `${SP}/r88-vision.png` });
await back();

// 5) 검사실·처치실·진료실로 바로
await pick('31번방');
ok(await page.getByText('원성옥', { exact: true }).count() >= 1 && await page.getByText('신종희', { exact: true }).count() >= 1, '31번방: QR 접수 환자가 바로 검사 대기');
await back();
await pick('처치실');
ok(await page.getByText('마바사', { exact: true }).count() >= 1, '처치실: 초진은 바로 검사 지정 대기');
await back();
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W(1200);
ok(await cardOf('박영수').getByRole('button', { name: '진료 호출' }).count() === 1, '검사 없는 환자 → 바로 진료 대기');
await back();

// 6) 끄면 원래대로: QR 처음 찍기는 '잠시 기다려 주세요', 시력방부터
await editKey('settings', s => ({ ...s, pilotSkipVision: false }));
await page.reload(); await W();
await pick('QR 접수');
await scan('7400001');
ok(await shows('나*라 (0001)님 접수되었습니다', '잠시 기다려 주세요') && !(await shows('이동해 주세요')), '끄면 QR 처음 화면은 예전 그대로');
const na = await rec('나다라');
ok(!!na.checkin && !na.done?.visionIop && !na.visionSkipped, '끄면 시력방부터');
await page.getByRole('button', { name: '관리' }).click(); await W();
await pick('시력');
ok(await page.getByTestId('pilot-skip-vision').count() === 0, '끄면 시력방 안내 줄 없음');
ok(await cardOf('나다라').getByRole('button', { name: '시력', exact: true }).count() === 1, '끄면 시력방 대기에 나다라');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
