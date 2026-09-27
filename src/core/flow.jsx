// 진료 흐름·검사·산동·측정값 등 화면과 무관한 규칙과 계산
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import * as XLSX from 'xlsx';
import {
  Eye, Camera, Stethoscope, Monitor, Settings, ClipboardList, Check, Plus,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Upload, Trash2, Search, GripVertical, RotateCcw, Syringe, StickyNote, ScanBarcode,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* 색상                                                                */
/* ------------------------------------------------------------------ */
export const COLOR_MAP = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', solid: 'bg-blue-600' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', solid: 'bg-teal-600' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', solid: 'bg-violet-600' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', solid: 'bg-rose-600' },
  sky: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', solid: 'bg-sky-600' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', solid: 'bg-emerald-600' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', solid: 'bg-indigo-600' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', solid: 'bg-amber-600' },
  slate: { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-700', solid: 'bg-slate-600' },
};
export const ROOM_PALETTE = ['teal', 'violet', 'rose', 'sky', 'emerald', 'indigo'];
export const INPUT = 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white';

/* ------------------------------------------------------------------ */
/* 기본 설정                                                           */
/* ------------------------------------------------------------------ */
export const VISION_KEY = 'visionIop';
export const GAT_ID = 'gat';
export const VISION_TEST = { id: VISION_KEY, name: '시력/안압', short: '시력/안압' };
export const ARK_TEST = { id: 'ark', name: 'ARK', short: 'ARK', roomId: 'vision', order: 0, builtin: 'ark', options: [], popupOnClick: false, machine: '' };
export const GAT_TEST = { id: GAT_ID, name: '안압 (GAT)', short: 'GAT', roomId: 'B', order: 3, builtin: 'gat', options: [], popupOnClick: false };
export const DEFAULT_OCT_OPTIONS = ['Macular', 'Disc', 'Angio'];

export const DEFAULT_SETTINGS = {
  rooms: [
    { id: 'B', name: 'WFP · OCT · VF 검사실', patientName: '정밀검사실', showPriority: true },
    { id: 'C', name: 'IDRA 검사실', patientName: '안구건조증 검사실', showPriority: false },
    { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' },
  ],
  tests: [
    ARK_TEST,
    { id: 'vf', name: '시야검사 (VF)', short: 'VF', roomId: 'B', order: 0, options: [], popupOnClick: false, machine: '' },
    { id: 'oct', name: 'OCT', short: 'OCT', roomId: 'B', order: 1, options: DEFAULT_OCT_OPTIONS, popupOnClick: true, machine: 'OCT' },
    { id: 'wfp', name: '안저촬영 (WFP)', short: 'WFP', roomId: 'B', order: 2, options: [], popupOnClick: false, machine: '' },
    GAT_TEST,
    { id: 'idra', name: 'IDRA (안구건조증)', short: 'IDRA', roomId: 'C', order: 0, options: [], popupOnClick: false, machine: '' },
  ],
  procedures: [
    { id: 'p_prof', name: '교수 처치', performer: 'prof' },
    { id: 'p_res', name: '전공의 처치', performer: 'resident' },
  ],
  // 시력방 이름 (직원 화면 / 환자용 화면)
  vision: { name: '시력 / 안압 검사실', patientName: '시력검사실' },
  dilationWaitMin: 15,
  lateGraceMin: 0, // 바코드 접수에서만: 예약시간보다 이 시간 넘게 늦게 찍으면 지각
  // 같은 날 2차 진료(다른 교수님)로 넘어갈 때 처치실에서 추가 검사를 확인할지
  linkCheckAdded: true,    // 진료 중에 추가된 2차 진료
  linkCheckPlanned: false, // 미리 명단에 예정된 2차 진료
};
export const PERFORMER_LABEL = { prof: '교수님', resident: '전공의' };

export const MEASURE_FIELDS = [
  { key: 'ucva', label: '나안' },
  { key: 'bcva', label: '교정' },
  { key: 'nct', label: 'NCT' },
  { key: 'gat', label: 'GAT' },
];

// 드래그 중에는 다른 컴퓨터의 변경을 화면에 반영하지 않음 (끌던 카드가 튀지 않도록)
export let DRAG_ACTIVE = false;
export function setDragActive(v) { DRAG_ACTIVE = v; }

/* ------------------------------------------------------------------ */
/* 순수 헬퍼                                                           */
/* ------------------------------------------------------------------ */
export function maskName(name) {
  if (!name) return '';
  const chars = Array.from(name);
  if (chars.length <= 1) return chars.join('');
  if (chars.length === 2) return `${chars[0]}*`;
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
}

export function timeToMin(t) {
  if (!t) return 0;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function normalizeTime(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    const totalMin = Math.round((v % 1) * 24 * 60) % (24 * 60);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s;
}

export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 메인 화면에서 날짜를 직접 정하면(모든 컴퓨터 공통, 그날 하루만) 그 날짜를 '오늘'로 씁니다.
export let forcedToday = null;
export function setForcedToday(v) { forcedToday = v; }
export function todayISO() {
  return forcedToday || realTodayISO();
}
export function realTodayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// 같은 날 두 번째 교수님 진료(2차 진료)는 visit 2, 3… 으로 따로 기록합니다.
export function patientKey(p) { return `${p.id}::${p.date}${p.visit > 1 ? `::${p.visit}` : ''}`; }
export function byQueue(a, b) { return a.queueKey - b.queueKey; }

export function roomColor(settings, roomId) {
  const i = settings.rooms.findIndex(r => r.id === roomId);
  return ROOM_PALETTE[Math.max(i, 0) % ROOM_PALETTE.length];
}

export function roomTests(settings, roomId) {
  return settings.tests.filter(t => t.roomId === roomId).sort((a, b) => a.order - b.order);
}

export function sortedTests(settings) {
  const idx = (id) => settings.rooms.findIndex(r => r.id === id);
  return [...settings.tests]
    .filter(t => t.roomId === 'vision' || idx(t.roomId) >= 0)
    .sort((a, b) => (idx(a.roomId) - idx(b.roomId)) || (a.order - b.order));
}

// 검사 선택 창(추가 검사·설명 완료·검사 지정·FU 지정)의 검사 순서. 설정에서 정한 순서가 없으면 검사실 순서.
export function orderForPicking(tests, settings) {
  const order = Array.isArray(settings?.pickOrder) ? settings.pickOrder : [];
  const pos = (t) => { const i = order.indexOf(t.id); return i < 0 ? order.length + tests.indexOf(t) : i; };
  return [...tests].sort((a, b) => pos(a) - pos(b));
}

/* 검사 처방: 처방은 모든 검사실 검사를 한 번에 넣으므로, 어느 검사실에서 [처방 전]을 눌러 처방 완료로 바꿔도
   그 환자의 모든 검사가 처방 완료로 표시됩니다 (직원 화면에만 표시).
   처방 완료 뒤 검사가 새로 추가되거나 다시 하게 되면 그 검사는 '처방 전'으로 돌아갑니다. */
// 교수님별 주요 검사: 교수 관리의 '다음 내원 검사 목록'. 목록을 정하지 않은 교수님은 모든 검사가 주요 검사
export function mainTestIds(prefs, doctor) {
  const ids = prefs?.[doctor]?.followupTests;
  return Array.isArray(ids) ? ids : null;
}
export function orderedTests(p) {
  return [...new Set(Object.values(p.orders || {}).flatMap(r => r?.tests || []))];
}
export function orderState(p, settings, roomId) {
  // 처방이 필요 없는 검사(예: OSDI 설문)는 처방 전/완료 표시에서 뺍니다
  const needed = roomTests(settings, roomId).filter(t => p.assigned?.[t.id] && !p.done?.[t.id] && !t.noOrder);
  const covered = orderedTests(p);
  const at = Math.max(0, ...Object.values(p.orders || {}).map(r => r?.at || 0));
  const rec = at ? { at } : null;
  const missing = needed.filter(t => !covered.includes(t.id));
  return { needed, rec, missing, complete: needed.length > 0 && missing.length === 0 };
}
// 검사를 새로(또는 다시) 지정하면 그 검사의 처방 완료 표시를 지웁니다
export function clearOrders(p, testIds) {
  if (!p.orders || !testIds.length) return p.orders;
  return Object.fromEntries(Object.entries(p.orders).map(([room, rec]) => [room, { ...rec, tests: (rec.tests || []).filter(id => !testIds.includes(id)) }]));
}

// 검사 전 처치실 준비 단계 (예: FAG 동의서 · skin test 20분). 설정에서 검사마다 켭니다.
// p.prep[testId] = { startedAt, result: 'neg' | 'pos', at, name }
export function hasPrep(t) { return !!t?.prepOn; }
export function prepOf(p, t) { return p.prep?.[t.id] || null; }
// 준비 결과가 음성이어야 검사실에서 검사할 수 있음
// 처치실 검사(예: Schirmer, MMP)의 시간 재기는 '진료 전 검사' 칸에서 바로 함 (검사 준비는 FAG처럼 검사실 검사의 준비만)
export function isTreatPrep(t) { return hasPrep(t) && t.roomId === 'treat'; }
export function prepBlocked(p, t) { return hasPrep(t) && !isTreatPrep(t) && prepOf(p, t)?.result !== 'neg'; }
// 양성이면 그 검사는 보류 (검사실 대기에서 빠지고, 진료실에 표시)
export function prepPositive(p, t) { return hasPrep(t) && prepOf(p, t)?.result === 'pos'; }
export function prepWaitMin(t) { return Math.max(0, Number(t?.prepWaitMin ?? 20) || 0); }
// 처치실에서 준비할 검사 (지정됐고, 아직 안 했고, 결과 전)
export function prepPendingTests(p, settings) {
  return sortedTests(settings).filter(t => hasPrep(t) && !isTreatPrep(t) && p.assigned?.[t.id] && !p.done?.[t.id] && !prepOf(p, t)?.result);
}
// 시간 재기 방식: 'confirm'(기본, 시간이 되면 직원이 확인해야 넘어감 · FAG, Schirmer) / 'go'(시작하면 바로 넘어가고 시간이 되면 확인 알림 · MMP)
export function prepGoMode(t) { return t?.prepMode === 'go'; }
export function prepDue(st, t, now = Date.now()) { return !!st?.startedAt && now >= st.startedAt + prepWaitMin(t) * 60000; }
// '바로 넘어감' 검사 중 결과 확인이 남은 것 (시작 때 검사는 완료로 넘어감)
export function prepChecks(p, settings) {
  return sortedTests(settings).filter(t => hasPrep(t) && prepGoMode(t) && p.assigned?.[t.id] && prepOf(p, t)?.go && !prepOf(p, t)?.checked);
}
// '진행 중 호출 금지'(예: Schirmer): 처치실에서 시작해 아직 확인 전이면 검사실에서 부르지 않음
export function prepHolding(p, settings) {
  return sortedTests(settings).find(t => hasPrep(t) && t.holdCall && !prepGoMode(t) && p.assigned?.[t.id] && !p.done?.[t.id] && prepOf(p, t)?.startedAt && !prepOf(p, t)?.result) || null;
}
// 시간 재기 버튼 이름: 따로 적은 이름(예: skin test)이 없으면 검사 이름 (예전 기본값 '검사 준비'도 검사 이름으로)
export function prepLabel(t) {
  const n = String(t?.prepName || '').trim();
  return n && n !== '검사 준비' ? n : (t?.short || t?.name || '');
}
// 처치실 검사는 [확인]이 곧 검사 완료 (검사실 검사는 '확인하면 검사 완료'를 켠 경우만)
export function prepCompletesTest(t, settings) {
  return !!t?.prepCompletes || t?.roomId === treatRoomOf(settings).id;
}
// 예전에 확인만 되고 완료가 안 된 처치실 검사 고치기 (바뀐 게 없으면 그대로)
export function fixTreatPreps(p, settings) {
  let done = p.done, doneAt = p.doneAt, changed = false;
  sortedTests(settings).forEach(t => {
    const st = p.prep?.[t.id];
    if (hasPrep(t) && t.roomId === treatRoomOf(settings).id && p.assigned?.[t.id] && st?.result === 'neg' && !done?.[t.id]) {
      done = { ...done, [t.id]: true }; doneAt = { ...(doneAt || {}), [t.id]: st.at || Date.now() }; changed = true;
    }
  });
  return changed ? { ...p, done, doneAt } : p;
}
// 시간 재기 시작·확인·취소 (검사 준비 카드와 진료 전 검사 칸이 함께 씀). 바로 넘어감은 시작하면 검사 완료
export function prepStartPatch(x, t, at) {
  const st = prepGoMode(t) ? { startedAt: at, go: true, name: t.short || t.name } : { startedAt: at, name: t.short || t.name };
  return {
    prep: { ...(x.prep || {}), [t.id]: st },
    ...(prepGoMode(t) ? { done: { ...x.done, [t.id]: true }, doneAt: { ...(x.doneAt || {}), [t.id]: at } } : {}),
  };
}
export function prepConfirmPatch(x, t, settings, at) {
  return {
    prep: { ...(x.prep || {}), [t.id]: { ...(x.prep?.[t.id] || {}), result: 'neg', at } },
    ...(prepCompletesTest(t, settings) ? { done: { ...x.done, [t.id]: true }, doneAt: { ...(x.doneAt || {}), [t.id]: at } } : {}),
  };
}
export function prepCancelPatch(x, t) {
  return {
    prep: { ...(x.prep || {}), [t.id]: null },
    ...(x.prep?.[t.id]?.go ? { done: { ...x.done, [t.id]: false }, doneAt: { ...(x.doneAt || {}), [t.id]: null } } : {}),
  };
}
// 시간 재는 중이고(시작, 확인 전) 아직 완료 안 된 검사
export function prepRunning(p, t) { const st = prepOf(p, t); return hasPrep(t) && !!st?.startedAt && !st.result && !st.go && !p.done?.[t.id]; }
export function prepPositiveNames(p) {
  return Object.values(p.prep || {}).filter(x => x?.result === 'pos').map(x => x.name).filter(Boolean);
}

// 진료 전 처치 (예: PRP, YAG만 받으러 온 환자): 처치실에서 먼저 하고, 검사가 있으면 그다음 검사실로
export function preProcPending(p) {
  return (p.preProcs || []).some(x => !x.done);
}

// 남은 검사 (준비 전인 검사 포함, 양성으로 보류된 검사는 뺌)
export function remainingTests(p, settings, roomId) {
  return roomTests(settings, roomId).filter(t => p.assigned?.[t.id] && !p.done?.[t.id] && !prepPositive(p, t));
}
// 지금 그 검사실에서 할 수 있는 검사. 처치실 검사는 '검사실 대기 중에도 바로'(예: OSDI)를 켠 것만
// 다른 검사실 검사가 남아 있을 때도 할 수 있고, 나머지(예: Syringing)는 다른 검사실 검사가 끝난 뒤에 합니다.
export function pendingTests(p, settings, roomId) {
  const list = roomTests(settings, roomId).filter(t => p.assigned?.[t.id] && !p.done?.[t.id] && !prepBlocked(p, t));
  if (roomId !== treatRoomOf(settings).id) return list;
  const othersLeft = settings.rooms.some(r => r.id !== roomId && remainingTests(p, settings, r.id).length > 0);
  return othersLeft ? list.filter(t => t.withExams) : list;
}

// 처치실에서 오늘 검사를 정할 환자: 초진, 또는 시력방에서 History를 적고 '처치실에서 검사 지정'으로 보낸 환자
export function assignAtTreat(p) {
  return !!(p.firstVisit || p.hxAssign);
}
// 시력/안압을 마쳤고, 초진이면 처치실에서 검사 지정까지 마친 상태 → 검사실로 갈 수 있음
// 시력방에서 하는 검사 id (설정의 시력방 검사, 예: ARK). App이 설정을 읽을 때마다 갱신합니다.
export let VISION_TEST_IDS = ['ark'];
export function setVisionTestIds(v) { VISION_TEST_IDS = v; }
// 산동 금지 검사 (설정의 '산동 금지', 기본 VF). 끝나기 전에는 점안을 막습니다. App이 설정을 읽을 때마다 갱신
export let NO_DILATE_TESTS = [{ id: 'vf', short: 'VF' }];
export function setNoDilateTests(v) { NO_DILATE_TESTS = v; }
export function dilationBlockers(p) {
  return NO_DILATE_TESTS.filter(t => p.assigned?.[t.id] && !p.done?.[t.id]);
}
export function visionComplete(p) {
  return !!p.done?.[VISION_KEY] && VISION_TEST_IDS.every(id => !p.assigned?.[id] || !!p.done?.[id]);
}
// 시력방 할 일: 측정값 [확인], (초진) History [확인], 시력방 검사(ARK 등), (산동 예정) 첫 점안.
// 모두 끝나면 시력/안압 완료로 자동으로 넘어감. 점안은 [점안 없이 넘기기](dilateSkip)나 산동 금지 검사(VF)가 남으면 제외
export function visionTasksLeft(p, prefs) {
  const left = [];
  if (!p.measureOk) left.push('measure');
  if (hxNeeded(p) && !p.hx) left.push('hx');
  if (VISION_TEST_IDS.some(id => p.assigned?.[id] && !p.done?.[id])) left.push('tests');
  if (dropDue(p, prefs)) left.push('drop');
  return left;
}
export function dropDue(p, prefs) {
  if (p.dilateSkip) return false;
  const st = dilationState(p, prefs, 15);
  return !!st.need && st.given === 0 && dilationBlockers(p).length === 0;
}
export function pastVision(p) {
  return !!p.checkin && visionComplete(p) && (!(assignAtTreat(p) || p.addOnCheck) || !!p.triageAssigned || !!p.triageDone);
}

// 진료 전 처치가 남아 있으면 검사실보다 처치가 먼저입니다.
export function roomPending(p, settings, roomId) {
  return pastVision(p) && !preProcPending(p) && pendingTests(p, settings, roomId).length > 0;
}

export function pendingRooms(p, settings) {
  return settings.rooms.filter(r => roomPending(p, settings, r.id));
}

// 지정된 검사를 모두 마침
export function testsComplete(p, settings) {
  if (!pastVision(p) || activeVf(p)) return false;
  return sortedTests(settings).every(t => !p.assigned?.[t.id] || p.done?.[t.id] || prepPositive(p, t));
}

// 진료 받을 준비가 됨 (검사 모두 완료, 초진이면 예진까지 완료)
export function allDone(p, settings) {
  return testsComplete(p, settings) && !preProcPending(p)
    && (!assignAtTreat(p) || p.triageRequired === false || !!p.triageDone)
    && (!p.extraTriage || !!p.triageDone);
}

/* 진료 흐름 단계 */
// 초진: 시력/안압 후 처치실에서 검사 지정 대기
// 2차 진료: 1차 진료 설명 완료 후 처치실에서 추가 검사 확인 대기 (설정에서 켠 경우)
export function needsTriageAssign(p) {
  return !p.consultDone && !!p.checkin && visionComplete(p) && !!(assignAtTreat(p) || p.addOnCheck) && !p.triageAssigned && !p.triageDone;
}
// 초진: 검사를 모두 마치고(또는 검사 없음) 처치실 처치 대기에서 예진 대기
// 초진 예진, 또는 처치실에서 '예진 추가'한 환자
export function needsTriageExam(p, settings) {
  const wanted = (assignAtTreat(p) && p.triageRequired !== false) || !!p.extraTriage;
  return !p.consultDone && wanted && !p.triageDone && testsComplete(p, settings);
}
// 진료실에서 '처치실 확인 요청'으로 보낸 환자
export function treatRequested(p) {
  return !p.consultDone && !!p.treatRequest;
}
export function inTreatRoom(p, settings) {
  return needsTriageAssign(p) || needsTriageExam(p, settings) || inResidentProcedure(p) || treatRequested(p) || (pastVision(p) && preProcPending(p));
}
export function pendingProcedures(p, performer) {
  return (p.procedures || []).filter(x => !x.done && (!performer || x.performer === performer));
}
export function inProfProcedure(p) {
  return !p.consultDone && pendingProcedures(p, 'prof').length > 0;
}
export function inResidentProcedure(p) {
  return !p.consultDone && pendingProcedures(p, 'prof').length === 0 && pendingProcedures(p, 'resident').length > 0;
}
// 진료 완료 후 설명 대기. 처치가 남아 있어도 설명 대기에 '처치 중'으로 함께 보입니다.
// explainedEarly: 처치 중에 설명을 먼저 끝낸 환자 → 처치가 끝나면 진찰실에서 [귀가]
export function awaitingExplain(p) {
  return !p.consultDone && !!p.seen;
}
export function procedureStatus(p) {
  const list = p.procedures || [];
  if (!list.length) return '';
  return pendingProcedures(p).length ? 'doing' : 'done';
}
export function inConsult(p) {
  return !p.consultDone && !p.seen && !!p.calledRoom;
}
export function consultWaiting(p, settings) {
  return !p.consultDone && !p.seen && !p.calledRoom && !p.treatRequest && allDone(p, settings);
}

export function getStage(p, settings) {
  if (p.consultDone) return { label: '완료', area: 'done' };
  if (p.linkWaiting) return { label: `${p.primaryDoctor || '1차'} 진료 후 대기 (2차 진료)`, area: 'linked' };
  if (!p.checkin) return { label: '접수 대기', area: 'reception' };
  if (!visionComplete(p)) return { label: '시력/안압 검사 대기', area: 'vision' };
  if (treatRequested(p)) return { label: '처치실 대기 (진료실 요청 확인)', area: 'treatReq' };
  if (needsTriageAssign(p)) return { label: p.firstVisit ? '처치실 대기 (초진 검사 지정)' : p.hxAssign ? '처치실 대기 (검사 지정)' : '처치실 대기 (2차 진료 추가 검사 확인)', area: 'triage' };
  if (preProcPending(p)) return { label: `처치실 대기 (진료 전 처치: ${(p.preProcs || []).filter(x => !x.done).map(x => x.name).join(', ')})`, area: 'preProc' };
  if (activeVf(p)) return { label: 'VF 검사 중 · 다른 장비 호출 금지', area: 'exam' };
  const prepNames = prepPendingTests(p, settings).filter(t => !prepOf(p, t)?.startedAt).map(t => t.short || t.name);
  if (prepNames.length) return { label: `처치실 대기 (${prepNames.join(', ')} 검사 준비)`, area: 'prep' };
  const rooms = pendingRooms(p, settings);
  if (rooms.length) return { label: `${rooms.map(r => r.name).join(', ')} 검사 대기`, area: 'exam' };
  if (needsTriageExam(p, settings)) return { label: '처치실 대기 (예진)', area: 'triageExam' };
  if (inProfProcedure(p)) return { label: p.explainedEarly ? '설명 완료 · 교수님 처치 후 귀가' : '교수님 처치 중 (설명 대기)', area: 'profProc' };
  if (inResidentProcedure(p)) return { label: p.explainedEarly ? '처치실 (설명 완료 · 처치 후 귀가)' : '처치실 대기 (처치)', area: 'resProc' };
  if (p.seen && p.explainedEarly) return { label: '처치 완료 · 귀가 대기', area: 'explain' };
  if (p.seen) return { label: '설명 대기', area: 'explain' };
  if (p.calledRoom) return { label: `${p.calledRoom} 진료 중`, area: 'inRoom' };
  return { label: '진료 대기', area: 'consult' };
}

/* 산동 */
export const DILATE_EYE_LABEL = { OD: '우안 (OD)', OS: '좌안 (OS)' };
export function dilateEyeOf(value) { return ['OD', 'OS'].includes(value) ? value : undefined; }
export function needsDilation(p, prefs) {
  if (typeof p.dilateOverride === 'boolean') return p.dilateOverride;
  // 산동이 필요한 진료 전 처치(예: PRP)가 남아 있으면 접수하자마자 '산동'
  if ((p.preProcs || []).some(x => x.dilate && !x.done)) return true;
  return !!prefs?.[p.doctor]?.dilate;
}
export function crActive(p, prefs) {
  return !!p.cr && !!prefs?.[p.doctor]?.cr;
}
export function dilationState(p, prefs, waitMin, now = Date.now()) {
  const cr = crActive(p, prefs);
  if (!cr && !needsDilation(p, prefs)) return { need: false };
  const total = cr ? 4 : 1;
  const drops = Array.from({ length: total }, (_, i) => (p.drops || [])[i] || null);
  const given = drops.filter(Boolean).length;
  const last = given ? Math.max(...drops.filter(Boolean)) : 0;
  const mins = last ? Math.floor((now - last) / 60000) : 0;
  const base = { need: true, cr, total, drops, given, mins };
  if (given === 0) return { ...base, status: 'todo' };
  if (given < total) return { ...base, status: 'progress' };
  return { ...base, status: mins >= (Number(waitMin) || 15) ? 'ready' : 'waiting' };
}
export function patchPatient(mutatePatients, pk, fn) {
  mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? { ...x, ...fn(x) } : x)));
}
export function toggleDrop(mutatePatients, pk, i) {
  const at = Date.now();
  patchPatient(mutatePatients, pk, x => {
    const drops = [...(x.drops || [])];
    drops[i] = drops[i] ? null : at;
    return { drops };
  });
}

/* 검사실 상단 분류: 같은 장비끼리 묶기 */
// 상단 분류 이름: 직접 적은 값이 있으면 그것, 없으면 이름에 OCT가 들어간 검사는 모두 'OCT'로 묶음
export function machineOf(t) {
  // OCT 계열은 장비 칸과 무관하게 집계만 통합. 검사 표시에는 short/name을 그대로 사용.
  if (/oct/i.test(`${t.id} ${t.short || ''} ${t.name || ''}`)) return 'OCT';
  return String(t.machine || '').trim() || t.short || t.name;
}
export function machineGroups(tests) {
  const groups = [];
  tests.forEach(t => {
    const key = machineOf(t);
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, tests: [] }; groups.push(g); }
    g.tests.push(t);
  });
  return groups;
}
export function groupPending(p, g) {
  if (activeVf(p)) return false;
  return g.tests.some(t => p.assigned?.[t.id] && !p.done?.[t.id]);
}

// 진행 중인 VF는 환자에 저장하여 검사실 간 공유한다.
export function isVfTest(t) {
  return t.id === 'vf' || /\bVF\b/i.test(t.short || '') || /시야|\bVF\b/i.test(t.name || '');
}
// [▶ 시작]·[종료]로 하는 검사: VF, 또는 '진행 중 호출 금지'를 켠 일반 검사 (시간 재기 검사는 처치실 준비로 따로)
export function startStopTest(t) {
  return isVfTest(t) || (!!t.holdCall && !t.prepOn);
}
export function activeVf(p) {
  return p.vfInProgress && p.assigned?.[p.vfInProgress] && !p.done?.[p.vfInProgress] ? p.vfInProgress : null;
}
export function updateVf(p, key, action, at) {
  if (action === 'start') {
    if (activeVf(p) || !pastVision(p) || !p.assigned?.[key] || p.done?.[key] || p.consultDone) return {};
    return { vfInProgress: key, vfStartedAt: at };
  }
  if (activeVf(p) !== key) return {};
  return {
    vfInProgress: null, vfStartedAt: null,
    ...(action === 'finish' ? { done: { ...p.done, [key]: true }, doneAt: { ...p.doneAt, [key]: at } } : {}),
  };
}

export function followupForDoctor(record, doctor) {
  return record?.byDoctor?.[doctor] || (!record?.doctor || record.doctor === doctor ? record : undefined);
}
export function saveFollowup(prev, id, doctor, value) {
  const old = prev[id] || {};
  const byDoctor = { ...old.byDoctor };
  if (old.doctor && !byDoctor[old.doctor]) { const { byDoctor: ignored, ...legacy } = old; byDoctor[old.doctor] = legacy; }
  const next = { ...value, doctor };
  if (doctor) byDoctor[doctor] = next;
  return { ...prev, [id]: { ...next, name: value.name || old.name, byDoctor } };
}
// 바빠서 다음 내원 검사를 못 정하고 보낸 환자: FU 기록에 '나중에 지정' 표시만 남깁니다 (기존 지정은 그대로).
// FU 지정 관리에서 지정해 저장하면 saveFollowup 이 이 표시를 지웁니다.
export function markFollowupLater(prev, id, { doctor, name, date, at }) {
  const old = prev[id] || {};
  return { ...prev, [id]: { ...old, name: name || old.name, fuLater: { doctor, date, at } } };
}
export function unmarkFollowupLater(prev, id) {
  if (!prev[id]?.fuLater) return prev;
  const { fuLater, ...rest } = prev[id];
  return { ...prev, [id]: rest };
}

// 한 교수님의 FU 지정만 지웁니다. 다른 교수님 기록이 남아 있으면 그중 가장 최근 것이 대표 기록이 됩니다.
export function deleteFollowup(prev, id, doctor) {
  const old = prev[id];
  if (!old) return prev;
  const next = { ...prev };
  const byDoctor = { ...old.byDoctor };
  if (doctor) delete byDoctor[doctor];
  const rest = Object.values(byDoctor);
  if (!doctor || !rest.length) { delete next[id]; return next; }
  const latest = [...rest].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  next[id] = { ...latest, name: old.name, byDoctor };
  return next;
}
export function fuVisitDate(fu) {
  if (fu?.visitDate) return fu.visitDate;
  if (!fu?.updatedAt) return '';
  const d = new Date(fu.updatedAt);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// FU 지정 관리에 보여줄 줄: 교수님별로 한 줄씩
export function followupRows(id, record) {
  const entries = Object.entries(record?.byDoctor || {});
  if (entries.length) return entries.map(([doctor, fu]) => ({ id, doctor, fu }));
  return [{ id, doctor: record?.doctor || '', fu: record }];
}

// 이름이 없는 FU 기록에 명단의 환자 이름을 채웁니다 (예전에 저장된 기록용)
export function fillFollowupNames(prev, list) {
  let changed = false;
  const next = { ...prev };
  list.forEach(p => {
    if (p?.id && p.name && next[p.id] && !next[p.id].name) { next[p.id] = { ...next[p.id], name: p.name }; changed = true; }
  });
  return changed ? next : prev;
}
// 진료 전 처치 목록 만들기 (설정 > 처치의 id 목록 → 환자 기록)
export function makePreProcs(ids, settings) {
  return (ids || []).map(id => (settings.procedures || []).find(x => x.id === id)).filter(Boolean)
    .map(x => ({ uid: newId('pp'), procId: x.id, name: x.name, performer: x.performer, dilate: !!x.dilate, done: false, doneAt: null }));
}
export function buildPatient(raw, fuMap, settings) {
  const fu = followupForDoctor(fuMap[raw.id], raw.doctor);
  const preProcs = makePreProcs(fu?.preProcs, settings);
  const assigned = { [VISION_KEY]: true };
  const detail = {};
  settings.tests.forEach(t => {
    assigned[t.id] = !!fu?.[t.id];
    if (assigned[t.id] && fu?.detail?.[t.id]) detail[t.id] = cleanDetail(fu.detail[t.id]);
  });
  return {
    id: raw.id,
    name: raw.name,
    date: raw.date,
    doctor: raw.doctor,
    reservation: raw.reservation,
    firstVisit: !!raw.firstVisit,
    checkin: '',
    late: false,
    queueKey: timeToMin(raw.reservation),
    assigned,
    detail,
    done: { [VISION_KEY]: false },
    doneAt: {},
    dilateOverride: fu?.dilate === 'yes' ? true : fu?.dilate === 'no' ? false : undefined,
    dilateEye: fu?.dilate === 'yes' ? dilateEyeOf(fu.dilateEye) : undefined,
    // 지난 진료에서 'FU 나중에'로 보내고 아직 지정하지 않은 환자
    fuMissing: !!fuMap[raw.id]?.fuLater && String(fuMap[raw.id].fuLater.date || '') < String(raw.date || ''),
    cr: !!fu?.cr,
    drops: [],
    procedures: [],
    triageAssigned: false,
    triageDone: false,
    seen: false,
    ignoredFuToday: false,
    // 다음 내원 진료 전 처치(PRP 등)가 지정돼 있으면 시력검사 없이 처치실로
    preProcs,
    skipVision: preProcs.length > 0 || undefined,
    consultDone: false,
    consultHold: false,
    calledRoom: null,
  };
}

/* 같은 날 두 교수님 진료 (2차 진료) */
// 교수님마다 기록을 따로 두고, 뒤 진료(linkWaiting)는 앞 진료(primaryKey)의 설명 완료 뒤에 시작합니다.
// - 미리 예정(planned): 1차 진료 전에 두 교수님 검사를 한 번에 합니다. 예약시간이 빠른 교수님이 1차.
// - 진료 중 추가(added): 1차 진료 설명 완료 후 (설정에 따라) 처치실에서 추가 검사를 확인합니다.
export function visitGroup(list, id, date) {
  return list.filter(x => x.id === id && x.date === date);
}
export function linkTail(group) {
  const pointed = new Set(group.map(x => x.primaryKey).filter(Boolean));
  return group.find(x => !pointed.has(patientKey(x))) || group[group.length - 1];
}
// 뒤 진료의 검사·산동을 앞 진료에 합칩니다 (검사를 한 번에 하기 위해)
export function unionPlan(first, other, prefs) {
  const assigned = { ...first.assigned };
  const detail = { ...first.detail };
  Object.entries(other.assigned || {}).forEach(([k, v]) => {
    if (v && !assigned[k]) { assigned[k] = true; if (other.detail?.[k]) detail[k] = other.detail[k]; }
  });
  const next = { ...first, assigned, detail };
  if (needsDilation(other, prefs)) {
    if (!needsDilation(first, prefs)) return { ...next, dilateOverride: true, dilateEye: dilateEyeOf(other.dilateEye) };
    if (dilateEyeOf(first.dilateEye) !== dilateEyeOf(other.dilateEye)) return { ...next, dilateEye: undefined };
  }
  return next;
}
export function addLinkedVisit(list, np, prefs, settings) {
  const group = visitGroup(list, np.id, np.date);
  const visit = Math.max(...group.map(x => x.visit || 1)) + 1;
  const tail = linkTail(group);
  const linkType = group.some(x => x.checkin) ? 'added' : 'planned';
  const rec = { ...np, visit, linkType };
  // 둘 다 접수 전이고 새 진료의 예약시간이 더 빠르면 새 진료가 1차
  if (linkType === 'planned' && group.length === 1 && np.reservation && tail.reservation && timeToMin(np.reservation) < timeToMin(tail.reservation)) {
    const second = { ...tail, linkWaiting: true, primaryKey: patientKey(rec), primaryDoctor: rec.doctor, linkType };
    return { next: [...list.filter(x => x !== tail), second, unionPlan(rec, second, prefs)], record: rec, first: true };
  }
  const waiting = { ...rec, linkWaiting: true, primaryKey: patientKey(tail), primaryDoctor: tail.doctor };
  const root = group.find(x => !x.linkWaiting && !x.consultDone);
  let next = linkType === 'planned' && root ? list.map(x => (x === root ? unionPlan(x, waiting, prefs) : x)) : list;
  next = [...next, waiting];
  if (tail.consultDone) next = activateLinked(next, patientKey(tail), settings);
  return { next, record: waiting, first: false };
}
// 앞 진료 설명 완료 → 뒤 진료 시작: 접수·시력/안압·오늘 한 검사·점안 기록을 이어받습니다.
export function activateLinked(list, pk, settings, at = Date.now()) {
  const primary = list.find(x => patientKey(x) === pk);
  if (!primary) return list;
  return list.map(x => {
    if (!x.linkWaiting || x.primaryKey !== pk) return x;
    const done = { ...x.done }, doneAt = { ...x.doneAt };
    Object.entries(primary.done || {}).forEach(([k, v]) => { if (v) { done[k] = true; doneAt[k] = primary.doneAt?.[k] ?? null; } });
    const check = x.linkType === 'added' ? settings?.linkCheckAdded !== false : !!settings?.linkCheckPlanned;
    return {
      ...x, linkWaiting: false, linkActivatedAt: at,
      checkin: primary.checkin || nowHHMM(), late: false,
      queueKey: timeToMin(x.reservation || nowHHMM()),
      done, doneAt,
      measure: x.measure || primary.measure,
      drops: (x.drops || []).some(Boolean) ? x.drops : [...(primary.drops || [])],
      addOnCheck: check, triageAssigned: false, triageDone: false,
    };
  });
}
// 설명 완료를 되돌리면, 아직 아무 진행이 없는 뒤 진료는 다시 대기로
export function deactivateLinked(list, pk) {
  return list.map(x => (x.primaryKey === pk && !x.linkWaiting && x.linkActivatedAt && !x.triageAssigned && !x.seen && !x.calledRoom && !x.consultDone
    ? { ...x, linkWaiting: true, linkActivatedAt: null, checkin: '', addOnCheck: false }
    : x));
}
// 기록을 지울 때, 그 기록을 기다리던 뒤 진료는 한 단계 앞으로
export function removeVisit(list, pk) {
  const gone = list.find(x => patientKey(x) === pk);
  if (!gone) return list;
  return list.filter(x => x !== gone).map(x => {
    if (x.primaryKey !== pk) return x;
    if (gone.primaryKey) return { ...x, primaryKey: gone.primaryKey, primaryDoctor: gone.primaryDoctor };
    const { primaryKey, primaryDoctor, ...rest } = x;
    return { ...rest, linkWaiting: false };
  });
}
// 미리 예정된 두 진료의 순서 바꾸기 (둘 다 접수 전일 때)
export function swapLinkOrder(list, waitingKey, prefs) {
  const w = list.find(x => patientKey(x) === waitingKey);
  const first = w && list.find(x => patientKey(x) === w.primaryKey);
  if (!w || !first || first.checkin || first.primaryKey) return list;
  const { primaryKey, primaryDoctor, ...rest } = w;
  const newFirst = unionPlan({ ...rest, linkWaiting: false }, first, prefs);
  const newSecond = { ...first, linkWaiting: true, primaryKey: waitingKey, primaryDoctor: w.doctor, linkType: w.linkType };
  return list.map(x => {
    if (x === w) return newFirst;
    if (x === first) return newSecond;
    if (x.primaryKey === waitingKey) return { ...x, primaryKey: patientKey(first), primaryDoctor: first.doctor };
    return x;
  });
}
// 이름·환자번호는 같은 날 같은 환자의 모든 진료에, 예약시간은 이 진료에만 적용합니다.
export function editPatientInfo(list, pk, { id, name, reservation }) {
  const rec = list.find(x => patientKey(x) === pk);
  if (!rec) return list;
  const newId = String(id || '').trim() || rec.id;
  if (newId !== rec.id && list.some(x => x.id === newId && x.date === rec.date)) return list;
  const keyMap = new Map();
  const next = list.map(x => {
    if (x.id !== rec.id || x.date !== rec.date) return x;
    let y = { ...x, id: newId, name: String(name || '').trim() || x.name };
    if (x === rec && reservation !== undefined && reservation !== x.reservation) {
      y = x.checkin ? { ...y, reservation } : { ...y, reservation, queueKey: timeToMin(reservation) };
    }
    keyMap.set(patientKey(x), patientKey(y));
    return y;
  });
  return next.map(x => (x.primaryKey && keyMap.has(x.primaryKey) ? { ...x, primaryKey: keyMap.get(x.primaryKey) } : x));
}

// 명단을 다시 올려도 이미 있는 환자의 진행 상황·검사 지정은 그대로 두고, 예약시간만 새 값으로 바꿉니다.
// 이미 접수한 환자는 대기 순서(직접 끌어서 바꾼 순서 포함)를 건드리지 않고 예약시간 글자만 바꿉니다.
// 같은 날 다른 교수님 명단에 이미 있으면 2차 진료로 연결합니다.
export function mergePatientList(prev, news, prefs, settings) {
  const stats = { added: [], timeChanged: [], unchanged: [], linked: [] };
  let list = prev;
  news.forEach(np => {
    const group = visitGroup(list, np.id, np.date);
    if (!group.length) { list = [...list, np]; stats.added.push(np); return; }
    const old = group.find(x => x.doctor === np.doctor);
    if (!old) {
      const r = addLinkedVisit(list, np, prefs, settings);
      list = r.next;
      stats.linked.push({ ...r.record, others: group.map(x => x.doctor), first: r.first });
      return;
    }
    if (np.reservation && np.reservation !== old.reservation) {
      list = list.map(x => (x !== old ? x : old.checkin
        ? { ...old, reservation: np.reservation }
        : { ...old, reservation: np.reservation, queueKey: timeToMin(np.reservation) }));
      stats.timeChanged.push({ ...old, newReservation: np.reservation });
      return;
    }
    stats.unchanged.push(old);
  });
  return { next: list, stats };
}
// 이전 정보(FU)로 검사·산동·CR이 붙은 환자인지
export function hasFollowupApplied(p) {
  return Object.entries(p.assigned || {}).some(([k, v]) => v && k !== VISION_KEY) || typeof p.dilateOverride === 'boolean' || !!p.cr;
}
// 재진인데 오늘 할 검사(CR 포함)가 하나도 없는 환자 → 프로그램 도입 전 환자일 가능성이 높아 확인 필요
export function needsTestCheck(p, prefs) {
  if (p.consultDone) return false;
  if (p.fuMissing) return true; // 지난 진료에서 FU 를 나중에 정하기로 하고 아직 안 정함
  if (p.firstVisit || p.linkType === 'added') return false;
  if (Object.entries(p.assigned || {}).some(([k, v]) => v && k !== VISION_KEY)) return false;
  return !crActive(p, prefs);
}

// 지각: 직원 [접수]는 자동으로 정하지 않고 카드의 [지각]으로 표시합니다 (접수 전에 고른 값 유지).
// 바코드 접수(autoLate)만 찍은 시각이 예약 + 유예시간보다 늦으면 자동으로 지각입니다.
// 지각 환자는 제시간 환자들 뒤로 갑니다.
export function lateQueueKey(p, late) {
  return (late ? 100000 : 0) + timeToMin(p.reservation) + timeToMin(p.checkin) / 10000;
}
export function applyCheckin(p, { autoLate = false, graceMin = 0 } = {}) {
  const checkin = nowHHMM();
  const late = autoLate
    ? !!p.late || (!!p.reservation && timeToMin(checkin) > timeToMin(p.reservation) + (Number(graceMin) || 0))
    : !!p.late;
  let next = { ...p, checkin, late, queueKey: lateQueueKey({ ...p, checkin }, late) };
  // 명단 관리에서 '시력검사 없이 바로 진료'로 정한 환자는 접수하자마자 시력/안압을 건너뜁니다.
  if (p.skipVision && !p.done?.[VISION_KEY]) {
    next = {
      ...next,
      assigned: { ...next.assigned, ...Object.fromEntries(VISION_TEST_IDS.map(id => [id, false])) },
      done: { ...next.done, [VISION_KEY]: true },
      doneAt: { ...(next.doneAt || {}), [VISION_KEY]: Date.now() },
      visionSkipped: true,
    };
  }
  return next;
}
export function setLate(p, late) {
  return p.checkin ? { ...p, late, queueKey: lateQueueKey(p, late) } : { ...p, late };
}
export function undoCheckin(p) {
  if (!p.checkin || p.consultDone || activeVf(p)) return p;
  if (p.done?.[VISION_KEY] && !p.visionSkipped) return p;
  const undone = { ...p, checkin: '', late: false, queueKey: timeToMin(p.reservation) };
  if (!p.visionSkipped) return undone;
  return { ...undone, done: { ...p.done, [VISION_KEY]: false }, doneAt: { ...(p.doneAt || {}), [VISION_KEY]: null }, visionSkipped: false };
}

export function updateTodayTests(p, tests, sel, detail) {
  if (p.consultDone || activeVf(p)) return p;
  const assigned = { ...p.assigned }, done = { ...p.done }, doneAt = { ...p.doneAt };
  const nextDetail = { ...p.detail };
  tests.forEach(t => {
    assigned[t.id] = !!sel[t.id];
    if (!sel[t.id]) { done[t.id] = false; doneAt[t.id] = null; delete nextDetail[t.id]; }
    else if (detail?.[t.id]) nextDetail[t.id] = detail[t.id];
    else delete nextDetail[t.id];
  });
  return { ...p, assigned, done, doneAt, detail: nextDetail };
}

// 보이는 목록(list, queueKey 순) 안에서 pk 환자를 toIndex 자리로 옮김
export function moveInQueue(mutatePatients, list, pk, toIndex) {
  const from = list.findIndex(p => patientKey(p) === pk);
  if (from < 0 || toIndex === from || toIndex < 0 || toIndex >= list.length) return;
  const rest = list.filter(p => patientKey(p) !== pk);
  const before = rest[toIndex - 1];
  const after = rest[toIndex];
  let newKey;
  if (before && after) newKey = (before.queueKey + after.queueKey) / 2;
  else if (before) newKey = before.queueKey + 0.5;
  else if (after) newKey = after.queueKey - 0.5;
  else return;
  mutatePatients(prev => prev.map(p => (patientKey(p) === pk ? { ...p, queueKey: newKey } : p)));
}

/* 시력·안압 값 */
export function emptyMeasure() {
  return { ucva: { od: '', os: '' }, bcva: { od: '', os: '' }, autoV: false, nct: { od: '', os: '' }, gat: { od: '', os: '' } };
}
export function normalizeMeasure(m) {
  const e = emptyMeasure();
  if (!m) return e;
  MEASURE_FIELDS.forEach(({ key }) => {
    e[key] = { od: String(m[key]?.od ?? ''), os: String(m[key]?.os ?? '') };
  });
  e.autoV = !!m.autoV;
  return e;
}
export function hasAnyValue(m) {
  return !!m && MEASURE_FIELDS.some(({ key }) => String(m[key]?.od ?? '').trim() || String(m[key]?.os ?? '').trim());
}
export function fieldText(m, key) {
  const od = String(m?.[key]?.od ?? '').trim();
  const os = String(m?.[key]?.os ?? '').trim();
  if (!od && !os) return '';
  return `${od || '-'} / ${os || '-'}`;
}
export function hasFieldValue(m, fields) {
  return fields.some(k => fieldText(m, k));
}
export function hasIop(p) {
  return !!(String(p.measure?.nct?.od ?? '').trim() || String(p.measure?.nct?.os ?? '').trim() || p.assigned?.[GAT_ID]);
}
export function hasVisionValue(m) {
  return ['ucva', 'bcva'].some(f => ['od', 'os'].some(e => String(m?.[f]?.[e] ?? '').trim()));
}
export function previousMeasure(p, history) {
  if (hasAnyValue(p.prevManual)) return { ...p.prevManual, source: 'manual' };
  const list = Array.isArray(history?.[p.id]) ? history[p.id] : [];
  return list.find(r => r.date < p.date) || null;
}
// 환자번호별로 최근 3회 측정 기록만 보관. 같은 날짜는 필드 단위로 합침
export function mergeHistory(prev, id, date, patch) {
  const list = Array.isArray(prev[id]) ? prev[id] : [];
  const existing = list.find(r => r.date === date);
  const merged = { ...normalizeMeasure(existing), ...patch, date };
  const others = list.filter(r => r.date !== date);
  const nextList = (hasAnyValue(merged) ? [merged, ...others] : others)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);
  const next = { ...prev };
  if (nextList.length) next[id] = nextList; else delete next[id];
  return next;
}

/* 검사 세부 종류·눈·프로토콜 */
export const EYE_OPTIONS = [
  { key: 'OU', label: '양안' },
  { key: 'OD', label: '우안 (OD)' },
  { key: 'OS', label: '좌안 (OS)' },
];
export function normalizeTests(tests) {
  return tests.map(({ noteEnabled, ...t }) => {
    const options = Array.isArray(t.options) ? t.options : (t.id === 'oct' ? DEFAULT_OCT_OPTIONS : []);
    // 이전 버전의 '참고사항 칸'은 VF에만 기본으로 켜져 있었으므로, 직접 켠 다른 항목(예: 연구)만 팝업 유지
    const popupOnClick = typeof t.popupOnClick === 'boolean'
      ? t.popupOnClick
      : options.length > 0 || (!!noteEnabled && t.id !== 'vf');
    const machine = typeof t.machine === 'string' ? t.machine : (t.id === 'oct' ? 'OCT' : '');
    return { ...t, options, popupOnClick, machine };
  });
}
export function cleanDetail(d) {
  return {
    options: Array.isArray(d?.options) ? d.options.filter(Boolean) : [],
    note: String(d?.note ?? ''),
    eye: ['OU', 'OD', 'OS'].includes(d?.eye) ? d.eye : 'OU',
    eyes: Object.fromEntries(['md', 'angio'].filter(k => ['OU', 'OD', 'OS'].includes(d?.eyes?.[k])).map(k => [k, d.eyes[k]])),
  };
}
export function octEyeGroups(t) {
  if (!t.optionEyeGroups && !/oct/i.test(`${t.id} ${t.short} ${t.name}`)) return [];
  const options = t.options || [];
  const md = options.filter(o => (t.optionEyeGroups?.[o] ?? (/macular|disc|^(m|d)$/i.test(o.trim()) ? 'md' : '')) === 'md');
  const angio = options.filter(o => (t.optionEyeGroups?.[o] ?? (/angio|octa|^a$/i.test(o.trim()) ? 'angio' : '')) === 'angio');
  return md.length && angio.length ? [{ key: 'md', label: 'M,D OCT', options: md }, { key: 'angio', label: 'OCTA', options: angio }] : [];
}
export function renameTestOptions(t, options) {
  const groups = Object.fromEntries(octEyeGroups(t).flatMap(g => g.options.map(o => [o, g.key])));
  const mapping = { ...groups, ...t.optionEyeGroups };
  const aliases = { ...t.optionAliases };
  const nextGroups = {};
  options.forEach((o, i) => {
    const old = (t.options || [])[i];
    nextGroups[o] = mapping[o] ?? (old && !options.includes(old) ? mapping[old] : undefined) ?? 'default';
    if (old && old !== o && !options.includes(old)) {
      Object.keys(aliases).forEach(k => { if (aliases[k] === old) aliases[k] = o; });
      aliases[old] = o;
    }
  });
  return { ...t, options, optionEyeGroups: nextGroups, optionAliases: aliases };
}
export function detailEye(d, key) { return d.eyes?.[key] || d.eye; }
export function octOptionCode(option) {
  const value = String(option).trim().toLowerCase();
  if (['m', 'macular'].includes(value)) return 'M';
  if (['d', 'disc'].includes(value)) return 'D';
  if (['a', 'angio', 'octa'].includes(value)) return 'A';
  return null;
}
export function orderedOptions(t, d) {
  const isOct = octEyeGroups(t).length > 0;
  const chosen = [...new Set(cleanDetail(d).options.map(o => {
    const renamed = t?.optionAliases?.[o] || o;
    if (!isOct || (t.options || []).includes(renamed)) return renamed;
    const code = octOptionCode(renamed);
    return (code && (t.options || []).find(current => octOptionCode(current) === code)) || renamed;
  }))];
  const known = (t?.options || []).filter(o => chosen.includes(o));
  return [...known, ...chosen.filter(o => !known.includes(o))];
}
export function testLabelWithOptions(t, d) {
  const opts = orderedOptions(t, d);
  const detail = cleanDetail(d);
  const groups = octEyeGroups(t);
  if (groups.length) {
    const labels = groups.filter(g => g.options.some(o => opts.includes(o))).map(g => {
      const eye = detailEye(detail, g.key);
      const eyeLabel = eye === 'OU' ? '양안' : eye === 'OD' ? '우안' : '좌안';
      if (g.key === 'angio') return `OCTA(${eyeLabel})`;
      const selected = g.options.filter(o => opts.includes(o)).map(o => /^macular$/i.test(o) ? 'M' : /^disc$/i.test(o) ? 'D' : o);
      return `OCT: ${selected.join(',')}(${eyeLabel})`;
    });
    const other = opts.filter(o => !groups.some(g => g.options.includes(o)));
    if (other.length) labels.push(`${t.short}: ${other.join(', ')} (${detail.eye === 'OU' ? '양안' : detail.eye + '만'})`);
    if (labels.length) return labels.join(' / ');
  }
  const eye = cleanDetail(d).eye;
  let label = opts.length ? `${t.short}: ${opts.join(', ')}` : t.short;
  if (eye !== 'OU') label += ` (${eye}만)`;
  return label;
}
export function octEyeSummary(t, value) {
  const d = cleanDetail(value), selected = orderedOptions(t, d);
  return octEyeGroups(t).filter(g => g.options.some(o => selected.includes(o))).map(g => `${g.key === 'md' ? 'OCT' : 'OCTA'} ${detailEye(d, g.key) === 'OU' ? '양안' : detailEye(d, g.key) === 'OD' ? '우안' : '좌안'}`).join(' / ');
}
// 체크된 검사 중 세부 종류·단안·프로토콜이 있는 것만 남김
export function pickDetail(detailMap, sel, tests) {
  const out = {};
  tests.forEach(t => {
    if (!sel[t.id]) return;
    const d = cleanDetail(detailMap?.[t.id]);
    const keep = {
      options: (t.options || []).length ? orderedOptions(t, d) : [],
      note: d.note.trim(),
      eye: d.eye,
      eyes: d.eyes,
    };
    if (keep.options.length || keep.note || keep.eye !== 'OU' || Object.keys(keep.eyes).length) out[t.id] = keep;
  });
  return out;
}
export function notesOf(p, tests) {
  return tests
    .filter(t => p.assigned?.[t.id] && String(p.detail?.[t.id]?.note ?? '').trim())
    .map(t => ({ id: t.id, short: t.short, note: String(p.detail[t.id].note).trim() }));
}
export function toDraft(settings) {
  return JSON.parse(JSON.stringify({
    ...settings,
    tests: settings.tests.map(t => ({ ...renameTestOptions(t, t.options || []), optionsText: (t.options || []).join(', ') })),
  }));
}
export function parseOptions(text) {
  return Array.from(new Set(String(text || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean)));
}

// 엑셀 명단: 위쪽 10줄 안에서 제목 줄을 찾아 제목 이름으로 칸을 고르므로, 칸 순서가 달라도 됩니다.
// 제목은 아래 5가지와 정확히 같아야 합니다 (앞뒤 띄어쓰기만 무시). 다른 칸(진단명 등)은 읽지 않습니다.
export const ROSTER_HEADERS = { id: '환자번호', name: '환자명', reservation: '예약', visit: '초재진', doctor: '진료의' };
export function rosterColumns(row) {
  const cols = {};
  row.forEach((cell, i) => {
    const h = String(cell ?? '').trim();
    Object.entries(ROSTER_HEADERS).forEach(([k, name]) => { if (cols[k] === undefined && h === name) cols[k] = i; });
  });
  return cols;
}
export function readRoster(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // 환자번호·이름은 엑셀 화면에 보이는 글자 그대로 읽습니다 (예: 앞자리 0 유지)
  const shown = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const hi = raw.slice(0, 10).findIndex(r => { const c = rosterColumns(r); return c.id !== undefined && c.name !== undefined; });
  if (hi < 0) return null;
  const cols = rosterColumns(raw[hi]);
  const rows = raw.slice(hi + 1).map((r, j) => {
    const view = shown[hi + 1 + j] || [];
    const text = (k) => (cols[k] === undefined ? '' : String(view[cols[k]] ?? r[cols[k]] ?? '').trim());
    return {
      id: text('id'),
      name: text('name'),
      reservation: cols.reservation === undefined ? '' : normalizeTime(r[cols.reservation]),
      firstVisit: !text('visit').includes('재진'), // '재진'이 아니면 모두 초진
      doctorText: text('doctor'),
    };
  }).filter(r => r.id);
  return { cols, rows };
}
// 엑셀의 진료의를 교수 관리에 등록된 이름과 맞춤 ('교수', 띄어쓰기, 괄호 안 글자는 무시)
export function doctorKey(v) {
  return String(v ?? '').replace(/\(.*?\)/g, '').replace(/교수님?|선생님|\s/g, '');
}
export function matchDoctor(text, doctors) {
  const t = doctorKey(text);
  if (!t) return null;
  const exact = doctors.filter(d => doctorKey(d) === t);
  if (exact.length === 1) return exact[0];
  const part = doctors.filter(d => doctorKey(d) && t.includes(doctorKey(d)));
  return part.length === 1 ? part[0] : null;
}

export function sampleRows() {
  return [
    { id: '10001', name: '김민수', reservation: '09:00' },
    { id: '10002', name: '이서연', reservation: '09:00' },
    { id: '10003', name: '박지훈', reservation: '09:10' },
    { id: '10004', name: '최유진', reservation: '09:20' },
    { id: '10005', name: '정하늘', reservation: '09:30' },
  ];
}

export function treatRoomOf(settings) {
  return settings.rooms.find(r => r.builtin === 'treat') || TREAT_ROOM;
}
// 처치실은 고정 검사실(builtin: 'treat')입니다. 여기 둔 검사(예: Syringing)는 진료 전에 처치실 화면에서 합니다.
export const TREAT_ROOM = { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' };
// 초진이면 무조건 History 필요. FU가 길어 초진으로 올라온 환자는 재진으로, 재진인데 필요하면 초진으로 고치면 됨
export function hxNeeded(p) {
  return !!p.firstVisit;
}
