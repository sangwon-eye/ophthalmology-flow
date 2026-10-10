import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 진료 전 처치 확인 대기 중 검사 가능 · 검사 준비를 진료실에서 (10-10 사용자, 이름은 모두 가상)
// A) 만니톨을 맞고 30분 확인을 기다리는 동안 다른 검사실 검사 가능, 진료 대기는 [확인] 뒤 (MMP와 같은 규칙)
//    - 검사실 카드 작은 글씨 '만니톨 확인 HH:MM', QR 다시 찍기(검사가 없으면) '처치 후 확인을 기다리고 있습니다 · ○번 진료실 앞에서'
//    - 맞기 전에는 지금처럼 검사실이 부르지 않음
// B) 설정 > 검사 [검사 준비] + [진료실에서] (예: FAG skin test): 동의서는 처치실, skin test는 진료실 '진료 전 처치' 칸
//    - 처치실 검사 준비 칸에는 원래 줄('FAG skin test · 진료실')에 [동의서 전]만 → 확인하면 처치실에서 빠지고 진료실에 [시작]
//    - 진료실: 동의서 전에는 점선 '처치실 · 동의서 전', 시작하면 '확인 대기' → 시간이 되면 '시간 됨' [끝 · 확인] (처치실 결과 확인에도)
//    - QR 다시 찍기: 진료실 검사 준비만 남으면 '검사 전 준비가 남았습니다 · ○번 진료실 앞으로'
// C) 동의서를 켠 교수님 진료 전 처치(예: YAG): 처치실 '진료 전 처치' 줄에 [동의서 전]만 → 받으면 진료실 칸에서 [처치 완료]
//    (진료실은 그 전까지 점선 '처치실 · 동의서 전', QR은 처치실)
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TMP = path.join(HERE, '..', '.tmp-r111');
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
  tests: s.tests.map(t => (t.id === 'fag' ? { ...t, prepOn: true, prepName: 'skin test', prepWaitMin: 20, consent: true, prepAtConsult: true } : t)),
  procedures: [{ id: 'man', name: '만니톨', performer: 'prof', checkMin: 30 }, { id: 'yag', name: 'YAG', performer: 'prof', eyeSelect: true, consent: true }],
}));
const base = (i, name, extra = {}) => ({
  id: String(6600000 + i * 79), name, date: today, doctor: '김선웅', reservation: `${String(9 + i).padStart(2, '0')}:00`, checkin: '08:40', late: false,
  assigned: { visionIop: true }, done: { visionIop: true }, doneAt: {}, drops: [], procedures: [], queueKey: 540 + i * 60 + 0.05, measureOk: 1, vaOk: 1, nctOk: 1, ...extra,
});
const man = (uid, extra = {}) => ({ uid, procId: 'man', name: '만니톨', performer: 'prof', done: false, ...extra });
await editKey('daily-patients', () => [
  base(0, '조현우', { assigned: { visionIop: true, oct: true }, preProcs: [man('a0', { performedAt: min(5), checkMin: 30 })] }), // 맞고 확인 대기 + OCT
  base(1, '신종희', { preProcs: [man('a1', { performedAt: min(5), checkMin: 30 })] }), // 맞고 확인 대기, 검사 없음
  base(2, '서준호', { assigned: { visionIop: true, oct: true }, preProcs: [man('a2')] }), // 맞기 전
  base(3, '임수빈', { assigned: { visionIop: true, fag: true, oct: true } }), // FAG 동의서 전
  base(4, '노은비', { assigned: { visionIop: true, fag: true }, consent: { fag: min(3) } }), // FAG 동의서 받음, skin test만 남음
  base(5, '배하늘', { skipVision: true, preProcs: [{ uid: 'y5', procId: 'yag', name: 'YAG', eye: 'OS', performer: 'prof', done: false }] }), // 교수님 YAG 동의서 전
]);
const rec = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
ok(built.status === 0, '흐름 규칙 묶기');
const inSec = (id, n) => page.locator(`#${id} div.bg-white`).filter({ has: page.getByText(n, { exact: true }) }).first();
let settings = (await getKey('settings')).value;
const prefs = (await getKey('doctor-prefs')).value;

// A) 규칙
const jo = await rec('조현우');
ok(F.roomPending(jo, settings, 'B') && !F.consultWaiting(jo, settings, prefs), '만니톨 확인 대기 중: 검사실은 부름, 진료 대기는 아님');
ok(!F.roomPending(await rec('서준호'), settings, 'B'), '맞기 전에는 지금처럼 검사실이 부르지 않음');
const sj = await rec('신종희');
ok(F.getStage(sj, settings).label === '진료 전 처치 확인 대기 (만니톨)' && !F.consultWaiting(sj, settings, prefs), `검사가 없으면 단계 '진료 전 처치 확인 대기' (${F.getStage(sj, settings).label})`);
// B) 규칙
const im = await rec('임수빈');
ok(F.getStage(im, settings).label === '처치실 대기 (FAG 동의서)', `FAG 동의서 전 단계 (${F.getStage(im, settings).label})`);
ok(F.getStage(await rec('노은비'), settings).label === '진료실 대기 (FAG 검사 준비)', '동의서 받은 뒤 단계: 진료실 대기 (FAG 검사 준비)');

// C) 규칙
ok(F.getStage(await rec('배하늘'), settings).label === '처치실 대기 (진료 전 처치: YAG 동의서)' && F.inTreatRoom(await rec('배하늘'), settings), `교수님 YAG 동의서 전: 처치실 대기 (${F.getStage(await rec('배하늘'), settings).label})`);

// A) 검사실 카드: 확인 시각
await page.goto(`${BASE}/`); await W(900);
await pick('31번방'); await W(1200);
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
ok((await cardOf('조현우').locator('[data-preproc-check]').innerText()).includes(`만니톨 확인 ${hhmm(min(5) + 30 * 60000)}`), "검사실 카드: '만니톨 확인 HH:MM'");
ok(await page.getByText('서준호', { exact: true }).count() === 0, '맞기 전 환자는 검사실 대기에 없음');
await back();

// B) 처치실: 동의서 줄만
await pick('처치실'); await W(1500);
const prep = inSec('treat-prep', '임수빈');
ok(await prep.locator('[data-task-line="검사 준비"]').filter({ hasText: '진료실' }).count() === 1 && await prep.getByRole('button', { name: '동의서 전', exact: true }).count() === 1 && await prep.getByRole('button', { name: '시작', exact: true }).count() === 0, "처치실 검사 준비: 원래 줄 'FAG skin test 진료실' + [동의서 전]만 (시작 없음, 따로 '동의서' 줄 없음)");
ok(await inSec('treat-prep', '노은비').count() === 0, '동의서를 받은 환자는 처치실 검사 준비에 없음');
const yagT = inSec('treat-preproc', '배하늘');
ok(await yagT.locator('[data-task-line="진료 전 처치"]').filter({ hasText: '교수님 · 진료실' }).count() === 1 && await yagT.getByRole('button', { name: '동의서 전', exact: true }).count() === 1 && await yagT.getByRole('button', { name: '처치 완료', exact: true }).count() === 0, "처치실 진료 전 처치: 'YAG · OS 교수님 · 진료실' + [동의서 전]만");
await page.screenshot({ path: `${SP}/r111-treat.png`, fullPage: true });
await back();

// B) 진료실: 동의서 전 점선 → 처치실에서 동의서 → [시작]
await pick('진료실'); await W(600);
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200);
let c = inSec('consult-preproc', '임수빈');
ok(await c.locator('[data-task-line="처치실"]').filter({ hasText: '동의서 전' }).count() === 1 && await c.getByRole('button', { name: '시작', exact: true }).count() === 0, "진료실: 동의서 전에는 점선 '처치실 · 동의서 전'");
ok(await inSec('consult-preproc', '노은비').getByRole('button', { name: '시작', exact: true }).count() === 1, '동의서 받은 환자: 진료실 [시작]');
ok(await inSec('consult-preproc', '조현우').locator('[data-task-line="확인 대기"]').count() === 1, "만니톨 확인 대기 환자도 진료실 칸에 '확인 대기'");
ok(await inSec('consult-preproc', '배하늘').locator('[data-task-line="처치실"]').filter({ hasText: '동의서 전' }).count() === 1 && await inSec('consult-preproc', '배하늘').getByRole('button', { name: '처치 완료', exact: true }).count() === 0, "진료실: 교수님 YAG 동의서 전에는 점선 '처치실 · 동의서 전'");
await page.screenshot({ path: `${SP}/r111-consult.png`, fullPage: true });
await back(); await pick('처치실'); await W(1200);
await inSec('treat-prep', '임수빈').getByRole('button', { name: '동의서 전', exact: true }).click(); await W(1200);
ok(!!(await rec('임수빈')).consent?.fag && await inSec('treat-prep', '임수빈').count() === 0, '처치실에서 동의서 확인 → 처치실 검사 준비에서 빠짐');
await inSec('treat-preproc', '배하늘').getByRole('button', { name: '동의서 전', exact: true }).click(); await W(1200);
ok(!!(await rec('배하늘')).preProcs[0].consentAt && await inSec('treat-preproc', '배하늘').count() === 0, '교수님 YAG 동의서 → 처치실에서 빠짐');
await back(); await pick('진료실'); await W(600);
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200);
c = inSec('consult-preproc', '임수빈');
ok(await c.locator('[data-task-line="검사 준비"]').count() === 1, "진료실: '검사 준비 FAG skin test' + [시작]");
ok(await inSec('consult-preproc', '배하늘').getByRole('button', { name: '처치 완료', exact: true }).isEnabled(), '동의서 뒤 진료실: YAG [처치 완료]');
await c.getByRole('button', { name: '시작', exact: true }).click(); await W(1200);
ok(!!(await rec('임수빈')).prep?.fag?.startedAt && await inSec('consult-preproc', '임수빈').getByRole('button', { name: '지금 확인', exact: true }).count() === 1, "시작 → '확인 대기' + [지금 확인]");
await editKey('daily-patients', l => l.map(p => (p.name === '임수빈' ? { ...p, prep: { fag: { ...p.prep.fag, startedAt: p.prep.fag.startedAt - 21 * 60000 } } } : p))); await W(1500);
c = inSec('consult-preproc', '임수빈');
ok(await c.locator('[data-task-line="시간 됨"]').count() === 1 && await c.getByRole('button', { name: '끝 · 확인', exact: true }).count() === 1, "20분 뒤 '시간 됨' + [끝 · 확인]");
await back(); await pick('처치실'); await W(1200);
ok(await inSec('treat-check', '임수빈').getByRole('button', { name: '끝 · 확인', exact: true }).count() === 1, '처치실 결과 확인에도 보임 (어느 쪽에서 확인해도 같음)');
await back(); await pick('진료실'); await W(600);
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200);
await inSec('consult-preproc', '임수빈').getByRole('button', { name: '끝 · 확인', exact: true }).click(); await W(1200);
settings = (await getKey('settings')).value;
const im2 = await rec('임수빈');
ok(im2.prep?.fag?.result === 'neg' && F.roomPending(im2, settings, 'B') && F.pendingTests(im2, settings, 'B').some(t => t.id === 'fag'), '진료실 [끝 · 확인] → 검사실에서 FAG 가능');
await back();

// QR 다시 찍기
await pick('QR 접수');
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await W(1200); };
await scan(sj.id);
ok(await page.getByText('처치 후 확인을 기다리고 있습니다').count() === 1 && await page.getByText(/^(\d+번 )?진료실 앞에서 기다려 주세요$/).count() === 1, "QR: '처치 후 확인을 기다리고 있습니다 · ○번 진료실 앞에서 기다려 주세요'");
await W(5500);
await scan((await rec('노은비')).id);
ok(await page.getByText('검사 전 준비가 남았습니다').count() === 1 && await page.getByText(/^(\d+번 )?진료실 앞으로 이동해 주세요$/).count() === 1, "QR: '검사 전 준비가 남았습니다 · ○번 진료실 앞으로'");
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
