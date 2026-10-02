import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASE, DATA, getKey } from '../lib.mjs';
// 백업복구.bat (scripts/restore.js): 서버가 켜져 있으면 멈춤, 시점·항목을 골라 되살림(지금 데이터는 따로 보관), 그만두면 그대로
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) { fails++; process.exitCode = 1; } };
const run = (dir, port, input) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'restore.js')], { env: { ...process.env, OPH_DATA_DIR: dir, OPH_PORT: String(port) }, input, encoding: 'utf8', timeout: 20000 });
const day = (n) => { const d = new Date(Date.now() + n * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const item = (value, version = 5) => JSON.stringify({ version, value: JSON.stringify(value), updatedAt: new Date().toISOString() });
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const valueOf = (file) => JSON.parse(JSON.parse(fs.readFileSync(file, 'utf8')).value);

// 1) 서버가 켜져 있으면 멈춤 (아무것도 바꾸지 않음)
const port = Number(new URL(BASE).port);
const before = fs.readFileSync(path.join(DATA, 'keys', 'daily-patients.json'), 'utf8');
const on = run(DATA, port, 'Y\n');
ok(on.status === 1 && /서버가 켜져 있습니다/.test(on.stdout), '서버가 켜져 있으면 되살리지 않음');
ok(fs.readFileSync(path.join(DATA, 'keys', 'daily-patients.json'), 'utf8') === before && (await getKey('daily-patients')).value.length > 0, '명단은 그대로');

// 2) 서버를 끈 상태 (따로 만든 데이터 폴더)
const d = fs.mkdtempSync(path.join(DATA, '..', 'restore-'));
const keys = path.join(d, 'keys');
write(path.join(keys, 'daily-patients.json'), item([{ id: '1', name: '지금명단' }], 50));
write(path.join(keys, 'fu-designations.json'), item({ 1: { name: '지금FU' } }, 50));
write(path.join(keys, 'settings.json'), item({ rooms: [], marker: 'now' }, 50));
write(path.join(d, 'backups-hourly', day(0), 'daily-patients-10시.json'), item([{ id: '1', name: '열시명단' }]));
write(path.join(d, 'backups-hourly', day(0), 'fu-designations-10시.json'), item({ 1: { name: '열시FU' } }));
write(path.join(d, 'backups', day(-1), 'daily-patients.json'), item([{ id: '1', name: '어제아침명단' }]));
write(path.join(d, 'backups', day(-1), 'settings.json'), item({ rooms: [], marker: 'yesterday' }));
const free = 3193;
// 그만두기
let r = run(d, free, '\n');
ok(r.status === 0 && /그만두었습니다/.test(r.stdout) && valueOf(path.join(keys, 'daily-patients.json'))[0].name === '지금명단', '번호를 안 고르면 그대로');
ok(/\[1\] .*10시 사본 — 환자 명단, FU 지정/.test(r.stdout) && /\[2\] .*하루 백업/.test(r.stdout), '시점 목록: 시간별 사본 → 하루 백업 순');
// 10시 사본 → 환자 명단만
r = run(d, free, '1\n1\nY\n');
ok(r.status === 0 && /되살렸습니다/.test(r.stdout), '되살리기 완료 안내');
const p = JSON.parse(fs.readFileSync(path.join(keys, 'daily-patients.json'), 'utf8'));
ok(JSON.parse(p.value)[0].name === '열시명단' && p.version > Date.now() - 60000, '명단을 10시 사본으로 (버전은 지금 시각으로 올림)');
ok(valueOf(path.join(keys, 'fu-designations.json'))[1].name === '지금FU', '고르지 않은 FU는 그대로');
const kept = fs.readdirSync(d).find(f => f.startsWith('keys-복구전-'));
ok(!!kept && valueOf(path.join(d, kept, 'daily-patients.json'))[0].name === '지금명단', '되살리기 전 데이터는 keys-복구전 폴더에 보관');
// 하루 백업 → 전부, 마지막에 N이면 그대로
r = run(d, free, '2\n2\nN\n');
ok(/그만두었습니다/.test(r.stdout) && valueOf(path.join(keys, 'settings.json')).marker === 'now', '마지막 확인에서 N이면 그대로');
r = run(d, free, '2\n2\nY\n');
ok(valueOf(path.join(keys, 'settings.json')).marker === 'yesterday' && valueOf(path.join(keys, 'daily-patients.json'))[0].name === '어제아침명단', '하루 백업 · 전부 → 설정·명단 모두 그날 아침으로');
// 손상된 백업은 쓰지 않음
write(path.join(d, 'backups-hourly', day(0), 'daily-patients-11시.json'), '{bad');
r = run(d, free, '1\n1\nY\n');
ok(r.status === 1 && /손상/.test(r.stdout) && valueOf(path.join(keys, 'daily-patients.json'))[0].name === '어제아침명단', '손상된 사본은 되살리지 않음');
fs.rmSync(d, { recursive: true, force: true });
