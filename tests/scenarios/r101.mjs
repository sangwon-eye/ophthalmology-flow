import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// '지난 진료 FU 미지정' (10-08 사용자: 지난 진료가 완료돼야 진료를 본 것, 이름은 모두 가상)
// - FU 기록에 그 교수님의 'FU 나중에'(설명 완료 때만 생김)가 지금도 있을 때만 표시
// - 명단 기록에 표시(fuMissing)만 남고 'FU 나중에'가 없어진 환자(설명 완료를 되돌리고 끝까지 완료 안 함 등)는 표시 안 함
const list = (await getKey('daily-patients')).value;
const doc = (n) => list.find(p => p.name === n).doctor;
const idOf = (n) => list.find(p => p.name === n).id;
const today = list[0].date;
const yesterday = (() => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
await editKey('daily-patients', l => l.map(p => (p.name === '조현우' || p.name === '장민호' ? { ...p, fuMissing: true, assigned: { ...p.assigned, oct: true } } : p)));
await editKey('fu-designations', fu => ({
  ...fu,
  // 조현우: 어제 그 교수님이 [설명 완료 · FU 나중에] → 진짜 FU 미지정
  [idOf('조현우')]: { name: '조현우', fuLaterBy: { [doc('조현우')]: { doctor: doc('조현우'), date: yesterday, at: 1 } } },
  // 장민호: 표시만 남음 ('FU 나중에' 없음 — 설명 완료를 되돌린 뒤 완료 안 함)
  [idOf('장민호')]: undefined,
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('관리자');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(1000);
const card = (name) => page.locator('[data-edge]').filter({ has: page.getByText(name, { exact: true }) }).first();
ok(await card('조현우').getByText('지난 진료 FU 미지정').count() === 1 && await card('조현우').getAttribute('data-edge') === 'check', "명단 관리: 'FU 나중에'가 남은 환자(조현우)는 빨간 'FU 미지정'");
ok(await card('장민호').getByText('지난 진료 FU 미지정').count() === 0 && await card('장민호').getAttribute('data-edge') !== 'check', "명단 관리: 'FU 나중에'가 없으면(장민호) 표시·빨간 테두리 없음");
await page.screenshot({ path: `${SP}/r101-admin.png` });
await page.getByRole('button', { name: 'FU 지정 관리', exact: true }).click(); await W(1000);
const fuText = await page.locator('body').innerText();
ok(fuText.includes('조현우') && !/FU 나중에 지정할 환자[\s\S]*장민호/.test(fuText), 'FU 지정 관리 목록과 같음 (조현우만)');
await back();
// 직원 화면(시력방 카드)도 같은 규칙
await pick('시력');
const body = async (n) => (await cardOf(n).count()) ? await cardOf(n).innerText() : '';
ok(!/FU 미지정/.test(await body('장민호')), '직원 화면도 표시만 남은 환자는 FU 미지정 없음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
