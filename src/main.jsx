import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AccessGate } from './views/AccessGate.jsx';
import './style.css';

/* ------------------------------------------------------------------ */
/* 공유 저장소: 서버 PC(server.js)에 저장해서 모든 컴퓨터가 같은 데이터를 봅니다 */
/* ------------------------------------------------------------------ */
const REQUEST_TIMEOUT_MS = 8000;
let connected = true;
const listeners = new Set();
function setConnected(v) {
  if (connected === v) return;
  connected = v;
  listeners.forEach(fn => fn(v));
}

// 접속 비밀번호: 서버가 통행증 없는 요청을 거절(401)하면 비밀번호 화면을 띄움
let accessNeeded = false;
const accessListeners = new Set();
function setAccessNeeded() {
  if (accessNeeded) return;
  accessNeeded = true;
  accessListeners.forEach(fn => fn(true));
}

async function request(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, cache: 'no-store' });
    setConnected(true);
    if (res.status === 401) setAccessNeeded();
    return res;
  } catch (e) {
    setConnected(false);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// 마지막으로 받은 값. 서버 값이 그대로면(304) 다시 내려받지 않고 이것을 씁니다.
const lastSeen = new Map();
const lastSubset = new Map();

window.storage = {
  // 없는 값이면 null, 서버에 연결되지 않으면 오류를 던집니다 (빈 데이터로 덮어쓰지 않도록).
  async get(key) {
    const known = lastSeen.get(key);
    const res = await request(`/api/storage/${encodeURIComponent(key)}${known ? `?have=${known.version}` : ''}`);
    if (res.status === 304 && known) return known;
    if (res.status === 404) { lastSeen.delete(key); return null; }
    if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
    const item = await res.json();
    lastSeen.set(key, item);
    return item;
  },
  // 환자별 기록 중 ids 에 해당하는 것만 받습니다. 같은 환자 목록이고 서버 값이 그대로면(304) 다시 받지 않습니다.
  async getSubset(key, ids) {
    const idsKey = ids.join(',');
    const known = lastSubset.get(key);
    const same = known && known.idsKey === idsKey;
    const res = await request(`/api/storage-subset/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, have: same ? known.item.version : null }),
    });
    if (res.status === 304 && same) return known.item;
    if (res.status === 404) {
      // 서버를 다시 켜기 전(예전 server.js)이면 이 주소가 없음 → 예전처럼 전체를 받도록 알림
      const body = await res.json().catch(() => ({}));
      if (body?.error === 'not found') { const e = new Error('부분 조회 미지원 서버'); e.unsupported = true; throw e; }
      lastSubset.delete(key);
      return null;
    }
    if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
    const item = await res.json();
    lastSubset.set(key, { idsKey, item });
    return item;
  },
  // version 을 주면, 그 사이에 다른 컴퓨터가 먼저 저장했을 때 conflict 오류가 납니다.
  async set(key, value, _shared, version) {
    const res = await request(`/api/storage/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, version }),
    });
    if (res.status === 409) {
      const err = new Error('다른 컴퓨터가 먼저 저장했습니다');
      err.conflict = true;
      throw err;
    }
    if (!res.ok) throw new Error(`저장 실패 (${res.status})`);
    const saved = await res.json();
    lastSeen.set(key, { key, value, version: saved.version });
    return saved;
  },
  // 환자별 기록에서 몇 칸만 바로 받기 (캐시 없이, 저장 직전 최신 값 확인용)
  async getEntries(key, ids) {
    const res = await request(`/api/storage-subset/${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, have: null }),
    });
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      if (body?.error === 'not found') { const e = new Error('부분 조회 미지원 서버'); e.unsupported = true; throw e; }
      return {};
    }
    if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
    const item = await res.json();
    try { return JSON.parse(item.value) || {}; } catch { return {}; }
  },
  // 환자별 기록에서 몇 칸만 저장. entries: [{ id, prev, next }] (next 가 null 이면 그 칸을 지움)
  async setEntries(key, entries) {
    const res = await request(`/api/storage-entries/${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }),
    });
    if (res.status === 409) {
      const err = new Error('다른 컴퓨터가 먼저 저장했습니다');
      err.conflict = true;
      throw err;
    }
    if (res.status === 404) { const e = new Error('칸 저장 미지원 서버'); e.unsupported = true; throw e; }
    if (!res.ok) throw new Error(`저장 실패 (${res.status})`);
    return res.json();
  },
};

/* 서버 연결 상태와 새 버전 알림 */
function StatusBar() {
  const [online, setOnline] = useState(connected);
  const [newVersion, setNewVersion] = useState(false);

  useEffect(() => {
    listeners.add(setOnline);
    return () => { listeners.delete(setOnline); };
  }, []);

  useEffect(() => {
    let firstBuild = null;
    const check = async () => {
      try {
        const res = await request('/api/health');
        const { build } = await res.json();
        if (firstBuild === null) firstBuild = build;
        else if (build !== firstBuild && build !== 'none') setNewVersion(true);
      } catch { /* 연결 상태는 request 가 표시합니다 */ }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  if (!online) {
    return (
      <div className="sticky top-0 z-50 bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
        서버 PC에 연결되지 않았습니다. 지금 입력한 내용은 저장되지 않습니다. 서버 PC가 켜져 있는지 확인해주세요.
      </div>
    );
  }
  if (newVersion) {
    return (
      <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-sky-600 px-4 py-2 text-sm text-white">
        새 버전이 있습니다.
        <button onClick={() => location.reload()} className="rounded bg-white px-3 py-1 font-semibold text-sky-700">새로고침</button>
      </div>
    );
  }
  return null;
}

// 처음 열 때 접속 비밀번호가 필요한지 확인 (서버에 연결되지 않으면 예전처럼 화면을 열고 연결 안내만)
function Root() {
  const [state, setState] = useState(accessNeeded ? 'locked' : 'checking');
  useEffect(() => {
    const onNeed = () => setState('locked');
    accessListeners.add(onNeed);
    request('/api/access').then(r => r.json()).then(r => {
      if (r?.enabled && !r.ok) setAccessNeeded();
      else setState(s => (s === 'locked' ? s : 'open'));
    }).catch(() => setState(s => (s === 'locked' ? s : 'open')));
    return () => { accessListeners.delete(onNeed); };
  }, []);
  if (state === 'checking') return null;
  if (state === 'locked') return <AccessGate onOk={() => location.reload()} />;
  return (
    <>
      <StatusBar />
      <App />
    </>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
