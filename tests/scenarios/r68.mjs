import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 9) FU를 저장하면 이미 올라가 있는 다음 명단(같은 교수님·접수 전)에도 바로 적용 (다른 교수님·2차 진료로 이어진 기록은 그대로)
// 12) FU는 평소 명단 환자 것만 받고(전체 X) 그 환자 칸만 저장, 관리자 'FU 지정 관리' 탭은 연 동안만 전체
const shift = (n) => { const d = new Date(Date.now() + n * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const [d1, d2] = [shift(1), shift(2)];
const pts0 = (await getKey('daily-patients')).value;
const s = pts0.find(p => p.name === '서준호');
const plan = (extra) => ({ id: s.id, name: '서준호', reservation: '10:00', checkin: '', late: false, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 600, firstVisit: false, ...extra });
await editKey('daily-patients', list => [
  ...list.map(p => (p.name === '서준호' ? { ...p, seen: true, seenAt: Date.now(), calledRoom: null } : p)),
  plan({ date: d1, doctor: '김선웅', assigned: { visionIop: true, vf: true, res: true }, fuMissing: true }),
  plan({ date: d2, doctor: '나상훈', assigned: { visionIop: true, vf: true } }),
  plan({ date: d2, doctor: '김선웅', visit: 2, linkWaiting: true, primaryKey: `${s.id}::${d2}`, primaryDoctor: '나상훈', assigned: { visionIop: true, res: true } }),
]);
await editKey('fu-designations', fu => ({ ...(fu || {}), 9990009: { wfp: true, doctor: '이종혁', name: '가상에프유', updatedAt: 1 } }));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
const reqs = [];
page.on('request', r => { const u = new URL(r.url()); if (u.pathname.includes('fu-designations')) reqs.push(`${r.method()} ${u.pathname}`); });
const count = (pat) => reqs.filter(x => x.startsWith(pat)).length;
const recs = async () => (await getKey('daily-patients')).value.filter(p => p.id === s.id);

await page.goto(`${BASE}/`); await W(4500);
ok(count('POST /api/storage-subset/fu-designations') >= 1 && count('GET /api/storage/fu-designations') === 0, '평소에는 FU를 명단 환자 것만 받음 (전체 안 받음)');
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W();
await cardOf('서준호').getByRole('button', { name: '설명 완료', exact: true }).click(); await W(400);
const more = modal().getByRole('button', { name: /^나머지 검사 보기/ });
if (await more.count()) { await more.click(); await W(200); }
const wfp = modal().locator('label').filter({ hasText: 'WFP' }).first().locator('input[type=checkbox]');
if (!(await wfp.isChecked())) await wfp.check();
await modal().getByRole('button', { name: '설명 완료', exact: true }).click(); await W(1500);
ok(count('POST /api/storage-entries/fu-designations') >= 1 && count('PUT /api/storage/fu-designations') === 0, 'FU 저장은 그 환자 칸만 (전체를 다시 쓰지 않음)');
const fu = (await getKey('fu-designations')).value[s.id];
const kfu = fu?.byDoctor?.김선웅 || fu;
ok(kfu?.wfp === true, '진료실 FU 저장됨 (WFP)');
let list = await recs();
const a = list.find(p => p.date === d1);
const tests = Object.keys({ ...a.assigned, ...kfu }).filter(k => !['visionIop', 'detail', 'dilate', 'dilateEye', 'cr', 'preProcs', 'name', 'visitDate', 'updatedAt', 'doctor', 'byDoctor', 'fuLater'].includes(k));
ok(a.assigned.visionIop && tests.every(k => !!a.assigned[k] === !!kfu[k]) && a.assigned.wfp && !a.assigned.res && a.fuMissing === false, '내일 김선웅 명단(접수 전): 새 FU로 바뀜 + FU 미지정 표시 지움');
ok(list.find(p => p.date === d2 && p.doctor === '나상훈').assigned.vf === true, '다른 교수님 명단은 그대로');
ok(list.find(p => p.date === d2 && p.doctor === '김선웅').assigned.res === true, '2차 진료로 이어진 기록은 그대로');
await back();

// 관리자 FU 지정 관리: 연 동안만 전체 (명단에 없는 환자 FU도 보임), FU를 고치면 다음 명단에도 적용
await pick('관리자');
const before = count('GET /api/storage/fu-designations');
await page.getByRole('button', { name: 'FU 지정 관리', exact: true }).click(); await W(1200);
ok(count('GET /api/storage/fu-designations') > before, 'FU 지정 관리 탭을 열면 전체를 받음');
await page.getByPlaceholder('환자번호 또는 이름으로 찾기').fill('가상에프유'); await W(400);
ok(await page.getByText('가상에프유').count() >= 1, '명단에 없는 환자의 FU도 보임');
await page.getByPlaceholder('환자번호 또는 이름으로 찾기').fill(s.id); await W(400);
await page.locator('div.bg-white').filter({ hasText: '다음 내원 김선웅' }).filter({ hasText: s.id }).last().getByRole('button', { name: '수정', exact: true }).click(); await W(400);
const more2 = modal().getByRole('button', { name: /^나머지 검사 보기/ });
if (await more2.count()) { await more2.click(); await W(200); }
await modal().locator('label').filter({ hasText: 'IDRA' }).first().locator('input[type=checkbox]').check();
await modal().getByRole('button', { name: '저장', exact: true }).click(); await W(1500);
list = await recs();
ok(list.find(p => p.date === d1).assigned.idra === true, '관리자에서 FU를 고치면 내일 명단에도 적용');
ok(await page.locator('div.bg-white').filter({ hasText: '다음 내원 김선웅' }).filter({ hasText: s.id }).last().getByText(/IDRA/).count() === 1, 'FU 지정 관리 목록에 바로 보임');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(800);
const after = count('GET /api/storage/fu-designations');
await W(6000);
ok(count('GET /api/storage/fu-designations') === after, '탭을 닫으면 전체를 다시 받지 않음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
