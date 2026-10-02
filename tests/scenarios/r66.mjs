import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 화면 안전장치 (화면오류-허용: 일부러 화면 오류를 만듦)
// 1) 화면 오류 → 흰 화면 대신 안내 + 서버에 기록, [다시 시도]·[메인 화면으로]
// 2) 저장 실패 → 빨간 띠 + 화면은 저장된 내용으로 되돌아감
// 3) 서버 데이터 파일 문제(health) → 손상은 빨간 띠, 자동 복구는 노란 띠([확인]은 PC마다 기억)
// 4) 마지막 화면 기억 (설정 제외, 지운 검사실이면 삭제 안내), 진료실 교수님 기억
// 5) 새 버전: 직원 화면은 안내 띠, 환자용 화면은 저절로 새로고침 (같은 화면으로)
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { ok, W, pick, back, cardOf } = tester(page, { keepRole: true });
const clientErrors = [];
page.on('request', r => { if (r.url().endsWith('/api/client-error')) clientErrors.push(r.postData() || ''); });
const setP = (name, patch) => editKey('daily-patients', list => list.map(p => (p.name === name ? { ...p, ...patch } : p)));
const errorText = () => page.getByText('화면을 그리는 중 오류가 났습니다');
const failBar = () => page.getByRole('alert').filter({ hasText: '저장되지 않았습니다' });

// 1) 화면 오류: 처치실 화면을 보는 중에 망가진 기록이 들어옴
await page.goto(`${BASE}/`); await W();
await pick('처치실');
await setP('조현우', { procedures: {} }); await W(4800);
ok(await errorText().count() === 1, '화면 오류: 흰 화면 대신 안내');
ok(await page.getByRole('button', { name: '메인 화면으로' }).count() === 1, '업무 화면 오류: [메인 화면으로] 버튼');
ok(clientErrors.some(x => x.includes('procedure')), '오류 내용을 서버에 기록 (어느 화면인지 포함)');
await setP('조현우', { procedures: [] }); await W(4800);
await page.getByRole('button', { name: '다시 시도' }).click(); await W(600);
ok(await errorText().count() === 0 && await page.getByRole('button', { name: '메인 화면', exact: true }).count() === 1, '[다시 시도] → 다시 그려짐 (그동안 받은 내용으로)');
await setP('조현우', { procedures: {} }); await W(4800);
await page.getByRole('button', { name: '메인 화면으로' }).click(); await W(600);
ok(await errorText().count() === 1 && await page.getByRole('button', { name: '메인 화면으로' }).count() === 0, '메인 화면도 오류면 메인 화면 안내 ([다시 시도]만)');
await setP('조현우', { procedures: [] }); await W(4800);
await page.getByRole('button', { name: '다시 시도' }).click(); await W(600);
ok(await page.getByText('이 컴퓨터의 화면을 선택하세요').count() === 1, '고친 뒤 [다시 시도] → 메인 화면');

// 2) 저장 실패: 서버가 명단 저장을 거절하면 빨간 띠, 접수는 되돌아감
await pick('시력');
await page.route('**/api/storage/daily-patients', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test"}' }) : route.continue()));
await cardOf('원성옥').getByRole('button', { name: '접수', exact: true }).click(); await W(2500);
ok(await failBar().count() === 1 && /^저장 실패/.test(await failBar().innerText()), '저장 실패 → 빨간 띠');
ok(!(await getKey('daily-patients')).value.find(p => p.name === '원성옥').checkin && await cardOf('원성옥').getByRole('button', { name: '접수', exact: true }).count() === 1, '화면은 저장된 내용으로 되돌아감 (접수 전)');
await failBar().getByRole('button', { name: '확인', exact: true }).click(); await W(300);
ok(await failBar().count() === 0, '[확인] → 띠 닫힘');
await page.unroute('**/api/storage/daily-patients');
await cardOf('원성옥').getByRole('button', { name: '접수', exact: true }).click(); await W(1500);
ok(!!(await getKey('daily-patients')).value.find(p => p.name === '원성옥').checkin && await failBar().count() === 0, '서버가 다시 받으면 그대로 저장 (띠 없음)');
await back();

// 3) 서버 데이터 파일 문제 안내 (health 응답을 바꿔서 확인)
let problems = [{ key: 'doctors', kind: 'broken', at: Date.now() }];
await page.route('**/api/health', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, build: 'same', problems }) }));
await page.reload(); await W(1000);
ok(await page.getByText(/서버의 교수 목록 파일이 손상되어/).count() === 1, '복구 못 한 파일 → 빨간 띠');
problems = [{ key: 'daily-patients', kind: 'recovered', from: '직전 저장본', at: Date.now() }];
await page.reload(); await W(1000);
ok(await page.getByText(/환자 명단 파일을 \d\d:\d\d에 직전 저장본으로 되돌렸습니다/).count() === 1, '자동 복구 → 노란 띠 (언제·무엇으로)');
await page.getByRole('status').filter({ hasText: '되돌렸습니다' }).getByRole('button', { name: '확인', exact: true }).click(); await W(300);
await page.reload(); await W(1000);
ok(await page.getByText(/되돌렸습니다/).count() === 0, '[확인]한 PC에는 다시 안 뜸');
await page.unroute('**/api/health');

// 4) 마지막 화면 기억
await pick('시력'); await page.reload(); await W(1200);
ok(await page.getByRole('button', { name: '메인 화면', exact: true }).count() === 1 && await cardOf('신종희').count() === 1, '새로고침해도 시력방 화면 그대로');
await back(); await page.reload(); await W(1000);
ok(await page.getByText('이 컴퓨터의 화면을 선택하세요').count() === 1, '메인 화면으로 나온 뒤에는 메인 화면');
await pick('진료실');
await page.getByRole('button', { name: '나상훈', exact: true }).first().click(); await W(300);
await page.reload(); await W(1200);
ok(/bg-amber-600/.test(await page.getByRole('button', { name: '나상훈', exact: true }).first().getAttribute('class')), '진료실: 고른 교수님 기억');
await back();
await pick('설정'); await page.reload(); await W(1000);
ok(await page.getByText('이 컴퓨터의 화면을 선택하세요').count() === 1, '설정은 기억 안 함 (비밀번호 때문)');
await page.evaluate(() => localStorage.setItem('oph-role', 'room:ZZ')); await page.reload(); await W(1200);
ok(await page.getByText('이 검사실은 설정에서 삭제되었습니다', { exact: false }).count() === 1, '지운 검사실이면 삭제 안내 (메인 화면 버튼)');
await back();

// 5) 새 버전: 환자용 화면은 저절로 새로고침(같은 화면), 직원 화면은 안내만
const newVersionPage = async (role) => {
  const p = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  let calls = 0;
  await p.route('**/api/health', route => { calls += 1; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, build: calls === 1 ? 'old' : 'new', problems: [] }) }); });
  await p.clock.install();
  await p.goto(`${BASE}/`);
  if (role) await p.evaluate(r => localStorage.setItem('oph-role', r), role);
  calls = 0;
  await p.reload(); await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__notReloaded = true; });
  // 30초 확인 → 새 버전을 알아챌 때까지 (컴퓨터가 바쁘면 조금 걸림)
  await p.clock.fastForward(31000);
  for (let i = 0; i < 20 && calls < 2; i++) await p.waitForTimeout(250);
  await p.waitForTimeout(1000);
  return { p, calls: () => calls };
};
const notReloaded = (p) => p.evaluate(() => window.__notReloaded === true).catch(() => false);
{
  const { p, calls } = await newVersionPage('board:vision');
  ok(await p.getByText('새 버전이 있습니다').count() === 0, '환자용 화면: 새 버전 안내 띠 없음');
  // 1분 안에 저절로 새로고침 (시계를 1분씩 몇 번 앞으로)
  for (let i = 0; i < 4 && await notReloaded(p); i++) { await p.clock.fastForward(62000); await p.waitForTimeout(1500); }
  ok(!(await notReloaded(p)) && calls() >= 3, '환자용 화면: 새 버전이면 저절로 새로고침');
  await p.waitForTimeout(1000);
  ok(await p.getByText(/대기 순서/).count() >= 1, '새로고침 뒤에도 같은 환자용 화면');
  await p.close();
}
{
  const { p } = await newVersionPage(null);
  ok(await p.getByText('새 버전이 있습니다').count() === 1, '직원 화면: 새 버전 안내 띠');
  await p.clock.fastForward(62000); await p.waitForTimeout(800);
  await p.clock.fastForward(62000); await p.waitForTimeout(800);
  ok(await notReloaded(p), '직원 화면은 저절로 새로고침하지 않음');
  await p.close();
}
await browser.close();
