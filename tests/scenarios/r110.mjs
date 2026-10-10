import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 교수님 담당 진료 전 처치는 진료실 화면에서 (10-10 사용자: 만니톨을 교수님 처치로 설정했는데, 검사실 요청으로 처치실에서 넣으면
// 처치실 '진료 전 처치'에 뜨고 진료 뒤에 넣으면 진료실에 뜸 → 모두 진료실, 이름은 모두 가상)
// - 처치 항목의 performer가 'prof'면 진료실 '진료 전 처치' 칸(그 교수님), 처치실 진료 전 처치에는 없음
// - performer가 없는 예전 기록은 예전처럼 처치실
// - 진료실 '진료 대기' 제목의 '검사 진행 중'에 세지 않음, 요약 줄 '진료 전 처치'
// - QR: 처음 찍기 '시력검사 없이 바로 ○번 진료실 앞으로 오세요', 다시 찍기 '다음은 처치입니다 · ○번 진료실 앞으로 이동해 주세요'
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TMP = path.join(HERE, '..', '.tmp-r110');
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, 'xlsx-stub.mjs'), 'export const read = () => ({}); export const utils = {}; export default {};');
const esbuild = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
const built = spawnSync(esbuild, [path.join(ROOT, 'src', 'core', 'flow.jsx'), '--bundle', '--format=esm', '--platform=node',
  '--outfile=' + path.join(TMP, 'flow.mjs'), '--alias:xlsx=' + path.join(TMP, 'xlsx-stub.mjs'), '--log-level=warning'], { stdio: 'inherit', shell: process.platform === 'win32' });
const F = await import(path.join(TMP, 'flow.mjs') + `?t=${Date.now()}`);

const today = new Date().toLocaleDateString('sv-SE');
await editKey('settings', s => ({
  ...s,
  procedures: [
    { id: 'man', name: '만니톨', performer: 'prof', checkMin: 30 },
    { id: 'prp', name: 'PRP', performer: 'resident', eyeSelect: true },
  ],
}));
const base = (i, name, doctor, extra = {}) => ({
  id: String(6400000 + i * 73), name, date: today, doctor, reservation: `${String(9 + i).padStart(2, '0')}:00`, checkin: '08:40', late: false,
  assigned: { visionIop: true }, done: { visionIop: true }, doneAt: {}, drops: [], procedures: [], queueKey: 540 + i * 60 + 0.05, measureOk: 1, vaOk: 1, nctOk: 1, ...extra,
});
await editKey('daily-patients', () => [
  base(0, '조현우', '김선웅', { assigned: { visionIop: true, oct: true }, preProcs: [{ uid: 'm0', procId: 'man', name: '만니톨', performer: 'prof', done: false, fromRequest: '31번방' }] }),
  base(1, '노은비', '김선웅', { preProcs: [{ uid: 'o1', procId: 'old', name: '레이저', done: false }] }), // 예전 기록 (performer 없음)
  base(2, '한가람', '김선웅'), // 진료 대기
  base(3, '문지후', '김선웅', { checkin: null, done: {}, skipVision: true, preProcs: [{ uid: 'm3', procId: 'man', name: '만니톨', performer: 'prof', done: false }] }), // 접수 전
]);
const rec = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const { errors, ok, W, pick, back } = tester(page);
ok(built.status === 0, '흐름 규칙 묶기');
const inSec = (id, n) => page.locator(`#${id} div.bg-white`).filter({ has: page.getByText(n, { exact: true }) }).first();

// 1) 규칙
const settings = (await getKey('settings')).value;
const jo = await rec('조현우');
const no = await rec('노은비');
ok(F.inProfPreProc(jo) && !F.inTreatRoom(jo, settings), '교수님 담당 진료 전 처치 → 진료실 (처치실 아님)');
ok(F.getStage(jo, settings).label === '진료실 대기 (진료 전 처치: 만니톨)', `단계 표시: ${F.getStage(jo, settings).label}`);
ok(!F.roomPending(jo, settings, 'B'), '만니톨이 끝나기 전에는 검사실에서 부르지 않음 (그대로)');
ok(F.inTreatRoom(no, settings) && !F.inProfPreProc(no), '예전 기록(performer 없음)은 예전처럼 처치실');
const work = F.treatWork((await getKey('daily-patients')).value, settings);
ok(work.preProc.map(p => p.name).join() === '노은비', '처치실 진료 전 처치 목록: 예전 기록만');

// 2) 처치실: 만니톨 환자는 없음
await page.goto(`${BASE}/`); await W(900);
await pick('처치실'); await W(1500);
ok(await inSec('treat-preproc', '노은비').count() === 1 && await inSec('treat-preproc', '조현우').count() === 0, '처치실 진료 전 처치: 예전 기록만, 만니톨 환자는 없음');
ok(await page.getByText('조현우', { exact: true }).count() === 0, '처치실 화면 어디에도 만니톨 대기 환자 없음');
await back();

// 3) 진료실: 진료 전 처치 칸 + 요약 줄, '검사 진행 중'에 안 셈
await pick('진료실'); await W(600);
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200);
const c = inSec('consult-preproc', '조현우');
ok(await c.locator('[data-task-line="진료 전 처치"]').filter({ hasText: '31번방 요청' }).count() === 1 && await c.getByRole('button', { name: '처치 완료', exact: true }).count() === 1, "진료실 진료 전 처치 칸: '만니톨 31번방 요청' + [처치 완료]");
ok(await page.locator('#consult-preproc').getByText('노은비', { exact: true }).count() === 0, '예전 기록은 진료실 칸에 없음');
ok(/진료 전 처치\s*1/.test(await page.getByRole('button', { name: /진료 전 처치/ }).first().innerText()), "요약 줄 '진료 전 처치 1'");
const head = await page.locator('h2, h3, div').filter({ hasText: /^진료 대기 · \d+명/ }).last().innerText();
ok(/진료 대기 · 1명/.test(head) && !/검사 진행 중/.test(head) && /처치실 1명/.test(head), `진료 대기 제목: 만니톨 환자는 '검사 진행 중'에 안 셈 (${head.replace(/\s+/g, ' ')})`);
await page.screenshot({ path: `${SP}/r110-consult.png`, fullPage: true });
await c.getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1200);
ok(!!(await rec('조현우')).preProcs[0].performedAt && await inSec('consult-preproc', '조현우').locator('[data-task-line="확인 대기"]').count() === 1, "[처치 완료] → '확인 대기' 줄 (30분)");
// 되돌리기 → 원래대로
await page.getByRole('button', { name: '되돌리기' }).last().click(); await W(1200);
ok(!(await rec('조현우')).preProcs[0].performedAt && await inSec('consult-preproc', '조현우').locator('[data-task-line="진료 전 처치"]').count() === 1, '되돌리기 → 시행 전으로');
await back();

// 4) QR: 다시 찍기 / 처음 찍기
await pick('QR 접수');
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await W(1200); };
await scan(jo.id);
ok(await page.getByText('다음은 처치입니다').count() === 1 && await page.getByText(/^(\d+번 )?진료실 앞으로 이동해 주세요$/).count() === 1, "QR 다시 찍기: '다음은 처치입니다 · ○번 진료실 앞으로 이동해 주세요'");
await W(8500);
await scan((await rec('문지후')).id);
await page.screenshot({ path: `${SP}/r110-qr.png` });
ok(await page.getByText(/^시력검사 없이 바로 (\d+번 )?진료실 앞으로 오세요$/).count() === 1, "QR 처음 찍기: '시력검사 없이 바로 ○번 진료실 앞으로 오세요'");
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
