import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
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

async function request(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, cache: 'no-store' });
    setConnected(true);
    return res;
  } catch (e) {
    setConnected(false);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

window.storage = {
  // 없는 값이면 null, 서버에 연결되지 않으면 오류를 던집니다 (빈 데이터로 덮어쓰지 않도록).
  async get(key) {
    const res = await request(`/api/storage/${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
    return res.json();
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

createRoot(document.getElementById('root')).render(
  <>
    <StatusBar />
    <App />
  </>
);
