import { chromium, SP, BASE, DATA, getKey, editKey, tester , measureVision } from '../lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
// 이전 시력: 한 환자 칸만 저장 (오늘 + 지난 1회), 서버 칸 저장 충돌 처리
const api = (k) => `${BASE}/api/storage-entries/${k}`;
const post = (k, entries) => fetch(api(k), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
// 서버: 칸 저장 · 충돌
await editKey('measure-history', () => ({ A: [{ date: '2026-01-01', nct: { od: '10', os: '11' } }], B: [{ date: '2026-01-02' }] }));
let r = await post('measure-history', [{ id: 'A', prev: [{ date: '2026-01-01', nct: { od: '10', os: '11' } }], next: [{ date: '2026-02-01' }] }]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
ok(r.status === 200, '칸 저장 성공');
let h = (await getKey('measure-history')).value;
ok(h.A[0].date === '2026-02-01' && h.B[0].date === '2026-01-02', '그 칸만 바뀌고 다른 칸은 그대로');
r = await post('measure-history', [{ id: 'A', prev: [{ date: 'old' }], next: null }]);
ok(r.status === 409 && (await r.json()).current.A[0].date === '2026-02-01', '다른 값 기준이면 거절 + 최신 값 돌려줌');
// 화면: 시력방 측정값 저장 → 그 환자 칸만, 최대 2회
const pid = (await getKey('daily-patients')).value.find(p => p.name === '최민지').id;
await editKey('measure-history', () => ({ [pid]: [{ date: '2025-05-01', nct: { od: '20', os: '20' } }, { date: '2025-01-01', nct: { od: '21', os: '21' } }], other: [{ date: '2025-01-01' }] }));
await page.goto(`${BASE}/`); await W();
await pick('시력');
await measureVision(page, cardOf('최민지'), '0.5');
await W(1500);
h = (await getKey('measure-history')).value;
ok(Array.isArray(h[pid]) && h[pid].length === 2 && h[pid][1].date === '2025-05-01', `오늘 + 지난 1회만 남음 (${JSON.stringify(h[pid]?.map(x => x.date))})`);
ok(Array.isArray(h.other), '다른 환자 칸은 그대로');
// 환자번호 끝 두 자리 파일에 나눠 저장 (…33 → 33.json)
const shardFile = path.join(DATA, 'keys', 'measure-history', `${String(pid).slice(-2)}.json`);
ok(fs.existsSync(shardFile) && JSON.parse(JSON.parse(fs.readFileSync(shardFile, 'utf8')).value)[pid], `환자 기록이 ${String(pid).slice(-2)}.json 에 저장됨`);
ok(!fs.existsSync(path.join(DATA, 'keys', 'measure-history.json')), '예전 한 파일은 없음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
