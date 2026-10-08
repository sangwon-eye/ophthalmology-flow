import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// '진료 순서 보호 인원'을 '진료실 앞으로 안내할 인원'과 분리 (10-07 사용자 결정, 이름은 모두 가상)
// - 설정 > 기타 새 칸 '진료 순서 보호 인원' 기본 1명, 0명이면 보호 없이 예약 순서
// - 안내 인원(복도 끝 모니터·QR)은 진료 순서에 영향 없음, 보호 인원은 모니터 노란 상자에 영향 없음
const testing = (p, extra) => ({ ...p, doctor: '김선웅', assigned: { visionIop: true, wfp: true }, done: { visionIop: true }, measureOk: 1, calledRoom: null, seen: false, consultDone: false, procedures: [], late: false, checkin: '08:30', ...extra });
const waiting = (p, extra) => ({ ...testing(p, extra), done: { visionIop: true, wfp: true } });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();

// 1) 설정: 새 칸 기본 1명 → 0명으로 저장, 안내 인원(5명)은 그대로
await pick('설정');
await page.getByRole('button', { name: '기타', exact: true }).click(); await W(300);
const field = page.getByLabel('진료 순서 보호 인원');
ok(await field.inputValue() === '1', '설정: 진료 순서 보호 인원 기본 1명');
await field.fill('0');
await page.getByRole('button', { name: '저장', exact: true }).click(); await W(1200);
const st = (await getKey('settings')).value;
ok(st.consultProtectCount === 0 && (st.consultFrontCount ?? 5) === 5, `설정: 보호 0명 저장, 안내 인원은 그대로 (${st.consultProtectCount}/${st.consultFrontCount})`);
await back();

await editKey('daily-patients', list => list.map(p => {
  if (p.doctor === '김선웅' && !['서준호', '조현우', '신종희', '임수빈', '장민호'].includes(p.name)) return { ...p, doctor: '나상훈' };
  if (p.name === '서준호') return waiting(p, { reservation: '09:00', queueKey: 540.0510 });
  if (p.name === '조현우') return waiting(p, { reservation: '10:00', queueKey: 600.0510 });
  if (p.name === '신종희') return waiting(p, { reservation: '10:30', queueKey: 630.0510 });
  if (p.name === '임수빈') return testing(p, { reservation: '08:20', queueKey: 500.0510 }); // 예약 가장 빠름, 검사 늦게 끝남
  if (p.name === '장민호') return testing(p, { reservation: '08:40', queueKey: 520.0510 });
  return p;
}));
const order = async (names) => {
  const t = await page.locator('body').innerText();
  const ws = t.indexOf('진료 대기 ·');
  const at = names.map(n => t.indexOf(n, ws));
  return at.every((v, i) => v > ws && (i === 0 || v > at[i - 1]));
};
const wfp = async (name) => { await pick('31번방'); await cardOf(name).getByRole('button', { name: /^WFP/ }).first().click(); await W(1200); await back(); };
const consult = async () => { await pick('진료실'); await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200); };

// 2) 보호 0명 (안내 인원 5명이어도): 예약이 가장 빠른 임수빈은 맨 앞으로
await wfp('임수빈');
await consult();
ok(await order(['임수빈', '서준호', '조현우', '신종희']), '보호 0명: 예약 순서대로 맨 앞 (안내 인원 5명은 순서에 영향 없음)');
await back();

// 3) 보호 2명 + 안내 인원 0명(모니터 표시 끔): 장민호는 앞 2명 바로 뒤
await editKey('settings', s => ({ ...s, consultProtectCount: 2, consultFrontCount: 0 }));
await W(1500);
await wfp('장민호');
await consult();
ok(await order(['임수빈', '서준호', '장민호', '조현우', '신종희']), '보호 2명: 앞 2명은 그대로, 장민호는 3번째 (안내 인원 0명이어도 보호)');
await back();

// 4) 복도 끝 모니터는 안내 인원(0명)만 따름 → 노란 상자 없음
await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
await page.getByRole('button', { name: /^진료실 대기 명단 \(전체\)\s*교수님별/ }).click(); await W(1500);
ok(await page.locator('[data-front]').count() === 0, '안내 인원 0명: 모니터 노란 상자 없음 (보호 인원과 따로)');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
