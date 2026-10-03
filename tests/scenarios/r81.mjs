import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// QR 접수기 다시 찍기 안내 + 복도 끝 모니터(진료실 대기 명단 전체) 앞 N명 (10-03 사용자 결정)
// 다시 찍으면: 시력 전 / 검사 두 곳 이상(큰 복도) / 한 곳(그곳으로) / 처치실 먼저(초진 검사 지정·예진) / 진료만(앞 N명이면 진료실 앞으로) / 진료 끝
const browser = await chromium.launch();
// 1) 설정 > 기타: '진료실 앞으로 안내할 인원' 기본 5명 → 1명으로 저장
const sp = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const s = tester(sp);
await sp.goto(`${BASE}/`); await s.W();
await s.pick('설정');
await sp.getByRole('button', { name: '기타', exact: true }).click(); await s.W(300);
const field = sp.getByLabel('진료실 앞으로 안내할 인원');
s.ok(await field.inputValue() === '5', '설정: 기본 5명');
await field.fill('1');
await sp.getByRole('button', { name: '저장', exact: true }).click(); await s.W(1200);
s.ok((await getKey('settings')).value.consultFrontCount === 1, '설정: 1명으로 저장');
await sp.close();

// 2) 상황 만들기 (가상 명단)
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '한지훈') return { ...p, done: { ...p.done, oct: true, wfp: true }, assigned: { ...p.assigned, idra: true } }; // 6번방(IDRA)만 남음
  if (p.name === '강서윤') return { ...p, done: { ...p.done, visionIop: true }, measureOk: 1, hxSheetAt: Date.now() }; // 초진: 처치실 검사 지정
  if (p.name === '박영수') return { ...p, checkin: '08:40', done: { visionIop: true }, measureOk: 1, firstVisit: true, hxSheetAt: 1, triageAssigned: true, assigned: { visionIop: true } }; // 예진만 남음
  if (p.name === '송하린') return { ...p, consultDone: true, consultDoneAt: Date.now() };
  return p;
}));
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('QR 접수');
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await W(900); };
// 결과 칸(제목 앞에 ✓ 가 붙음) 전체 글에 문구가 모두 있는지
const shows = async (...texts) => { const s = await page.locator('[role=status]').innerText().catch(() => ''); return texts.every(x => s.includes(x)); };
await scan('6100111');
ok(await shows('최*지 (0111)님은 이미 접수되었습니다', '시력검사 대기 중입니다', '큰 복도에서 기다려 주세요'), '시력검사 전 → 큰 복도');
await scan('6100333');
ok(await shows('검사가 남았습니다', '큰 복도에서 기다려 주세요'), '검사 두 곳 이상(정밀·안구건조증) → 큰 복도');
await scan('6100222');
ok(await shows('검사가 한 곳 남았습니다', '정밀검사실로 이동해 주세요'), '한 곳만 남음 → 그 검사실로');
await scan('6100370');
ok(await shows('검사가 한 곳 남았습니다', '안구건조증 검사실로 이동해 주세요'), '6번방(IDRA)만 남음 → 그 검사실로');
await scan('6100185');
ok(await shows('다음은 처치실입니다', '처치실로 이동해 주세요'), '초진 검사 지정 → 처치실 먼저');
await scan('6100074');
ok(await shows('다음은 처치실입니다', '처치실로 이동해 주세요'), '예진만 남음 → 처치실');
await scan('6100407');
ok(await shows('곧 진료 순서입니다', '7번 진료실 앞으로 이동해 주세요'), '진료 호출 받은 환자 → 진료실 앞으로');
await scan('6100518');
ok(await shows('진료가 끝났습니다', '간호사 안내를 받으시기 바랍니다'), '진료 후(설명 대기) → 간호사 안내');
await scan('6100555');
ok(await shows('송*린 (0555)님', '진료가 끝났습니다', '간호사 안내를 받으시기 바랍니다'), '귀가까지 끝난 환자 → 같은 안내 (빨간 화면 아님)');

// 3) 진료만 남음: 김선웅 진료 대기 [조현우, 서준호], 앞 1명만 '진료실 앞으로'
await editKey('daily-patients', list => list.map(p => (p.name === '조현우' ? { ...p, done: { ...p.done, oct: true, wfp: true } } : p)));
await W(1500);
await scan('6100444');
ok(await shows('3번 진료실에서 진료 예정입니다', '복도 끝 모니터를 확인해 주세요'), '진료만 남음(앞 1명 밖) → 복도 끝 모니터 확인');
await scan('6100222');
ok(await shows('곧 진료 순서입니다', '3번 진료실 앞으로 이동해 주세요'), '진료만 남음(앞 1명 안) → 진료실 앞으로');
await page.screenshot({ path: `${SP}/r81-kiosk-front.png` });

// 4) 복도 끝 모니터: 앞 1명은 노란 상자 '진료실 앞으로 이동해 주세요', 나머지는 '큰 복도에서 기다려 주세요'
const board = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const b = tester(board);
await board.goto(`${BASE}/`); await b.W();
await board.getByRole('button', { name: /^환자용 화면/ }).click(); await b.W(300);
await board.getByRole('button', { name: /^진료실 대기 명단/ }).first().click(); await b.W(1200);
const front = board.locator('[data-front]').filter({ hasText: '조*우' });
b.ok(await front.count() === 1 && await front.getByText('진료실 앞으로 이동해 주세요').count() === 1 && await front.getByText('서*호', { exact: false }).count() === 0, '복도 끝 모니터: 앞 1명(조*우)만 노란 상자');
b.ok(await board.locator('[data-rest]').filter({ hasText: '서*호' }).getByText('큰 복도에서 기다려 주세요').count() === 1, '복도 끝 모니터: 나머지(서*호)는 큰 복도에서');
b.ok(await board.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '화면 밖으로 넘치지 않음');
await board.screenshot({ path: `${SP}/r81-board-front.png` });
// 0명이면 노란 상자 없음 (예전 모양)
await editKey('settings', st => ({ ...st, consultFrontCount: 0 }));
await b.W(2000);
b.ok(await board.locator('[data-front]').count() === 0 && await board.getByText('다음 순서', { exact: true }).count() >= 1, '0명이면 끔 (예전 모양)');
for (const x of [{ t: { errors } }, { t: b }]) ok(x.t.errors.length === 0, `페이지 오류 없음 ${x.t.errors.join(' / ')}`);
await browser.close();
