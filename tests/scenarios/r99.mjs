import { chromium, getKey, tester, BASE } from '../lib.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 지각 환자 자리 (10-08 사용자 결정, 이름은 모두 가상)
// - '자기보다 먼저 접수한 환자' 중 가장 뒤 순서 바로 뒤. 그 뒤에 접수한 환자와는 예약시간으로 비교
//   예: L(9:00 예약·9:10 접수, 지각), A(9:30·9:05), C(9:20·9:15), D(10:00·9:12) → C, A, L, D
// - 검사실·시력방 순서(queueKey)는 모든 환자 기준, 진료 순서(lateConsultKey)는 같은 교수님 환자 기준
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TMP = path.join(HERE, '..', '.tmp-r99');
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, 'xlsx-stub.mjs'), 'export const read = () => ({}); export const utils = {}; export default {};');
const esbuild = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
const built = spawnSync(esbuild, [path.join(ROOT, 'src', 'core', 'flow.jsx'), '--bundle', '--format=esm', '--platform=node',
  '--outfile=' + path.join(TMP, 'flow.mjs'), '--alias:xlsx=' + path.join(TMP, 'xlsx-stub.mjs'), '--log-level=warning'], { stdio: 'inherit', shell: process.platform === 'win32' });
const F = await import(path.join(TMP, 'flow.mjs') + `?t=${Date.now()}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
ok(built.status === 0, '흐름 규칙 묶기');
const d = '2026-10-08';
const mk = (name, doctor, reservation, checkin) => {
  const p = { id: name, name, date: d, doctor, reservation, checkin, late: false, assigned: {}, done: {} };
  return { ...p, queueKey: F.lateQueueKey(p, false) };
};
const A = mk('A', '김', '09:30', '09:05');
const D = mk('D', '김', '10:00', '09:12');
const C = mk('C', '김', '09:20', '09:15');
const E = mk('E', '나', '11:00', '08:50'); // 다른 교수님, 일찍 온 11시 환자
let L = { ...mk('L', '김', '09:00', '09:10') };
const list = [A, D, C, E, L];
L = F.setLate(L, true, list);
const rooms = [A, C, D, E, L].sort(F.byQueue).map(p => p.name).join('');
ok(rooms === 'CADEL', `검사실 순서(모든 환자): C → A → D → E → L (${rooms})`);
ok(L.queueKey > E.queueKey, `검사실(모든 환자 기준): 먼저 온 다른 교수님 11시 환자(E) 뒤 (${L.queueKey.toFixed(5)} > ${E.queueKey.toFixed(5)})`);
const consult = [A, C, D, L].sort(F.byConsultQueue).map(p => p.name).join('');
ok(consult === 'CALD', `진료실(같은 교수님 기준): C → A → L → D (${consult})`);
// 먼저 온 사람이 없으면 자기 예약 자리 그대로
const L2 = F.setLate(mk('L2', '이', '09:00', '09:10'), true, [mk('Z', '이', '09:40', '09:20')]);
ok(Math.floor(L2.queueKey) === 540 && L2.lateConsultKey === L2.queueKey, '먼저 온 사람이 없으면 자기 예약 자리 (뒤에 온 9:40 환자보다 앞)');
// 지각을 풀면 예약 순서로, 진료용 자리 칸도 지움
const L3 = F.setLate(L, false, list);
ok(Math.floor(L3.queueKey) === 540 && L3.lateConsultKey === undefined, '[지각]을 풀면 예약 순서');

// 화면: 시력방 카드 [지각]을 누르면 새 규칙(맨 뒤 묶음이 아님)으로 자리
await page.goto(`${BASE}/`); await W();
await pick('시력');
await cardOf('정대현').getByRole('button', { name: '지각', exact: true }).click(); await W(1200);
const j = (await getKey('daily-patients')).value.find(p => p.name === '정대현');
ok(j.late && j.queueKey < 100000 && typeof j.lateConsultKey === 'number', `[지각] → 먼저 접수한 환자 뒤 자리 (${j.queueKey.toFixed(4)})`);
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
