// 안과 환자 흐름 - 내부망 공유 서버
// 서버 PC 한 대에서 실행하면, 같은 내부망의 다른 컴퓨터는 브라우저로 접속해서 같은 데이터를 봅니다.
// Node.js 기본 기능만 사용하므로 인터넷 없이도 실행됩니다 (dist 폴더가 이미 있어야 합니다).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, loadConfig, configuredPort, lanAddresses } from './scripts/common.js';

const CONFIG = loadConfig();
const PORT = configuredPort();
const DIST_DIR = path.join(ROOT, 'dist');
// OPH_DATA_DIR: 자동 테스트가 실제 데이터와 따로 쓰는 폴더 (평소에는 쓰지 않음)
const DATA_DIR = process.env.OPH_DATA_DIR || path.join(ROOT, 'data');
const KEYS_DIR = path.join(DATA_DIR, 'keys');
const OLD_STORE_FILE = path.join(DATA_DIR, 'store.json');
// 하루 백업 폴더. 서버설정.txt 에 BACKUP_DIR 을 적으면 data\backups 대신 그 폴더에만 백업합니다 (두 곳에 함께 남지 않음).
// 테스트(OPH_DATA_DIR)일 때는 실제 백업 폴더를 절대 건드리지 않도록 테스트 폴더 안에만
const BACKUP_DIR = process.env.OPH_DATA_DIR ? path.join(DATA_DIR, 'backups') : (CONFIG.BACKUP_DIR || process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups'));
// 종료 코드: 0 = 정상 종료(서버끄기), 2 = 데이터 파일 손상, 3 = 이미 켜져 있음. 그 외에는 자동으로 다시 켭니다.
const EXIT_DATA_ERROR = 2;
const EXIT_PORT_IN_USE = 3;

// 창 없이 실행하면 화면 대신 data\server-log.txt 에 기록합니다.
if (process.env.OPH_HIDDEN === '1') {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const logFile = path.join(DATA_DIR, 'server-log.txt');
  try { if (fs.statSync(logFile).size > 5 * 1024 * 1024) fs.renameSync(logFile, `${logFile}.old`); } catch { /* 처음 */ }
  const write = (args) => {
    const line = `[${new Date().toLocaleString('ko-KR')}] ${args.map(a => (a instanceof Error ? a.stack : String(a))).join(' ')}\n`;
    try { fs.appendFileSync(logFile, line); } catch { /* 기록 실패는 무시 */ }
  };
  console.log = (...a) => write(a);
  console.error = (...a) => write(a);
}
const BACKUP_KEEP_DAYS = 30;
const MAX_BODY = 50 * 1024 * 1024;
// 실시간으로 주고받는 명단은 어제~앞으로의 날짜만. 그보다 지난 명단은 월별 보관 파일로 옮깁니다.
const LIVE_PATIENTS_KEY = 'daily-patients';
const ARCHIVE_PREFIX = 'patients-archive-';
const LIVE_PAST_DAYS = 1;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ---------------- 데이터 저장 ---------------- */
// 항목(key)마다 data\keys\<key>.json 파일 하나: { version, value, updatedAt }
// 항목별로 나눠 저장하므로, 버튼 하나 누를 때 바뀐 항목만 저장합니다.
const KEY_RE = /^[A-Za-z0-9_-]{1,100}$/;
const cache = new Map();

function keyFile(key) { return path.join(KEYS_DIR, `${key}.json`); }

const parsed = new Map(); // 부분 조회용: 항목별로 마지막으로 풀어 둔 값
function parsedOf(key, item) {
  let all = parsed.get(key);
  if (!all || all.version !== item.version) {
    let obj = {};
    try { obj = JSON.parse(item.value) || {}; } catch { obj = {}; }
    all = { version: item.version, obj };
    parsed.set(key, all);
  }
  return all;
}

// 환자별 기록 중 환자가 계속 쌓이는 것(이전 시력)은 파일 하나가 아니라 환자번호 끝 두 자리로 100개 파일에 나눠 둡니다.
//   data\keys\measure-history\00.json ~ 99.json  (환자번호 …33 → 33.json)
// 저장할 때 그 환자의 작은 파일 하나만 다시 쓰므로, 누적 환자가 수십만 명이어도 저장 속도가 그대로입니다.
// 화면 쪽에서는 지금처럼 'measure-history' 하나로 보입니다 (전체 읽기·저장·부분 조회 모두 같은 주소).
const SHARDED = new Set(['measure-history']);
const SHARD_IDS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
function shardOf(id) {
  const digits = String(id).replace(/\D/g, '');
  if (digits) return digits.slice(-2).padStart(2, '0');
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 100;
  return String(h).padStart(2, '0');
}
const shardKey = (key, shard) => `${key}/${shard}`;
function shardData(key, shard) {
  const item = readItem(shardKey(key, shard));
  return item ? parsedOf(shardKey(key, shard), item).obj : {};
}
// 전체 버전 = 100개 파일 버전의 합 (어느 파일이든 저장하면 늘어남)
function shardedVersion(key) {
  return SHARD_IDS.reduce((n, sh) => n + (readItem(shardKey(key, sh))?.version || 0), 0);
}
function writeShard(key, shard, obj) {
  fs.mkdirSync(path.join(KEYS_DIR, key), { recursive: true });
  const k = shardKey(key, shard);
  const saved = writeItem(k, JSON.stringify(obj));
  parsed.set(k, { version: saved.version, obj });
}
function readItem(key) {
  if (cache.has(key)) return cache.get(key);
  if (brokenKeys.has(key)) throw new DataFileError(`${key} 파일 손상`); // 복구 못 한 항목은 서버를 다시 켤 때까지 그대로 멈춤
  const file = keyFile(key);
  let item = null;
  if (fs.existsSync(file)) {
    try {
      item = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      item = recoverItem(key, file); // 복구하지 못하면 오류를 던져 그 항목만 쓰지 못하게 함 (빈 값으로 덮어쓰지 않도록)
    }
  }
  cache.set(key, item);
  return item;
}

// 데이터 파일 문제 기록 (자동으로 복구했거나, 복구하지 못한 것). 모든 화면 위쪽 안내에 씁니다 (/api/health 로 항목 이름만 알림)
const dataProblems = [];
function noteProblem(key, kind, from = '') {
  dataProblems.push({ key: String(key).split('/')[0], kind, from, at: Date.now() });
  if (dataProblems.length > 20) dataProblems.shift();
}
class DataFileError extends Error {}
const brokenKeys = new Set();
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
// 손상된 데이터 파일 자동 복구: 직전 저장본(.prev) → 오늘·어제 시간별 사본 → 하루 백업(최근 날짜부터)
// 손상된 파일은 지우지 않고 '.손상-날짜시각' 이름으로 따로 남깁니다. 복구한 항목은 버전을 크게 올려 화면들이 새로 받게 합니다.
function recoverItem(key, file) {
  try { fs.copyFileSync(file, `${file}.손상-${stamp()}`); } catch { /* 복사 못 해도 복구는 계속 */ }
  const base = String(key).split('/')[0];
  const rel = path.relative(KEYS_DIR, file);
  const candidates = [{ file: `${file}.prev`, from: '직전 저장본' }];
  if (HOURLY_KEYS.includes(base) && fs.existsSync(HOURLY_DIR)) {
    for (const day of fs.readdirSync(HOURLY_DIR).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse()) {
      const files = fs.readdirSync(path.join(HOURLY_DIR, day)).filter(f => f.startsWith(`${base}-`) && f.endsWith('.json')).sort().reverse();
      for (const f of files) candidates.push({ file: path.join(HOURLY_DIR, day, f), from: `${day} ${f.slice(base.length + 1, -5)} 사본` });
    }
  }
  if (fs.existsSync(BACKUP_DIR)) {
    for (const day of fs.readdirSync(BACKUP_DIR).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse()) {
      candidates.push({ file: path.join(BACKUP_DIR, day, rel), from: `${day} 백업` });
    }
  }
  for (const c of candidates) {
    let item;
    try { item = JSON.parse(fs.readFileSync(c.file, 'utf8')); } catch { continue; }
    if (!item || typeof item !== 'object') continue;
    item = { ...item, version: Math.max(Number(item.version) || 0, Date.now()) };
    const text = JSON.stringify(item);
    writeFileSafely(file, text, false); // 손상된 파일을 직전 저장본으로 남기지 않음
    try { writeDurable(`${file}.prev`, text); lastPrev.set(file, Date.now()); } catch { /* 직전 저장본은 다음 저장 때 */ }
    console.error(`[복구] ${file} 파일이 손상되어 ${c.from}(${c.file})으로 되돌렸습니다. 최근 입력이 조금 빠졌을 수 있습니다.`);
    noteProblem(key, 'recovered', c.from);
    return item;
  }
  console.error(`[오류] ${file} 파일이 손상되었고 되돌릴 백업도 없습니다. 이 항목은 저장·읽기를 멈춥니다 (덮어쓰지 않도록).`);
  console.error('백업복구.bat 으로 복구하거나, 백업 폴더에서 같은 이름의 파일을 복사해 넣은 뒤 서버를 다시 켜세요.');
  noteProblem(key, 'broken');
  brokenKeys.add(key);
  throw new DataFileError(`${key} 파일 손상`);
}

// 정전·강제 종료에도 파일이 깨지지 않도록: 임시 파일에 쓰고 디스크에 확실히 기록(fsync)한 뒤 이름을 바꿉니다.
// 바꾸기 전 파일은 '.prev' 로 남겨 둡니다 (1분에 한 번까지, 손상 시 자동 복구용).
const PREV_EVERY_MS = 60 * 1000;
const lastPrev = new Map();
function writeDurable(file, text) {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function keepPrevious(file) {
  const now = Date.now();
  if (now - (lastPrev.get(file) || 0) < PREV_EVERY_MS) return;
  try {
    if (fs.existsSync(file)) { fs.copyFileSync(file, `${file}.prev`); lastPrev.set(file, now); }
  } catch { /* 직전 저장본을 못 남겨도 저장은 계속 */ }
}
function writeFileSafely(file, text, keepPrev = true) {
  const tmp = `${file}.tmp`;
  writeDurable(tmp, text);
  if (keepPrev) keepPrevious(file);
  try {
    fs.renameSync(tmp, file);
  } catch {
    // 백신 프로그램 등이 파일을 잡고 있으면 이름 바꾸기가 실패할 수 있어 직접 씁니다.
    writeDurable(file, text);
    fs.rmSync(tmp, { force: true });
  }
}

function writeItem(key, value) {
  backupOncePerDay(); // 그날 첫 저장 전에 어제까지의 데이터를 백업
  const item = { version: (readItem(key)?.version || 0) + 1, value, updatedAt: new Date().toISOString() };
  writeFileSafely(keyFile(key), JSON.stringify(item));
  cache.set(key, item);
  notifyChange(key);
  return item;
}

// 이전 버전(store.json 한 파일)에서 쓰던 데이터를 항목별 파일로 옮깁니다.
function migrateOldStore() {
  if (!fs.existsSync(OLD_STORE_FILE)) return;
  let old;
  try { old = JSON.parse(fs.readFileSync(OLD_STORE_FILE, 'utf8')); } catch {
    console.error('\n[오류] data\\store.json 파일이 손상되어 옮길 수 없습니다. 서버를 멈춥니다.\n');
    process.exit(EXIT_DATA_ERROR);
  }
  for (const [key, item] of Object.entries(old)) {
    if (KEY_RE.test(key) && !fs.existsSync(keyFile(key))) writeFileSafely(keyFile(key), JSON.stringify(item));
  }
  fs.renameSync(OLD_STORE_FILE, `${OLD_STORE_FILE}.옮김완료`);
  console.log('이전 데이터(store.json)를 새 저장 방식으로 옮겼습니다.');
}

let lastBackupDay = null;
function backupOncePerDay() {
  const day = localDate();
  if (lastBackupDay === day) return;
  lastBackupDay = day;
  try {
    const target = path.join(BACKUP_DIR, day);
    if (fs.existsSync(target)) return;
    const files = fs.existsSync(KEYS_DIR) ? fs.readdirSync(KEYS_DIR).filter(f => f.endsWith('.json') || SHARDED.has(f)) : [];
    if (!files.length) return;
    fs.mkdirSync(target, { recursive: true });
    // 나눠 둔 기록(폴더)도 폴더째 복사합니다
    for (const f of files) fs.cpSync(path.join(KEYS_DIR, f), path.join(target, f), { recursive: true });
    const days = fs.readdirSync(BACKUP_DIR).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
    for (const d of days.slice(0, Math.max(0, days.length - BACKUP_KEEP_DAYS))) {
      fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });
    }
  } catch (e) {
    console.error(`[경고] 백업에 실패했습니다 (${BACKUP_DIR}): ${e.message}`);
  }
}

// 진료 중에 문제가 생겨도 오늘 입력을 되살릴 수 있게, 명단과 FU를 1시간마다 따로 복사해 둡니다 (오늘·어제만 보관).
const HOURLY_DIR = path.join(DATA_DIR, 'backups-hourly');
const HOURLY_KEYS = [LIVE_PATIENTS_KEY, 'fu-designations'];
const HOURLY_KEEP_DAYS = 2;
const hourlyVersion = new Map();
function hourlySnapshot() {
  const day = localDate();
  const hour = `${String(new Date().getHours()).padStart(2, '0')}시`;
  const dir = path.join(HOURLY_DIR, day);
  for (const key of HOURLY_KEYS) {
    try {
      const item = readItem(key);
      if (!item || hourlyVersion.get(key) === item.version) continue;
      const target = path.join(dir, `${key}-${hour}.json`);
      if (fs.existsSync(target)) continue; // 이 시간 사본은 이미 있음 (다음 시간에 다시)
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(keyFile(key), target);
      hourlyVersion.set(key, item.version);
    } catch (e) {
      console.error(`[경고] 시간별 사본 실패 (${key}): ${e.message}`);
    }
  }
  try {
    const days = fs.existsSync(HOURLY_DIR) ? fs.readdirSync(HOURLY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort() : [];
    for (const d of days.slice(0, Math.max(0, days.length - HOURLY_KEEP_DAYS))) fs.rmSync(path.join(HOURLY_DIR, d), { recursive: true, force: true });
  } catch { /* 지우지 못해도 다음에 다시 */ }
}

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 어제보다 지난 명단을 월별 보관 파일(patients-archive-YYYY-MM)로 옮깁니다.
function archiveOldPatients() {
  const live = readItem(LIVE_PATIENTS_KEY);
  if (!live) return;
  let list;
  try { list = JSON.parse(live.value); } catch { return; }
  if (!Array.isArray(list)) return;
  const cutoff = localDate(-LIVE_PAST_DAYS);
  const old = list.filter(p => typeof p?.date === 'string' && p.date < cutoff);
  if (!old.length) return;
  const byMonth = new Map();
  for (const p of old) {
    const month = p.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(p);
  }
  for (const [month, items] of byMonth) {
    const key = `${ARCHIVE_PREFIX}${month}`;
    let prev = [];
    try { prev = JSON.parse(readItem(key)?.value || '[]'); } catch { prev = []; }
    const keyOf = p => `${p.id}::${p.date}::${p.visit || 1}`;
    const merged = new Map(prev.map(p => [keyOf(p), p]));
    // 이미 보관된 기록은 덮어쓰지 않음 (지난 날짜에 같은 환자를 다시 올려도 그날 진행 기록이 빈 기록으로 바뀌지 않도록)
    for (const p of items) if (!merged.has(keyOf(p))) merged.set(keyOf(p), p);
    writeItem(key, JSON.stringify([...merged.values()]));
  }
  // 보관 파일을 먼저 저장한 뒤 실시간 명단에서 뺍니다 (중간에 멈춰도 데이터가 사라지지 않도록).
  writeItem(LIVE_PATIENTS_KEY, JSON.stringify(list.filter(p => !old.includes(p))));
  console.log(`지난 명단 ${old.length}명을 보관 파일로 옮겼습니다.`);
}

/* ---------------- 변경 알림 (서버 → 모든 화면) ---------------- */
// 저장이 일어나면 연결된 모든 화면에 "무엇이 바뀌었는지"(예: daily-patients)만 바로 알립니다. 환자 정보는 보내지 않습니다.
// 알림을 받은 화면은 평소처럼 서버에서 새 내용을 받아 갑니다. 알림이 막혀도 화면은 4초마다 스스로 확인합니다.
const eventClients = new Set();
const NOTIFY_BATCH_MS = 300; // 0.3초 안에 생긴 변경은 모아서 한 번에 알림
let pendingKeys = null;
function sendEvent(res, text) {
  if (res.writableEnded || res.destroyed) { eventClients.delete(res); return; }
  try { res.write(text); } catch { eventClients.delete(res); }
}
function notifyChange(key) {
  const base = String(key).split('/')[0]; // 나눠 둔 기록(measure-history/07)은 원래 이름으로
  if (!pendingKeys) {
    pendingKeys = new Set();
    setTimeout(() => {
      const msg = `event: change\ndata: ${JSON.stringify({ keys: [...pendingKeys] })}\n\n`;
      pendingKeys = null;
      for (const res of eventClients) sendEvent(res, msg);
    }, NOTIFY_BATCH_MS);
  }
  pendingKeys.add(base);
}
function handleEvents(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write('retry: 3000\n\n'); // 연결이 끊기면 브라우저가 3초 뒤 다시 연결
  eventClients.add(res);
  res.on('error', () => eventClients.delete(res));
  req.on('close', () => eventClients.delete(res));
}
// 조용할 때도 연결이 끊기지 않도록 25초마다 짧은 신호
setInterval(() => { for (const res of eventClients) sendEvent(res, ': ping\n\n'); }, 25000).unref();

fs.mkdirSync(KEYS_DIR, { recursive: true });
migrateOldStore();
try { archiveOldPatients(); } catch (e) { console.error(`[경고] 지난 명단 보관 실패: ${e.message}`); }
hourlySnapshot();
setInterval(() => {
  try { archiveOldPatients(); } catch (e) { console.error(`[경고] 지난 명단 보관 실패: ${e.message}`); }
  hourlySnapshot();
}, 10 * 60 * 1000);

/* ---------------- HTTP ---------------- */
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// 새 버전을 빌드하면 index.html 수정 시각이 바뀌므로, 브라우저가 이것으로 업데이트를 알아챕니다.
function buildId() {
  try { return String(fs.statSync(path.join(DIST_DIR, 'index.html')).mtimeMs); } catch { return 'none'; }
}

// 설정 화면 비밀번호: 공유 저장소(모든 컴퓨터가 읽음)가 아니라 이 파일에 해시로만 저장합니다.
// 잊어버리면 설정비밀번호초기화.bat 으로 이 파일을 지우면 됩니다.
const LOCK_FILE = path.join(DATA_DIR, 'settings-lock.json');
function readLock() {
  try {
    const l = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    return l?.salt && l?.hash ? l : null;
  } catch { return null; }
}
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}
function lockMatches(lock, password) {
  const a = Buffer.from(hashPassword(password ?? '', lock.salt), 'hex');
  const b = Buffer.from(lock.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function handleLock(req, res, pathname) {
  const lock = readLock();
  if (pathname === '/api/settings-lock' && req.method === 'GET') return sendJson(res, 200, { enabled: !!lock });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'bad body' }); }
  if (pathname === '/api/settings-lock/check') {
    const ok = !lock || lockMatches(lock, body?.password);
    if (!ok) await delay(800); // 여러 번 빨리 맞춰보지 못하도록
    return sendJson(res, 200, { ok });
  }
  if (pathname === '/api/settings-lock/set') {
    if (lock && !lockMatches(lock, body?.current)) { await delay(800); return sendJson(res, 403, { error: 'wrong' }); }
    const next = String(body?.next ?? '');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!next) {
      try { fs.unlinkSync(LOCK_FILE); } catch { /* 이미 없음 */ }
      console.log('설정 비밀번호를 없앴습니다.');
      return sendJson(res, 200, { enabled: false });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ salt, hash: hashPassword(next, salt) }));
    console.log('설정 비밀번호를 바꿨습니다.');
    return sendJson(res, 200, { enabled: true });
  }
  return sendJson(res, 404, { error: 'not found' });
}

// 접속 비밀번호: 정해 두면 서버가 모든 읽기·저장 요청에서 통행증(쿠키)을 확인합니다.
// 화면만 막는 것이 아니라 서버가 막으므로, 주소를 알아도 비밀번호 없이는 데이터를 읽거나 바꿀 수 없습니다.
// 비밀번호는 해시로만 저장. 비밀번호를 바꾸면 secret 이 바뀌어 모든 컴퓨터가 다시 입력해야 합니다.
// 잊어버리면 접속비밀번호초기화.bat 으로 이 파일을 지우면 됩니다 (지우면 잠금 없음).
const ACCESS_FILE = path.join(DATA_DIR, 'access-lock.json');
const ACCESS_COOKIE = 'oph_access';
const ACCESS_MAX_AGE = 400 * 24 * 3600; // 크롬이 허용하는 최대(400일). 화면을 열 때마다 다시 늘어남
const ACCESS_MAX_FAILS = 5;
const ACCESS_LOCK_MS = 60 * 1000;
const accessFails = new Map(); // 컴퓨터(주소)별 틀린 횟수
function readAccess() {
  try {
    const l = JSON.parse(fs.readFileSync(ACCESS_FILE, 'utf8'));
    return l?.salt && l?.hash && l?.secret ? l : null;
  } catch { return null; }
}
const accessToken = (lock) => crypto.createHmac('sha256', lock.secret).update('oph-access').digest('hex');
function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
function accessOk(req, lock = readAccess()) {
  if (!lock) return true;
  const a = Buffer.from(cookieOf(req, ACCESS_COOKIE));
  const b = Buffer.from(accessToken(lock));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const accessCookie = (lock) => `${ACCESS_COOKIE}=${accessToken(lock)}; Path=/; Max-Age=${ACCESS_MAX_AGE}; HttpOnly; SameSite=Strict`;
function sendJsonCookie(res, status, body, cookie) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
  res.end(JSON.stringify(body));
}
// 여러 번 틀리면 그 컴퓨터는 1분 동안 잠금 (비밀번호를 하나씩 맞춰보지 못하도록)
function accessBlocked(req) {
  const f = accessFails.get(req.socket.remoteAddress || '');
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function accessFailed(req) {
  const ip = req.socket.remoteAddress || '';
  const f = accessFails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= ACCESS_MAX_FAILS) { f.n = 0; f.until = Date.now() + ACCESS_LOCK_MS; }
  accessFails.set(ip, f);
}
async function handleAccess(req, res, pathname) {
  const lock = readAccess();
  if (pathname === '/api/access' && req.method === 'GET') {
    const ok = accessOk(req, lock);
    // 들어와 있는 컴퓨터는 통행증 기간을 다시 늘림
    return sendJsonCookie(res, 200, { enabled: !!lock, ok }, lock && ok ? accessCookie(lock) : '');
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'bad body' }); }
  if (pathname === '/api/access/login') {
    if (!lock) return sendJson(res, 200, { ok: true });
    const wait = accessBlocked(req);
    if (wait) return sendJson(res, 429, { error: 'locked', wait });
    if (!lockMatches(lock, body?.password)) {
      accessFailed(req);
      await delay(800);
      const after = accessBlocked(req);
      return sendJson(res, after ? 429 : 403, { error: after ? 'locked' : 'wrong', wait: after });
    }
    accessFails.delete(req.socket.remoteAddress || '');
    return sendJsonCookie(res, 200, { ok: true }, accessCookie(lock));
  }
  if (pathname === '/api/access/set') {
    // 바꾸기·없애기: 들어와 있는 컴퓨터에서 현재 비밀번호를 알아야 함
    if (lock) {
      if (!accessOk(req, lock)) return sendJson(res, 401, { error: 'access' });
      const wait = accessBlocked(req);
      if (wait) return sendJson(res, 429, { error: 'locked', wait });
      if (!lockMatches(lock, body?.current)) { accessFailed(req); await delay(800); return sendJson(res, 403, { error: 'wrong' }); }
    }
    const next = String(body?.next ?? '');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!next) {
      try { fs.unlinkSync(ACCESS_FILE); } catch { /* 이미 없음 */ }
      console.log('접속 비밀번호를 없앴습니다.');
      return sendJson(res, 200, { enabled: false });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const nextLock = { salt, hash: hashPassword(next, salt), secret: crypto.randomBytes(32).toString('hex') };
    fs.writeFileSync(ACCESS_FILE, JSON.stringify(nextLock));
    console.log('접속 비밀번호를 정했습니다 (모든 컴퓨터가 한 번씩 다시 입력).');
    // 바꾼 이 컴퓨터는 다시 묻지 않도록 새 통행증
    return sendJsonCookie(res, 200, { enabled: true }, accessCookie(nextLock));
  }
  return sendJson(res, 404, { error: 'not found' });
}

// 화면 오류(흰 화면 대신 오류 안내가 뜬 경우)를 서버 기록에 남깁니다. 같은 컴퓨터는 1시간에 30건까지
const clientErrors = new Map();
async function handleClientError(req, res) {
  const ip = req.socket.remoteAddress || '';
  const now = Date.now();
  const c = clientErrors.get(ip) || { n: 0, reset: now + 3600 * 1000 };
  if (now > c.reset) { c.n = 0; c.reset = now + 3600 * 1000; }
  c.n += 1;
  clientErrors.set(ip, c);
  let body = {};
  try { body = JSON.parse(await readBody(req)); } catch { /* 내용 없이 기록 */ }
  if (c.n <= 30) {
    const cut = (v, n) => String(v ?? '').slice(0, n);
    console.error(`[화면 오류] ${ip} · ${cut(body.where, 80)} · ${cut(body.message, 300)}\n${cut(body.stack, 1500)}`);
  }
  return sendJson(res, 200, { ok: true });
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health') return sendJson(res, 200, { ok: true, build: buildId(), problems: dataProblems });
  if (pathname === '/api/access' || pathname.startsWith('/api/access/')) return handleAccess(req, res, pathname);
  // 접속 비밀번호가 있으면 통행증 없는 요청은 모두 거절 (서버끄기는 서버 PC 자신만 되므로 그대로)
  if (pathname !== '/api/shutdown' && !accessOk(req)) return sendJson(res, 401, { error: 'access' });
  if (pathname.startsWith('/api/settings-lock')) return handleLock(req, res, pathname);
  if (pathname === '/api/client-error' && req.method === 'POST') return handleClientError(req, res);
  if (pathname === '/api/events' && req.method === 'GET') return handleEvents(req, res);

  // 서버끄기.bat 에서 사용. 서버 PC 자신에서만 끌 수 있습니다.
  if (pathname === '/api/shutdown') {
    const from = req.socket.remoteAddress || '';
    if (req.method !== 'POST' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(from)) return sendJson(res, 403, { error: 'forbidden' });
    sendJson(res, 200, { ok: true });
    console.log('서버끄기 요청으로 서버를 끕니다.');
    setTimeout(() => process.exit(0), 200);
    return;
  }

  // 환자별 기록(이전 시력·History)은 명단에 있는 환자 것만 보냅니다.
  // 모든 컴퓨터가 4초마다 확인하므로, 몇 년 치 기록 전체를 매번 보내지 않도록 합니다. 저장된 기록은 그대로 남습니다.
  const sub = pathname.match(/^\/api\/storage-subset\/([^/]+)$/);
  if (sub && req.method === 'POST') {
    const key = decodeURIComponent(sub[1]);
    if (!KEY_RE.test(key)) return sendJson(res, 400, { error: 'bad key' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'bad body' }); }
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    const sharded = SHARDED.has(key);
    const item = sharded ? null : readItem(key);
    const version = sharded ? shardedVersion(key) : item?.version || 0;
    if (!version) return sendJson(res, 404, { version: 0 });
    if (body?.have !== undefined && body.have !== null && Number(body.have) === version) {
      res.writeHead(304, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    const out = {};
    ids.forEach(id => {
      const obj = sharded ? shardData(key, shardOf(id)) : parsedOf(key, item).obj;
      if (Object.prototype.hasOwnProperty.call(obj, id)) out[id] = obj[id];
    });
    return sendJson(res, 200, { key, value: JSON.stringify(out), version });
  }

  // 환자별 기록을 환자 한 명 칸만 바꿔 저장합니다 (파일 전체를 주고받지 않도록).
  // prev 는 브라우저가 알던 그 칸의 값: 그 사이 다른 컴퓨터가 바꿨으면 거절하고 최신 값을 돌려줍니다.
  const ent = pathname.match(/^\/api\/storage-entries\/([^/]+)$/);
  if (ent && req.method === 'POST') {
    const key = decodeURIComponent(ent[1]);
    if (!KEY_RE.test(key)) return sendJson(res, 400, { error: 'bad key' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'bad body' }); }
    const entries = Array.isArray(body?.entries) ? body.entries.filter(e => typeof e?.id === 'string' && e.id) : [];
    if (!entries.length) return sendJson(res, 400, { error: 'no entries' });
    const sharded = SHARDED.has(key);
    const item = sharded ? null : readItem(key);
    const current = (id) => (sharded ? shardData(key, shardOf(id)) : item ? parsedOf(key, item).obj : {})[id];
    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const changed = entries.filter(e => !same(current(e.id), e.prev));
    if (changed.length) return sendJson(res, 409, { error: 'conflict', current: Object.fromEntries(changed.map(e => [e.id, current(e.id) ?? null])) });
    const setEntry = (obj, e) => { if (e.next === null || e.next === undefined) delete obj[e.id]; else obj[e.id] = e.next; };
    try {
      if (sharded) {
        const byShard = {};
        entries.forEach(e => { const sh = shardOf(e.id); byShard[sh] ||= { ...shardData(key, sh) }; setEntry(byShard[sh], e); });
        for (const [sh, obj] of Object.entries(byShard)) writeShard(key, sh, obj);
        return sendJson(res, 200, { key, version: shardedVersion(key) });
      }
      const next = { ...(item ? parsedOf(key, item).obj : {}) };
      entries.forEach(e => setEntry(next, e));
      const saved = writeItem(key, JSON.stringify(next));
      parsed.set(key, { version: saved.version, obj: next });
      return sendJson(res, 200, { key, version: saved.version });
    } catch (e) {
      console.error(`[오류] 저장 실패: ${e.message}`);
      return sendJson(res, 500, { error: 'write failed' });
    }
  }

  const m = pathname.match(/^\/api\/storage\/([^/]+)$/);
  if (!m) return sendJson(res, 404, { error: 'not found' });
  const key = decodeURIComponent(m[1]);
  if (!KEY_RE.test(key)) return sendJson(res, 400, { error: 'bad key' });

  // 나눠 둔 기록 전체 읽기·저장 (예전 방식 화면이나 점검용). 100개 파일을 합쳐서/나눠서 처리
  if (SHARDED.has(key) && (req.method === 'GET' || req.method === 'PUT')) {
    const version = shardedVersion(key);
    if (req.method === 'GET') {
      if (!version) return sendJson(res, 404, { version: 0 });
      const have = new URL(req.url, 'http://localhost').searchParams.get('have');
      if (have !== null && Number(have) === version) { res.writeHead(304, { 'Cache-Control': 'no-store' }); res.end(); return; }
      const all = {};
      SHARD_IDS.forEach(sh => Object.assign(all, shardData(key, sh)));
      return sendJson(res, 200, { key, value: JSON.stringify(all), version });
    }
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'bad body' }); }
    if (typeof body?.value !== 'string') return sendJson(res, 400, { error: 'value must be a string' });
    if (body.version !== undefined && body.version !== null && Number(body.version) !== version) return sendJson(res, 409, { error: 'conflict', version });
    let obj;
    try { obj = JSON.parse(body.value) || {}; } catch { return sendJson(res, 400, { error: 'bad value' }); }
    const byShard = Object.fromEntries(SHARD_IDS.map(sh => [sh, {}]));
    for (const [id, v] of Object.entries(obj)) byShard[shardOf(id)][id] = v;
    try {
      for (const sh of SHARD_IDS) {
        if (JSON.stringify(byShard[sh]) !== JSON.stringify(shardData(key, sh))) writeShard(key, sh, byShard[sh]);
      }
    } catch (e) {
      console.error(`[오류] 저장 실패: ${e.message}`);
      return sendJson(res, 500, { error: 'write failed' });
    }
    return sendJson(res, 200, { key, version: shardedVersion(key) });
  }

  if (req.method === 'GET') {
    const item = readItem(key);
    if (!item) return sendJson(res, 404, { version: 0 });
    // 브라우저가 이미 같은 버전을 갖고 있으면 내용을 다시 보내지 않습니다 (4초마다 확인하므로 중요).
    const have = new URL(req.url, 'http://localhost').searchParams.get('have');
    if (have !== null && Number(have) === item.version) {
      res.writeHead(304, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    return sendJson(res, 200, { key, value: item.value, version: item.version });
  }

  if (req.method === 'PUT') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'bad body' }); }
    if (typeof body?.value !== 'string') return sendJson(res, 400, { error: 'value must be a string' });
    const current = readItem(key)?.version || 0;
    // 다른 컴퓨터가 그 사이에 먼저 저장했다면 거절하고, 브라우저가 최신 내용으로 다시 적용합니다.
    if (body.version !== undefined && body.version !== null && Number(body.version) !== current) {
      return sendJson(res, 409, { error: 'conflict', version: current });
    }
    let item;
    try {
      item = writeItem(key, body.value);
    } catch (e) {
      console.error(`[오류] 저장 실패: ${e.message}`);
      return sendJson(res, 500, { error: 'write failed' });
    }
    return sendJson(res, 200, { key, version: item.version });
  }

  return sendJson(res, 405, { error: 'method not allowed' });
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(DIST_DIR, pathname));
  if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('화면 파일(dist)이 없습니다. 서버 PC에서 업데이트.bat 을 실행해주세요.');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  // index.html 은 매번 새로 받아서 업데이트가 바로 반영되게 하고, 이름에 해시가 붙은 파일은 오래 저장합니다.
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(req, res, decodeURIComponent(pathname));
  } catch (e) {
    // 손상된 파일(복구 못 함)은 처음 발견할 때 한 번만 기록 (모든 화면이 4초마다 물어보므로 매번 쓰면 기록이 넘침)
    if (!(e instanceof DataFileError)) console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: e instanceof DataFileError ? 'data file broken' : 'server error' });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[오류] ${PORT}번 포트를 이미 사용 중입니다. 서버가 이미 켜져 있는지 확인하세요.\n`);
    process.exit(EXIT_PORT_IN_USE);
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const { main, virtual } = lanAddresses();
  const hidden = process.env.OPH_HIDDEN === '1';
  console.log('');
  console.log('========================================================');
  console.log(' 안과 환자 흐름 공유 서버가 켜졌습니다.');
  console.log('');
  console.log(` 이 컴퓨터에서 접속:   http://localhost:${PORT}`);
  for (const a of main) console.log(` 다른 컴퓨터에서 접속: http://${a}:${PORT}`);
  if (!main.length) for (const a of virtual) console.log(` 다른 컴퓨터에서 접속: http://${a}:${PORT}`);
  console.log('');
  console.log(` 데이터 폴더: ${KEYS_DIR}`);
  console.log(` 백업 폴더:   ${BACKUP_DIR}`);
  console.log('');
  if (!hidden) {
    console.log(' 이 창을 닫으면 모든 컴퓨터에서 사용할 수 없습니다.');
    console.log(' 끄려면 이 창에서 Ctrl+C 를 누르세요.');
    console.log(' (창 없이 켜려면 이 창을 닫고 서버켜기_창없이.bat 을 사용하세요)');
  }
  console.log('========================================================');
  console.log('');
});
