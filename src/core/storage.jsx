// 서버 저장소 읽기·쓰기와 공유 상태 훅
import { useState, useEffect, useCallback, useRef } from 'react';
import { ARK_TEST, DEFAULT_SETTINGS, DRAG_ACTIVE, GAT_ID, GAT_TEST, TREAT_ROOM, normalizeTests, realTodayISO } from './flow.jsx';

/* ------------------------------------------------------------------ */
/* 저장소 (window.storage, 공유)                                        */
/* ------------------------------------------------------------------ */
// 서버에 연결되지 않으면 오류를 그대로 던집니다. 빈 값으로 착각해 공유 데이터를 덮어쓰지 않기 위해서입니다.
// meta 를 넘기면 불러온 값의 버전을 담아 줍니다 (저장할 때 다른 컴퓨터와 겹쳤는지 확인용).
export async function loadKey(key, fallback, meta) {
  const r = await window.storage.get(key, true);
  if (meta) meta.version = r?.version ?? 0;
  if (!r) return fallback;
  // 서버 값이 깨져 있으면 빈 값으로 여기지 않고 오류 (빈 값에 변경을 얹어 저장하면 명단 전체가 사라지므로)
  try { return JSON.parse(r.value); } catch { throw new Error(`${key} 값을 읽지 못했습니다`); }
}
export async function saveKey(key, value, version) {
  await window.storage.set(key, JSON.stringify(value), true, version);
}
export const loadDaily = (meta) => loadKey('daily-patients', [], meta);
export const loadFu = (meta) => loadKey('fu-designations', {}, meta);
export const loadDoctors = (meta) => loadKey('doctors', [], meta);
export const loadHistory = (meta) => loadKey('measure-history', {}, meta);
// 명단(오늘 + 앞으로 올린 날짜)에 있는 환자 것만 받기. 저장할 때는 전체를 받아 합쳐서 저장합니다(loadHistory).
export async function loadKeySubset(key, ids) {
  if (!window.storage.getSubset) return loadKey(key, {});
  let r;
  try {
    r = await window.storage.getSubset(key, ids);
  } catch (e) {
    if (e?.unsupported) return loadKey(key, {});
    throw e;
  }
  if (!r) return {};
  try { return JSON.parse(r.value) || {}; } catch { return {}; }
}
// 환자 몇 명 것만 한 번 받기 (명단 올리기·환자 추가 때 그 환자들의 FU 확인용, 캐시 없이 최신 값)
export async function loadEntries(key, ids) {
  if (!ids.length) return {};
  try {
    return await window.storage.getEntries(key, ids);
  } catch (e) {
    if (e?.unsupported) return loadKey(key, {}); // 예전 서버: 전체를 받음
    throw e;
  }
}
export const loadDoctorPrefs = (meta) => loadKey('doctor-prefs', {}, meta);
export const loadTodayOverride = (meta) => loadKey('today-override', null, meta);

export function ensureBuiltins(s) {
  if (!s.rooms.some(r => r.builtin === 'treat')) s = { ...s, rooms: [...s.rooms, TREAT_ROOM] };
  // 예전 설정: 처치실 검사에 켠 '시간 재기(준비)'는 이제 [시간 재기] 칩 (한 번 저장하면 timed 값이 생겨 다시 바꾸지 않음)
  s = { ...s, tests: s.tests.map(t => (t.timed === undefined && t.prepOn && t.roomId === 'treat' ? { ...t, prepOn: false, timed: true } : t)) };
  // ARK는 설정에서 지우면(arkRemoved) 다시 넣지 않습니다
  s = { ...s, tests: s.tests.some(t => t.id === 'ark') ? s.tests.map(t => t.id === 'ark' ? { ...t, roomId: 'vision', builtin: 'ark' } : t) : s.arkRemoved ? s.tests : [ARK_TEST, ...s.tests] };
  if (s.tests.some(t => t.id === GAT_ID)) {
    return { ...s, tests: s.tests.map(t => (t.id === GAT_ID ? { ...t, builtin: 'gat' } : t)) };
  }
  const room = s.rooms.find(r => r.id === 'B') || s.rooms[0];
  if (!room) return s;
  const max = Math.max(-1, ...s.tests.filter(t => t.roomId === room.id).map(t => t.order));
  return { ...s, tests: [...s.tests, { ...GAT_TEST, roomId: room.id, order: max + 1 }] };
}
export async function loadSettings(meta) {
  const s = await loadKey('settings', null, meta);
  if (!s) return DEFAULT_SETTINGS;
  const base = ensureBuiltins({
    ...DEFAULT_SETTINGS,
    ...s,
    rooms: Array.isArray(s.rooms) ? s.rooms : DEFAULT_SETTINGS.rooms,
    tests: Array.isArray(s.tests) ? s.tests : DEFAULT_SETTINGS.tests,
  });
  return {
    ...base,
    tests: normalizeTests(base.tests),
    procedures: Array.isArray(base.procedures) ? base.procedures : DEFAULT_SETTINGS.procedures,
    dilationWaitMin: Number.isFinite(Number(base.dilationWaitMin)) ? Number(base.dilationWaitMin) : 15,
    vision: { ...DEFAULT_SETTINGS.vision, ...(base.vision || {}) },
    hxFields: hxFieldsOf(base),
  };
}
export function visionNames(settings) {
  return { ...DEFAULT_SETTINGS.vision, ...(settings.vision || {}) };
}

// 실시간 명단에는 어제~앞으로의 날짜만 있습니다. 그보다 지난 명단은 서버가 월별 보관 파일로 옮깁니다.
export function shiftISO(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
// 서버는 실제 날짜(서버 PC 시계) 기준으로 그저께 이전 명단을 보관 파일로 옮기므로, 여기서도 실제 날짜로 판단합니다.
// (메인 화면에서 날짜를 직접 정해도 보관 여부는 바뀌지 않음 — 정한 날짜로 판단하면 보관 명단이 안 보이던 문제)
export function isArchivedDate(date) {
  return !!date && date < shiftISO(realTodayISO(), -1);
}
// 보관된 날짜를 고르면 그 달의 보관 명단을 한 번 불러옵니다 (보기 전용).
// live: 실시간 명단 — 자정 직후처럼 서버가 아직 보관 파일로 옮기지 않은 그 날짜 기록도 함께 보여 줍니다 (같은 기록이면 실시간 것)
export function useArchivedPatients(date, live = []) {
  const isArchived = isArchivedDate(date);
  const month = isArchived ? date.slice(0, 7) : '';
  const [state, setState] = useState({ month: '', list: [], loading: false, error: false });
  useEffect(() => {
    if (!month) return undefined;
    let alive = true;
    setState({ month, list: [], loading: true, error: false });
    loadKey(`patients-archive-${month}`, [])
      .then(list => { if (alive) setState({ month, list: Array.isArray(list) ? list : [], loading: false, error: false }); })
      .catch(() => { if (alive) setState({ month, list: [], loading: false, error: true }); });
    return () => { alive = false; };
  }, [month]);
  const ready = state.month === month;
  const keyOf = p => `${p.id}::${p.date}::${p.visit || 1}`;
  const extra = isArchived ? live.filter(p => typeof p?.date === 'string' && p.date.slice(0, 7) === month && isArchivedDate(p.date)) : [];
  const merged = new Map((ready ? state.list : []).map(p => [keyOf(p), p]));
  extra.forEach(p => merged.set(keyOf(p), p));
  return { isArchived, list: [...merged.values()], loading: isArchived && (!ready || state.loading), error: ready && state.error };
}

// 다른 컴퓨터와 동시에 저장해 부딪혔을 때: 아주 잠깐 무작위로 기다렸다가 다시 (여러 대가 같은 순간에 다시 부딪히지 않게)
const MAX_CONFLICT_RETRY = 15;
const conflictPause = (attempt) => new Promise(r => setTimeout(r, 20 + Math.random() * 60 * Math.min(attempt + 1, 5)));

// 끝내 저장하지 못하면 화면에 알립니다 (ui/safety.jsx 의 빨간 띠). 접속 비밀번호 화면(401)으로 바뀌는 경우는 빼고
function reportSaveFailure(key, e) {
  if (e?.status === 401) return;
  try { window.dispatchEvent(new CustomEvent('oph-save-failed', { detail: { key, message: String(e?.message || e) } })); } catch { /* 알림만 못 함 */ }
}

// 화면을 먼저 바꾸고, 저장은 뒤에서 순서대로 처리 (버튼이 즉시 반응하도록)
export function useSharedStore(storageKey, loader, initial) {
  const [value, setValue] = useState(initial);
  const pending = useRef(0);
  const seq = useRef(0);
  const queue = useRef(Promise.resolve());

  const mutate = useCallback((updater) => {
    setValue(prev => updater(prev));
    pending.current += 1;
    seq.current += 1;
    const run = queue.current.then(async () => {
      try {
        // 다른 컴퓨터가 같은 순간에 저장했으면, 최신 내용을 다시 불러와 이 변경을 다시 적용합니다.
        for (let attempt = 0; ; attempt++) {
          const meta = {};
          const latest = await loader(meta);
          const next = updater(latest);
          try {
            await saveKey(storageKey, next, meta.version);
          } catch (e) {
            if (e?.conflict && attempt < MAX_CONFLICT_RETRY) { await conflictPause(attempt); continue; }
            throw e;
          }
          if (pending.current === 1) setValue(next);
          return next;
        }
      } finally {
        pending.current -= 1;
      }
    });
    queue.current = run.catch(e => { reportSaveFailure(storageKey, e); });
    return run;
  }, [storageKey, loader]);

  // 환자별 기록(예: 이전 시력)에서 한 환자 칸만 바꾸기: 서버와 그 칸만 주고받습니다.
  // fn(지금 칸 값) → 새 칸 값 (null 이면 지움). 다른 컴퓨터가 그 사이 같은 칸을 바꿨으면 최신 값으로 다시 적용합니다.
  const mutateEntry = useCallback((id, fn) => {
    const apply = (obj) => { const n = fn(obj?.[id] ?? null); const out = { ...(obj || {}) }; if (n === null || n === undefined) delete out[id]; else out[id] = n; return out; };
    setValue(prev => apply(prev));
    pending.current += 1;
    seq.current += 1;
    const run = queue.current.then(async () => {
      try {
        for (let attempt = 0; ; attempt++) {
          let base;
          try {
            base = await window.storage.getEntries(storageKey, [id]);
          } catch (e) {
            if (!e?.unsupported) throw e;
            // 예전 서버: 전체를 받아 합쳐서 저장
            const meta = {};
            const latest = await loader(meta);
            await saveKey(storageKey, apply(latest), meta.version);
            return;
          }
          const prev = base[id] ?? null;
          const next = fn(prev) ?? null;
          if (JSON.stringify(prev) === JSON.stringify(next)) return;
          try {
            await window.storage.setEntries(storageKey, [{ id, prev, next }]);
          } catch (e) {
            if (e?.conflict && attempt < MAX_CONFLICT_RETRY) { await conflictPause(attempt); continue; }
            throw e;
          }
          if (pending.current === 1) setValue(v => { const out = { ...(v || {}) }; if (next === null) delete out[id]; else out[id] = next; return out; });
          return;
        }
      } finally {
        pending.current -= 1;
      }
    });
    queue.current = run.catch(e => { reportSaveFailure(storageKey, e); });
    return run;
  }, [storageKey, loader]);

  // 새로 받기를 시작할 때 표시. 저장이 진행 중일 때 시작한 새로 받기는 저장 전 내용을 가져올 수 있어 쓰지 않습니다
  // (쓰면 방금 넣은 내용이 잠깐 사라졌다가 다시 나타남). 저장이 끝나면 서버 알림·4초 확인으로 곧 다시 받습니다.
  const mark = useCallback(() => (pending.current > 0 ? null : seq.current), []);
  const sync = useCallback((incoming, startedAt) => {
    if (startedAt !== null && pending.current === 0 && !DRAG_ACTIVE && seq.current === startedAt) setValue(incoming);
  }, []);

  return [value, mutate, sync, mark, mutateEntry];
}

export function hxFieldsOf(settings) {
  return Array.isArray(settings?.hxFields) && settings.hxFields.length ? settings.hxFields : DEFAULT_HX_FIELDS;
}
// History 양식: 설정 > 기타에서 항목을 바꿀 수 있습니다.
// type: yn(있음/없음), ynYears(있음/없음 + 기간), text(한 줄), long(여러 줄). History는 그날 기록에만 저장 (다음 내원 때 불러오지 않음)
export const DEFAULT_HX_FIELDS = [
  { id: 'htn', label: '고혈압', short: 'HTN', type: 'yn' },
  { id: 'dm', label: '당뇨', short: 'DM', type: 'ynYears' },
  { id: 'pmh', label: '기타 과거력', short: '과거력', type: 'text' },
  { id: 'surgery', label: '이전 안과 수술력', short: '수술력', type: 'long' },
  { id: 'cc', label: '주호소', short: '주호소', type: 'text' },
];
