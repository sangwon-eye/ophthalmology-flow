import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 동의서 · 검사실 → 처치실 확인 요청 · 요청 카드 [처치 추가] · 확인 · 재진료 (10-10 사용자, 이름은 모두 가상)
// - 검사실 카드 작은 글씨 '처치실 확인 요청' → 메모 → 검사실은 '처치실 확인 중'으로 멈춤 → 처치실 '요청 확인' 칸 '31번방 요청'
// - [확인 · 검사실로]면 멈춤이 풀리고, [처치 추가 → 만니톨]이면 진료 전 처치 → 처치 완료 → 30분 확인 → 다시 검사실로
// - 설정에서 [동의서]를 켠 처치·검사 준비는 '동의서 전'을 눌러야 [처치 완료]·[시작]
// - 진료 뒤 처치의 확인 시간이 되면 [확인] 옆 '확인 · 재진료' → 확인 + 같은 교수님 진료 대기로
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TMP = path.join(HERE, '..', '.tmp-r107');
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, 'xlsx-stub.mjs'), 'export const read = () => ({}); export const utils = {}; export default {};');
const esbuild = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
const built = spawnSync(esbuild, [path.join(ROOT, 'src', 'core', 'flow.jsx'), '--bundle', '--format=esm', '--platform=node',
  '--outfile=' + path.join(TMP, 'flow.mjs'), '--alias:xlsx=' + path.join(TMP, 'xlsx-stub.mjs'), '--log-level=warning'], { stdio: 'inherit', shell: process.platform === 'win32' });
const F = await import(path.join(TMP, 'flow.mjs') + `?t=${Date.now()}`);

const today = new Date().toLocaleDateString('sv-SE');
const now = Date.now();
const min = (m) => now - m * 60000;
await editKey('settings', s => ({
  ...s,
  tests: s.tests.map(t => (t.id === 'fag' ? { ...t, prepOn: true, prepName: 'skin test', prepWaitMin: 20, consent: true } : t)),
  procedures: [
    { id: 'man', name: '만니톨', performer: 'prof', checkMin: 30 },
    { id: 'yag', name: 'YAG', performer: 'resident', eyeSelect: true, checkMin: 60, consent: true },
    { id: 'inj', name: '주사', performer: 'prof', eyeSelect: true, consent: true },
    { id: 'p2', name: '전공의 처치', performer: 'resident' },
  ],
}));
const m = (iop = ['17', '18']) => ({ ucva: { od: '0.4', os: '0.7' }, nct: { od: iop[0], os: iop[1] } });
const base = (i, name, doctor, extra = {}) => ({
  id: String(6600000 + i * 89), name, date: today, doctor, reservation: `${String(9 + i).padStart(2, '0')}:00`, checkin: '08:40', late: false,
  assigned: { visionIop: true }, done: { visionIop: true }, doneAt: {}, drops: [], procedures: [], queueKey: 540 + i * 60 + 0.05, measureOk: 1, vaOk: 1, nctOk: 1, measure: m(), ...extra,
});
const seenX = (ago) => ({ seen: true, seenAt: min(ago), consultDoneAt: min(ago), assigned: { visionIop: true, oct: true }, done: { visionIop: true, oct: true } });
const list = [
  base(0, '조현우', '이종혁', { assigned: { visionIop: true, oct: true, wfp: true }, measure: m(['32', '18']) }), // 31번방 → 처치실 확인 요청
  base(1, '신종희', '나상훈', { ...seenX(15), procedures: [{ uid: 'y1', procId: 'yag', name: 'YAG', eye: 'OS', performer: 'resident', done: false, orderedAt: min(15) }] }), // 동의서 YAG
  base(2, '임수빈', '나상훈', { assigned: { visionIop: true, fag: true, oct: true }, done: { visionIop: true, oct: true } }), // FAG 동의서
  base(3, '남궁하늘', '김선웅', { ...seenX(50), procedures: [{ uid: 'mn3', procId: 'man', name: '만니톨', performer: 'prof', done: false, orderedAt: min(50), performedAt: min(32), checkMin: 30 }] }), // 확인 · 재진료
  base(4, '황도윤', '김선웅', { ...seenX(8), procedures: [{ uid: 'i4', procId: 'inj', name: '주사', eye: 'OD', performer: 'prof', done: false, orderedAt: min(8) }] }), // 교수님 처치 동의서
  base(5, '서준호', '김선웅', { assigned: { visionIop: true, oct: true }, done: { visionIop: true, oct: true }, consultHold: true, treatRequest: { at: min(3), from: '김선웅' }, sendNote: { text: '만니톨 여부 판단', from: '김선웅', at: min(3) } }), // 진료실 요청
  base(6, '오세영', '이종혁', { ...seenX(12), procedures: [{ uid: 'p6', procId: 'p2', name: '전공의 처치', performer: 'resident', done: false, orderedAt: min(12) }] }), // 예전 기록 (동의서 없는 처치)
];
await editKey('daily-patients', () => list);
const rec = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
ok(built.status === 0, '흐름 규칙 묶기');
const sec = (id) => page.locator(`#${id}`);
const inSec = (id, n) => sec(id).locator('div.bg-white').filter({ has: page.getByText(n, { exact: true }) }).first();
await page.goto(`${BASE}/`); await W(900);

// 1) 검사실 → 처치실 확인 요청
await pick('31번방'); await W(1000);
await cardOf('조현우').getByRole('button', { name: '처치실 확인 요청', exact: true }).click(); await W(300);
await page.getByLabel('처치실 확인 요청 메모').fill('안압 OD 32, 만니톨?');
await page.keyboard.press('Enter'); await W(1200);
let r = await rec('조현우');
ok(r.treatRequest?.roomId === 'B' && r.treatRequest.from === '31번방' && r.treatRequest.note === '안압 OD 32, 만니톨?' && !r.sendNote, '요청 기록: treatRequest {from 31번방, roomId, note} (진료실 메모 칸은 건드리지 않음)');
ok(/처치실 확인 중 · 안압 OD 32, 만니톨\?/.test(await cardOf('조현우').innerText()) && await cardOf('조현우').getByRole('button', { name: /^OCT/ }).first().isDisabled(), "검사실 카드: '처치실 확인 중 · 메모' + 검사 칸 잠김");
ok(await cardOf('조현우').getByRole('button', { name: '처치실 확인 요청', exact: true }).count() === 0, '요청 중에는 작은 글씨가 사라짐');
await page.screenshot({ path: `${SP}/r107-exam-asked.png` });
await back();
// 처치실 '요청 확인' 칸
await pick('처치실'); await W(1200);
const req = inSec('treat-request', '조현우');
ok(await page.getByText(/^요청 확인 \(진료실 · 검사실\) · 2명$/).count() === 1, "칸 이름 '요청 확인 (진료실 · 검사실)' (진료실 요청 1 + 검사실 요청 1)");
ok(await req.locator('[data-task-line="31번방 요청"]').count() === 1 && /안압 OD 32, 만니톨\?/.test(await req.innerText()), "요청 카드: '31번방 요청' + 메모");
ok(await req.getByRole('button', { name: '처치 추가', exact: true }).count() === 1 && await req.getByRole('button', { name: '확인 · 검사실로', exact: true }).count() === 1 && await req.getByRole('button', { name: '검사 추가', exact: true }).count() === 0, '검사실 요청: [처치 추가] [확인 · 검사실로]만');
ok(await inSec('treat-request', '서준호').getByRole('button', { name: '처치 추가', exact: true }).count() === 1 && await inSec('treat-request', '서준호').getByRole('button', { name: '확인 완료 · 진료 대기로', exact: true }).count() === 1, '진료실 요청 카드에도 [처치 추가] (기존 버튼 그대로)');
ok(/요청 2/.test(await page.locator('[data-summary="treat-request"]').innerText()), "요약 칩 '요청 2'");
// [확인 · 검사실로] → 멈춤 풀림
await req.getByRole('button', { name: '확인 · 검사실로', exact: true }).click(); await W(1200);
r = await rec('조현우');
ok(!r.treatRequest && !!r.treatHandledAt, '[확인 · 검사실로] → 요청 처리');
await back(); await pick('31번방'); await W(900);
ok(!(await cardOf('조현우').getByRole('button', { name: /^OCT/ }).first().isDisabled()), '검사실 멈춤이 풀림');
// 다시 요청 → [처치 추가 → 만니톨]
await cardOf('조현우').getByRole('button', { name: '처치실 확인 요청', exact: true }).click(); await W(300);
await page.getByLabel('처치실 확인 요청 메모').fill('만니톨?');
await page.getByRole('button', { name: '요청 보내기', exact: true }).click(); await W(1200);
await back(); await pick('처치실'); await W(1200);
await inSec('treat-request', '조현우').getByRole('button', { name: '처치 추가', exact: true }).click(); await W(400);
const modal = page.locator('.fixed.inset-0').last();
ok(await modal.getByText('조현우님 처치 추가').count() === 1 && await modal.getByText('기타 요청 (직접 입력)').count() === 0 && await modal.getByText(/후 다시 진료/).count() === 0, '[처치 추가] 창: 처치만 (다시 진료·기타 요청 없음)');
await page.screenshot({ path: `${SP}/r107-add-modal.png` });
await modal.locator('label').filter({ hasText: '만니톨' }).locator('input').check();
await modal.getByRole('button', { name: '처치 추가', exact: true }).click(); await W(1200);
r = await rec('조현우');
ok(!r.treatRequest && r.preProcs?.length === 1 && r.preProcs[0].name === '만니톨' && r.preProcs[0].fromRequest === '31번방' && !r.preProcs[0].done, '만니톨 → 진료 전 처치(새 칸 fromRequest), 요청은 처리됨');
ok(await inSec('treat-preproc', '조현우').locator('[data-task-line="진료 전 처치"]').filter({ hasText: '31번방 요청' }).count() === 1, "진료 전 처치 칸: '만니톨 31번방 요청'");
ok(!F.roomPending(r, (await getKey('settings')).value, 'B'), '만니톨이 끝나기 전에는 검사실에서 부르지 않음');
await inSec('treat-preproc', '조현우').getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1200);
ok(await inSec('treat-check', '조현우').getByRole('button', { name: '확인 대기', exact: true }).count() === 1, "만니톨 [처치 완료] → 결과 확인 '확인 대기' (30분)");
await editKey('daily-patients', l => l.map(p => (p.name === '조현우' ? { ...p, preProcs: p.preProcs.map(i => ({ ...i, performedAt: i.performedAt - 31 * 60000 })) } : p))); await W(1500);
ok(await inSec('treat-check', '조현우').getByRole('button', { name: '확인 · 재진료' }).count() === 0, "진료 전 처치에는 '확인 · 재진료' 없음 (확인하면 원래대로 검사·진료로)");
await inSec('treat-check', '조현우').getByRole('button', { name: '확인', exact: true }).click(); await W(1200);
r = await rec('조현우');
ok(r.preProcs[0].done && F.roomPending(r, (await getKey('settings')).value, 'B'), '30분 확인 → 다시 검사실 대기로');

// 2) 동의서: 전공의 YAG · FAG skin test
const yag = inSec('treat-procs', '신종희');
ok(await yag.getByRole('button', { name: '처치 완료', exact: true }).isDisabled() && await yag.getByRole('button', { name: '동의서 전', exact: true }).count() === 1, "동의서 켠 YAG: '동의서 전' + [처치 완료] 회색");
ok(await inSec('treat-procs', '오세영').getByRole('button', { name: '처치 완료', exact: true }).isEnabled() && await inSec('treat-procs', '오세영').getByRole('button', { name: '동의서 전' }).count() === 0, '동의서 안 켠 처치(예전과 같은 기록)는 그대로');
await yag.getByRole('button', { name: '동의서 전', exact: true }).click(); await W(1000);
ok(!!(await rec('신종희')).procedures[0].consentAt && await yag.getByRole('button', { name: /^동의서 ✓ \d\d:\d\d$/ }).count() === 1 && await yag.getByRole('button', { name: '처치 완료', exact: true }).isEnabled(), "누르면 초록 '동의서 ✓ 시각'(새 칸 consentAt) + [처치 완료] 눌림");
await page.screenshot({ path: `${SP}/r107-consent.png`, fullPage: true });
const fag = inSec('treat-prep', '임수빈');
ok(await fag.getByRole('button', { name: '시작', exact: true }).isDisabled() && await fag.getByRole('button', { name: '동의서 전', exact: true }).count() === 1, "FAG skin test: '동의서 전' + [시작] 회색");
await fag.getByRole('button', { name: '동의서 전', exact: true }).click(); await W(1000);
ok(!!(await rec('임수빈')).consent?.fag && await fag.getByRole('button', { name: '시작', exact: true }).isEnabled(), '동의서 확인 → [시작] 눌림 (새 칸 consent.fag)');
await yag.getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1200);
ok(!!(await rec('신종희')).procedures[0].performedAt, '동의서 확인 뒤 YAG 시행');

// 3) 진료실 설명 대기: 교수님 처치 동의서 · 확인 · 재진료
await back(); await pick('진료실'); await W(600);
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200);
const hw = inSec('consult-explain', '황도윤');
ok(await hw.getByRole('button', { name: '교수님 처치 완료', exact: true }).isDisabled() && await hw.getByRole('button', { name: '동의서 전', exact: true }).count() === 1, "설명 대기 교수님 처치: '동의서 전' + 회색 [교수님 처치 완료]");
const nk = inSec('consult-explain', '남궁하늘');
ok(await nk.getByRole('button', { name: '확인 · 재진료', exact: true }).count() === 1, "확인 시간이 된 진료 뒤 처치: [확인] 옆 '확인 · 재진료'");
await page.screenshot({ path: `${SP}/r107-explain.png`, fullPage: true });
await nk.getByRole('button', { name: '확인 · 재진료', exact: true }).click(); await W(1200);
r = await rec('남궁하늘');
ok(r.procedures[0].done && !!r.procedures[0].checkedAt && !r.seen && r.procReconsult?.names === '만니톨', '확인 · 재진료 → 처치 끝 + 진료 대기로 (procReconsult)');
ok(await page.locator('#consult-waiting').getByText('만니톨 후 재진').count() + await page.getByText('만니톨 후 재진').count() >= 1, "진료실 카드 '만니톨 후 재진'");
// 되돌리기
await page.getByRole('button', { name: '되돌리기' }).last().click(); await W(1200);
r = await rec('남궁하늘');
ok(r.seen && !r.procReconsult && !r.procedures[0].done && !!r.procedures[0].performedAt, '되돌리기 → 설명 대기 + 다시 확인 대기');

// 4) 설정 화면: 처치 [동의서] · 검사 준비 검사 [동의서] 칩
await back(); await pick('설정');
await page.getByRole('button', { name: '처치', exact: true }).click(); await W(300);
ok(await page.locator('label').filter({ hasText: /^동의서$/ }).count() === 4, '설정 > 처치: 처치마다 [동의서] 체크');
await page.getByRole('button', { name: /^검사실 · 검사/ }).first().click(); await W(300);
ok(await page.locator('[data-test-row="FAG"]').getByRole('button', { name: /동의서/ }).getAttribute('aria-pressed') === 'true' && await page.locator('[data-test-row="OCT"]').getByRole('button', { name: /동의서/ }).count() === 0, '설정 > 검사: [검사 준비]를 켠 검사에만 [동의서] 칩');

// 5) 흐름 규칙 (화면 없이)
const S = (await getKey('settings')).value;
ok(F.consentMissing(S, [{ uid: 'a', procId: 'p2', done: false }]).length === 0 && F.consentMissing(S, [{ uid: 'b', procId: 'yag', done: false }]).length === 1, '동의서는 설정에서 켠 처치만');
ok(F.examAsked({ treatRequest: { at: 1, roomId: 'B' } }) && !F.examAsked({ treatRequest: { at: 1, from: '김선웅' } }), '검사실 요청만 검사실을 멈춤 (진료실 요청은 예전 그대로)');
ok(F.getStage({ ...list[0], treatRequest: { at: 1, from: '31번방', roomId: 'B' } }, S).label === '처치실 대기 (31번방 요청 확인)', "전체 환자 명단 상태: '처치실 대기 (31번방 요청 확인)'");
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
