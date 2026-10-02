// 백업에서 되살리기 (백업복구.bat): 서버를 끈 상태에서 시간별 사본·하루 백업 중 하나를 골라 data\keys 에 되살립니다.
// 되살리기 전 지금 데이터는 data\keys-복구전-날짜시각 폴더에 그대로 보관합니다 (잘못 골랐으면 그 폴더에서 다시 복사).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT, configuredPort, loadConfig } from './common.js';

const DATA_DIR = process.env.OPH_DATA_DIR || path.join(ROOT, 'data');
const KEYS_DIR = path.join(DATA_DIR, 'keys');
const CONFIG = loadConfig();
// 서버(server.js)와 같은 규칙: 서버설정.txt 의 BACKUP_DIR 이 있으면 하루 백업은 그 폴더에만
const BACKUP_DIR = process.env.OPH_DATA_DIR ? path.join(DATA_DIR, 'backups') : (CONFIG.BACKUP_DIR || process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups'));
const HOURLY_DIR = path.join(DATA_DIR, 'backups-hourly');
const SHARDED = ['measure-history'];
const NAMES = { 'daily-patients': '환자 명단', 'fu-designations': 'FU 지정' };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = [];
let waiting = null;
rl.on('line', l => { if (waiting) { const w = waiting; waiting = null; w(l); } else lines.push(l); });
rl.on('close', () => { if (waiting) waiting(''); });
const ask = (q) => new Promise(resolve => {
  process.stdout.write(q);
  if (lines.length) resolve(lines.shift()); else waiting = resolve;
});
const say = (t = '') => console.log(t ? ` ${t}` : '');
const finish = (code) => { rl.close(); process.exitCode = code; };

function serverRunning() {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: configuredPort(), path: '/api/health', timeout: 1500 }, res => { res.resume(); resolve(true); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}
const days = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(d => DAY_RE.test(d)).sort().reverse() : []);
const readable = (file) => { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return !!v && typeof v === 'object' && 'value' in v; } catch { return false; } };

// 되살릴 수 있는 시점 목록 (최근 것부터): 시간별 사본(명단·FU)은 그 시각마다, 하루 백업은 그날 아침 상태
function restorePoints() {
  const points = [];
  for (const day of days(HOURLY_DIR)) {
    const byHour = {};
    for (const f of fs.readdirSync(path.join(HOURLY_DIR, day))) {
      const m = f.match(/^(.+)-(\d\d)시\.json$/);
      if (!m || !NAMES[m[1]]) continue;
      (byHour[m[2]] ||= {})[m[1]] = path.join(HOURLY_DIR, day, f);
    }
    for (const hour of Object.keys(byHour).sort().reverse()) {
      points.push({ label: `${day} ${hour}시 사본`, files: byHour[hour], all: false });
    }
  }
  for (const day of days(BACKUP_DIR).slice(0, 14)) {
    const dir = path.join(BACKUP_DIR, day);
    const files = {};
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json')) files[f.slice(0, -5)] = path.join(dir, f);
      else if (SHARDED.includes(f)) files[f] = path.join(dir, f);
    }
    if (Object.keys(files).length) points.push({ label: `${day} 하루 백업 (그날 아침 상태)`, files, all: true });
  }
  return points;
}

// 파일 하나 되살리기: 버전 번호를 지금 시각으로 올려 모든 화면이 새로 받게 함
function restoreFile(src, key) {
  const item = JSON.parse(fs.readFileSync(src, 'utf8'));
  item.version = Date.now();
  const target = path.join(KEYS_DIR, `${key}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(item));
  fs.renameSync(`${target}.tmp`, target);
}
function restoreSharded(srcDir, key) {
  const target = path.join(KEYS_DIR, key);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const f of fs.readdirSync(srcDir).filter(x => x.endsWith('.json'))) restoreFile(path.join(srcDir, f), `${key}/${f.slice(0, -5)}`);
}

async function main() {
  say();
  say('백업에서 되살리기');
  say('──────────────────');
  if (await serverRunning()) {
    say('서버가 켜져 있습니다. 먼저 서버끄기.bat 으로 서버를 끈 뒤 다시 실행하세요.');
    say('(서버가 켜진 채로 되살리면 화면들이 곧바로 다시 저장해 덮어쓸 수 있습니다)');
    say();
    return finish(1);
  }
  const points = restorePoints();
  if (!points.length) {
    say(`되살릴 백업이 없습니다. (시간별 사본: ${HOURLY_DIR}, 하루 백업: ${BACKUP_DIR})`);
    say();
    return finish(1);
  }
  say('되살릴 시점을 고르세요 (최근 것부터):');
  points.forEach((p, i) => say(`  [${i + 1}] ${p.label} — ${p.all ? '전체' : Object.keys(p.files).map(k => NAMES[k]).join(', ')}`));
  say();
  const n = Number(String(await ask(' 번호 (그만두려면 그냥 Enter): ')).trim());
  const point = points[n - 1];
  if (!point) { say('그만두었습니다. 아무것도 바꾸지 않았습니다.'); return finish(0); }

  // 무엇을 되살릴지: 명단·FU (하루 백업은 전체도 가능)
  const choices = [];
  if (point.files['daily-patients']) choices.push({ label: '환자 명단만', keys: ['daily-patients'] });
  if (point.files['fu-designations']) choices.push({ label: 'FU 지정만', keys: ['fu-designations'] });
  if (point.files['daily-patients'] && point.files['fu-designations']) choices.push({ label: '환자 명단 + FU 지정', keys: ['daily-patients', 'fu-designations'] });
  if (point.all) choices.push({ label: '전부 (설정·교수 목록·이전 시력·지난 명단까지 그날 아침으로)', keys: Object.keys(point.files) });
  let chosen = choices[0];
  if (choices.length > 1) {
    say();
    say('무엇을 되살릴까요?');
    choices.forEach((c, i) => say(`  [${i + 1}] ${c.label}`));
    chosen = choices[Number(String(await ask(' 번호: ')).trim()) - 1];
    if (!chosen) { say('그만두었습니다. 아무것도 바꾸지 않았습니다.'); return finish(0); }
  }
  const bad = chosen.keys.filter(k => !SHARDED.includes(k) && !readable(point.files[k]));
  if (bad.length) { say(`이 백업의 ${bad.join(', ')} 파일이 손상되어 쓸 수 없습니다. 다른 시점을 고르세요.`); return finish(1); }

  const stamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const keep = path.join(DATA_DIR, `keys-복구전-${stamp}`);
  say();
  say(`되살릴 것: ${point.label} · ${chosen.label}`);
  say(`지금 데이터는 ${keep} 폴더에 그대로 보관합니다.`);
  const yes = String(await ask(' 정말 되살릴까요? 되살리려면 Y, 그만두려면 N: ')).trim().toUpperCase();
  if (yes !== 'Y') { say('그만두었습니다. 아무것도 바꾸지 않았습니다.'); return finish(0); }

  if (fs.existsSync(KEYS_DIR)) fs.cpSync(KEYS_DIR, keep, { recursive: true });
  for (const key of chosen.keys) {
    if (SHARDED.includes(key)) restoreSharded(point.files[key], key);
    else restoreFile(point.files[key], key);
  }
  say();
  say('되살렸습니다.');
  say('이제 서버켜기_창없이.bat 으로 서버를 켜고, 각 컴퓨터에서 F5(새로고침)를 누르세요.');
  say(`되살리기 전으로 돌아가려면: 서버를 끄고 ${keep} 안의 파일을 data\\keys 에 다시 복사하세요.`);
  say();
  return finish(0);
}

main().catch(e => { say(`되살리지 못했습니다: ${e.message}`); finish(1); });
