// 안과 환자 흐름 - 내부망 공유 서버
// 서버 PC 한 대에서 실행하면, 같은 내부망의 다른 컴퓨터는 브라우저로 접속해서 같은 데이터를 봅니다.
// Node.js 기본 기능만 사용하므로 인터넷 없이도 실행됩니다 (dist 폴더가 이미 있어야 합니다).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = path.join(ROOT, 'data');
const KEYS_DIR = path.join(DATA_DIR, 'keys');
const OLD_STORE_FILE = path.join(DATA_DIR, 'store.json');
// 백업 폴더. 공유폴더에 백업하려면 서버시작.bat 에서 BACKUP_DIR 을 지정하세요.
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
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

function readItem(key) {
  if (cache.has(key)) return cache.get(key);
  const file = keyFile(key);
  let item = null;
  if (fs.existsSync(file)) {
    try {
      item = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      console.error(`\n[오류] ${file} 파일이 손상되어 읽을 수 없습니다.`);
      console.error('데이터를 덮어쓰지 않도록 서버를 멈춥니다.');
      console.error(`백업 폴더(${BACKUP_DIR})의 가장 최근 날짜 폴더에서 같은 이름의 파일을 복사해 넣은 뒤 다시 실행하세요.\n`);
      process.exit(1);
    }
  }
  cache.set(key, item);
  return item;
}

function writeFileSafely(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  try {
    fs.renameSync(tmp, file);
  } catch {
    // 백신 프로그램 등이 파일을 잡고 있으면 이름 바꾸기가 실패할 수 있어 직접 씁니다.
    fs.writeFileSync(file, text);
    fs.rmSync(tmp, { force: true });
  }
}

function writeItem(key, value) {
  backupOncePerDay(); // 그날 첫 저장 전에 어제까지의 데이터를 백업
  const item = { version: (readItem(key)?.version || 0) + 1, value, updatedAt: new Date().toISOString() };
  writeFileSafely(keyFile(key), JSON.stringify(item));
  cache.set(key, item);
  return item;
}

// 이전 버전(store.json 한 파일)에서 쓰던 데이터를 항목별 파일로 옮깁니다.
function migrateOldStore() {
  if (!fs.existsSync(OLD_STORE_FILE)) return;
  let old;
  try { old = JSON.parse(fs.readFileSync(OLD_STORE_FILE, 'utf8')); } catch {
    console.error('\n[오류] data\\store.json 파일이 손상되어 옮길 수 없습니다. 서버를 멈춥니다.\n');
    process.exit(1);
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
    const files = fs.existsSync(KEYS_DIR) ? fs.readdirSync(KEYS_DIR).filter(f => f.endsWith('.json')) : [];
    if (!files.length) return;
    fs.mkdirSync(target, { recursive: true });
    for (const f of files) fs.copyFileSync(path.join(KEYS_DIR, f), path.join(target, f));
    const days = fs.readdirSync(BACKUP_DIR).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
    for (const d of days.slice(0, Math.max(0, days.length - BACKUP_KEEP_DAYS))) {
      fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });
    }
  } catch (e) {
    console.error(`[경고] 백업에 실패했습니다 (${BACKUP_DIR}): ${e.message}`);
  }
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
    for (const p of items) merged.set(keyOf(p), p);
    writeItem(key, JSON.stringify([...merged.values()]));
  }
  // 보관 파일을 먼저 저장한 뒤 실시간 명단에서 뺍니다 (중간에 멈춰도 데이터가 사라지지 않도록).
  writeItem(LIVE_PATIENTS_KEY, JSON.stringify(list.filter(p => !old.includes(p))));
  console.log(`지난 명단 ${old.length}명을 보관 파일로 옮겼습니다.`);
}

fs.mkdirSync(KEYS_DIR, { recursive: true });
migrateOldStore();
archiveOldPatients();
setInterval(() => {
  try { archiveOldPatients(); } catch (e) { console.error(`[경고] 지난 명단 보관 실패: ${e.message}`); }
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

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health') return sendJson(res, 200, { ok: true, build: buildId() });

  const m = pathname.match(/^\/api\/storage\/([^/]+)$/);
  if (!m) return sendJson(res, 404, { error: 'not found' });
  const key = decodeURIComponent(m[1]);
  if (!KEY_RE.test(key)) return sendJson(res, 400, { error: 'bad key' });

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
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'server error' });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[오류] ${PORT}번 포트를 이미 사용 중입니다. 서버가 이미 켜져 있는지 확인하세요.\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const addrs = Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => a.address);
  console.log('');
  console.log('========================================================');
  console.log(' 안과 환자 흐름 공유 서버가 켜졌습니다.');
  console.log('');
  console.log(` 이 컴퓨터에서 접속:   http://localhost:${PORT}`);
  for (const a of addrs) console.log(` 다른 컴퓨터에서 접속: http://${a}:${PORT}`);
  console.log('');
  console.log(` 데이터 폴더: ${KEYS_DIR}`);
  console.log(` 백업 폴더:   ${BACKUP_DIR}`);
  console.log('');
  console.log(' 이 창을 닫으면 모든 컴퓨터에서 사용할 수 없습니다.');
  console.log(' 끄려면 이 창에서 Ctrl+C 를 누르세요.');
  console.log('========================================================');
  console.log('');
});
