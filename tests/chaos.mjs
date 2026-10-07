// 동시 사용 시험 (오래 걸려서 run.mjs 전체 실행에는 넣지 않음):
//   node tests/chaos.mjs            (기본 300초, SECONDS_RUN=600 SEED=7 처럼 바꿀 수 있음)
// 시력방 2·검사실 2·처치실·진료실 4 화면을 동시에 띄워 업무 버튼을 무작위로 빠르게 누르고(QR 접수도 계속 들어옴),
// 끝난 뒤 저장된 명단에 흐름이 깨진 환자(어느 화면에도 없음·진료 중 겹침 등)·화면 오류·저장 실패가 없는지 확인합니다.
// 준비: npm install (esbuild 로 진료 흐름 규칙을 묶어 검사에 씀), npm run build
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.join(HERE, '.tmp-chaos');
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, 'xlsx-stub.mjs'), 'export const utils = {}; export default { utils };');
const esbuild = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
const built = spawnSync(esbuild, [path.join(ROOT, 'src', 'core', 'flow.jsx'), '--bundle', '--format=esm', '--platform=node',
  '--outfile=' + path.join(TMP, 'flow.mjs'), '--alias:xlsx=' + path.join(TMP, 'xlsx-stub.mjs'), '--log-level=warning'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (built.status !== 0) { console.log('esbuild 실패: npm install 을 먼저 하세요'); process.exit(1); }
const { checkState } = await import('./check-state.mjs');
const PORT = Number(process.env.PORT || 3210), B = `http://127.0.0.1:${PORT}`;
const SECONDS = Number(process.env.SECONDS_RUN || 300);
const SEED = Number(process.env.SEED || 1);
let rnd = SEED * 9301 + 49297; const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
const work = fs.mkdtempSync(path.join(TMP, 'run-'));
spawnSync(process.execPath, [path.join(ROOT, 'tests', 'seed.cjs')], { cwd: work });
const today = new Date().toLocaleDateString('sv-SE');
// 환자를 더 넣음 (초진·CR 교수님·산동·여러 검사)
const keyFile = path.join(work, 'data', 'keys', 'daily-patients.json');
const item = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
const list = JSON.parse(item.value);
const docs = ['김선웅', '나상훈', '이종혁'];
for (let i = 0; i < 30; i++) {
  const r = `${String(9 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`;
  const a = { visionIop: true };
  if (i % 2) a.oct = true; if (i % 3 === 0) a.vf = true; if (i % 4 === 0) a.idra = true; if (i % 5 === 0) a.wfp = true;
  // 절반은 이미 접수·시력검사를 마친 상태로 시작 (뒤쪽 흐름까지 충분히 시험)
  const ahead = i % 2 === 0;
  list.push({ id: String(6300000 + i * 13), name: `동시${i}`, date: today, doctor: docs[i % 3], reservation: i % 7 === 6 ? '' : r, checkin: ahead ? '08:30' : '', assigned: a, done: ahead ? { visionIop: true } : {}, doneAt: ahead ? { visionIop: Date.now() - 600000 } : {}, measureOk: ahead ? Date.now() - 600000 : undefined, hxSheetAt: ahead ? Date.now() : undefined, drops: [], procedures: [], queueKey: i % 7 === 6 ? 1440 : 540 + i * 10, firstVisit: i % 6 === 0, dilateOverride: i % 4 === 1 ? true : undefined, cr: i % 9 === 1 });
}
item.value = JSON.stringify(list);
fs.writeFileSync(keyFile, JSON.stringify(item));
// 산동 기다리는 시간을 짧게 (기본 1분, DILATE_MIN=15 처럼 바꿀 수 있음): 시험 시간 안에 '산동 완료'·CR '분 지남 · 확인'까지 나오게
const setFile = path.join(work, 'data', 'keys', 'settings.json');
const setItem = JSON.parse(fs.readFileSync(setFile, 'utf8'));
// 시범 운영 '시력방 건너뛰기'를 켜고 시험하려면 PILOT_SKIP=1 (시력방 화면의 [접수]가 시력방을 건너뜀)
setItem.value = JSON.stringify({ ...JSON.parse(setItem.value), dilationWaitMin: Number(process.env.DILATE_MIN || 1), ...(process.env.PILOT_SKIP ? { pilotSkipVision: true } : {}),
  // 처치 후 확인을 켜고 시험하려면 PROC_CHECK=1 (모든 처치 1분 뒤 확인)
  ...(process.env.PROC_CHECK ? { procedures: JSON.parse(setItem.value).procedures.map(x => ({ ...x, checkMin: 1 })) } : {}) });
fs.writeFileSync(setFile, JSON.stringify(setItem));
const logFd = fs.openSync(path.join(work, 'server-out.txt'), 'w');
const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, OPH_DATA_DIR: path.join(work, 'data'), OPH_PORT: String(PORT) }, stdio: ['ignore', logFd, logFd] });
await new Promise(r => setTimeout(r, 1500));
const { chromium } = await import('./lib.mjs');
const browser = await chromium.launch();
const roles = [['시력', null], ['시력', null], ['31번방', null], ['6번방', null], ['처치실', null], ['진료실', '김선웅'], ['진료실', '나상훈'], ['진료실', '이종혁'], ['진료실', '김선웅']];
const errors = []; const saveFails = []; let clicks = 0;
const SAFE = /^([^·]+ \d\d:\d\d · (확인 대기|\d+분 지남 · 확인)$|접수|시력|NCT|완료|▶|종료|검사 지정|History 설문지|History 입력|예진 완료|처치 완료|진료 전 처치 완료|진료 호출|진료 완료|설명 완료|귀가|점안|CR \d회|\d회 점안|산동|확인|끝|시작|지정|처방 전|보내기|추가 검사|처치|오늘 검사|Schirmer|OCT|VF|WFP|IDRA|GAT|ARK|FAG|FP|AS-OCT|Specular|B-scan|연구)/;
const AVOID = /삭제|접수 취소|처치 취소|되돌리기|취소|메인 화면|설정|글씨|자동|가나다|예약시간순|오전|오후|전체|띵동|교수|소리|접기|보기|감사|누르면|한 번 더/;
const MODAL_OK = /^(확인|저장|설명 완료|검사 지정|처치 지정|보내기|추가 검사 등록|설명 완료 · FU 나중에|적용|지정 완료)$/;
async function drive(page, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const modal = page.locator('.fixed.inset-0').last();
      if (await page.locator('.fixed.inset-0').count()) {
        const boxes = modal.locator('input[type=checkbox]');
        const nb = await boxes.count();
        for (let k = 0; k < 2 && nb; k++) { if (rand() < 0.4) await boxes.nth(Math.floor(rand() * nb)).click({ timeout: 800 }).catch(() => {}); }
        const radios = modal.locator('input[type=radio]');
        const nr = await radios.count();
        if (nr && rand() < 0.5) await radios.nth(Math.floor(rand() * nr)).check({ timeout: 800 }).catch(() => {});
        const inputs = modal.locator('input[type=text], input:not([type])');
        if (await inputs.count() && rand() < 0.5) await inputs.first().fill(String(Math.round(rand() * 10) / 10), { timeout: 800 }).catch(() => {});
        const btns = await modal.getByRole('button').all();
        const names = await Promise.all(btns.map(b => b.innerText({ timeout: 500 }).catch(() => '')));
        const okIdx = names.map((n, i) => (MODAL_OK.test(n.trim()) ? i : -1)).filter(i => i >= 0);
        const cancelIdx = names.findIndex(n => n.trim() === '취소');
        const pickIdx = okIdx.length && rand() < 0.8 ? okIdx[Math.floor(rand() * okIdx.length)] : cancelIdx;
        if (pickIdx >= 0) { await btns[pickIdx].click({ timeout: 1000 }).catch(() => {}); clicks++; }
        else await page.keyboard.press('Escape');
      } else {
        const btns = await page.locator('main button:visible, [class*="max-w"] button:visible').all();
        const cand = [];
        for (const b of btns.slice(0, 200)) {
          const n = (await b.innerText({ timeout: 500 }).catch(() => '')).trim();
          if (n && SAFE.test(n) && !AVOID.test(n) && await b.isEnabled({ timeout: 500 }).catch(() => false)) cand.push(b);
        }
        if (cand.length) { await cand[Math.floor(rand() * cand.length)].click({ timeout: 1000 }).catch(() => {}); clicks++; }
      }
    } catch { /* 화면이 바뀌는 중 */ }
    await page.waitForTimeout(80 + rand() * 400);
  }
}
const pages = [];
for (const [role, doc] of roles) {
  const p = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', e => errors.push(`${role}${doc || ''}: ${e.message}`));
  await p.addInitScript(() => { window.addEventListener('oph-save-failed', e => { (window.__fails ||= []).push(e.detail?.message); }); });
  await p.goto(`${B}/`); await p.waitForTimeout(1000);
  await p.getByRole('button', { name: new RegExp(`^${role}`) }).first().click(); await p.waitForTimeout(800);
  if (doc) { await p.getByRole('button', { name: doc, exact: true }).first().click(); await p.waitForTimeout(500); }
  pages.push([p, role + (doc || '')]);
}
// QR 접수 흉내: 접수 전 환자를 1~3초마다 하나씩 접수 (실제 병원처럼 계속 환자가 들어옴)
const kioskEnd = Date.now() + SECONDS * 1000;
const kiosk = (async () => {
  while (Date.now() < kioskEnd) {
    const r = await (await fetch(`${B}/api/storage/daily-patients`)).json();
    const l = JSON.parse(r.value); const p = l.find(x => x.date === today && !x.checkin && !x.linkWaiting);
    if (!p) break;
    const at = new Date(); const hh = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    const next = l.map(x => (x === p ? { ...x, checkin: hh, queueKey: x.queueKey } : x));
    await fetch(`${B}/api/storage/daily-patients`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: JSON.stringify(next), version: r.version }) });
    await new Promise(res => setTimeout(res, 1000 + rand() * 2000));
  }
})();
await Promise.all([...pages.map(([p]) => drive(p, SECONDS * 1000)), kiosk]);
await new Promise(r => setTimeout(r, 6000));
for (const [p, name] of pages) { const f = await p.evaluate(() => window.__fails || []); if (f.length) saveFails.push(`${name}: ${f.length}건 (${f[0]})`); }
const st = await checkState(B, today);
await browser.close(); srv.kill(); await new Promise(r => setTimeout(r, 300));
const serverOut = fs.readFileSync(path.join(work, 'server-out.txt'), 'utf8');
const clientErr = serverOut.match(/\[화면 오류\][^\n]*/g) || [];
const stageCount = {}; st.stages.forEach(s => { const k = s.replace(/\(.*?\)/g, '').trim(); stageCount[k] = (stageCount[k] || 0) + 1; });
console.log(JSON.stringify({ seed: SEED, seconds: SECONDS, clicks, patients: st.count, stages: stageCount }, null, 0));
console.log('흐름 문제:', st.problems.length ? '\n  ' + st.problems.join('\n  ') : '없음');
console.log('화면 오류:', errors.length + clientErr.length ? '\n  ' + [...errors, ...clientErr].slice(0, 10).join('\n  ') : '없음');
console.log('저장 실패:', saveFails.length ? '\n  ' + saveFails.join('\n  ') : '없음');
fs.rmSync(work, { recursive: true, force: true });
process.exitCode = st.problems.length || errors.length || clientErr.length || saveFails.length ? 1 : 0;
