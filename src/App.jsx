import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Eye, Camera, Stethoscope, Monitor, Settings, ClipboardList, Check, Plus,
  ChevronUp, ChevronDown, Activity, AlertTriangle, Upload, Trash2, Search, GripVertical, RotateCcw, Syringe,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* 색상                                                                */
/* ------------------------------------------------------------------ */
const COLOR_MAP = {
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
const ROOM_PALETTE = ['teal', 'violet', 'rose', 'sky', 'emerald', 'indigo'];
const INPUT = 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white';

/* ------------------------------------------------------------------ */
/* 기본 설정                                                           */
/* ------------------------------------------------------------------ */
const VISION_KEY = 'visionIop';
const GAT_ID = 'gat';
const VISION_TEST = { id: VISION_KEY, name: '시력/안압', short: '시력/안압' };
const ARK_TEST = { id: 'ark', name: 'ARK', short: 'ARK', roomId: 'vision', order: 0, builtin: 'ark', options: [], popupOnClick: false, machine: '' };
const GAT_TEST = { id: GAT_ID, name: '안압 (GAT)', short: 'GAT', roomId: 'B', order: 3, builtin: 'gat', options: [], popupOnClick: false };
const DEFAULT_OCT_OPTIONS = ['Macular', 'Disc', 'Angio'];

const DEFAULT_SETTINGS = {
  rooms: [
    { id: 'B', name: 'WFP · OCT · VF 검사실', patientName: '정밀검사실', showPriority: true },
    { id: 'C', name: 'IDRA 검사실', patientName: '안구건조증 검사실', showPriority: false },
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
  dilationWaitMin: 15,
  lateGraceMin: 0,
  // 같은 날 2차 진료(다른 교수님)로 넘어갈 때 처치실에서 추가 검사를 확인할지
  linkCheckAdded: true,    // 진료 중에 추가된 2차 진료
  linkCheckPlanned: false, // 미리 명단에 예정된 2차 진료
};
const PERFORMER_LABEL = { prof: '교수님', resident: '전공의' };

const MEASURE_FIELDS = [
  { key: 'ucva', label: '나안' },
  { key: 'bcva', label: '교정' },
  { key: 'nct', label: 'NCT' },
  { key: 'gat', label: 'GAT' },
];

// 드래그 중에는 다른 컴퓨터의 변경을 화면에 반영하지 않음 (끌던 카드가 튀지 않도록)
let DRAG_ACTIVE = false;

/* ------------------------------------------------------------------ */
/* 순수 헬퍼                                                           */
/* ------------------------------------------------------------------ */
function maskName(name) {
  if (!name) return '';
  const chars = Array.from(name);
  if (chars.length <= 1) return chars.join('');
  if (chars.length === 2) return `${chars[0]}*`;
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
}

function timeToMin(t) {
  if (!t) return 0;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function normalizeTime(v) {
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

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// 같은 날 두 번째 교수님 진료(2차 진료)는 visit 2, 3… 으로 따로 기록합니다.
function patientKey(p) { return `${p.id}::${p.date}${p.visit > 1 ? `::${p.visit}` : ''}`; }
function byQueue(a, b) { return a.queueKey - b.queueKey; }

function roomColor(settings, roomId) {
  const i = settings.rooms.findIndex(r => r.id === roomId);
  return ROOM_PALETTE[Math.max(i, 0) % ROOM_PALETTE.length];
}

function roomTests(settings, roomId) {
  return settings.tests.filter(t => t.roomId === roomId).sort((a, b) => a.order - b.order);
}

function sortedTests(settings) {
  const idx = (id) => settings.rooms.findIndex(r => r.id === id);
  return [...settings.tests]
    .filter(t => t.roomId === 'vision' || idx(t.roomId) >= 0)
    .sort((a, b) => (idx(a.roomId) - idx(b.roomId)) || (a.order - b.order));
}

// 검사 선택 창(추가 검사·설명 완료·검사 지정·FU 지정)의 검사 순서. 설정에서 정한 순서가 없으면 검사실 순서.
function orderForPicking(tests, settings) {
  const order = Array.isArray(settings?.pickOrder) ? settings.pickOrder : [];
  const pos = (t) => { const i = order.indexOf(t.id); return i < 0 ? order.length + tests.indexOf(t) : i; };
  return [...tests].sort((a, b) => pos(a) - pos(b));
}

/* 검사 처방: 검사실에서 전산 처방을 넣은 뒤 [처방 완료]를 누릅니다 (직원 화면에만 표시).
   처방 완료 뒤 이 검사실 검사가 새로 추가되거나 다시 하게 되면 '처방 전'으로 돌아갑니다. */
function orderState(p, settings, roomId) {
  const needed = roomTests(settings, roomId).filter(t => p.assigned?.[t.id] && !p.done?.[t.id]);
  const rec = p.orders?.[roomId];
  const covered = rec?.tests || [];
  const missing = needed.filter(t => !covered.includes(t.id));
  return { needed, rec, missing, complete: needed.length > 0 && missing.length === 0 };
}
// 검사를 새로(또는 다시) 지정하면 그 검사의 처방 완료 표시를 지웁니다
function clearOrders(p, testIds) {
  if (!p.orders || !testIds.length) return p.orders;
  return Object.fromEntries(Object.entries(p.orders).map(([room, rec]) => [room, { ...rec, tests: (rec.tests || []).filter(id => !testIds.includes(id)) }]));
}

function pendingTests(p, settings, roomId) {
  return roomTests(settings, roomId).filter(t => p.assigned?.[t.id] && !p.done?.[t.id]);
}

// 시력/안압을 마쳤고, 초진이면 처치실에서 검사 지정까지 마친 상태 → 검사실로 갈 수 있음
function visionComplete(p) {
  return !!p.done?.[VISION_KEY] && (!p.assigned?.ark || !!p.done?.ark);
}
function pastVision(p) {
  return !!p.checkin && visionComplete(p) && (!(p.firstVisit || p.addOnCheck) || !!p.triageAssigned || !!p.triageDone);
}

function roomPending(p, settings, roomId) {
  return pastVision(p) && pendingTests(p, settings, roomId).length > 0;
}

function pendingRooms(p, settings) {
  return settings.rooms.filter(r => roomPending(p, settings, r.id));
}

// 지정된 검사를 모두 마침
function testsComplete(p, settings) {
  if (!pastVision(p) || activeVf(p)) return false;
  return sortedTests(settings).every(t => !p.assigned?.[t.id] || p.done?.[t.id]);
}

// 진료 받을 준비가 됨 (검사 모두 완료, 초진이면 예진까지 완료)
function allDone(p, settings) {
  return testsComplete(p, settings) && (!p.firstVisit || p.triageRequired === false || !!p.triageDone);
}

/* 진료 흐름 단계 */
// 초진: 시력/안압 후 처치실에서 검사 지정 대기
// 2차 진료: 1차 진료 설명 완료 후 처치실에서 추가 검사 확인 대기 (설정에서 켠 경우)
function needsTriageAssign(p) {
  return !p.consultDone && !!p.checkin && visionComplete(p) && !!(p.firstVisit || p.addOnCheck) && !p.triageAssigned && !p.triageDone;
}
// 초진: 검사를 모두 마치고(또는 검사 없음) 처치실 처치 대기에서 예진 대기
function needsTriageExam(p, settings) {
  return !p.consultDone && !!p.firstVisit && p.triageRequired !== false && !p.triageDone && testsComplete(p, settings);
}
// 진료실에서 '처치실 확인 요청'으로 보낸 환자
function treatRequested(p) {
  return !p.consultDone && !!p.treatRequest;
}
function inTreatRoom(p, settings) {
  return needsTriageAssign(p) || needsTriageExam(p, settings) || inResidentProcedure(p) || treatRequested(p);
}
function pendingProcedures(p, performer) {
  return (p.procedures || []).filter(x => !x.done && (!performer || x.performer === performer));
}
function inProfProcedure(p) {
  return !p.consultDone && pendingProcedures(p, 'prof').length > 0;
}
function inResidentProcedure(p) {
  return !p.consultDone && pendingProcedures(p, 'prof').length === 0 && pendingProcedures(p, 'resident').length > 0;
}
function awaitingExplain(p) {
  return !p.consultDone && !!p.seen && pendingProcedures(p).length === 0;
}
function inConsult(p) {
  return !p.consultDone && !p.seen && !!p.calledRoom;
}
function consultWaiting(p, settings) {
  return !p.consultDone && !p.seen && !p.calledRoom && !p.treatRequest && allDone(p, settings);
}

function getStage(p, settings) {
  if (p.consultDone) return { label: '완료', area: 'done' };
  if (p.linkWaiting) return { label: `${p.primaryDoctor || '1차'} 진료 후 대기 (2차 진료)`, area: 'linked' };
  if (!p.checkin) return { label: '접수 대기', area: 'reception' };
  if (!visionComplete(p)) return { label: '시력/안압 검사 대기', area: 'vision' };
  if (treatRequested(p)) return { label: '처치실 대기 (진료실 요청 확인)', area: 'treatReq' };
  if (needsTriageAssign(p)) return { label: p.firstVisit ? '처치실 대기 (초진 검사 지정)' : '처치실 대기 (2차 진료 추가 검사 확인)', area: 'triage' };
  if (activeVf(p)) return { label: 'VF 검사 중 · 다른 장비 호출 금지', area: 'exam' };
  const rooms = pendingRooms(p, settings);
  if (rooms.length) return { label: `${rooms.map(r => r.name).join(', ')} 검사 대기`, area: 'exam' };
  if (needsTriageExam(p, settings)) return { label: '처치실 대기 (예진)', area: 'triageExam' };
  if (inProfProcedure(p)) return { label: '교수님 처치 대기', area: 'profProc' };
  if (inResidentProcedure(p)) return { label: '처치실 대기 (처치)', area: 'resProc' };
  if (p.seen) return { label: '설명 대기', area: 'explain' };
  if (p.calledRoom) return { label: `${p.calledRoom} 진료 중`, area: 'inRoom' };
  return { label: '진료 대기', area: 'consult' };
}

/* 산동 */
const DILATE_EYE_LABEL = { OD: '우안 (OD)', OS: '좌안 (OS)' };
function dilateEyeOf(value) { return ['OD', 'OS'].includes(value) ? value : undefined; }
function needsDilation(p, prefs) {
  if (typeof p.dilateOverride === 'boolean') return p.dilateOverride;
  return !!prefs?.[p.doctor]?.dilate;
}
function crActive(p, prefs) {
  return !!p.cr && !!prefs?.[p.doctor]?.cr;
}
function dilationState(p, prefs, waitMin, now = Date.now()) {
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
function patchPatient(mutatePatients, pk, fn) {
  mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? { ...x, ...fn(x) } : x)));
}
function toggleDrop(mutatePatients, pk, i) {
  const at = Date.now();
  patchPatient(mutatePatients, pk, x => {
    const drops = [...(x.drops || [])];
    drops[i] = drops[i] ? null : at;
    return { drops };
  });
}

/* 검사실 상단 분류: 같은 장비끼리 묶기 */
// 상단 분류 이름: 직접 적은 값이 있으면 그것, 없으면 이름에 OCT가 들어간 검사는 모두 'OCT'로 묶음
function machineOf(t) {
  // OCT 계열은 장비 칸과 무관하게 집계만 통합. 검사 표시에는 short/name을 그대로 사용.
  if (/oct/i.test(`${t.id} ${t.short || ''} ${t.name || ''}`)) return 'OCT';
  return String(t.machine || '').trim() || t.short || t.name;
}
function machineGroups(tests) {
  const groups = [];
  tests.forEach(t => {
    const key = machineOf(t);
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, tests: [] }; groups.push(g); }
    g.tests.push(t);
  });
  return groups;
}
function groupPending(p, g) {
  if (activeVf(p)) return false;
  return g.tests.some(t => p.assigned?.[t.id] && !p.done?.[t.id]);
}

// 진행 중인 VF는 환자에 저장하여 검사실 간 공유한다.
function isVfTest(t) {
  return t.id === 'vf' || /\bVF\b/i.test(t.short || '') || /시야|\bVF\b/i.test(t.name || '');
}
function activeVf(p) {
  return p.vfInProgress && p.assigned?.[p.vfInProgress] && !p.done?.[p.vfInProgress] ? p.vfInProgress : null;
}
function updateVf(p, key, action, at) {
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

function followupForDoctor(record, doctor) {
  return record?.byDoctor?.[doctor] || (!record?.doctor || record.doctor === doctor ? record : undefined);
}
function saveFollowup(prev, id, doctor, value) {
  const old = prev[id] || {};
  const byDoctor = { ...old.byDoctor };
  if (old.doctor && !byDoctor[old.doctor]) { const { byDoctor: ignored, ...legacy } = old; byDoctor[old.doctor] = legacy; }
  const next = { ...value, doctor };
  if (doctor) byDoctor[doctor] = next;
  return { ...prev, [id]: { ...next, name: value.name || old.name, byDoctor } };
}
// 한 교수님의 FU 지정만 지웁니다. 다른 교수님 기록이 남아 있으면 그중 가장 최근 것이 대표 기록이 됩니다.
function deleteFollowup(prev, id, doctor) {
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
// FU 지정 관리에 보여줄 줄: 교수님별로 한 줄씩
function followupRows(id, record) {
  const entries = Object.entries(record?.byDoctor || {});
  if (entries.length) return entries.map(([doctor, fu]) => ({ id, doctor, fu }));
  return [{ id, doctor: record?.doctor || '', fu: record }];
}

// 이름이 없는 FU 기록에 명단의 환자 이름을 채웁니다 (예전에 저장된 기록용)
function fillFollowupNames(prev, list) {
  let changed = false;
  const next = { ...prev };
  list.forEach(p => {
    if (p?.id && p.name && next[p.id] && !next[p.id].name) { next[p.id] = { ...next[p.id], name: p.name }; changed = true; }
  });
  return changed ? next : prev;
}
function buildPatient(raw, fuMap, settings) {
  const fu = followupForDoctor(fuMap[raw.id], raw.doctor);
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
    cr: !!fu?.cr,
    drops: [],
    procedures: [],
    triageAssigned: false,
    triageDone: false,
    seen: false,
    ignoredFuToday: false,
    consultDone: false,
    consultHold: false,
    calledRoom: null,
  };
}

/* 같은 날 두 교수님 진료 (2차 진료) */
// 교수님마다 기록을 따로 두고, 뒤 진료(linkWaiting)는 앞 진료(primaryKey)의 설명 완료 뒤에 시작합니다.
// - 미리 예정(planned): 1차 진료 전에 두 교수님 검사를 한 번에 합니다. 예약시간이 빠른 교수님이 1차.
// - 진료 중 추가(added): 1차 진료 설명 완료 후 (설정에 따라) 처치실에서 추가 검사를 확인합니다.
function visitGroup(list, id, date) {
  return list.filter(x => x.id === id && x.date === date);
}
function linkTail(group) {
  const pointed = new Set(group.map(x => x.primaryKey).filter(Boolean));
  return group.find(x => !pointed.has(patientKey(x))) || group[group.length - 1];
}
// 뒤 진료의 검사·산동을 앞 진료에 합칩니다 (검사를 한 번에 하기 위해)
function unionPlan(first, other, prefs) {
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
function addLinkedVisit(list, np, prefs, settings) {
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
function activateLinked(list, pk, settings, at = Date.now()) {
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
function deactivateLinked(list, pk) {
  return list.map(x => (x.primaryKey === pk && !x.linkWaiting && x.linkActivatedAt && !x.triageAssigned && !x.seen && !x.calledRoom && !x.consultDone
    ? { ...x, linkWaiting: true, linkActivatedAt: null, checkin: '', addOnCheck: false }
    : x));
}
// 기록을 지울 때, 그 기록을 기다리던 뒤 진료는 한 단계 앞으로
function removeVisit(list, pk) {
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
function swapLinkOrder(list, waitingKey, prefs) {
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
function editPatientInfo(list, pk, { id, name, reservation }) {
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
function mergePatientList(prev, news, prefs, settings) {
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
function hasFollowupApplied(p) {
  return Object.entries(p.assigned || {}).some(([k, v]) => v && k !== VISION_KEY) || typeof p.dilateOverride === 'boolean' || !!p.cr;
}
// 재진인데 오늘 할 검사(CR 포함)가 하나도 없는 환자 → 프로그램 도입 전 환자일 가능성이 높아 확인 필요
function needsTestCheck(p, prefs) {
  if (p.firstVisit || p.consultDone || p.linkType === 'added') return false;
  if (Object.entries(p.assigned || {}).some(([k, v]) => v && k !== VISION_KEY)) return false;
  return !crActive(p, prefs);
}

function applyCheckin(p, graceMin) {
  const checkin = nowHHMM();
  const reservationMin = timeToMin(p.reservation);
  const checkinMin = timeToMin(checkin);
  const late = !!p.reservation && checkinMin > reservationMin + (Number(graceMin) || 0);
  const queueKey = (late ? 100000 : 0) + reservationMin + checkinMin / 10000;
  return { ...p, checkin, late, queueKey };
}
function undoCheckin(p) {
  if (!p.checkin || p.done?.[VISION_KEY] || p.consultDone || activeVf(p)) return p;
  return { ...p, checkin: '', late: false, queueKey: timeToMin(p.reservation) };
}

function updateTodayTests(p, tests, sel, detail) {
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
function moveInQueue(mutatePatients, list, pk, toIndex) {
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
function emptyMeasure() {
  return { ucva: { od: '', os: '' }, bcva: { od: '', os: '' }, autoV: false, nct: { od: '', os: '' }, gat: { od: '', os: '' } };
}
function normalizeMeasure(m) {
  const e = emptyMeasure();
  if (!m) return e;
  MEASURE_FIELDS.forEach(({ key }) => {
    e[key] = { od: String(m[key]?.od ?? ''), os: String(m[key]?.os ?? '') };
  });
  e.autoV = !!m.autoV;
  return e;
}
function hasAnyValue(m) {
  return !!m && MEASURE_FIELDS.some(({ key }) => String(m[key]?.od ?? '').trim() || String(m[key]?.os ?? '').trim());
}
function fieldText(m, key) {
  const od = String(m?.[key]?.od ?? '').trim();
  const os = String(m?.[key]?.os ?? '').trim();
  if (!od && !os) return '';
  return `${od || '-'} / ${os || '-'}`;
}
function hasIop(p) {
  return !!(String(p.measure?.nct?.od ?? '').trim() || String(p.measure?.nct?.os ?? '').trim() || p.assigned?.[GAT_ID]);
}
function previousMeasure(p, history) {
  if (hasAnyValue(p.prevManual)) return { ...p.prevManual, source: 'manual' };
  const list = Array.isArray(history?.[p.id]) ? history[p.id] : [];
  return list.find(r => r.date < p.date) || null;
}
// 환자번호별로 최근 3회 측정 기록만 보관. 같은 날짜는 필드 단위로 합침
function mergeHistory(prev, id, date, patch) {
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
const EYE_OPTIONS = [
  { key: 'OU', label: '양안' },
  { key: 'OD', label: '우안 (OD)' },
  { key: 'OS', label: '좌안 (OS)' },
];
function normalizeTests(tests) {
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
function cleanDetail(d) {
  return {
    options: Array.isArray(d?.options) ? d.options.filter(Boolean) : [],
    note: String(d?.note ?? ''),
    eye: ['OU', 'OD', 'OS'].includes(d?.eye) ? d.eye : 'OU',
    eyes: Object.fromEntries(['md', 'angio'].filter(k => ['OU', 'OD', 'OS'].includes(d?.eyes?.[k])).map(k => [k, d.eyes[k]])),
  };
}
function octEyeGroups(t) {
  if (!t.optionEyeGroups && !/oct/i.test(`${t.id} ${t.short} ${t.name}`)) return [];
  const options = t.options || [];
  const md = options.filter(o => (t.optionEyeGroups?.[o] ?? (/macular|disc|^(m|d)$/i.test(o.trim()) ? 'md' : '')) === 'md');
  const angio = options.filter(o => (t.optionEyeGroups?.[o] ?? (/angio|octa|^a$/i.test(o.trim()) ? 'angio' : '')) === 'angio');
  return md.length && angio.length ? [{ key: 'md', label: 'M,D OCT', options: md }, { key: 'angio', label: 'OCTA', options: angio }] : [];
}
function renameTestOptions(t, options) {
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
function detailEye(d, key) { return d.eyes?.[key] || d.eye; }
function octOptionCode(option) {
  const value = String(option).trim().toLowerCase();
  if (['m', 'macular'].includes(value)) return 'M';
  if (['d', 'disc'].includes(value)) return 'D';
  if (['a', 'angio', 'octa'].includes(value)) return 'A';
  return null;
}
function orderedOptions(t, d) {
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
function testLabelWithOptions(t, d) {
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
function octEyeSummary(t, value) {
  const d = cleanDetail(value), selected = orderedOptions(t, d);
  return octEyeGroups(t).filter(g => g.options.some(o => selected.includes(o))).map(g => `${g.key === 'md' ? 'OCT' : 'OCTA'} ${detailEye(d, g.key) === 'OU' ? '양안' : detailEye(d, g.key) === 'OD' ? '우안' : '좌안'}`).join(' / ');
}
// 체크된 검사 중 세부 종류·단안·프로토콜이 있는 것만 남김
function pickDetail(detailMap, sel, tests) {
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
function notesOf(p, tests) {
  return tests
    .filter(t => p.assigned?.[t.id] && String(p.detail?.[t.id]?.note ?? '').trim())
    .map(t => ({ id: t.id, short: t.short, note: String(p.detail[t.id].note).trim() }));
}
function toDraft(settings) {
  return JSON.parse(JSON.stringify({
    ...settings,
    tests: settings.tests.map(t => ({ ...renameTestOptions(t, t.options || []), optionsText: (t.options || []).join(', ') })),
  }));
}
function parseOptions(text) {
  return Array.from(new Set(String(text || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean)));
}

function sampleRows() {
  return [
    { id: '10001', name: '김민수', reservation: '09:00' },
    { id: '10002', name: '이서연', reservation: '09:00' },
    { id: '10003', name: '박지훈', reservation: '09:10' },
    { id: '10004', name: '최유진', reservation: '09:20' },
    { id: '10005', name: '정하늘', reservation: '09:30' },
  ];
}

/* ------------------------------------------------------------------ */
/* 저장소 (window.storage, 공유)                                        */
/* ------------------------------------------------------------------ */
// 서버에 연결되지 않으면 오류를 그대로 던집니다. 빈 값으로 착각해 공유 데이터를 덮어쓰지 않기 위해서입니다.
// meta 를 넘기면 불러온 값의 버전을 담아 줍니다 (저장할 때 다른 컴퓨터와 겹쳤는지 확인용).
async function loadKey(key, fallback, meta) {
  const r = await window.storage.get(key, true);
  if (meta) meta.version = r?.version ?? 0;
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
}
async function saveKey(key, value, version) {
  await window.storage.set(key, JSON.stringify(value), true, version);
}
const loadDaily = (meta) => loadKey('daily-patients', [], meta);
const loadFu = (meta) => loadKey('fu-designations', {}, meta);
const loadDoctors = (meta) => loadKey('doctors', [], meta);
const loadHistory = (meta) => loadKey('measure-history', {}, meta);
const loadDoctorPrefs = (meta) => loadKey('doctor-prefs', {}, meta);

function ensureBuiltins(s) {
  s = { ...s, tests: s.tests.some(t => t.id === 'ark') ? s.tests.map(t => t.id === 'ark' ? { ...t, roomId: 'vision', builtin: 'ark' } : t) : [ARK_TEST, ...s.tests] };
  if (s.tests.some(t => t.id === GAT_ID)) {
    return { ...s, tests: s.tests.map(t => (t.id === GAT_ID ? { ...t, builtin: 'gat' } : t)) };
  }
  const room = s.rooms.find(r => r.id === 'B') || s.rooms[0];
  if (!room) return s;
  const max = Math.max(-1, ...s.tests.filter(t => t.roomId === room.id).map(t => t.order));
  return { ...s, tests: [...s.tests, { ...GAT_TEST, roomId: room.id, order: max + 1 }] };
}
async function loadSettings(meta) {
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
  };
}

// 실시간 명단에는 어제~앞으로의 날짜만 있습니다. 그보다 지난 명단은 서버가 월별 보관 파일로 옮깁니다.
function shiftISO(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function isArchivedDate(date) {
  return !!date && date < shiftISO(todayISO(), -1);
}
// 보관된 날짜를 고르면 그 달의 보관 명단을 한 번 불러옵니다 (보기 전용).
function useArchivedPatients(date) {
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
  return { isArchived, list: ready ? state.list : [], loading: isArchived && (!ready || state.loading), error: ready && state.error };
}

// 화면을 먼저 바꾸고, 저장은 뒤에서 순서대로 처리 (버튼이 즉시 반응하도록)
function useSharedStore(storageKey, loader, initial) {
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
            if (e?.conflict && attempt < 5) continue;
            throw e;
          }
          if (pending.current === 1) setValue(next);
          return next;
        }
      } finally {
        pending.current -= 1;
      }
    });
    queue.current = run.catch(() => undefined);
    return run;
  }, [storageKey, loader]);

  const mark = useCallback(() => seq.current, []);
  const sync = useCallback((incoming, startedAt) => {
    if (pending.current === 0 && !DRAG_ACTIVE && seq.current === startedAt) setValue(incoming);
  }, []);

  return [value, mutate, sync, mark];
}

/* ------------------------------------------------------------------ */
/* 공용 UI                                                             */
/* ------------------------------------------------------------------ */
/* 글씨 크기: 컴퓨터마다 따로 저장합니다 (화면 크기가 다르므로). '자동'은 창 너비에 맞춰 줄입니다. */
const TEXT_SIZE_KEY = 'ui-text-size';
const TEXT_SIZE_OPTIONS = [['auto', '자동'], ['0.7', '70%'], ['0.8', '80%'], ['0.9', '90%'], ['1', '100%'], ['1.1', '110%'], ['1.25', '125%'], ['1.5', '150%']];
function textScale(v) {
  if (v !== 'auto') return Number(v) || 1;
  return Math.max(0.75, Math.min(1, window.innerWidth / 1100));
}
function applyTextSize(v) {
  const scale = textScale(v);
  document.documentElement.style.fontSize = `${Math.round(scale * 1000) / 10}%`;
  // 80% 이하에서는 설명 문구(t-hint)를 숨깁니다
  if (scale <= 0.8) document.documentElement.dataset.compact = '1';
  else delete document.documentElement.dataset.compact;
}
function useTextSize() {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(TEXT_SIZE_KEY) || 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    const onChange = (e) => setValue(e.detail);
    window.addEventListener('ui-text-size', onChange);
    return () => window.removeEventListener('ui-text-size', onChange);
  }, []);
  const change = useCallback((v) => {
    try { localStorage.setItem(TEXT_SIZE_KEY, v); } catch { /* 저장 못 해도 지금 화면에는 적용 */ }
    window.dispatchEvent(new CustomEvent('ui-text-size', { detail: v }));
  }, []);
  return [value, change];
}
// App 에서 한 번만 사용: 선택한 크기를 적용하고, '자동'이면 창 크기가 바뀔 때마다 다시 계산
function useApplyTextSize() {
  const [value] = useTextSize();
  useEffect(() => {
    applyTextSize(value);
    if (value !== 'auto') return undefined;
    const onResize = () => applyTextSize('auto');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [value]);
}
function TextSizeControl({ className = '' }) {
  const [value, change] = useTextSize();
  return (
    <label className={`flex items-center gap-1 text-xs text-slate-500 ${className}`} title="이 컴퓨터의 글씨 크기 (컴퓨터마다 따로 저장됩니다)">
      글씨
      <select value={value} onChange={e => change(e.target.value)} className="text-xs border border-slate-300 rounded-lg px-1.5 py-1.5 bg-white text-slate-600">
        {TEXT_SIZE_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </label>
  );
}

function ScreenShell({ title, color, onBack, lastSync, count, extra, children }) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`sticky top-0 z-10 ${c.bg} border-b ${c.border}`}>
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className={`text-xs font-medium ${c.text} mb-0.5`}>Ophthalmology Flow</div>
            <h1 className="text-xl font-semibold text-slate-900">
              {title}
              {typeof count === 'number' && <span className="ml-2 text-base font-normal text-slate-500">대기 {count}명</span>}
            </h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {extra}
            <TextSizeControl />
            <button type="button" onClick={onBack} className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">
              화면 전환
            </button>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-5 py-5">{children}</div>
      {lastSync && <div className="t-hint text-center text-xs text-slate-400 pb-6">마지막 업데이트 {lastSync.toLocaleTimeString('ko-KR')}</div>}
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="text-center py-16 text-slate-400 text-sm">{text}</div>;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function ConfirmButton({ label, confirmLabel = '한 번 더 누르면 삭제', onConfirm, disabled, className = '' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (disabled) {
    return (
      <button type="button" disabled className={`text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-300 flex items-center gap-1 ${className}`}>
        <Trash2 size={12} /> {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1 ${armed ? 'bg-red-600 border-red-600 text-white' : 'border-red-200 text-red-600'} ${className}`}
    >
      <Trash2 size={12} /> {armed ? confirmLabel : label}
    </button>
  );
}

function useUndoToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const show = useCallback((message, undo) => setToast({ id: Date.now(), message, undo }), []);
  const node = toast ? (
    <div className="fixed bottom-5 inset-x-0 flex justify-center px-4 z-40 pointer-events-none">
      <div className="pointer-events-auto bg-slate-900 text-white rounded-xl pl-4 pr-2 py-2 flex items-center gap-3 shadow-lg max-w-full">
        <span className="text-sm">{toast.message}</span>
        {toast.undo && (
          <button
            type="button"
            onClick={() => { toast.undo(); setToast(null); }}
            className="text-sm font-semibold text-amber-300 px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
          >
            <RotateCcw size={14} /> 되돌리기
          </button>
        )}
      </div>
    </div>
  ) : null;
  return [node, show];
}

function RecentDone({ count, children }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <div className="mt-8 border-t border-slate-200 pt-4">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-sm text-slate-600">
        <span className="font-medium">방금 완료한 환자 {count}명</span>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          잘못 눌렀다면 여기서 되돌리세요 {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

function RecentRow({ p, time, children }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 flex-wrap">
      <div className="text-sm text-slate-700">
        <span className="t-name text-slate-900">{p.name}</span> <span className="text-xs text-slate-400">{p.id}</span>
        {time && <span className="text-xs text-slate-400 ml-2">{time} 완료</span>}
      </div>
      <div className="flex flex-wrap gap-2 justify-end">{children}</div>
    </div>
  );
}

function UndoButton({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 flex items-center gap-1 bg-white">
      <RotateCcw size={12} /> {label}
    </button>
  );
}

// 평소엔 일반 클릭, 오른쪽 클릭(터치스크린은 길게 누르기)이면 onSpecial 실행
function SpecialPressButton({ onClick, onSpecial, className, title, children, disabled = false }) {
  const timer = useRef(null);
  const firedAt = useRef(0);
  const suppressClick = useRef(false);
  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };
  useEffect(() => clear, []);
  const trigger = () => {
    // 터치 길게 누르기에서 타이머와 contextmenu가 둘 다 올 수 있어 한 번만 실행
    if (Date.now() - firedAt.current < 800) return;
    firedAt.current = Date.now();
    if (!disabled) onSpecial();
  };
  const specialHandlers = onSpecial && !disabled ? {
    onContextMenu: (e) => { e.preventDefault(); clear(); trigger(); },
    onPointerDown: (e) => {
      suppressClick.current = false;
      if (e.pointerType === 'mouse') return;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        suppressClick.current = true; // 손을 뗄 때 따라오는 클릭 한 번은 무시
        trigger();
      }, 550);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  } : {};
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={`${className} disabled:opacity-40 disabled:cursor-not-allowed`}
      style={{ WebkitTouchCallout: 'none' }}
      {...specialHandlers}
      onClick={(e) => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        onClick(e);
      }}
    >
      {children}
    </button>
  );
}

function TestToggle({ label, done, onToggle, emphasize, onSpecial, disabled = false }) {
  const style = done
    ? 'bg-green-50 border-green-300 text-green-700'
    : emphasize
      ? 'bg-amber-50 border-amber-400 text-amber-800 font-medium'
      : 'bg-white border-slate-300 text-slate-600';
  return (
    <SpecialPressButton
      disabled={disabled}
      onClick={() => onToggle(!done)}
      onSpecial={onSpecial}
      title={onSpecial ? '오른쪽 클릭: 단안·프로토콜 지정' : undefined}
      className={`text-sm px-3 py-1.5 rounded-lg border flex items-center gap-1.5 select-none ${style}`}
    >
      {done && <Check size={14} />}
      {label}
      {emphasize && !done && <span className="text-xs">우선</span>}
    </SpecialPressButton>
  );
}

function TestPicker({ p, tests, onPick, onSpecial }) {
  if (!tests.length) return null;
  return (
    <div className="w-full flex flex-wrap items-center gap-1.5 mt-1">
      <span className="text-xs text-slate-400 mr-1">오늘 검사</span>
      {tests.map(t => {
        const on = !!p.assigned?.[t.id];
        const label = octEyeGroups(t).length ? 'OCT' : on ? testLabelWithOptions(t, p.detail?.[t.id]) : t.short;
        return (
          <SpecialPressButton
            key={t.id}
            disabled={!!activeVf(p)}
            onClick={() => onPick(t, on)}
            onSpecial={() => onSpecial(t)}
            title="오른쪽 클릭: 단안·프로토콜 지정"
            className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 max-w-xs select-none ${on ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-white border-slate-300 text-slate-500'}`}
          >
            {on ? <Check size={12} className="shrink-0" /> : <Plus size={12} className="shrink-0" />}
            <span className="truncate">{label}</span>
            {t.popupOnClick && <ChevronDown size={12} className="shrink-0 opacity-60" />}
          </SpecialPressButton>
        );
      })}
    </div>
  );
}

function TestDetailEditor({ test, value, onChange, showExtra = true }) {
  const v = { ...cleanDetail(value), options: orderedOptions(test, value) };
  const opts = test.options || [];
  const eyeGroups = octEyeGroups(test);
  const toggle = (o) => onChange({ ...v, options: v.options.includes(o) ? v.options.filter(x => x !== o) : [...v.options, o] });
  return (
    <div className="space-y-3">
      {opts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {opts.map(o => {
            const on = v.options.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className={`text-sm px-3 py-1.5 rounded-lg border flex items-center gap-1 ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}
              >
                {on && <Check size={12} />} {o}
              </button>
            );
          })}
        </div>
      )}
      {eyeGroups.map(g => (
        <div key={g.key} className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-sm font-medium text-slate-700">{g.label}</span>
          <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
            {EYE_OPTIONS.map(o => <button key={o.key} type="button" aria-pressed={detailEye(v, g.key) === o.key}
              onClick={() => onChange({ ...v, eyes: { ...v.eyes, [g.key]: o.key } })}
              className={`px-3 py-1.5 rounded-md text-sm ${detailEye(v, g.key) === o.key ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
              {o.label}
            </button>)}
          </div>
        </div>
      ))}
      {showExtra && (
        <>
          {(!eyeGroups.length || opts.some(o => !eyeGroups.some(g => g.options.includes(o)))) && <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
            {EYE_OPTIONS.map(o => (
              <button
                key={o.key}
                type="button"
                onClick={() => onChange({ ...v, eye: o.key })}
                className={`px-3 py-1.5 rounded-md text-sm ${v.eye === o.key ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}
              >
                {o.label}
              </button>
            ))}
          </div>}
          <input
            value={v.note}
            onChange={e => onChange({ ...v, note: e.target.value })}
            placeholder="검사 프로토콜·참고사항 (예: 24-2C, 연구 프로토콜)"
            className={INPUT}
          />
        </>
      )}
    </div>
  );
}

// 검사실 카드의 '오늘 검사'에서 세부 종류가 있는 검사를 눌렀을 때 뜨는 창
function TestDetailModal({ test, patientName, on, value, onApply, onRemove, onCancel }) {
  const [v, setV] = useState(() => cleanDetail(value));
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium text-slate-900">{patientName}님 {test.short || test.name}</h3>
        <p className="text-sm text-slate-500 mb-4">
          {(test.options || []).length
            ? '종류를 고르세요. 여러 개 골라도 되고, 아직 모르면 비워둬도 돼요. 단안이나 프로토콜이 있으면 아래에서 지정하세요.'
            : '단안이면 눈을 고르고, 필요하면 프로토콜을 적어주세요.'}
        </p>
        <TestDetailEditor test={test} value={v} onChange={setV} />
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          {on && (
            <button type="button" onClick={onRemove} className="flex-1 py-3 rounded-xl border border-red-200 text-red-600">검사 빼기</button>
          )}
          <button type="button" onClick={() => onApply(v)} className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-medium">{on ? '적용' : '검사 추가'}</button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button type="button" onClick={onClick} className={`text-sm px-3 py-1.5 rounded-full border ${active ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>
      {label}
    </button>
  );
}

function MeasureLine({ label, m, fields, emptyText = '없음' }) {
  const keys = fields || MEASURE_FIELDS.map(f => f.key);
  const parts = keys.map(k => {
    const text = fieldText(m, k);
    if (!text) return null;
    const name = k === 'bcva' && m?.autoV ? '교정(AutoV)' : MEASURE_FIELDS.find(f => f.key === k).label;
    return (
      <span key={k} className="whitespace-nowrap">
        <span className="text-slate-400">{name}</span> {text}
      </span>
    );
  }).filter(Boolean);
  const isToday = label === '오늘';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-700">
      <span className={`px-1.5 py-0.5 rounded ${isToday ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
        {label}{!isToday && m?.date ? ` ${m.date}` : ''}
      </span>
      {parts.length ? parts : <span className="text-slate-400">{emptyText}</span>}
    </div>
  );
}

function MeasureTable({ today, prev }) {
  const rows = [
    { label: '오늘', m: today },
    { label: prev?.date ? `이전 ${prev.date}` : '이전', m: prev },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full">
        <thead>
          <tr className="text-xs text-slate-400">
            <th className="text-left font-normal pr-4 py-1" />
            {MEASURE_FIELDS.map(f => <th key={f.key} className="text-left font-normal pr-4 py-1">{f.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className="pr-4 py-1.5 text-xs text-slate-500 whitespace-nowrap">{r.label}</td>
              {MEASURE_FIELDS.map(f => (
                <td key={f.key} className="pr-4 py-1.5 whitespace-nowrap text-slate-800">
                  {fieldText(r.m, f.key) || '-'}
                  {f.key === 'bcva' && r.m?.autoV && fieldText(r.m, 'bcva') ? <span className="ml-1 text-xs text-amber-700">AutoV</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-slate-400 mt-1">왼쪽이 OD, 오른쪽이 OS</div>
    </div>
  );
}

function MeasureModal({ mode, patient, previous, gatAvailable, gatAssigned, onSave, onCancel }) {
  const initial = mode === 'prev' ? previous : patient.measure;
  const [m, setM] = useState(() => normalizeMeasure(initial));
  const [date, setDate] = useState(mode === 'prev' ? (previous?.date || '') : '');
  const [gat, setGat] = useState(!!gatAssigned);
  const [warned, setWarned] = useState(false);

  const setEye = (key, eye, v) => setM(s => ({ ...s, [key]: { ...s[key], [eye]: v } }));
  const fields = mode === 'gat' ? ['gat'] : mode === 'vision' ? ['ucva', 'bcva', 'nct'] : ['ucva', 'bcva', 'nct', 'gat'];
  const noIop = mode === 'vision' && !gat && !m.nct.od.trim() && !m.nct.os.trim();
  const title = mode === 'prev' ? '이전 시력·안압' : mode === 'gat' ? 'GAT 안압' : '오늘 시력·안압';
  const completeLabel = mode === 'gat' ? '저장하고 GAT 완료' : '저장하고 완료';

  const submit = (complete) => {
    if (complete && noIop && !warned) { setWarned(true); return; }
    onSave({ measure: m, complete, gat, date });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium text-slate-900">{patient.name}님 {title}</h3>
        <div className="text-xs text-slate-400 mb-4">{patient.id}</div>

        {mode !== 'prev' && (
          <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1">
            <MeasureLine label="이전" m={previous} fields={mode === 'gat' ? ['nct', 'gat'] : undefined} emptyText="이전 값 없음" />
            {mode === 'gat' && <MeasureLine label="오늘" m={patient.measure} fields={['nct']} emptyText="오늘 NCT 없음" />}
          </div>
        )}

        <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '4rem 1fr 1fr 4.5rem' }}>
          <div />
          <div className="text-xs text-slate-500 text-center">OD (우안)</div>
          <div className="text-xs text-slate-500 text-center">OS (좌안)</div>
          <div />
          {fields.map((key, fi) => (
            <React.Fragment key={key}>
              <div className="text-sm text-slate-700">{MEASURE_FIELDS.find(f => f.key === key).label}</div>
              <input
                autoFocus={fi === 0}
                value={m[key].od}
                onChange={e => setEye(key, 'od', e.target.value)}
                inputMode="decimal"
                className="border border-slate-300 rounded-lg px-2 py-2 text-center text-base w-full"
              />
              <input
                value={m[key].os}
                onChange={e => setEye(key, 'os', e.target.value)}
                inputMode="decimal"
                className="border border-slate-300 rounded-lg px-2 py-2 text-center text-base w-full"
              />
              <div>
                {key === 'bcva' && (
                  <button
                    type="button"
                    onClick={() => setM(s => ({ ...s, autoV: !s.autoV }))}
                    className={`text-xs px-2.5 py-2 rounded-lg border w-full ${m.autoV ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 text-slate-500'}`}
                  >
                    AutoV
                  </button>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
        {fields.includes('ucva') && (
          <div className="text-xs text-slate-400 mt-2">시력은 0.1~1.5 같은 숫자나 FC, HM, LP, NLP처럼 적으면 됩니다. AutoV는 AR 값으로 trial lens를 넣고 잰 교정시력일 때 켜주세요.</div>
        )}

        {mode === 'vision' && gatAvailable && (
          <label className="flex items-center gap-2 mt-4 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={gat} onChange={e => { setGat(e.target.checked); setWarned(false); }} className="w-4 h-4" />
            안압은 GAT로 측정 (정밀검사실에서 입력)
          </label>
        )}

        {mode === 'prev' && (
          <div className="mt-4">
            <Field label="측정일 (모르면 비워두세요)">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />
            </Field>
          </div>
        )}

        {warned && noIop && (
          <div className="mt-4 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
            NCT 값이 비어 있어요. GAT로 잴 환자라면 위에서 체크해주세요. 그래도 완료하려면 한 번 더 누르세요.
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="button" onClick={() => submit(false)} className={`flex-1 py-3 rounded-xl font-medium ${mode === 'prev' ? 'bg-slate-800 text-white' : 'border border-slate-300 text-slate-700'}`}>저장</button>
          {mode !== 'prev' && (
            <button type="button" onClick={() => submit(true)} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">{completeLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* 명단 보기 방식: 정렬(예약시간순·가나다순), 오전·오후 */
function byName(a, b) {
  return String(a.name).localeCompare(String(b.name), 'ko') || String(a.id).localeCompare(String(b.id));
}
// 예약 12:00 전은 오전, 12:00부터 오후. 예약시간이 없으면 양쪽 모두에 보입니다.
const NOON = 12 * 60;
function inSession(p, session) {
  if (session === 'all' || !p.reservation) return true;
  const m = timeToMin(p.reservation);
  return session === 'am' ? m < NOON : m >= NOON;
}
// 화면마다 고른 정렬을 이 컴퓨터에 기억합니다
function useSortMode(storageKey) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'name' ? 'name' : 'time'; } catch { return 'time'; }
  });
  const change = (m) => {
    setMode(m);
    try { localStorage.setItem(storageKey, m); } catch { /* 저장 못 해도 동작에는 문제 없음 */ }
  };
  return [mode, change];
}
function SegmentedToggle({ value, onChange, options, className = '' }) {
  return (
    <div className={`inline-flex gap-1 bg-slate-100 rounded-lg p-1 ${className}`}>
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${value === k ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
const SORT_OPTIONS = [['time', '예약시간순'], ['name', '가나다순']];
const SESSION_OPTIONS = [['all', '전체'], ['am', '오전'], ['pm', '오후']];

function PatientRow({ p, index, color, handle, onUp, onDown, children }) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  return (
    <div className={`flex items-start gap-3 bg-white border ${c.border} rounded-xl p-4`}>
      {handle && <div className="pt-2 shrink-0">{handle}</div>}
      <div className={`t-num w-10 h-10 rounded-full ${c.solid} text-white flex items-center justify-center font-semibold shrink-0`}>{index + 1}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="t-name text-slate-900">{p.name}</span>
          <span className="text-xs text-slate-400">{p.id}</span>
          {p.doctor && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{p.doctor}</span>}
          {p.firstVisit && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">초진</span>}
          {p.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">2차 진료 · {p.primaryDoctor} 후</span>}
          {p.late && <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">지각</span>}
          {p.consultHold && !p.consultDone && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 flex items-center gap-1">
              <AlertTriangle size={11} /> 진료 후 추가검사
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">예약 {p.reservation || '-'} · 접수 {p.checkin || '-'}</div>
        {p.sendNote?.text && !p.consultDone && <div className="w-full text-sm bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg px-3 py-1.5 mt-1"><span className="font-medium">{p.sendNote.from || '진료실'} 메모</span> {p.sendNote.text}</div>}
        <div className="flex flex-wrap items-center gap-2 mt-2">{children}</div>
      </div>
      {(onUp || onDown) && (
        <div className="flex flex-col gap-1 shrink-0">
          <button type="button" aria-label="위로" onClick={onUp} className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
            <ChevronUp size={16} />
          </button>
          <button type="button" aria-label="아래로" onClick={onDown} className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
            <ChevronDown size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// 손잡이(⋮⋮)를 잡고 끌어서 순서를 바꾸는 목록. 마우스·터치 모두 지원
function DraggableList({ items, getKey, onMove, renderItem, locked = false }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);

  useEffect(() => () => { DRAG_ACTIVE = false; }, []);

  const start = (e, index) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const nodes = wrapRef.current ? Array.from(wrapRef.current.children) : [];
    if (!nodes[index]) return;
    const rects = nodes.map(n => {
      const r = n.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    const d = { index, key: getKey(items[index]), startY: e.clientY, dy: 0, rects, target: index };
    dragRef.current = d;
    DRAG_ACTIVE = true;
    setDrag(d);
    e.preventDefault();
  };

  const move = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    const r = d.rects[d.index];
    const center = r.top + r.height / 2 + dy;
    let target = 0;
    d.rects.forEach((rr, i) => {
      if (i !== d.index && rr.top + rr.height / 2 < center) target += 1;
    });
    const next = { ...d, dy, target };
    dragRef.current = next;
    setDrag(next);
  };

  const end = () => {
    const d = dragRef.current;
    dragRef.current = null;
    DRAG_ACTIVE = false;
    setDrag(null);
    if (d && d.target !== d.index) onMove(d.key, d.target);
  };

  return (
    <div ref={wrapRef}>
      {items.map((item, i) => {
        let style;
        if (drag) {
          const h = drag.rects[drag.index]?.height || 0;
          if (i === drag.index) {
            style = { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 30 };
          } else if (drag.index < drag.target && i > drag.index && i <= drag.target) {
            style = { transform: `translateY(${-h}px)`, transition: 'transform 150ms ease' };
          } else if (drag.index > drag.target && i >= drag.target && i < drag.index) {
            style = { transform: `translateY(${h}px)`, transition: 'transform 150ms ease' };
          } else {
            style = { transition: 'transform 150ms ease' };
          }
        }
        const handle = (
          <div
            role="button"
            aria-label="끌어서 순서 바꾸기"
            onPointerDown={e => start(e, i)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            style={{ touchAction: 'none', cursor: drag ? 'grabbing' : 'grab' }}
            className="p-1 -ml-1 rounded text-slate-300 hover:text-slate-500 select-none"
          >
            <GripVertical size={20} />
          </div>
        );
        const lifted = drag && i === drag.index;
        return (
          <div key={getKey(item)} className="pb-3" style={style}>
            <div className={lifted ? 'shadow-xl rounded-xl' : ''}>{renderItem(item, i, locked ? null : handle)}</div>
          </div>
        );
      })}
    </div>
  );
}

function PriorityBanner({ groups, patients }) {
  const counts = groups.map(g => ({ g, n: patients.filter(p => groupPending(p, g)).length }));
  const top = counts.find(c => c.n > 0);
  if (!top) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
      <Activity className="text-amber-600 shrink-0 mt-0.5" size={20} />
      <div className="text-sm text-amber-900">
        <div className="font-medium mb-0.5">{top.g.key}부터 채워주세요</div>
        <div>{counts.map(c => `${c.g.key} ${c.n}명`).join(', ')} 대기 중. {top.g.key} 장비가 쉬지 않도록 먼저 진행하고, 기다리는 동안 나머지 검사를 진행하세요.</div>
      </div>
    </div>
  );
}

function DilationBadge({ st, waitMin, eye }) {
  const w = Number(waitMin) || 15;
  if (st.status === 'todo') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">점안 필요{eye ? ` · ${DILATE_EYE_LABEL[eye]}` : ''}</span>;
  }
  if (st.status === 'progress') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">CR {st.given}/{st.total}회, 마지막 점안 후 {st.mins}분</span>;
  }
  if (st.status === 'waiting') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">산동 중 {st.mins}분 (앞으로 {Math.max(0, w - st.mins)}분)</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">산동 완료</span>;
}

// 산동 칩을 오른쪽 클릭(길게 누르기)했을 때 뜨는 좌·우안 선택 창
function DilationEyeModal({ patientName, on, eye, onApply, onRemove, onCancel }) {
  const [v, setV] = useState(eye || 'OU');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-slate-900">{patientName}님 산동</h3>
        <p className="text-sm text-slate-500 mb-4">한쪽 눈만 산동하면 눈을 골라주세요.</p>
        <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
          {EYE_OPTIONS.map(o => (
            <button key={o.key} type="button" aria-pressed={v === o.key} onClick={() => setV(o.key)}
              className={`px-3 py-1.5 rounded-md text-sm ${v === o.key ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          {on && <button type="button" onClick={onRemove} className="flex-1 py-3 rounded-xl border border-red-200 text-red-600">산동 빼기</button>}
          <button type="button" onClick={() => onApply(v)} className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-medium">{on ? '적용' : '산동 추가'}</button>
        </div>
      </div>
    </div>
  );
}

// 산동 여부·CR·점안 시각 기록. 모든 직원 화면의 환자 카드에서 같은 방식으로 사용
function DilationRow({ p, prefs, waitMin, mutatePatients, showDrops = true }) {
  const pk = patientKey(p);
  const crAvail = !!prefs?.[p.doctor]?.cr;
  const cr = crActive(p, prefs);
  const dil = needsDilation(p, prefs);
  const st = dilationState(p, prefs, waitMin);
  const eye = !cr && dil ? dilateEyeOf(p.dilateEye) : undefined;
  const [eyeModal, setEyeModal] = useState(false);
  const chip = (on) => `text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-white border-slate-300 text-slate-400'}`;
  return (
    <div className="w-full flex flex-wrap items-center gap-1.5">
      {!cr && (
        <SpecialPressButton
          onClick={() => patchPatient(mutatePatients, pk, () => ({ dilateOverride: !dil }))}
          onSpecial={() => setEyeModal(true)}
          title="오른쪽 클릭: 좌·우안 지정"
          className={`${chip(dil)} select-none`}
        >
          {dil ? `산동 함${eye ? ` · ${DILATE_EYE_LABEL[eye]}` : ''}` : '산동 안 함'}
        </SpecialPressButton>
      )}
      {eyeModal && (
        <DilationEyeModal
          patientName={p.name}
          on={dil}
          eye={dilateEyeOf(p.dilateEye)}
          onApply={e => { patchPatient(mutatePatients, pk, () => ({ dilateOverride: true, dilateEye: dilateEyeOf(e) })); setEyeModal(false); }}
          onRemove={() => { patchPatient(mutatePatients, pk, () => ({ dilateOverride: false })); setEyeModal(false); }}
          onCancel={() => setEyeModal(false)}
        />
      )}
      {crAvail && (
        <button type="button" onClick={() => patchPatient(mutatePatients, pk, x => ({ cr: !x.cr }))} className={chip(cr)}>
          {cr ? 'CR 함' : 'CR 안 함'}
        </button>
      )}
      {showDrops && st.need && st.drops.map((t, i) => (
        <button
          key={i}
          type="button"
          onClick={() => toggleDrop(mutatePatients, pk, i)}
          title={t ? '다시 누르면 기록 취소' : '누르면 지금 시각으로 기록'}
          className={`text-xs px-2.5 py-1 rounded-lg border ${t
            ? 'bg-slate-100 border-slate-200 text-slate-500'
            : i === st.given ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-300 text-slate-500'}`}
        >
          {cr ? `${i + 1}회 점안` : '점안'}{t ? ` ${fmtClock(t)}` : ''}
        </button>
      ))}
      {st.need && <DilationBadge st={st} waitMin={waitMin} eye={eye} />}
    </div>
  );
}

function ProcedureModal({ patient, procedures, onConfirm, onCancel }) {
  const [sel, setSel] = useState({});
  const [note, setNote] = useState('');
  // 목록에 없는 요청은 직접 입력 (예: 안약 교육, 봉합사 제거)
  const [custom, setCustom] = useState('');
  const [customBy, setCustomBy] = useState('resident');
  const customName = custom.trim();
  const chosen = [
    ...procedures.filter(x => sel[x.id]),
    ...(customName ? [{ id: 'custom', name: customName, performer: customBy }] : []),
  ];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium mb-1 text-slate-900">{patient.name}님 처치</h3>
        <p className="text-sm text-slate-500 mb-4">교수님 처치는 진료실 명단의 처치 대기로, 전공의 처치는 처치실로 갑니다. 처치가 끝나면 설명 대기로 넘어가요.</p>
        <div className="space-y-2 mb-4">
          {procedures.length === 0 && <div className="text-sm text-slate-400">설정 &gt; 처치에서 처치 목록을 먼저 만들어주세요</div>}
          {procedures.map(x => (
            <label key={x.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer">
              <input type="checkbox" checked={!!sel[x.id]} onChange={() => setSel(s => ({ ...s, [x.id]: !s[x.id] }))} className="w-5 h-5" />
              <span className="text-slate-700 flex-1">{x.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${x.performer === 'prof' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>{PERFORMER_LABEL[x.performer]}</span>
            </label>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 p-3 mb-4">
          <div className="text-sm text-slate-700 mb-2">기타 요청 (직접 입력)</div>
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="예: 안약 점안 교육, 봉합사 제거" className={INPUT} />
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-500">누가</span>
            <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
              {['prof', 'resident'].map(k => (
                <button key={k} type="button" aria-pressed={customBy === k} onClick={() => setCustomBy(k)}
                  className={`px-3 py-1 rounded-md text-sm ${customBy === k ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
                  {PERFORMER_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="처치 메모 (선택 · 위에서 고른 처치 모두에 붙습니다)" className={`${INPUT} mb-6`} />
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button
            type="button"
            disabled={!chosen.length}
            onClick={() => onConfirm(chosen, note.trim())}
            className={`flex-1 py-3 rounded-xl font-medium ${chosen.length ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-400'}`}
          >
            처치 지정
          </button>
        </div>
      </div>
    </div>
  );
}

function cancelProcedure(mutatePatients, pk, uid) {
  mutatePatients(prev => prev.map(p => {
    if (patientKey(p) !== pk || p.consultDone || !(p.procedures || []).some(x => x.uid === uid && !x.done)) return p;
    const procedures = p.procedures.filter(x => x.uid !== uid);
    if (procedures.length) return { ...p, procedures };
    const occupied = prev.some(x => patientKey(x) !== pk && x.date === p.date && x.doctor === p.doctor && inConsult(x));
    return { ...p, procedures, seen: false, seenAt: null, procOrderedAt: null, calledRoom: occupied ? null : p.doctor || null };
  }));
}

function ProcedureList({ p, performer, onCancel }) {
  const list = (p.procedures || []).filter(x => !performer || x.performer === performer);
  if (!list.length) return null;
  return (
    <div className="w-full text-sm text-slate-700 space-y-0.5">
      {list.map(x => (
        <div key={x.uid} className={x.done ? 'text-slate-400 line-through' : ''}>
          <span className="font-medium">{x.name}</span>
          <span className="text-xs text-slate-400 ml-1">{PERFORMER_LABEL[x.performer]}</span>
          {x.note && <span className="text-xs text-yellow-800 ml-2">{x.note}</span>}
          {!x.done && onCancel && <button type="button" onClick={() => onCancel(x.uid)} className="ml-3 rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700">처치 취소</button>}
        </div>
      ))}
    </div>
  );
}

function TestCheckModal({ title, subtitle, tests: rawTests, settings, initial, initialDetail, dilation, triageChoice, followup, linkDoctors, confirmLabel, onConfirm, onCancel }) {
  const tests = orderForPicking(rawTests, settings);
  const [followupDoctor, setFollowupDoctor] = useState(followup?.doctor || '');
  const [linkDoctor, setLinkDoctor] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [triageRequired, setTriageRequired] = useState(triageChoice !== false);
  const [dil, setDil] = useState(() => ({ mode: ['yes', 'no'].includes(dilation?.initial?.mode) ? dilation.initial.mode : followup?.prefs?.[followup.doctor]?.dilate ? 'yes' : 'no', cr: !!dilation?.initial?.cr, eye: dilateEyeOf(dilation?.initial?.eye) || 'OU' }));
  const [dilEyeOpen, setDilEyeOpen] = useState(() => !!dilateEyeOf(dilation?.initial?.eye));
  const [sel, setSel] = useState(() => Object.fromEntries(tests.map(t => [t.id, !!initial?.[t.id]])));
  const [detail, setDetail] = useState(() => {
    const out = {};
    Object.keys(initialDetail || {}).forEach(k => { out[k] = cleanDetail(initialDetail[k]); });
    return out;
  });
  // 단안·프로토콜 칸은 필요할 때만 펼침 (이미 값이 있으면 펼친 상태로 시작)
  const [extraOpen, setExtraOpen] = useState(() => {
    const out = {};
    Object.keys(initialDetail || {}).forEach(k => {
      const d = cleanDetail(initialDetail[k]);
      if (d.note.trim() || d.eye !== 'OU') out[k] = true;
    });
    return out;
  });
  const roomName = (id) => id === 'vision' ? '시력/안압방' : settings.rooms.find(r => r.id === id)?.name || '';
  const preferred = followup?.prefs?.[followupDoctor]?.followupTests;
  const primary = !followup || !Array.isArray(preferred) ? tests : tests.filter(t => preferred.includes(t.id));
  const others = tests.filter(t => !primary.some(x => x.id === t.id));
  const visibleTests = showOthers ? [...primary, ...others] : primary;
  const openExtra = (id) => {
    setSel(s => ({ ...s, [id]: true }));
    setExtraOpen(o => ({ ...o, [id]: true }));
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium mb-1 text-slate-900">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mb-4">{subtitle}</p>}
        {followup && <div className="text-sm text-indigo-700 mb-3">다음 내원 담당: {followupDoctor || '미지정'}</div>}
        <div className="space-y-2 mb-6">
          {tests.length === 0 && <div className="text-sm text-slate-400">설정에 등록된 검사가 없습니다</div>}
          {visibleTests.map(t => {
            const checked = !!sel[t.id];
            const hasOpts = (t.options || []).length > 0;
            const open = !!t.popupOnClick || (!followup && !!extraOpen[t.id]);
            return (
              <div
                key={t.id}
                onContextMenu={e => { e.preventDefault(); openExtra(t.id); }}
                className={`rounded-xl border ${checked ? 'border-slate-300 bg-slate-50' : 'border-slate-200'}`}
              >
                <label className="flex items-center gap-3 p-3 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => setSel(s => ({ ...s, [t.id]: !s[t.id] }))} className="w-5 h-5" />
                  <span className="text-slate-700 flex-1">
                    {t.short || t.name}
                    {checked && !open && detail[t.id] && cleanDetail(detail[t.id]).eye !== 'OU' && (
                      <span className="ml-2 text-xs text-slate-500">{cleanDetail(detail[t.id]).eye}만</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">{roomName(t.roomId)}</span>
                </label>
                {checked && open && (
                  <div className="px-3 pb-3">
                    <TestDetailEditor test={t} value={detail[t.id]} onChange={v => setDetail(d => ({ ...d, [t.id]: v }))} showExtra={open} />
                  </div>
                )}
                {checked && !open && !followup && (
                  <button type="button" onClick={() => openExtra(t.id)} className="text-xs text-slate-500 underline px-3 pb-3">
                    단안·프로토콜 지정
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {followup && <div className="mb-5 space-y-2">
          <button type="button" onClick={() => setShowOthers(v => !v)} className="w-full rounded-lg border border-slate-300 py-2 text-sm">{showOthers ? '나머지 검사 접기' : `나머지 검사 보기 (${others.length}개 · 선택 ${others.filter(t => sel[t.id]).length}개)${linkDoctor ? ` · 오늘 ${linkDoctor} 진료 추가` : ''}`}</button>
          {showOthers && <>
            {Array.isArray(linkDoctors) && (
              <label className="block text-sm text-fuchsia-800 rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3">오늘 다른 교수 진료 추가
                <select value={linkDoctor} onChange={e => setLinkDoctor(e.target.value)} className={INPUT}>
                  <option value="">추가 안 함</option>
                  {linkDoctors.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <span className="text-xs">{linkDoctor
                  ? `설명 완료 후 ${settings.linkCheckAdded !== false ? '처치실에서 추가 검사를 확인하고 ' : ''}${linkDoctor} 진료 대기로 넘어갑니다.`
                  : '같은 날 다른 교수님 진료도 봐야 하면 선택하세요.'}</span>
              </label>
            )}
            <label className="block text-sm text-slate-600">다음 내원 담당 교수
              <select value={followupDoctor} onChange={e => { setFollowupDoctor(e.target.value); setDil(d => ({ ...d, cr: !!followup.prefs?.[e.target.value]?.cr && d.cr })); }} className={INPUT}>
                {[...new Set([followupDoctor, ...(followup.doctors || [])])].filter(Boolean).map(name => <option key={name} value={name}>{name}</option>)}
              </select><span className="text-xs">현재 선택한 검사는 유지되고, 오늘 진료 교수는 변경되지 않습니다.</span>
            </label>
          </>}
        </div>}
        {typeof triageChoice === 'boolean' && (
          <fieldset className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 mb-4">
            <legend className="px-1 text-sm font-medium text-indigo-900">검사 후 예진</legend>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="triage-required" checked={triageRequired} onChange={() => setTriageRequired(true)} />예진 함</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="triage-required" checked={!triageRequired} onChange={() => setTriageRequired(false)} />예진 안 함</label>
            </div>
            <p className="mt-2 text-xs text-indigo-800">{triageRequired ? '검사 완료 후 처치실의 예진 대기로 이동합니다.' : '검사 완료 후 바로 진료 대기로 이동합니다.'} 검사가 없으면 바로 이동합니다.</p>
          </fieldset>
        )}
        {dilation && (
          <div className="rounded-xl border border-slate-200 p-3 mb-6">
            <div className="text-sm text-slate-700 mb-2">다음 내원 산동</div>
            <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
              {[['yes', '산동 함'], ['no', '산동 안 함']].map(([k, label]) => (
                <SpecialPressButton
                  key={k}
                  onClick={() => setDil(d => ({ ...d, mode: k }))}
                  onSpecial={k === 'yes' ? () => { setDil(d => ({ ...d, mode: 'yes' })); setDilEyeOpen(true); } : undefined}
                  title={k === 'yes' ? '오른쪽 클릭: 좌·우안 지정' : undefined}
                  className={`px-3 py-1.5 rounded-md text-sm select-none ${dil.mode === k ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}
                >
                  {k === 'yes' && dil.mode === 'yes' && dil.eye !== 'OU' ? `${label} · ${DILATE_EYE_LABEL[dil.eye]}` : label}
                </SpecialPressButton>
              ))}
            </div>
            {dil.mode === 'yes' && dilEyeOpen && (
              <div className="mt-2 inline-flex gap-1 bg-slate-100 rounded-lg p-1 ml-0 sm:ml-2">
                {EYE_OPTIONS.map(o => (
                  <button key={o.key} type="button" aria-pressed={dil.eye === o.key} onClick={() => setDil(d => ({ ...d, eye: o.key }))}
                    className={`px-3 py-1.5 rounded-md text-sm ${dil.eye === o.key ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {(followup ? !!followup.prefs?.[followupDoctor]?.cr : dilation.crAvailable) && (
              <label className="flex items-center gap-2 mt-3 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={dil.cr} onChange={e => setDil(d => ({ ...d, cr: e.target.checked }))} className="w-4 h-4" />
                CR (조절마비 굴절검사, 4회 점안)
              </label>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="button" onClick={() => onConfirm(sel, pickDetail(detail, sel, tests), { ...dil, doctor: followupDoctor }, triageRequired, linkDoctor)} className="flex-1 py-3 rounded-xl bg-amber-600 text-white font-medium">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 역할 선택                                                           */
/* ------------------------------------------------------------------ */
function RoleSelect({ settings, onSelect }) {
  const items = [
    { key: 'vision', label: '시력 · 안압', sub: '가장 먼저 거치는 검사실', icon: Eye, color: 'blue' },
    ...settings.rooms.map(r => ({
      key: `room:${r.id}`,
      label: r.name,
      sub: roomTests(settings, r.id).map(t => t.short).join(', ') || '검사 없음',
      icon: Camera,
      color: roomColor(settings, r.id),
    })),
    { key: 'procedure', label: '처치실', sub: '초진 예진 · 전공의 처치', icon: Syringe, color: 'indigo' },
    { key: 'consult', label: '진료실', sub: '교수님별 진료 대기', icon: Stethoscope, color: 'amber' },
    { key: 'board', label: '환자용 화면', sub: '대기 명단 모니터', icon: Monitor, color: 'slate' },
    { key: 'admin', label: '관리자', sub: '명단 업로드 · FU 지정', icon: ClipboardList, color: 'slate' },
    { key: 'settings', label: '설정', sub: '검사 · 검사실 · 교수', icon: Settings, color: 'slate' },
    { key: 'directory', label: '전체 환자 명단', sub: '환자 찾기 · 진행 상황', icon: Search, color: 'slate' },
  ];
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="text-sm text-slate-400 mb-1">Ophthalmology Flow</div>
          <h1 className="text-2xl font-semibold text-slate-900">이 컴퓨터의 화면을 선택하세요</h1>
          <div className="flex justify-center mt-3"><TextSizeControl /></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {items.map(({ key, label, sub, icon: Icon, color }) => {
            const c = COLOR_MAP[color] || COLOR_MAP.slate;
            return (
              <button key={key} type="button" onClick={() => onSelect(key)} className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 ${c.border} ${c.bg} hover:shadow-md transition-shadow`}>
                <Icon size={32} className={c.text} />
                <div className="text-center">
                  <div className="t-tile font-medium text-slate-900">{label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 검사실 화면 (시력/안압 + 설정된 검사실 공용)                           */
/* ------------------------------------------------------------------ */
function StationView({ mode, settings, doctorPrefs, patients, history, mutatePatients, mutateHistory, onBack, lastSync }) {
  const [filter, setFilter] = useState('all');
  const [sortMode, changeSort] = useSortMode(mode === 'vision' ? 'sort-vision' : `sort-room-${mode}`);
  const nameSort = sortMode === 'name';
  const [session, setSession] = useState('all');
  const [query, setQuery] = useState('');
  const [measureFor, setMeasureFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [toastNode, showToast] = useUndoToast();
  const isVision = mode === 'vision';
  const room = isVision ? null : settings.rooms.find(r => r.id === mode);

  if (!isVision && !room) {
    return (
      <ScreenShell title="검사실" color="slate" onBack={onBack} lastSync={lastSync}>
        <EmptyState text="이 검사실은 설정에서 삭제되었습니다. 화면 전환을 눌러 다시 선택해주세요." />
      </ScreenShell>
    );
  }

  const color = isVision ? 'blue' : roomColor(settings, room.id);
  const title = isVision ? '시력 / 안압 검사실' : room.name;
  const tests = isVision ? [VISION_TEST, ARK_TEST] : roomTests(settings, room.id);
  const groups = isVision ? [] : machineGroups(tests);
  const allTests = sortedTests(settings);
  const showPriority = !isVision && !!room.showPriority && groups.length >= 2;
  const gatTest = settings.tests.find(t => t.id === GAT_ID);
  const gatAvailable = !!gatTest && settings.rooms.some(r => r.id === gatTest.roomId);
  const roomHasGat = !isVision && gatTest?.roomId === room.id;

  // 처방 완료 표시 (이 검사실의 지금 남은 검사 기준)
  const setOrdered = (p, on) => {
    const pk = patientKey(p);
    const before = p.orders;
    const at = Date.now();
    patchPatient(mutatePatients, pk, x => {
      const orders = { ...(x.orders || {}) };
      if (on) {
        const ids = roomTests(settings, room.id).filter(t => x.assigned?.[t.id]).map(t => t.id);
        orders[room.id] = { at, tests: [...new Set([...(orders[room.id]?.tests || []), ...ids])] };
      } else {
        delete orders[room.id];
      }
      return { orders };
    });
    showToast(`${p.name} ${on ? '처방 완료' : '처방 완료 취소'}`, () => patchPatient(mutatePatients, pk, () => ({ orders: before })));
  };

  const q = query.trim();
  const notCheckedIn = isVision
    ? patients.filter(p => !p.consultDone && !p.checkin && inSession(p, session) && (!q || (p.name || '').includes(q) || String(p.id).includes(q))).sort(nameSort ? byName : byQueue)
    : [];
  const roomList = (isVision
    ? patients.filter(p => !p.consultDone && p.checkin && !visionComplete(p))
    : patients.filter(p => !p.consultDone && roomPending(p, settings, room.id))
  ).sort(byQueue);
  const activeGroup = groups.find(g => g.key === filter) || null;
  // VF 분류에서도 진행 중인 카드와 종료 버튼을 계속 보여준다.
  const shown = activeGroup ? roomList.filter(p => groupPending(p, activeGroup) || activeGroup.tests.some(t => t.id === activeVf(p))) : roomList;
  const toggleFirstVisit = (pk) => patchPatient(mutatePatients, pk, x => ({ firstVisit: !x.firstVisit }));
  const firstVisitChip = (p) => (
    <button
      type="button"
      onClick={() => toggleFirstVisit(patientKey(p))}
      className={`text-xs px-2.5 py-1 rounded-full border ${p.firstVisit ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-300 text-slate-400'}`}
    >
      {p.firstVisit ? '초진' : '재진'}
    </button>
  );

  const testLabel = (key) => (key === VISION_KEY ? '시력/안압' : (settings.tests.find(t => t.id === key)?.short || '검사'));

  const writeDone = (pk, key, val, at) =>
    mutatePatients(prev => prev.map(x => (patientKey(x) === pk && !activeVf(x)
      ? { ...x, done: { ...x.done, [key]: val }, doneAt: { ...(x.doneAt || {}), [key]: val ? at : null } }
      : x)));

  const changeVf = (p, t, action) => {
    const at = Date.now();
    patchPatient(mutatePatients, patientKey(p), x => updateVf(x, t.id, action, at));
  };

  const markDone = (p, key, val) => {
    if (activeVf(p)) return;
    const pk = patientKey(p);
    writeDone(pk, key, val, Date.now());
    if (val) {
      const noIop = key === VISION_KEY && !hasIop(p);
      const toTriage = key === VISION_KEY && p.firstVisit ? ', 처치실로' : '';
      showToast(`${p.name} ${testLabel(key)} 완료${noIop ? ' (안압 값 없음)' : ''}${toTriage}`, () => writeDone(pk, key, false, null));
    }
  };

  // detail: undefined면 기존 세부 정보 유지, null이면 삭제, 객체면 교체
  const setAssigned = (pk, key, val, detail) =>
    mutatePatients(prev => prev.map(x => {
      if (patientKey(x) !== pk || activeVf(x)) return x;
      const nextDetail = { ...(x.detail || {}) };
      if (!val || detail === null) delete nextDetail[key];
      else if (detail) nextDetail[key] = detail;
      return {
        ...x,
        assigned: { ...x.assigned, [key]: val },
        done: val ? x.done : { ...x.done, [key]: false },
        detail: nextDetail,
      };
    }));

  const pickTest = (p, t, on) => {
    if (t.popupOnClick) { setDetailFor({ key: patientKey(p), testId: t.id }); return; }
    setAssigned(patientKey(p), t.id, !on);
  };
  const openSpecial = (p, t) => setDetailFor({ key: patientKey(p), testId: t.id });

  const checkIn = (p) => {
    const pk = patientKey(p);
    mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? applyCheckin(x, settings.lateGraceMin) : x)));
    showToast(`${p.name} 접수`, () => mutatePatients(prev => prev.map(x => (patientKey(x) === pk
      ? { ...x, checkin: '', late: false, queueKey: timeToMin(x.reservation) }
      : x))));
  };

  const handleMeasureSave = ({ measure, complete, gat, date }) => {
    const { key: pk, mode: mmode } = measureFor;
    const p = patients.find(x => patientKey(x) === pk);
    setMeasureFor(null);
    if (!p || activeVf(p)) return;

    if (mmode === 'prev') {
      const prevManual = hasAnyValue(measure) ? { ...measure, date } : null;
      mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? { ...x, prevManual } : x)));
      return;
    }

    const patch = mmode === 'gat'
      ? { gat: measure.gat }
      : { ucva: measure.ucva, bcva: measure.bcva, autoV: measure.autoV, nct: measure.nct };
    const doneKey = mmode === 'gat' ? GAT_ID : VISION_KEY;
    const at = Date.now();
    mutatePatients(prev => prev.map(x => {
      if (patientKey(x) !== pk || activeVf(x)) return x;
      let nx = { ...x, measure: { ...normalizeMeasure(x.measure), ...patch } };
      if (mmode === 'vision' && gatAvailable) {
        nx = { ...nx, assigned: { ...nx.assigned, [GAT_ID]: gat } };
        if (!gat) nx = { ...nx, done: { ...nx.done, [GAT_ID]: false } };
      }
      if (complete) {
        nx = { ...nx, done: { ...nx.done, [doneKey]: true }, doneAt: { ...(nx.doneAt || {}), [doneKey]: at } };
      }
      return nx;
    }));
    mutateHistory(prev => mergeHistory(prev, p.id, p.date, patch));
    if (complete) showToast(`${p.name} ${testLabel(doneKey)} 완료`, () => writeDone(pk, doneKey, false, null));
  };

  // 되돌리기 목록
  const recent = isVision
    ? patients
      .filter(p => !p.consultDone && p.done?.[VISION_KEY])
      .sort((a, b) => (b.doneAt?.[VISION_KEY] || 0) - (a.doneAt?.[VISION_KEY] || 0))
      .slice(0, 10)
      .map(p => ({ p, keys: [VISION_KEY], at: p.doneAt?.[VISION_KEY] }))
    : patients
      .filter(p => !p.consultDone && tests.some(t => p.assigned?.[t.id] && p.done?.[t.id]))
      .map(p => {
        const keys = tests.filter(t => p.assigned?.[t.id] && p.done?.[t.id]).map(t => t.id);
        return { p, keys, at: Math.max(0, ...keys.map(k => p.doneAt?.[k] || 0)) };
      })
      .sort((a, b) => b.at - a.at)
      .slice(0, 10);

  const measurePatient = measureFor ? patients.find(x => patientKey(x) === measureFor.key) : null;
  const detailPatient = detailFor ? patients.find(x => patientKey(x) === detailFor.key) : null;
  const detailTest = detailFor ? settings.tests.find(t => t.id === detailFor.testId) : null;

  return (
    <ScreenShell title={title} color={color} onBack={onBack} lastSync={lastSync} count={roomList.length}>
      {showPriority && roomList.length > 0 && <PriorityBanner groups={groups} patients={roomList} />}

      {!isVision && groups.length >= 2 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <FilterChip active={!activeGroup} onClick={() => setFilter('all')} label={`전체 ${roomList.length}`} />
          {groups.map(g => (
            <FilterChip
              key={g.key}
              active={activeGroup?.key === g.key}
              onClick={() => setFilter(g.key)}
              label={`${g.key} ${roomList.filter(p => groupPending(p, g)).length}명${roomList.some(p => g.tests.some(t => t.id === activeVf(p))) ? ' · 검사 중' : ''}`}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-sm font-medium text-slate-500">{isVision ? `검사 대기 · ${roomList.length}명` : ''}</div>
        <SegmentedToggle value={sortMode} onChange={changeSort} options={SORT_OPTIONS} />
      </div>
      {nameSort && shown.length > 1 && <div className="text-xs text-slate-500 mb-2">가나다순으로 보는 중입니다. 번호는 실제 대기 순서이고, 순서를 바꾸려면 예약시간순으로 돌아가세요.</div>}
      <div className="t-hint text-xs text-slate-400 mb-3">
        {isVision
          ? '측정값 입력에서 값을 넣고 저장하고 완료를 누르세요. 순서는 왼쪽 손잡이를 끌거나 화살표로 바꿔요.'
          : 'VF는 시작 후 종료를 누르세요. VF 검사 중에는 다른 장비에서 호출하지 마세요. 나머지 검사는 버튼을 눌러 완료합니다. 순서는 손잡이나 화살표로 바꿔요.'}
        {' '}단안이나 검사 프로토콜은 검사 버튼을 오른쪽 클릭(터치스크린은 길게 누르기)해서 지정해요.
      </div>

      {shown.length === 0 ? (
        <EmptyState text="대기 중인 환자가 없습니다" />
      ) : (
        <DraggableList
          items={nameSort ? [...shown].sort(byName) : shown}
          locked={nameSort}
          getKey={patientKey}
          onMove={(key, to) => moveInQueue(mutatePatients, shown, key, to)}
          renderItem={(p, _i, handle) => {
            // 가나다순으로 보여도 번호는 실제 대기 순서
            const idx = shown.indexOf(p);
            const pk = patientKey(p);
            const runningVf = activeVf(p);
            const topTest = showPriority && !runningVf ? pendingTests(p, settings, room.id)[0] : null;
            const otherRooms = isVision ? [] : pendingRooms(p, settings).filter(r => r.id !== room.id);
            const prev = previousMeasure(p, history);
            const needsGatHere = roomHasGat && p.assigned?.[GAT_ID] && !p.done?.[GAT_ID];
            const notes = notesOf(p, allTests);
            return (
              <PatientRow
                p={p}
                index={idx}
                color={color}
                handle={handle}
                onUp={nameSort ? undefined : () => moveInQueue(mutatePatients, shown, pk, idx - 1)}
                onDown={nameSort ? undefined : () => moveInQueue(mutatePatients, shown, pk, idx + 1)}
              >
                {runningVf && (
                  <div role="status" className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                    VF 검사 중 · {fmtClock(p.vfStartedAt)} 시작 · 다른 장비 호출 금지
                  </div>
                )}
                {isVision && (
                  <div className="w-full space-y-1 mb-1">
                    <MeasureLine label="이전" m={prev} emptyText="이전 값 없음" />
                    {hasAnyValue(p.measure) && <MeasureLine label="오늘" m={p.measure} fields={['ucva', 'bcva', 'nct']} />}
                  </div>
                )}
                {roomHasGat && p.assigned?.[GAT_ID] && (
                  <div className="w-full space-y-1 mb-1">
                    <MeasureLine label="이전" m={prev} fields={['nct', 'gat']} emptyText="이전 안압 없음" />
                    <MeasureLine label="오늘" m={p.measure} fields={['nct', 'gat']} emptyText="오늘 안압 없음" />
                  </div>
                )}
                {!isVision && (() => {
                  const o = orderState(p, settings, room.id);
                  if (!o.needed.length) return null;
                  if (o.complete) {
                    return (
                      <span className="w-full flex items-center gap-2 text-sm text-emerald-700">
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-1"><Check size={13} />처방 완료 {fmtClock(o.rec.at)}</span>
                        <button type="button" onClick={() => setOrdered(p, false)} className="text-xs text-slate-400 underline">처방 완료 취소</button>
                      </span>
                    );
                  }
                  return (
                    <span className="w-full flex items-center gap-2 flex-wrap">
                      <span className="text-sm px-2 py-0.5 rounded-lg bg-orange-100 text-orange-800 font-medium">
                        {o.rec ? `추가 처방 필요: ${o.missing.map(t => t.short || t.name).join(', ')}` : '처방 전'}
                      </span>
                      <button type="button" onClick={() => setOrdered(p, true)} className="text-sm px-3 py-1.5 rounded-lg bg-orange-500 text-white font-medium">처방 완료</button>
                    </span>
                  );
                })()}
                {isVision && (
                  <button type="button" onClick={() => setMeasureFor({ key: pk, mode: 'vision' })} className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium">
                    측정값 입력
                  </button>
                )}
                {needsGatHere && !runningVf && (
                  <button type="button" onClick={() => setMeasureFor({ key: pk, mode: 'gat' })} className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium">
                    GAT 입력
                  </button>
                )}
                {tests.filter(t => p.assigned?.[t.id] && (!isVision || t.id === 'ark')).map(t => (
                  isVfTest(t) && !p.done?.[t.id] ? (
                    <div key={t.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{testLabelWithOptions(t, p.detail?.[t.id])}</span>
                      {runningVf === t.id ? <>
                        <button type="button" onClick={() => changeVf(p, t, 'finish')} className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white">VF 종료</button>
                        <button type="button" onClick={() => changeVf(p, t, 'cancel')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">VF 시작 취소</button>
                      </> : <button type="button" disabled={!!runningVf} onClick={() => changeVf(p, t, 'start')} className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-40">VF 시작</button>}
                    </div>
                  ) : <TestToggle
                    disabled={!!runningVf}
                    key={t.id}
                    label={testLabelWithOptions(t, p.detail?.[t.id])}
                    done={!!p.done?.[t.id]}
                    emphasize={topTest?.id === t.id}
                    onToggle={v => markDone(p, t.id, v)}
                    onSpecial={isVision ? undefined : () => openSpecial(p, t)}
                  />
                ))}
                {isVision && (
                  <button type="button" onClick={() => setMeasureFor({ key: pk, mode: 'prev' })} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-500">
                    이전 값 수정
                  </button>
                )}
                {isVision && firstVisitChip(p)}
                {isVision && <button type="button" onClick={() => mutatePatients(prev => prev.map(x => patientKey(x) === pk ? undoCheckin(x) : x))} className="text-xs px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700">접수 취소</button>}
                <DilationRow p={p} prefs={doctorPrefs} waitMin={settings.dilationWaitMin} mutatePatients={mutatePatients} />
                {otherRooms.length > 0 && (
                  <span className="text-xs text-slate-500">
                    다른 검사실 남음: {otherRooms.map(r => `${r.name} (${pendingTests(p, settings, r.id).map(t => t.short).join(', ')})`).join(', ')}
                  </span>
                )}
                {notes.length > 0 && (
                  <div className="w-full text-xs bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg px-3 py-2 space-y-0.5">
                    {notes.map(n => (
                      <div key={n.id}><span className="font-medium">{n.short}</span> {n.note}</div>
                    ))}
                  </div>
                )}
                <TestPicker p={p} tests={orderForPicking(allTests, settings)} onPick={(t, on) => pickTest(p, t, on)} onSpecial={(t) => openSpecial(p, t)} />
              </PatientRow>
            );
          }}
        />
      )}

      {isVision && (
        <div className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="text-sm font-medium text-slate-500">접수 대기 · {notCheckedIn.length}명</div>
            <SegmentedToggle value={session} onChange={setSession} options={SESSION_OPTIONS} />
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5">
              <Search size={14} className="text-slate-400" />
              <input placeholder="이름·환자번호 찾기" value={query} onChange={e => setQuery(e.target.value)} className="outline-none text-sm w-36" />
            </div>
          </div>
          {notCheckedIn.length === 0 ? (
            <div className="text-sm text-slate-400 py-4">{q ? '찾는 환자가 없습니다' : '접수 대기 환자가 없습니다'}</div>
          ) : notCheckedIn.map(p => (
            <div key={patientKey(p)} className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                    <span className="t-name">{p.name}</span> <span className="text-xs text-slate-400">{p.id}</span>
                    {p.doctor && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{p.doctor}</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">예약 {p.reservation || '-'}</div>
                </div>
                <div className="flex gap-2 shrink-0 items-center">
                  {firstVisitChip(p)}
                  <button type="button" onClick={() => setMeasureFor({ key: patientKey(p), mode: 'prev' })} className="text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600">이전 값</button>
                  <button type="button" onClick={() => checkIn(p)} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-medium">접수</button>
                </div>
              </div>
              <div className="mt-2">
                <MeasureLine label="이전" m={previousMeasure(p, history)} emptyText="이전 값 없음 (이전 값 버튼으로 입력)" />
              </div>
            </div>
          ))}
        </div>
      )}

      <RecentDone count={recent.length}>
        {recent.map(({ p, keys, at }) => {
          const pk = patientKey(p);
          return (
            <RecentRow key={pk} p={p} time={fmtClock(at)}>
              {keys.map(k => (
                <UndoButton key={k} label={`${testLabel(k)} 완료 취소`} onClick={() => writeDone(pk, k, false, null)} />
              ))}
            </RecentRow>
          );
        })}
      </RecentDone>

      {measureFor && measurePatient && (
        <MeasureModal
          key={`${measureFor.key}-${measureFor.mode}`}
          mode={measureFor.mode}
          patient={measurePatient}
          previous={previousMeasure(measurePatient, history)}
          gatAvailable={gatAvailable}
          gatAssigned={!!measurePatient.assigned?.[GAT_ID]}
          onSave={handleMeasureSave}
          onCancel={() => setMeasureFor(null)}
        />
      )}
      {detailFor && detailPatient && detailTest && (
        <TestDetailModal
          key={`${detailFor.key}-${detailFor.testId}`}
          test={detailTest}
          patientName={detailPatient.name}
          on={!!detailPatient.assigned?.[detailTest.id]}
          value={detailPatient.detail?.[detailTest.id]}
          onApply={(d) => {
            const kept = pickDetail({ [detailTest.id]: d }, { [detailTest.id]: true }, [detailTest])[detailTest.id] || null;
            setAssigned(detailFor.key, detailTest.id, true, kept);
            setDetailFor(null);
          }}
          onRemove={() => { setAssigned(detailFor.key, detailTest.id, false); setDetailFor(null); }}
          onCancel={() => setDetailFor(null)}
        />
      )}
      {toastNode}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* 진료실 화면                                                          */
/* ------------------------------------------------------------------ */
function DoctorPicker({ doctors, value, onChange }) {
  if (doctors.length === 0) {
    return <div className="text-sm text-red-600">등록된 교수가 없습니다. 설정 &gt; 교수 관리에서 추가해주세요.</div>;
  }
  return (
    <div className="flex gap-1 bg-white rounded-lg border border-slate-300 p-1 flex-wrap max-w-full">
      {doctors.map(name => (
        <button key={name} type="button" onClick={() => onChange(name)} className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${value === name ? 'bg-amber-600 text-white' : 'text-slate-600'}`}>
          {name}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children, hint }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-medium text-slate-600">{children}</div>
      {hint && <div className="t-hint text-xs text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function SimpleCard({ p, tone = 'slate', children }) {
  const c = COLOR_MAP[tone] || COLOR_MAP.slate;
  return (
    <div className={`bg-white border ${c.border} rounded-xl p-4 mb-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="t-name text-slate-900">{p.name}</span>
        <span className="text-xs text-slate-400">{p.id}</span>
        {p.doctor && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{p.doctor}</span>}
        {p.firstVisit && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">초진</span>}
        {p.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">2차 진료 · {p.primaryDoctor} 후</span>}
      </div>
      {p.sendNote?.text && !p.consultDone && <div className="w-full text-sm bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg px-3 py-1.5 mt-1"><span className="font-medium">{p.sendNote.from || '진료실'} 메모</span> {p.sendNote.text}</div>}
      <div className="flex flex-wrap items-center gap-2 mt-2">{children}</div>
    </div>
  );
}

// 진료실 → 원하는 곳으로 보내기 창
const SEND_DESTS = [
  ['vision', '시력/안압 다시', '시력·안압을 다시 측정합니다'],
  ['exam', '검사실', '누락된 검사를 추가하거나 검사를 다시 합니다'],
  ['treat', '처치실', '처치실에서 확인한 뒤 진료 대기로 돌아옵니다'],
];
function SendPatientModal({ patient, tests, settings, onConfirm, onCancel }) {
  const [dest, setDest] = useState('treat');
  const [sel, setSel] = useState({});
  const [note, setNote] = useState('');
  const ordered = orderForPicking(tests, settings);
  const ready = dest !== 'exam' || ordered.some(t => sel[t.id]);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium text-slate-900 mb-1">{patient.name}님 보내기</h3>
        <p className="text-sm text-slate-500 mb-4">확인이 끝나면 다시 이 진료실 진료 대기로 돌아옵니다.</p>
        <div className="space-y-2 mb-4">
          {SEND_DESTS.map(([k, label, desc]) => (
            <label key={k} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${dest === k ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}>
              <input type="radio" name="send-dest" checked={dest === k} onChange={() => setDest(k)} className="mt-1" />
              <span><span className="font-medium text-slate-900">{label}</span><span className="block text-xs text-slate-500">{desc}</span></span>
            </label>
          ))}
        </div>
        {dest === 'exam' && (
          <div className="flex flex-wrap gap-2 mb-4">
            {ordered.map(t => {
              const on = !!sel[t.id];
              const doneToday = patient.assigned?.[t.id] && patient.done?.[t.id];
              return (
                <button key={t.id} type="button" onClick={() => setSel(x => ({ ...x, [t.id]: !x[t.id] }))}
                  className={`text-sm px-3 py-1.5 rounded-lg border flex items-center gap-1 ${on ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>
                  {on && <Check size={12} />}{t.short || t.name}{doneToday && <span className={`text-xs ${on ? 'text-violet-100' : 'text-slate-400'}`}>(오늘 함 · 다시)</span>}
                </button>
              );
            })}
          </div>
        )}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder={dest === 'treat' ? '전달 메모 (예: 추가 검사 있는지 확인해주세요)' : '전달 메모 (선택, 예: VF 누락되어 다시 부탁드립니다)'}
          className={`${INPUT} mb-6`} />
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="button" disabled={!ready} onClick={() => onConfirm({ dest, sel, note: note.trim() })} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-40">보내기</button>
        </div>
      </div>
    </div>
  );
}

function ConsultView({ patients, allPatients = patients, doctors, doctorPrefs, settings, history, mutatePatients, mutateFu, onBack, lastSync }) {
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [explainFor, setExplainFor] = useState(null);
  const [extraModalFor, setExtraModalFor] = useState(null);
  const [procFor, setProcFor] = useState(null);
  const [toastNode, showToast] = useUndoToast();

  useEffect(() => {
    if (doctors.length && !doctors.includes(selectedDoctor)) setSelectedDoctor(doctors[0]);
  }, [doctors, selectedDoctor]);

  const allTests = sortedTests(settings);
  const waitMin = settings.dilationWaitMin;
  const mine = patients.filter(p => p.doctor === selectedDoctor);
  const explainList = mine.filter(awaitingExplain).sort((a, b) => (a.seenAt || 0) - (b.seenAt || 0));
  const procList = mine.filter(inProfProcedure).sort((a, b) => (a.procOrderedAt || 0) - (b.procOrderedAt || 0));
  const inRoom = mine.find(inConsult);
  const waiting = mine.filter(p => consultWaiting(p, settings)).sort(byQueue);
  const onHold = mine.filter(p => p.consultHold && !p.consultDone && !p.seen && (!allDone(p, settings) || p.treatRequest));
  const testing = mine.filter(p => !p.consultDone && !p.consultHold && !p.seen && p.checkin && !allDone(p, settings) && !inTreatRoom(p, settings)).length;
  const residentCount = mine.filter(p => inTreatRoom(p, settings)).length;
  const recent = mine
    .filter(p => p.consultDone)
    .sort((a, b) => (b.consultDoneAt || 0) - (a.consultDoneAt || 0))
    .slice(0, 10);

  const patch = (pk, fn) => patchPatient(mutatePatients, pk, fn);
  const doctor = selectedDoctor;

  // 되돌릴 때, 진료실이 비어 있으면 다시 진료 중으로, 아니면 진료 대기 맨 앞으로
  const backToRoom = (pk, extra = () => ({})) => mutatePatients(prev => {
    const someoneIn = prev.some(x => patientKey(x) !== pk && x.doctor === doctor && inConsult(x));
    return prev.map(x => (patientKey(x) === pk ? { ...x, ...extra(x), seen: false, seenAt: null, calledRoom: someoneIn ? null : doctor } : x));
  });

  const finishConsult = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    patch(pk, () => ({ seen: true, seenAt: at, calledRoom: null }));
    showToast(`${p.name} 진료 완료, 설명 대기로`, () => backToRoom(pk));
  };

  const orderProcedures = (chosen, note) => {
    const p = procFor;
    const pk = patientKey(p);
    const at = Date.now();
    setProcFor(null);
    const items = chosen.map(c => ({
      uid: newId('pr'), procId: c.id, name: c.name, performer: c.performer, note, done: false, doneAt: null, orderedAt: at,
    }));
    patch(pk, x => ({ seen: true, seenAt: at, calledRoom: null, procOrderedAt: at, procedures: [...(x.procedures || []), ...items] }));
    const where = items.some(i => i.performer === 'prof') ? '처치 대기로' : '처치실로';
    showToast(`${p.name} 처치 지정, ${where}`, () => backToRoom(pk, x => ({ procedures: (x.procedures || []).filter(i => i.orderedAt !== at) })));
  };

  const finishProfProcedure = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    patch(pk, x => ({ procedures: (x.procedures || []).map(i => (i.performer === 'prof' && !i.done ? { ...i, done: true, doneAt: at } : i)) }));
    const next = pendingProcedures(p, 'resident').length ? '처치실로' : '설명 대기로';
    showToast(`${p.name} 처치 완료, ${next}`, () => patch(pk, x => ({
      procedures: (x.procedures || []).map(i => (i.doneAt === at ? { ...i, done: false, doneAt: null } : i)),
    })));
  };

  const completeExplain = async (sel, detail, dil, _triage, linkDoctor) => {
    const p = explainFor;
    const pk = patientKey(p);
    const at = Date.now();
    setExplainFor(null);
    mutateFu(prev => saveFollowup(prev, p.id, dil?.doctor || p.doctor, {
        ...sel,
        detail,
        dilate: dil?.mode === 'yes' || dil?.mode === 'no' ? dil.mode : undefined,
        dilateEye: dil?.mode === 'yes' ? dilateEyeOf(dil.eye) : undefined,
        cr: dil?.cr || undefined,
        name: p.name,
        updatedAt: at,
    }));
    // 오늘 다른 교수 진료 추가: 그 교수님의 이전 정보(FU)를 붙여 2차 진료로 연결
    let extra = null;
    if (linkDoctor) {
      let fu = {};
      try { fu = await loadFu(); } catch { /* 이전 정보 없이 추가 */ }
      extra = buildPatient({ id: p.id, name: p.name, date: p.date, doctor: linkDoctor, reservation: '', firstVisit: false }, fu, settings);
    }
    const undoDone = () => mutatePatients(prev => deactivateLinked(prev.map(x => (patientKey(x) === pk ? { ...x, consultDone: false, consultDoneAt: null } : x)), pk));
    mutatePatients(prev => {
      let next = prev.map(x => (patientKey(x) === pk ? { ...x, consultDone: true, consultDoneAt: at } : x));
      if (extra) next = mergePatientList(next, [extra], doctorPrefs, settings).next;
      return activateLinked(next, pk, settings, at);
    });
    const nextVisit = linkDoctor || allPatients.find(x => x.primaryKey === pk && x.linkWaiting)?.doctor;
    const via = settings.linkCheckAdded !== false && linkDoctor ? '처치실 추가 검사 확인 후 ' : '';
    showToast(`${p.name} 설명 완료${nextVisit ? `, ${via}${nextVisit} 2차 진료로` : ''}`, undoDone);
  };

  const confirmExtra = (sel, detail) => {
    const pk = patientKey(extraModalFor);
    setExtraModalFor(null);
    applyExtraTests(pk, allTests.filter(t => sel[t.id]).map(t => t.id), detail, undefined);
  };
  // 검사를 추가(또는 다시)하고 검사실 대기열 앞쪽으로 보냅니다. sendNote 가 있으면 전달 메모도 남깁니다.
  const applyExtraTests = (pk, chosen, detail, sendNote) => {
    if (!chosen.length) return;
    mutatePatients(prev => {
      const target = prev.find(p => patientKey(p) === pk);
      if (!target) return prev;
      const assigned = { ...target.assigned };
      const done = { ...target.done };
      const nextDetail = { ...(target.detail || {}) };
      chosen.forEach(k => {
        assigned[k] = true;
        done[k] = false;
        if (detail?.[k]) nextDetail[k] = detail[k];
      });
      const others = prev
        .filter(p => patientKey(p) !== pk && p.date === target.date && !p.consultDone && pendingRooms(p, settings).length > 0)
        .sort(byQueue);
      let boosted = target.queueKey;
      if (others.length === 1) boosted = others[0].queueKey + 0.0005;
      else if (others.length >= 2) boosted = (others[0].queueKey + others[1].queueKey) / 2;
      boosted = Math.min(boosted, target.queueKey);
      return prev.map(p => (patientKey(p) === pk
        ? { ...p, assigned, done, detail: nextDetail, orders: clearOrders(p, chosen), calledRoom: null, consultHold: true, queueKey: boosted, ...(sendNote !== undefined ? { sendNote } : {}) }
        : p));
    });
  };

  // 진료실에서 원하는 곳으로 환자 보내기 (누락 검사·재검·처치실 확인)
  const [sendFor, setSendFor] = useState(null);
  const sendPatient = (p, { dest, sel, note }) => {
    const pk = patientKey(p);
    const at = Date.now();
    setSendFor(null);
    const sendNote = note ? { text: note, from: doctor, at } : null;
    const before = { done: p.done, doneAt: p.doneAt, assigned: p.assigned, detail: p.detail, queueKey: p.queueKey, calledRoom: p.calledRoom, consultHold: p.consultHold, sendNote: p.sendNote, treatRequest: p.treatRequest };
    const undo = () => patch(pk, () => before);
    if (dest === 'exam') {
      const ids = allTests.filter(t => sel[t.id]).map(t => t.id);
      applyExtraTests(pk, ids, {}, sendNote);
      showToast(`${p.name} 검사실로 보냈습니다 (${allTests.filter(t => sel[t.id]).map(t => t.short || t.name).join(', ')})`, undo);
      return;
    }
    patch(pk, x => (dest === 'vision'
      ? { calledRoom: null, consultHold: true, sendNote, done: { ...x.done, [VISION_KEY]: false }, doneAt: { ...x.doneAt, [VISION_KEY]: null } }
      : { calledRoom: null, consultHold: true, sendNote, treatRequest: { at, from: doctor } }));
    showToast(`${p.name} ${dest === 'vision' ? '시력/안압 검사실' : '처치실'}로 보냈습니다`, undo);
  };

  // 다른 교수님 진료 추가 (2차 진료): 이 진료의 설명 완료 후 시작
  const nextVisitOf = (p) => allPatients.filter(x => x.primaryKey === patientKey(p));
  const nextVisitNote = (p) => {
    const next = nextVisitOf(p);
    return next.length ? <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700">설명 완료 후 → {next.map(x => x.doctor).join(', ')} 2차 진료</span> : null;
  };

  const inRoomTests = inRoom ? allTests.filter(t => inRoom.assigned?.[t.id]) : [];
  const inRoomNotes = inRoom ? notesOf(inRoom, allTests) : [];
  const dilationInitial = (p) => ({
    mode: needsDilation(p, doctorPrefs) ? 'yes' : 'no',
    cr: !!p.cr,
    eye: p.dilateEye,
  });

  return (
    <ScreenShell
      title="진료실"
      color="amber"
      onBack={onBack}
      lastSync={lastSync}
      count={waiting.length}
      extra={<DoctorPicker doctors={doctors} value={selectedDoctor} onChange={setSelectedDoctor} />}
    >
      {!selectedDoctor ? (
        <EmptyState text="상단에서 교수님을 선택해주세요" />
      ) : (
        <>
          {explainList.length > 0 && (
            <div className="mb-6">
              <SectionTitle hint="안내가 끝나면 설명 완료를 누르고 다음 내원 검사를 지정하세요">설명 대기 · {explainList.length}명</SectionTitle>
              {explainList.map(p => (
                <SimpleCard key={patientKey(p)} p={p} tone="emerald">
                  <ProcedureList p={p} />
                  {nextVisitNote(p)}
                  <button type="button" onClick={() => setExplainFor(p)} className="text-sm px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium">
                    설명 완료
                  </button>
                </SimpleCard>
              ))}
            </div>
          )}

          {procList.length > 0 && (
            <div className="mb-6">
              <SectionTitle hint="교수님이 직접 하는 처치입니다">처치 대기 · {procList.length}명</SectionTitle>
              {procList.map(p => (
                <SimpleCard key={patientKey(p)} p={p} tone="rose">
                  <ProcedureList p={p} onCancel={uid => cancelProcedure(mutatePatients, patientKey(p), uid)} />
                  <DilationRow p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
                  <button type="button" onClick={() => finishProfProcedure(p)} className="text-sm px-4 py-2 rounded-lg bg-rose-600 text-white font-medium">
                    처치 완료
                  </button>
                </SimpleCard>
              ))}
            </div>
          )}

          {inRoom && (
            <div className="bg-white border-2 border-amber-300 rounded-2xl p-6 mb-6">
              <div className="text-sm text-amber-600 font-medium mb-1">현재 진료 중</div>
              <div className="text-2xl font-semibold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
                {inRoom.name}
                {inRoom.firstVisit && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-normal">초진</span>}
                {inRoom.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 font-normal">2차 진료 · {inRoom.primaryDoctor} 후</span>}
                {nextVisitNote(inRoom)}
              </div>
              <div className="text-sm text-slate-400 mb-4">{inRoom.id} · 예약 {inRoom.reservation}</div>
              <div className="bg-slate-50 rounded-xl p-3 mb-3">
                <MeasureTable today={inRoom.measure} prev={previousMeasure(inRoom, history)} />
              </div>
              {inRoomTests.length > 0 && (
                <div className="text-sm text-slate-700 mb-2">
                  <span className="text-xs text-slate-400 mr-2">오늘 검사</span>
                  {inRoomTests.map(t => testLabelWithOptions(t, inRoom.detail?.[t.id])).join(', ')}
                </div>
              )}
              {inRoomNotes.length > 0 && (
                <div className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg px-3 py-2 space-y-0.5 mb-2">
                  {inRoomNotes.map(n => <div key={n.id}><span className="font-medium">{n.short}</span> {n.note}</div>)}
                </div>
              )}
              <div className="mb-5">
                <DilationRow p={inRoom} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button type="button" onClick={() => setExtraModalFor(inRoom)} className="py-3 rounded-xl border-2 border-amber-300 text-amber-700 font-medium">추가 검사</button>
                <button type="button" onClick={() => setProcFor(inRoom)} className="py-3 rounded-xl border-2 border-rose-300 text-rose-700 font-medium">처치</button>
                <button type="button" onClick={() => finishConsult(inRoom)} className="py-3 rounded-xl bg-amber-600 text-white font-medium">진료 완료</button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setSendFor(inRoom)} className="text-sm px-4 py-2 rounded-lg border-2 border-indigo-300 text-indigo-700 font-medium">보내기 (시력·검사실·처치실)</button>
                <button type="button" onClick={() => patch(patientKey(inRoom), () => ({ calledRoom: null }))} className="py-2 text-sm text-slate-400">호출 취소</button>
              </div>
            </div>
          )}

          <SectionTitle>
            진료 대기 · {waiting.length}명
            {testing > 0 ? ` (검사 진행 중 ${testing}명)` : ''}
            {residentCount > 0 ? ` (처치실 ${residentCount}명)` : ''}
          </SectionTitle>
          {waiting.length === 0 ? (
            <EmptyState text="검사를 모두 마친 환자가 없습니다" />
          ) : (
            <DraggableList
              items={waiting}
              getKey={patientKey}
              onMove={(key, to) => moveInQueue(mutatePatients, waiting, key, to)}
              renderItem={(p, i, handle) => {
                const pk = patientKey(p);
                return (
                  <PatientRow
                    p={p}
                    index={i}
                    color="amber"
                    handle={handle}
                    onUp={() => moveInQueue(mutatePatients, waiting, pk, i - 1)}
                    onDown={() => moveInQueue(mutatePatients, waiting, pk, i + 1)}
                  >
                    <div className="w-full mb-1">
                      <MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" />
                    </div>
                    <DilationRow p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
                    <button
                      type="button"
                      disabled={!!inRoom}
                      onClick={() => patch(pk, () => ({ calledRoom: doctor, sendNote: null }))}
                      className={`text-sm px-3 py-1.5 rounded-lg font-medium ${inRoom ? 'bg-slate-200 text-slate-400' : 'bg-amber-600 text-white'}`}
                    >
                      진료 호출
                    </button>
                    <button type="button" onClick={() => setSendFor(p)} className="text-sm px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700">보내기</button>
                    {inRoom && i === 0 && <span className="text-xs text-slate-400">현재 환자 진료를 마친 뒤 호출할 수 있어요</span>}
                  </PatientRow>
                );
              }}
            />
          )}

          {onHold.length > 0 && (
            <div className="mt-8">
              <SectionTitle>진료 보류 (추가 검사 중) · {onHold.length}명</SectionTitle>
              {onHold.map(p => (
                <div key={patientKey(p)} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3 mb-2">
                  <div className="text-sm text-slate-700"><span className="t-name text-slate-900">{p.name}</span> <span className="text-xs text-slate-400">{p.id}</span></div>
                  <div className="text-xs text-slate-500">{getStage(p, settings).label}</div>
                </div>
              ))}
            </div>
          )}

          <RecentDone count={recent.length}>
            {recent.map(p => (
              <RecentRow key={patientKey(p)} p={p} time={fmtClock(p.consultDoneAt)}>
                <UndoButton label="설명 완료 취소" onClick={() => mutatePatients(prev => deactivateLinked(prev.map(x => (patientKey(x) === patientKey(p) ? { ...x, consultDone: false, consultDoneAt: null } : x)), patientKey(p)))} />
              </RecentRow>
            ))}
          </RecentDone>
        </>
      )}

      {explainFor && (
        <TestCheckModal
          key={`explain-${patientKey(explainFor)}`}
          title={`${explainFor.name}님 다음 내원 검사`}
          followup={{ doctor: explainFor.doctor, doctors, prefs: doctorPrefs }}
          linkDoctors={doctors.filter(d => !allPatients.some(x => x.id === explainFor.id && x.date === explainFor.date && x.doctor === d))}
          subtitle="다음 내원 때 필요한 검사를 체크하고 설명 완료를 누르세요"
          tests={allTests}
          settings={settings}
          initial={explainFor.assigned}
          initialDetail={explainFor.detail}
          dilation={{ crAvailable: !!doctorPrefs?.[explainFor.doctor]?.cr, initial: dilationInitial(explainFor) }}
          confirmLabel="설명 완료"
          onConfirm={completeExplain}
          onCancel={() => setExplainFor(null)}
        />
      )}
      {extraModalFor && (
        <TestCheckModal
          key={`extra-${patientKey(extraModalFor)}`}
          title={`${extraModalFor.name}님 추가 검사`}
          subtitle="오늘 추가로 할 검사를 체크해주세요. 등록하면 진료 보류로 바뀌고, 검사실 대기열 앞쪽에 들어갑니다."
          tests={allTests}
          settings={settings}
          initial={{}}
          confirmLabel="추가 검사 등록"
          onConfirm={confirmExtra}
          onCancel={() => setExtraModalFor(null)}
        />
      )}
      {sendFor && (
        <SendPatientModal
          key={`send-${patientKey(sendFor)}`}
          patient={sendFor}
          tests={allTests}
          settings={settings}
          onConfirm={v => sendPatient(sendFor, v)}
          onCancel={() => setSendFor(null)}
        />
      )}
      {procFor && (
        <ProcedureModal
          key={`proc-${patientKey(procFor)}`}
          patient={procFor}
          procedures={settings.procedures || []}
          onConfirm={orderProcedures}
          onCancel={() => setProcFor(null)}
        />
      )}
      {toastNode}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* 처치실 화면 (초진 예진 + 전공의 처치)                                  */
/* ------------------------------------------------------------------ */
function defaultTriageRequired(p, doctorPrefs) {
  // 이미 지정한 환자별 선택을 우선하고, 신규 지정은 담당 교수 기본값을 사용한다.
  if (typeof p.triageRequired === 'boolean') return p.triageRequired;
  return doctorPrefs?.[p.doctor]?.triageRequired !== false;
}

function ProcedureRoomView({ patients, settings, doctorPrefs, history, mutatePatients, onBack, lastSync }) {
  const [triageFor, setTriageFor] = useState(null);
  const [sortMode, changeSort] = useSortMode('sort-procedure');
  const order = sortMode === 'name' ? byName : byQueue;
  const [toastNode, showToast] = useUndoToast();
  const allTests = sortedTests(settings);
  const waitMin = settings.dilationWaitMin;

  const requests = patients.filter(treatRequested).sort(order);
  const [reqFor, setReqFor] = useState(null);
  // 진료실 요청: 확인 끝 → 진료 대기로 (필요하면 검사를 붙여서 검사실로)
  const finishRequest = (p, testIds = [], detail = {}) => {
    const pk = patientKey(p);
    const before = { treatRequest: p.treatRequest, assigned: p.assigned, done: p.done, detail: p.detail };
    patchPatient(mutatePatients, pk, x => {
      const assigned = { ...x.assigned }, done = { ...x.done }, nd = { ...(x.detail || {}) };
      testIds.forEach(id => { assigned[id] = true; done[id] = false; if (detail?.[id]) nd[id] = detail[id]; });
      return { treatRequest: null, assigned, done, detail: nd, orders: clearOrders(x, testIds) };
    });
    showToast(`${p.name} ${testIds.length ? '검사 추가, 검사 후 진료 대기로' : '확인 완료, 진료 대기로'}`, () => patchPatient(mutatePatients, pk, () => before));
  };
  const triage = patients.filter(needsTriageAssign).sort(order);
  const procs = patients.filter(p => needsTriageExam(p, settings) || inResidentProcedure(p)).sort(order);
  const recent = [
    ...patients.filter(p => p.firstVisit && p.triageDone).map(p => ({ p, kind: 'triage', at: p.triageAt || 0 })),
    ...patients
      .filter(p => (p.procedures || []).some(i => i.performer === 'resident' && i.done))
      .map(p => ({ p, kind: 'proc', at: Math.max(0, ...(p.procedures || []).filter(i => i.performer === 'resident' && i.done).map(i => i.doneAt || 0)) })),
  ].sort((a, b) => b.at - a.at).slice(0, 10);

  const confirmTriage = (sel, detail, _dilation, triageRequired = true) => {
    const p = triageFor;
    const pk = patientKey(p);
    const at = Date.now();
    setTriageFor(null);
    const chosen = allTests.filter(t => sel[t.id]);
    patchPatient(mutatePatients, pk, x => {
      if (!needsTriageAssign(x)) return {};
      const assigned = { ...x.assigned };
      const done = { ...x.done };
      const nd = { ...(x.detail || {}) };
      allTests.forEach(t => {
        assigned[t.id] = !!sel[t.id];
        if (!sel[t.id]) { done[t.id] = false; delete nd[t.id]; }
        else if (detail?.[t.id]) nd[t.id] = detail[t.id];
        else delete nd[t.id];
      });
      return { assigned, done, detail: nd, triageAssigned: true, triageAssignedAt: at, triageRequired: x.firstVisit ? triageRequired : false };
    });
    const pending = chosen.filter(t => !p.done?.[t.id]);
    const withTriage = p.firstVisit && triageRequired;
    showToast(`${p.name} ${p.firstVisit ? '검사 지정' : '추가 검사 확인'} 완료, ${pending.length ? (withTriage ? '검사 후 처치실 예진으로' : '검사 후 진료 대기로') : (withTriage ? '처치 대기에서 예진' : '진료 대기로')}`, () => patchPatient(mutatePatients, pk, x => (!activeVf(x) && !x.triageDone ? { triageAssigned: false, triageAssignedAt: null, triageRequired: p.triageRequired } : {})));
  };

  const finishTriage = (p) => {
    const at = Date.now();
    patchPatient(mutatePatients, patientKey(p), x => needsTriageExam(x, settings) ? { triageDone: true, triageAt: at } : {});
    showToast(p.name + ' 예진 완료, 진료 대기로', () => patchPatient(mutatePatients, patientKey(p), () => ({ triageDone: false, triageAt: null })));
  };

  const finishResident = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    patchPatient(mutatePatients, pk, x => ({
      procedures: (x.procedures || []).map(i => (i.performer === 'resident' && !i.done ? { ...i, done: true, doneAt: at } : i)),
    }));
    showToast(`${p.name} 처치 완료, 설명 대기로`, () => patchPatient(mutatePatients, pk, x => ({
      procedures: (x.procedures || []).map(i => (i.doneAt === at ? { ...i, done: false, doneAt: null } : i)),
    })));
  };

  const undoRecent = ({ p, kind }) => {
    const pk = patientKey(p);
    if (kind === 'triage') {
      patchPatient(mutatePatients, pk, () => ({ triageDone: false, triageAt: null }));
    } else {
      patchPatient(mutatePatients, pk, x => ({
        procedures: (x.procedures || []).map(i => (i.performer === 'resident' ? { ...i, done: false, doneAt: null } : i)),
      }));
    }
  };

  return (
    <ScreenShell title="처치실" color="indigo" onBack={onBack} lastSync={lastSync} count={requests.length + triage.length + procs.length}>
      <div className="flex justify-end mb-3">
        <SegmentedToggle value={sortMode} onChange={changeSort} options={SORT_OPTIONS} />
      </div>
      {requests.length > 0 && (
        <div className="mb-8">
          <SectionTitle hint="진료실에서 확인을 요청한 환자입니다. 메모를 확인하고, 추가할 검사가 있으면 지정하세요.">진료실 요청 확인 · {requests.length}명</SectionTitle>
          {requests.map(p => (
            <SimpleCard key={patientKey(p)} p={p} tone="amber">
              <div className="w-full"><MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" /></div>
              <button type="button" onClick={() => setReqFor(p)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">검사 추가</button>
              <button type="button" onClick={() => finishRequest(p)} className="text-sm px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 font-medium">확인 완료 · 진료 대기로</button>
            </SimpleCard>
          ))}
        </div>
      )}
      <div className="mb-8">
        <SectionTitle hint="초진은 오늘 할 검사와 예진 여부를, 2차 진료는 다음 교수님 진료 전에 추가할 검사를 지정하세요.">
          검사 지정 대기 (초진 · 2차 진료) · {triage.length}명
        </SectionTitle>
        {triage.length === 0 ? (
          <div className="text-sm text-slate-400 py-3">검사 지정 대기 환자가 없습니다</div>
        ) : triage.map(p => {
          const doneTests = allTests.filter(t => p.done?.[t.id]);
          return (
          <SimpleCard key={patientKey(p)} p={p} tone="sky">
            <div className="w-full">
              <MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" />
            </div>
            {p.addOnCheck && doneTests.length > 0 && <div className="w-full text-xs text-slate-500">오늘 이미 한 검사: {doneTests.map(t => t.short || t.name).join(', ')}</div>}
            <DilationRow p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
            <button type="button" onClick={() => setTriageFor(p)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">
              {p.firstVisit ? '검사 지정' : '추가 검사 확인'}
            </button>
          </SimpleCard>
          );
        })}
      </div>

      <div>
        <SectionTitle hint="검사를 마친 초진 환자의 예진과 전공의 처치를 진행합니다.">처치 대기 · {procs.length}명</SectionTitle>
        {procs.length === 0 ? (
          <div className="text-sm text-slate-400 py-3">처치 대기 환자가 없습니다</div>
        ) : procs.map(p => (
          <SimpleCard key={patientKey(p)} p={p} tone="indigo">
            {needsTriageExam(p, settings) && <>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">예진</span>
              <div className="w-full"><MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" /></div>
              <button type="button" onClick={() => finishTriage(p)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">예진 완료</button>
            </>}
            <ProcedureList p={p} performer="resident" onCancel={uid => cancelProcedure(mutatePatients, patientKey(p), uid)} />
            <DilationRow p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
            {inResidentProcedure(p) && <button type="button" onClick={() => finishResident(p)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">
              처치 완료
            </button>}
          </SimpleCard>
        ))}
      </div>

      <RecentDone count={recent.length}>
        {recent.map(r => (
          <RecentRow key={`${patientKey(r.p)}-${r.kind}`} p={r.p} time={fmtClock(r.at)}>
            <UndoButton label={r.kind === 'triage' ? '예진 완료 취소' : '처치 완료 취소'} onClick={() => undoRecent(r)} />
          </RecentRow>
        ))}
      </RecentDone>

      {reqFor && (
        <TestCheckModal
          key={`req-${patientKey(reqFor)}`}
          title={`${reqFor.name}님 추가 검사`}
          subtitle={`${reqFor.sendNote?.text ? `진료실 메모: ${reqFor.sendNote.text} · ` : ''}추가할 검사를 체크하세요. 검사를 마치면 진료 대기로 돌아갑니다.`}
          tests={allTests}
          settings={settings}
          initial={{}}
          initialDetail={{}}
          confirmLabel="검사 추가"
          onConfirm={(sel, detail) => { const p = reqFor; setReqFor(null); finishRequest(p, allTests.filter(t => sel[t.id]).map(t => t.id), detail); }}
          onCancel={() => setReqFor(null)}
        />
      )}
      {triageFor && (
        <TestCheckModal
          key={`triage-${patientKey(triageFor)}`}
          title={triageFor.firstVisit ? `${triageFor.name}님 검사 지정` : `${triageFor.name}님 2차 진료 추가 검사 (${triageFor.doctor})`}
          subtitle={triageFor.firstVisit
            ? '오늘 할 검사와 검사 후 예진 여부를 선택하세요. 검사가 없으면 선택한 대기 명단으로 바로 이동합니다.'
            : `${triageFor.primaryDoctor || '1차'} 진료를 마쳤습니다. ${triageFor.doctor} 진료 전에 할 검사를 체크하세요. 이미 한 검사는 다시 하지 않습니다. 없으면 바로 진료 대기로 이동합니다.${allTests.some(t => triageFor.done?.[t.id]) ? ` (오늘 한 검사: ${allTests.filter(t => triageFor.done?.[t.id]).map(t => t.short || t.name).join(', ')})` : ''}`}
          tests={allTests}
          settings={settings}
          initial={triageFor.assigned}
          initialDetail={triageFor.detail}
          triageChoice={triageFor.firstVisit ? defaultTriageRequired(triageFor, doctorPrefs) : undefined}
          confirmLabel={triageFor.firstVisit ? '검사 지정 완료' : '확인 완료'}
          onConfirm={confirmTriage}
          onCancel={() => setTriageFor(null)}
        />
      )}
      {toastNode}
    </ScreenShell>
  );
}

// 명단 관리: 이름·환자번호·예약시간 수정
function PatientInfoModal({ patient, onSave, onCancel }) {
  const [v, setV] = useState({ id: patient.id || '', name: patient.name || '', reservation: patient.reservation || '' });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-slate-900 mb-1">{patient.name}님 정보 수정</h3>
        <p className="text-sm text-slate-500 mb-4">이름·환자번호는 같은 날 이 환자의 모든 진료에 함께 바뀝니다. 이미 접수한 환자는 예약시간을 바꿔도 대기 순서는 그대로입니다.</p>
        <div className="space-y-3">
          <Field label="이름"><input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} className={INPUT} /></Field>
          <Field label="환자번호"><input value={v.id} onChange={e => setV({ ...v, id: e.target.value })} className={INPUT} /></Field>
          <Field label="예약시간 (예: 09:30)"><input value={v.reservation} onChange={e => setV({ ...v, reservation: e.target.value })} className={INPUT} /></Field>
        </div>
        {v.id.trim() !== patient.id && <p className="text-xs text-amber-700 mt-3">환자번호를 바꾸면 새 번호의 이전 정보(FU)는 자동으로 붙지 않습니다. 필요하면 검사를 직접 지정해주세요.</p>}
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="button" onClick={() => onSave(v)} className="flex-1 py-3 rounded-xl bg-slate-800 text-white font-medium">저장</button>
        </div>
      </div>
    </div>
  );
}

// 명단 올리기 결과 요약 + 파일에서 빠진 환자 삭제 버튼
function UploadResult({ result, patients, onRemove, onShowList }) {
  const { date, doctor, total, stats, missing } = result;
  const byKey = new Map(patients.map(p => [patientKey(p), p]));
  const stillMissing = missing.map(k => byKey.get(k)).filter(Boolean);
  const withFu = stats ? stats.added.filter(hasFollowupApplied).length : 0;
  const fv = stats ? stats.added.filter(p => p.firstVisit).length : 0;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
      <div className="font-medium text-slate-900">{date} {doctor} 명단 · 파일 속 환자 {total}명</div>
      {stats ? (
        <ul className="space-y-1">
          <li>새로 추가 <b>{stats.added.length}명</b>{stats.added.length > 0 && ` (이전 정보 적용 ${withFu}명 · 이전 정보 없음 ${stats.added.length - withFu}명${fv ? ` · 초진 ${fv}명` : ''})`}</li>
          {stats.timeChanged.length > 0 && <li>이미 있어 <b>예약시간만 변경 {stats.timeChanged.length}명</b>: {stats.timeChanged.slice(0, 8).map(p => `${p.name} ${p.reservation || '-'}→${p.newReservation}`).join(', ')}{stats.timeChanged.length > 8 ? ` 외 ${stats.timeChanged.length - 8}명` : ''}</li>}
          {stats.unchanged.length > 0 && <li>이미 있어 그대로 둠 {stats.unchanged.length}명</li>}
          {stats.linked.length > 0 && <li className="text-fuchsia-800">같은 날 다른 교수님 명단에도 있어 <b>두 교수님 진료로 연결 {stats.linked.length}명</b>: {stats.linked.slice(0, 8).map(p => `${p.name}(${p.first ? `${doctor} 먼저 → ${p.others.join(', ')}` : `${p.others.join(', ')} → ${doctor}`})`).join(', ')}{stats.linked.length > 8 ? ` 외 ${stats.linked.length - 8}명` : ''} · 검사는 1차 진료 전에 함께 합니다. 순서는 명단 관리에서 바꿀 수 있어요.</li>}
        </ul>
      ) : <div className="text-red-600">저장하지 못했습니다. 서버 연결을 확인하고 다시 올려주세요.</div>}
      {stillMissing.length > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
          <div className="font-medium text-orange-900 mb-1">이번 파일에 없는 환자 {stillMissing.length}명</div>
          <p className="text-xs text-orange-800 mb-2">같은 날짜·교수 명단에 있었지만 이번 파일에는 없습니다. 예약이 취소된 환자인지 확인한 뒤 삭제하세요. (삭제 버튼은 두 번 눌러야 삭제됩니다)</p>
          {stillMissing.map(p => (
            <div key={patientKey(p)} className="flex items-center justify-between gap-2 py-1 border-t border-orange-200 first:border-t-0">
              <span><span className="t-name text-slate-900">{p.name}</span> <span className="text-xs text-slate-500">{p.id} · 예약 {p.reservation || '-'}{p.checkin ? ` · 접수 ${p.checkin}` : ''}</span></span>
              <ConfirmButton label="삭제" onConfirm={() => onRemove(patientKey(p))} />
            </div>
          ))}
        </div>
      )}
      {stats && (
        <button type="button" onClick={onShowList} className="text-xs underline text-slate-600">명단 관리에서 보기</button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 관리자 화면                                                          */
/* ------------------------------------------------------------------ */
function AdminView({ patients, doctors, doctorPrefs, settings, fuMap, mutatePatients, mutateFu, mutateDoctors, mutateDoctorPrefs, onBack, lastSync }) {
  const [todayDetail, setTodayDetail] = useState(null);
  const todayEdit = patients.find(p => patientKey(p) === todayDetail?.key);
  const todayTest = settings.tests.find(t => t.id === todayDetail?.testId);
  const setTodayTest = (key, test, on, detail) => mutatePatients(prev => prev.map(p => {
    if (patientKey(p) !== key) return p;
    const details = { ...p.detail };
    if (detail !== undefined) { if (detail) details[test.id] = detail; else delete details[test.id]; }
    return updateTodayTests(p, [test], { ...p.assigned, [test.id]: on }, details);
  }));
  const [tab, setTab] = useState('upload');
  const [batchDate, setBatchDate] = useState(todayISO());
  const [batchDoctor, setBatchDoctor] = useState('');
  const [manual, setManual] = useState({ id: '', name: '', reservation: '', firstVisit: false });
  const [manageDate, setManageDate] = useState(todayISO());
  const [fuSearch, setFuSearch] = useState('');
  const [fuEdit, setFuEdit] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (doctors.length && !doctors.includes(batchDoctor)) setBatchDoctor(doctors[0]);
  }, [doctors, batchDoctor]);

  const allTests = sortedTests(settings);

  const [uploadResult, setUploadResult] = useState(null);
  const [sortMode, changeSort] = useSortMode('admin-sort');
  const [session, setSession] = useState('all');

  // 이미 명단에 있는 환자는 덮어쓰지 않습니다 (mergePatientList 참고). 저장된 결과의 통계를 돌려줍니다.
  const upsert = async (news) => {
    let stats = null;
    await mutatePatients(prev => {
      const r = mergePatientList(prev, news, doctorPrefs, settings);
      stats = r.stats;
      return r.next;
    });
    return stats;
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!batchDoctor) { setMessage('먼저 담당 교수를 선택해주세요.'); e.target.value = ''; return; }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      // 환자번호·이름은 엑셀 화면에 보이는 글자 그대로 읽습니다 (예: 앞자리 0 유지)
      const shown = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      const currentFu = await loadFu();
      const news = rows
        .map((row, i) => ({
          // 양식: 예약 | 환자번호 | 환자명 | 초재진 — '재진'이 아니면 모두 초진
          id: String(shown[i]?.['환자번호'] ?? row['환자번호'] ?? '').trim(),
          name: String(shown[i]?.['환자명'] ?? row['환자명'] ?? '').trim(),
          reservation: normalizeTime(row['예약']),
          firstVisit: !String(row['초재진'] ?? '').includes('재진'),
          date: batchDate,
          doctor: batchDoctor,
        }))
        .filter(r => r.id);
      const uniq = [...new Map(news.map(r => [r.id, r])).values()].map(r => buildPatient(r, currentFu, settings));
      if (!uniq.length) {
        setUploadResult(null);
        setMessage('환자를 찾지 못했습니다. 첫 줄에 예약 / 환자번호 / 환자명 / 초재진 제목이 있는지 확인해주세요.');
        e.target.value = '';
        return;
      }
      let stats = null;
      try { stats = await upsert(uniq); } catch { /* 저장 실패는 결과 창에 표시 */ }
      const ids = new Set(uniq.map(p => p.id));
      // 같은 날짜·같은 교수 명단에 있었는데 이번 파일에는 없는 환자 → 사용자가 확인 후 삭제
      const missing = patients
        .filter(p => p.date === batchDate && p.doctor === batchDoctor && !ids.has(p.id))
        .map(p => patientKey(p));
      setMessage('');
      setUploadResult({ date: batchDate, doctor: batchDoctor, total: uniq.length, stats, missing });
    } catch (err) {
      setMessage('파일을 읽지 못했습니다. 엑셀(.xlsx) 파일인지 확인해주세요.');
    }
    e.target.value = '';
  };

  const loadSample = async () => {
    let docsNow = doctors;
    if (!docsNow.length) {
      docsNow = ['김안과 교수', '이안과 교수'];
      await mutateDoctors(() => docsNow);
    }
    await mutateFu(prev => ({
      ...prev,
      '10001': { oct: true, vf: true, detail: { oct: { options: ['Macular', 'Disc'], note: '' }, vf: { options: [], note: '24-2C' } } },
      '10004': { wfp: true, idra: true, gat: true },
    }));
    if (docsNow[1] && !doctorPrefs?.[docsNow[1]]) {
      await mutateDoctorPrefs(prev => ({ ...prev, [docsNow[1]]: { dilate: true, cr: true } }));
    }
    const freshFu = await loadFu();
    const news = sampleRows().map((r, i) => buildPatient({ ...r, firstVisit: r.id === '10003', date: todayISO(), doctor: docsNow[i % docsNow.length] }, freshFu, settings));
    await upsert(news);
    setUploadResult(null);
    setMessage(`샘플 환자 ${news.length}명을 오늘 명단에 올렸습니다. (이미 있던 환자는 그대로 둡니다)`);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 예약: '09:00', 환자번호: '10001', 환자명: '홍길동', 초재진: '재진' },
      { 예약: '09:10', 환자번호: '10002', 환자명: '김철수', 초재진: '초진' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '명단');
    XLSX.writeFile(wb, '환자명단_템플릿.xlsx');
  };

  const handleManualAdd = async () => {
    if (!manual.id || !manual.name) { setMessage('환자번호와 이름을 입력해주세요.'); return; }
    if (!batchDoctor) { setMessage('먼저 담당 교수를 선택해주세요.'); return; }
    const currentFu = await loadFu();
    const np = buildPatient({ ...manual, id: manual.id.trim(), name: manual.name.trim(), reservation: normalizeTime(manual.reservation), date: batchDate, doctor: batchDoctor }, currentFu, settings);
    const stats = await upsert([np]);
    if (stats?.linked.length) {
      const l = stats.linked[0];
      setMessage(l.linkType === 'added'
        ? `${manual.name}님을 ${batchDoctor} 2차 진료로 추가했습니다. ${l.others.join(', ')} 진료 설명 완료 후 ${settings.linkCheckAdded !== false ? '처치실에서 추가 검사를 확인합니다' : '진료 대기로 넘어갑니다'}.`
        : `${manual.name}님은 ${batchDate}에 ${l.others.join(', ')} 명단에도 있어 두 교수님 진료로 연결했습니다 (${l.first ? `${batchDoctor} 먼저` : `${l.others.join(', ')} 먼저`}).`);
    }
    else if (stats?.timeChanged.length) setMessage(`${manual.name}님은 이미 명단에 있어 예약시간만 ${np.reservation}(으)로 바꿨습니다. 진행 상황은 그대로입니다.`);
    else if (stats?.unchanged.length) setMessage(`${manual.name}님은 이미 ${batchDate} ${batchDoctor} 명단에 있습니다.`);
    else setMessage(`${manual.name}님을 ${batchDate} ${batchDoctor} 명단에 추가했습니다.${hasFollowupApplied(np) ? ' (이전 정보 적용)' : ''}`);
    setManual({ id: '', name: '', reservation: '', firstVisit: false });
  };

  const archived = useArchivedPatients(manageDate);
  const readOnly = archived.isArchived;
  const [manageDoctor, setManageDoctor] = useState('');
  const dayAll = (readOnly ? archived.list : patients).filter(p => p.date === manageDate);
  const dayDoctors = [...new Set([...doctors, ...dayAll.map(p => p.doctor)].filter(Boolean))];
  const byDate = dayAll.filter(p => (!manageDoctor || p.doctor === manageDoctor) && inSession(p, session)).sort(sortMode === 'name' ? byName : byQueue);
  // 전체 삭제: 지금 보이는 명단(날짜 + 선택한 교수)을 한 번에 지웁니다. 바로 되돌릴 수 있습니다.
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const sessionLabel = session === 'am' ? ' 오전' : session === 'pm' ? ' 오후' : '';
  const [bulkDeleted, setBulkDeleted] = useState(null);
  const bulkDelete = () => {
    const keys = byDate.map(patientKey);
    const snapshot = dayAll;
    const label = `${manageDate}${manageDoctor ? ` ${manageDoctor}` : ' 전체'}${sessionLabel} 명단 ${keys.length}명`;
    setBulkConfirm(false);
    mutatePatients(prev => keys.reduce((list, k) => removeVisit(list, k), prev));
    setBulkDeleted({ keys, snapshot, label });
  };
  const undoBulkDelete = () => {
    const { keys, snapshot } = bulkDeleted;
    const deleted = new Set(keys);
    setBulkDeleted(null);
    mutatePatients(prev => {
      const have = new Set(prev.map(patientKey));
      const before = new Map(snapshot.map(p => [patientKey(p), p]));
      // 남아 있던 다른 교수님 진료는 연결 상태만 원래대로
      const restored = prev.map(p => {
        const old = before.get(patientKey(p));
        if (!old || deleted.has(patientKey(p))) return p;
        return { ...p, primaryKey: old.primaryKey, primaryDoctor: old.primaryDoctor, linkWaiting: old.linkWaiting };
      });
      return [...restored, ...snapshot.filter(p => deleted.has(patientKey(p)) && !have.has(patientKey(p)))];
    });
    setMessage('삭제를 되돌렸습니다.');
  };
  const checkCount = readOnly ? 0 : byDate.filter(p => needsTestCheck(p, doctorPrefs)).length;
  const updateOne = (pk, fn) => mutatePatients(prev => prev.map(p => (patientKey(p) === pk ? fn(p) : p)));
  const removeOne = (pk) => mutatePatients(prev => removeVisit(prev, pk));
  const reassignDoctor = (p, doctor) => {
    if (patients.some(x => x.id === p.id && x.date === p.date && x.doctor === doctor && patientKey(x) !== patientKey(p))) {
      setMessage(`${p.name}님은 ${p.date}에 이미 ${doctor} 진료가 있습니다.`);
      return;
    }
    const pk = patientKey(p);
    mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? { ...x, doctor } : x.primaryKey === pk ? { ...x, primaryDoctor: doctor } : x)));
  };
  const toggleFirst = (pk) => updateOne(pk, p => ({ ...p, firstVisit: !p.firstVisit }));
  const [infoEdit, setInfoEdit] = useState(null);
  const saveInfo = (p, info) => {
    const id = info.id.trim();
    if (!id || !info.name.trim()) { setMessage('환자번호와 이름을 입력해주세요.'); return; }
    if (id !== p.id && patients.some(x => x.id === id && x.date === p.date)) {
      setMessage(`환자번호 ${id}는 ${p.date} 명단에 이미 있습니다.`);
      return;
    }
    setInfoEdit(null);
    mutatePatients(prev => editPatientInfo(prev, patientKey(p), { id, name: info.name, reservation: normalizeTime(info.reservation) }));
    setMessage(`${info.name.trim()}님 정보를 수정했습니다.`);
  };
  const swapOrder = (p) => mutatePatients(prev => swapLinkOrder(prev, patientKey(p), doctorPrefs));
  const crAnywhere = Object.values(doctorPrefs || {}).some(v => v?.cr);

  // FU 기록에 이름이 없으면 명단에서 찾아 보여줍니다
  const nameOf = (id) => fuMap[id]?.name || patients.find(p => p.id === id)?.name || '';
  const fuQuery = fuSearch.trim();
  const fuIds = Object.keys(fuMap).filter(id => !fuQuery || id.includes(fuQuery) || nameOf(id).includes(fuQuery)).slice(0, 30);
  useEffect(() => {
    // 명단에 있는 환자인데 FU 기록에 이름이 비어 있으면 채워 둡니다 (한 번만 저장)
    if (patients.some(p => fuMap[p.id] && !fuMap[p.id].name && p.name)) mutateFu(prev => fillFollowupNames(prev, patients));
  }, [patients, fuMap, mutateFu]);
  const saveFuEdit = (sel, detail, dil) => {
    const id = fuEdit.id;
    setFuEdit(null);
    mutateFu(prev => saveFollowup(prev, id, fuEdit.doctor || '', {
        ...sel,
        detail,
        dilate: dil?.mode === 'yes' || dil?.mode === 'no' ? dil.mode : undefined,
        dilateEye: dil?.mode === 'yes' ? dilateEyeOf(dil.eye) : undefined,
        cr: dil?.cr || undefined,
        name: fuEdit.name || nameOf(id),
        updatedAt: Date.now(),
    }));
  };

  const TABS = [
    { key: 'upload', label: '명단 업로드' },
    { key: 'manual', label: '환자 추가' },
    { key: 'today', label: '명단 관리' },
    { key: 'fu', label: 'FU 지정 관리' },
  ];

  return (
    <ScreenShell title="관리자" color="slate" onBack={onBack} lastSync={lastSync}>
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setMessage(''); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {message && <div className="bg-slate-800 text-white text-sm rounded-xl px-4 py-3 mb-4">{message}</div>}

      {(tab === 'upload' || tab === 'manual') && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4 grid grid-cols-2 gap-3">
          <Field label="진료 날짜">
            <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className={INPUT} />
          </Field>
          <Field label="담당 교수">
            {doctors.length === 0 ? (
              <div className="text-sm text-red-600 py-2">설정 &gt; 교수 관리에서 먼저 등록해주세요</div>
            ) : (
              <select value={batchDoctor} onChange={e => setBatchDoctor(e.target.value)} className={INPUT}>
                {doctors.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </Field>
        </div>
      )}

      {tab === 'upload' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="font-medium text-slate-900 mb-1">엑셀 명단 올리기</div>
          <p className="t-hint text-sm text-slate-500 mb-3">첫 줄에 예약 · 환자번호 · 환자명 · 초재진 제목을 적어주세요. 초재진 칸에 '재진'이라고 적힌 환자 외에는 모두 초진으로 올라갑니다. 위에서 고른 날짜와 교수가 파일 속 모든 환자에게 적용되고, 저장된 FU 검사는 환자번호로 자동으로 붙습니다. 같은 명단을 다시 올려도 이미 있는 환자는 지정해둔 검사·진행 상황이 그대로 유지되고, 예약시간만 바뀐 경우 새 시간으로 고쳐집니다.</p>
          <div className="flex gap-3 flex-wrap items-center">
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium cursor-pointer">
              <Upload size={16} /> 엑셀 올리기
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </label>
            <button type="button" onClick={downloadTemplate} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">템플릿 받기</button>
            <button type="button" onClick={loadSample} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">데모 샘플 넣기</button>
          </div>
          {uploadResult && <UploadResult result={uploadResult} patients={patients} onRemove={removeOne} onShowList={() => { setManageDate(uploadResult.date); setTab('today'); }} />}
        </div>
      )}

      {tab === 'manual' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="font-medium text-slate-900 mb-3">환자 한 명 추가</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <input placeholder="환자번호" value={manual.id} onChange={e => setManual({ ...manual, id: e.target.value })} className={INPUT} />
            <input placeholder="이름" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} className={INPUT} />
            <input placeholder="예약시간 (예: 09:30)" value={manual.reservation} onChange={e => setManual({ ...manual, reservation: e.target.value })} className={INPUT} />
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={manual.firstVisit} onChange={e => setManual({ ...manual, firstVisit: e.target.checked })} className="w-4 h-4" />
              초진
            </label>
          </div>
          <button type="button" onClick={handleManualAdd} className="px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium">명단에 추가</button>
        </div>
      )}

      {tab === 'today' && (
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-sm text-slate-500">날짜</span>
            <input type="date" value={manageDate} onChange={e => setManageDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            <select value={manageDoctor} onChange={e => setManageDoctor(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">전체 교수</option>
              {dayDoctors.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-sm text-slate-400">{byDate.length}명</span>
            {!readOnly && byDate.length > 0 && (
              <button type="button" onClick={() => setBulkConfirm(true)} className="text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 bg-white flex items-center gap-1">
                <Trash2 size={14} /> {`${manageDoctor ? `${manageDoctor} ` : ''}${sessionLabel.trim() ? `${sessionLabel.trim()} ` : ''}전체 삭제`}
              </button>
            )}
            <div className="ml-auto flex gap-2 flex-wrap">
              <SegmentedToggle value={session} onChange={setSession} options={SESSION_OPTIONS} />
              <SegmentedToggle value={sortMode} onChange={changeSort} options={SORT_OPTIONS} />
            </div>
          </div>
          {bulkDeleted && (
            <div className="bg-slate-800 text-white text-sm rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <span>{bulkDeleted.label}을 삭제했습니다.</span>
              <button type="button" onClick={undoBulkDelete} className="text-sm font-semibold text-amber-300 px-3 py-1 rounded-lg flex items-center gap-1 shrink-0"><RotateCcw size={14} /> 되돌리기</button>
            </div>
          )}
          {bulkConfirm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                <h3 className="text-lg font-medium text-slate-900 mb-1">명단 전체 삭제</h3>
                <p className="text-sm text-slate-600 mb-2">
                  <b>{manageDate} {manageDoctor || '모든 교수님'}{sessionLabel}</b> 명단 <b>{byDate.length}명</b>을 모두 삭제합니다.
                </p>
                {byDate.some(p => p.checkin) && <p className="text-sm text-red-600 mb-2">이미 접수한 환자 {byDate.filter(p => p.checkin).length}명도 함께 삭제됩니다.</p>}
                <p className="text-xs text-slate-500">삭제 직후 화면에 나오는 [되돌리기]로 복구할 수 있습니다. 환자별 다음 내원 정보(FU)는 지워지지 않습니다.</p>
                <div className="flex gap-2 mt-6">
                  <button type="button" onClick={() => setBulkConfirm(false)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
                  <button type="button" onClick={bulkDelete} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium">{byDate.length}명 삭제</button>
                </div>
              </div>
            </div>
          )}
          {readOnly && (
            <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 mb-4 text-sm text-slate-600">
              {archived.loading ? '지난 명단을 불러오는 중입니다…' : archived.error ? '지난 명단을 불러오지 못했습니다. 서버 연결을 확인해주세요.' : '지난 날짜의 보관된 명단입니다. 보기만 할 수 있습니다.'}
            </div>
          )}
          {checkCount > 0 && (
            <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 mb-4 text-sm text-orange-900">
              <span className="font-semibold">확인 필요 {checkCount}명</span> · 재진인데 오늘 검사가 하나도 지정되지 않았습니다. 프로그램 사용 전에 진료받은 환자일 수 있으니 검사를 지정해주세요.
            </div>
          )}
          {byDate.length === 0 ? <EmptyState text={readOnly && archived.loading ? '불러오는 중…' : '이 날짜에 올라간 환자가 없습니다'} /> : byDate.map(p => {
            const flag = !readOnly && needsTestCheck(p, doctorPrefs);
            return (
            <div key={patientKey(p)} className={`bg-white rounded-xl p-4 mb-3 flex items-center justify-between gap-3 flex-wrap ${flag ? 'border-2 border-orange-400' : 'border border-slate-200'}`}>
              <div>
                <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                  <span className="t-name">{p.name}</span> <span className="text-xs text-slate-400">{p.id}</span>
                  {flag && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold">검사 미지정 · 확인 필요</span>}
                  {p.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">2차 진료 · {p.primaryDoctor} 후{p.linkType === 'added' ? ' (진료 중 추가)' : ''}</span>}
                  {dayAll.filter(x => x.primaryKey === patientKey(p)).map(x => <span key={patientKey(x)} className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700">1차 진료 → {x.doctor}</span>)}
                  {p.consultDone && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">진료 완료</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">예약 {p.reservation || '-'} · {readOnly ? p.doctor : getStage(p, settings).label}</div>
                {!readOnly && p.linkWaiting && p.linkType === 'planned' && <div className="text-xs text-fuchsia-700 mt-0.5">검사는 1차 진료 전에 함께 합니다. 추가할 검사는 1차 진료 카드에 지정해주세요.</div>}
              </div>
              {!readOnly && <>
              <div className="flex gap-2 items-center flex-wrap">
                {p.linkWaiting && p.linkType === 'planned' && !patients.find(x => patientKey(x) === p.primaryKey)?.checkin && !patients.find(x => patientKey(x) === p.primaryKey)?.primaryKey && (
                  <button type="button" onClick={() => swapOrder(p)} className="text-xs px-3 py-1.5 rounded-lg border border-fuchsia-300 text-fuchsia-700">진료 순서 바꾸기</button>
                )}
                <button type="button" onClick={() => setInfoEdit(p)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600">정보 수정</button>
                <select value={p.doctor} onChange={e => reassignDoctor(p, e.target.value)} className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                  {!doctors.includes(p.doctor) && <option value={p.doctor}>{p.doctor}</option>}
                  {doctors.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <button type="button" onClick={() => toggleFirst(patientKey(p))} className={`text-xs px-3 py-1.5 rounded-lg border ${p.firstVisit ? 'bg-sky-50 border-sky-300 text-sky-700' : 'border-slate-300 text-slate-500'}`}>
                  {p.firstVisit ? '초진' : '재진'}
                </button>
                <ConfirmButton label="삭제" onConfirm={() => removeOne(patientKey(p))} />
              </div>
              <TestPicker p={p} tests={orderForPicking(allTests, settings)} onPick={(t, on) => { if (p.consultDone) return; if (t.popupOnClick) setTodayDetail({ key: patientKey(p), testId: t.id }); else setTodayTest(patientKey(p), t, !on); }} onSpecial={t => { if (!p.consultDone) setTodayDetail({ key: patientKey(p), testId: t.id }); }} />
              <DilationRow showDrops={false} p={p} prefs={doctorPrefs} waitMin={settings.dilationWaitMin} mutatePatients={mutatePatients} />
              </>}
            </div>
            );
          })}
        </div>
      )}

      {tab === 'fu' && (
        <div>
          <p className="t-hint text-sm text-slate-500 mb-3">진료실에서 지정하지 못한 환자는 여기서 환자번호나 이름으로 찾아 다음 방문 검사를 지정할 수 있어요.</p>
          <div className="flex items-center gap-2 mb-4 bg-white border border-slate-300 rounded-lg px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <input placeholder="환자번호 또는 이름으로 찾기" value={fuSearch} onChange={e => setFuSearch(e.target.value)} className="flex-1 outline-none text-sm" />
          </div>
          {fuIds.length === 0 && !fuSearch.trim() && <EmptyState text="저장된 FU 지정이 없습니다" />}
          {fuIds.flatMap(id => followupRows(id, fuMap[id])).map(({ id, doctor: fuDoctor, fu }) => {
            const dilText = [fu.dilate === 'yes' ? `산동 함${dilateEyeOf(fu.dilateEye) ? ` (${DILATE_EYE_LABEL[fu.dilateEye]})` : ''}` : fu.dilate === 'no' ? '산동 안 함' : '', fu.cr ? 'CR' : ''].filter(Boolean).join(', ');
            const names = [allTests.filter(t => fu[t.id]).map(t => testLabelWithOptions(t, fu.detail?.[t.id])).join(', '), dilText].filter(Boolean).join(' / ');
            const fuNotes = allTests
              .filter(t => fu[t.id] && String(fu.detail?.[t.id]?.note ?? '').trim())
              .map(t => ({ id: t.id, short: t.short, note: String(fu.detail[t.id].note).trim() }));
            return (
              <div key={`${id}-${fuDoctor}`} className="bg-white border border-slate-200 rounded-xl p-4 mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                    {nameOf(id) ? <span className="t-name">{nameOf(id)}</span> : <span className="text-slate-400 font-normal">이름 정보 없음</span>}
                    <span className="text-xs text-slate-400 font-normal">{id}</span>
                    {fuDoctor && <span className="text-xs text-slate-500 font-normal">· 다음 내원 {fuDoctor}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{names || '지정된 검사 없음'}</div>
                  {fuNotes.map(n => (
                    <div key={n.id} className="text-xs text-yellow-800 mt-0.5"><span className="font-medium">{n.short}</span> {n.note}</div>
                  ))}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => setFuEdit({ ...fu, id, doctor: fuDoctor, name: nameOf(id) })} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600">수정</button>
                  <ConfirmButton label="삭제" onConfirm={() => { mutateFu(prev => deleteFollowup(prev, id, fuDoctor)); setMessage(`${nameOf(id) || id}${fuDoctor ? ` ${fuDoctor}` : ''} 다음 내원 지정을 삭제했습니다.`); }} />
                </div>
              </div>
            );
          })}
          {fuQuery && !fuMap[fuQuery] && /^[0-9A-Za-z-]+$/.test(fuQuery) && (
            <button type="button" onClick={() => setFuEdit({ id: fuQuery, name: nameOf(fuQuery) })} className="mt-3 text-sm px-4 py-2 rounded-lg bg-slate-800 text-white">
              {fuSearch.trim()} 새로 지정하기
            </button>
          )}
        </div>
      )}

      {todayEdit && todayTest && <TestDetailModal key={`${todayDetail.key}-${todayTest.id}`} test={todayTest} patientName={todayEdit.name} on={!!todayEdit.assigned?.[todayTest.id]} value={todayEdit.detail?.[todayTest.id]}
        onApply={d => { const kept = pickDetail({ [todayTest.id]: d }, { [todayTest.id]: true }, [todayTest])[todayTest.id] || null; setTodayTest(todayDetail.key, todayTest, true, kept); setTodayDetail(null); }}
        onRemove={() => { setTodayTest(todayDetail.key, todayTest, false); setTodayDetail(null); }} onCancel={() => setTodayDetail(null)} />}
      {infoEdit && <PatientInfoModal patient={infoEdit} onSave={info => saveInfo(infoEdit, info)} onCancel={() => setInfoEdit(null)} />}
      {fuEdit && (
        <TestCheckModal
          key={`fu-${fuEdit.id}`}
          title={`${fuEdit.name || nameOf(fuEdit.id) ? `${fuEdit.name || nameOf(fuEdit.id)}님 (${fuEdit.id})` : `환자 ${fuEdit.id}`} 다음 방문 검사`}
          subtitle="다음에 내원했을 때 할 검사를 체크해주세요"
          tests={allTests}
          settings={settings}
          initial={fuEdit}
          initialDetail={fuEdit.detail}
          dilation={{ crAvailable: crAnywhere, initial: { mode: fuEdit.dilate || 'default', cr: !!fuEdit.cr, eye: fuEdit.dilateEye } }}
          confirmLabel="저장"
          onConfirm={saveFuEdit}
          onCancel={() => setFuEdit(null)}
        />
      )}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* 환자용 화면                                                          */
/* ------------------------------------------------------------------ */
function BoardShell({ title, onBack, wide, extra, children }) {
  const [now, setNow] = useState(new Date());
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!autoScroll) return undefined;
    let direction = 1;
    let resumeAt = Date.now() + 3000;
    let last = Date.now();
    const timer = setInterval(() => {
      const el = scrollRef.current;
      const now = Date.now();
      const elapsed = Math.min(now - last, 100);
      last = now;
      if (!el) return;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (max <= 1) { direction = 1; resumeAt = now + 3000; return; }
      if (now < resumeAt) return;
      el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + direction * elapsed * 0.024));
      if ((direction === 1 && el.scrollTop >= max - 1) || (direction === -1 && el.scrollTop <= 1)) {
        direction *= -1;
        resumeAt = now + 3000;
      }
    }, 50);
    return () => clearInterval(timer);
  }, [autoScroll]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  const width = wide ? 'max-w-7xl' : 'max-w-4xl';
  return (
    <div className="h-[calc(100dvh-32px)] min-h-0 flex flex-col overflow-hidden bg-slate-50">
      <div className="shrink-0 bg-white border-b border-slate-200">
        <div className={`${width} mx-auto px-6 py-5 flex items-center justify-between gap-4`}>
          <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
          <div className="flex items-center gap-4">
            {extra}
            <span className="text-2xl text-slate-500 tabular-nums">{now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
            <button type="button" aria-pressed={autoScroll} onClick={() => setAutoScroll(v => !v)} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-500">{autoScroll ? '자동 스크롤 켜짐' : '자동 스크롤 꺼짐'}</button>
            <TextSizeControl />
            <button type="button" onClick={onBack} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-400">화면 전환</button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} tabIndex={0} aria-label="환자 대기 명단" className="min-h-0 flex-1 overflow-y-auto" onWheel={() => setAutoScroll(false)} onTouchStart={() => setAutoScroll(false)}>
        <div className={`${width} mx-auto px-6 py-3`}>{children}</div>
      </div>
    </div>
  );
}

function BoardEmpty({ text = '대기 중인 환자가 없습니다' }) {
  return <div className="text-center py-10 text-slate-400">{text}</div>;
}

function patientBoardName(p) {
  const suffix = String(p.id ?? '').trim().slice(-4);
  return `${maskName(p.name)}${suffix ? ` (${suffix})` : ''}`;
}

function BoardNumberRow({ n, name, color, compact, note }) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  return (
    <div className={`flex flex-wrap items-center gap-2 bg-white border ${c.border} rounded-lg px-3 py-1.5`}>
      <div className={`${compact ? 'w-7 h-7 text-base' : 'w-9 h-9 text-xl'} rounded-full ${c.solid} text-white flex items-center justify-center font-semibold shrink-0`}>{n}</div>
      <div className={`${compact ? 'text-lg' : 'text-2xl'} font-medium text-slate-900`}>{name}</div>
      {note && <div className={`text-sm ${c.text}`}>{note}</div>}
    </div>
  );
}

function VisionBoardList({ patients, compact }) {
  const list = patients.filter(p => !p.consultDone && p.checkin && !visionComplete(p)).sort(byQueue);
  if (!list.length) return <BoardEmpty />;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' }}>
      {list.map((p, i) => (
        <BoardNumberRow key={patientKey(p)} n={i + 1} name={patientBoardName(p)} color="blue" compact={compact} note={i === 0 ? '다음 순서' : ''} />
      ))}
    </div>
  );
}

function ExamBoardList({ patients, settings, compact }) {
  const list = patients
    .filter(p => !p.consultDone && pendingRooms(p, settings).length > 0)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  return (
    <div>
      <div className={`bg-teal-50 border border-teal-200 rounded-xl ${compact ? 'p-3 text-sm' : 'p-4'} text-teal-900 mb-3`}>
        검사 순서는 기계 상황에 따라 달라집니다. 이름이 불리면 안내된 검사실로 와주세요.
      </div>
      {list.length === 0 ? <BoardEmpty /> : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' }}>
          {list.map(p => (
            <div key={patientKey(p)} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap">
              <span className={`${compact ? 'text-lg' : 'text-2xl'} font-medium text-slate-900`}>{patientBoardName(p)}</span>
              <div className="flex flex-wrap gap-2 justify-end">
                {activeVf(p) && <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900">{settings.tests.find(t => t.id === activeVf(p))?.name || '시야검사'} 검사 중</span>}
                {(activeVf(p) ? [] : pendingRooms(p, settings)).map(r => {
                  const c = COLOR_MAP[roomColor(settings, r.id)];
                  return (
                    <span key={r.id} className={`${compact ? 'text-xs' : 'text-sm'} px-3 py-1 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
                      {r.patientName || r.name}: {pendingTests(p, settings, r.id).map(t => t.name || t.short).join(', ')}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 진찰실 번호: 숫자만 적으면 'N번 진료실', 글자를 적으면 그대로 표시
function consultRoomLabel(prefs, doctor) {
  const v = String(prefs?.[doctor]?.roomNo ?? '').trim();
  if (!v) return '';
  return /^\d+$/.test(v) ? `${v}번 진료실` : v;
}

// 설정 > 교수 관리: 진찰실 번호 (칸을 벗어나거나 Enter 를 누르면 저장)
function DoctorRoomInput({ name, value, onSave }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  const save = () => { if (v.trim() !== String(value || '').trim()) onSave(v.trim()); };
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-600">
      진찰실
      <input aria-label={`${name} 진찰실 번호`} value={v} onChange={e => setV(e.target.value)} onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        placeholder="예: 3" className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" />
    </label>
  );
}

function ConsultBoardSection({ doctor, patients, settings, compact, plain, roomLabel = '' }) {
  const mine = patients.filter(p => p.doctor === doctor && !p.consultDone);
  const inRoom = mine.find(inConsult);
  const waiting = mine.filter(p => consultWaiting(p, settings)).sort(byQueue);
  const testing = mine.filter(p => !p.seen && !allDone(p, settings)).length;
  return (
    <div className={plain ? '' : 'bg-white border border-amber-200 rounded-2xl p-4'}>
      {!plain && (
        <div className={`${compact ? 'text-lg' : 'text-xl'} font-semibold text-slate-900 mb-3 flex items-baseline justify-between gap-2 flex-wrap`}>
          {doctor}
          {roomLabel && <span className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-amber-700`}>{roomLabel}</span>}
        </div>
      )}
      {inRoom && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">
          <span className="text-sm text-amber-700 font-medium">진료 중{roomLabel ? ` · ${roomLabel}` : ''}</span>
          <span className={`${compact ? 'text-lg' : 'text-2xl'} font-medium text-slate-900`}>{patientBoardName(inRoom)}</span>
        </div>
      )}
      {waiting.length === 0 ? (
        <div className="text-sm text-slate-400 py-3">진료 대기 환자가 없습니다</div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' }}>
          {waiting.map((p, i) => (
            <BoardNumberRow key={patientKey(p)} n={i + 1} name={patientBoardName(p)} color="amber" compact={compact} note={i === 0 ? '다음 순서' : ''} />
          ))}
        </div>
      )}
      {testing > 0 && <div className="text-sm text-slate-500 mt-3">검사 진행 중 {testing}명</div>}
    </div>
  );
}

function BoardColumn({ title, children }) {
  return (
    <div>
      <div className="text-xl font-semibold text-slate-800 mb-3 pb-2 border-b-2 border-slate-200">{title}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function BoardSelect({ doctors, onSelect, onBack }) {
  const options = [
    { key: 'vision', label: '시력검사실 대기 명단', sub: '순번 표시' },
    { key: 'exam', label: '검사실 대기 명단', sub: '순번 없이 검사실·검사 안내' },
    { key: 'vision-exam', label: '시력검사실 + 검사실', sub: '두 명단을 한 화면에' },
    { key: 'consult-all', label: '진료실 대기 명단 (전체)', sub: '교수님별 구역으로 나눠 표시' },
    ...doctors.map(d => ({ key: `consult:${d}`, label: `${d} 진료실`, sub: '진료실 앞 모니터용' })),
    { key: 'combined', label: '통합 화면', sub: '세 명단을 한 화면에' },
  ];
  return (
    <ScreenShell title="환자용 화면 선택" color="slate" onBack={onBack}>
      <p className="text-sm text-slate-500 mb-4">이 모니터에 띄울 명단을 고르세요. 이름은 김*수처럼 가려서 표시됩니다.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map(o => (
          <button key={o.key} type="button" onClick={() => onSelect(o.key)} className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-400">
            <div className="font-medium text-slate-900">{o.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{o.sub}</div>
          </button>
        ))}
      </div>
    </ScreenShell>
  );
}

function BoardView({ kind, patients, settings, doctors, doctorPrefs, onBack }) {
  const [layout, setLayout] = useState('horizontal');
  const activeDoctors = Array.from(new Set([...doctors, ...patients.map(p => p.doctor).filter(Boolean)]))
    .filter(d => patients.some(p => p.doctor === d && !p.consultDone));

  if (kind === 'vision') {
    return <BoardShell title="시력검사실 대기 순서" onBack={onBack}><VisionBoardList patients={patients} /></BoardShell>;
  }
  if (kind === 'exam') {
    return <BoardShell title="검사실 대기 명단" onBack={onBack}><ExamBoardList patients={patients} settings={settings} /></BoardShell>;
  }
  if (kind === 'vision-exam') {
    return (
      <BoardShell title="검사 대기 현황" onBack={onBack} wide extra={<label className="text-xs text-slate-500">배치 <select aria-label="대기 명단 배치" value={layout} onChange={e => setLayout(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1"><option value="horizontal">좌우 배치</option><option value="vertical">위아래 배치</option></select></label>}>
        <div className="grid gap-4" style={{ gridTemplateColumns: layout === 'horizontal' ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
          <BoardColumn title="시력검사실"><VisionBoardList patients={patients} /></BoardColumn>
          <BoardColumn title="검사실"><ExamBoardList patients={patients} settings={settings} /></BoardColumn>
        </div>
      </BoardShell>
    );
  }
  if (kind === 'consult-all') {
    return (
      <BoardShell title="진료 대기 순서" onBack={onBack} wide>
        {activeDoctors.length === 0 ? <BoardEmpty /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeDoctors.map(d => <ConsultBoardSection key={d} doctor={d} patients={patients} settings={settings} roomLabel={consultRoomLabel(doctorPrefs, d)} />)}
          </div>
        )}
      </BoardShell>
    );
  }
  if (kind.startsWith('consult:')) {
    const d = kind.slice('consult:'.length);
    return (
      <BoardShell title={`${d} 진료 대기 순서${consultRoomLabel(doctorPrefs, d) ? ` · ${consultRoomLabel(doctorPrefs, d)}` : ''}`} onBack={onBack}>
        <ConsultBoardSection doctor={d} patients={patients} settings={settings} plain roomLabel={consultRoomLabel(doctorPrefs, d)} />
      </BoardShell>
    );
  }
  return (
    <BoardShell title="오늘의 대기 현황" onBack={onBack} wide>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BoardColumn title="시력검사실"><VisionBoardList patients={patients} compact /></BoardColumn>
        <BoardColumn title="검사실"><ExamBoardList patients={patients} settings={settings} compact /></BoardColumn>
        <BoardColumn title="진료실">
          {activeDoctors.length === 0 ? <BoardEmpty /> : activeDoctors.map(d => (
            <ConsultBoardSection key={d} doctor={d} patients={patients} settings={settings} compact roomLabel={consultRoomLabel(doctorPrefs, d)} />
          ))}
        </BoardColumn>
      </div>
    </BoardShell>
  );
}

/* ------------------------------------------------------------------ */
/* 설정 화면                                                            */
/* ------------------------------------------------------------------ */
function SettingsView({ settings, doctors, doctorPrefs, mutateSettings, mutateDoctors, mutateDoctorPrefs, onBack, lastSync }) {
  const [tab, setTab] = useState('rooms');
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [newDoctor, setNewDoctor] = useState('');
  const updateDraft = (fn) => { setDraft(d => fn(d)); setDirty(true); setNotice(''); };

  const updateRoom = (id, patch) => updateDraft(d => ({ ...d, rooms: d.rooms.map(r => (r.id === id ? { ...r, ...patch } : r)) }));
  const moveRoom = (id, dir) => updateDraft(d => {
    const i = d.rooms.findIndex(r => r.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= d.rooms.length) return d;
    const rooms = [...d.rooms];
    [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
    return { ...d, rooms };
  });
  const addRoom = () => updateDraft(d => ({ ...d, rooms: [...d.rooms, { id: newId('r'), name: '새 검사실', patientName: '새 검사실', showPriority: false }] }));
  const deleteRoom = (id) => updateDraft(d => ({ ...d, rooms: d.rooms.filter(r => r.id !== id) }));

  const maxOrder = (d, roomId) => Math.max(-1, ...d.tests.filter(t => t.roomId === roomId).map(t => t.order));
  const updateTest = (id, patch) => updateDraft(d => ({ ...d, tests: d.tests.map(t => (t.id === id ? { ...t, ...patch } : t)) }));
  const addTest = (roomId) => updateDraft(d => ({
    ...d,
    tests: [...d.tests, { id: newId('t'), name: '새 검사', short: '새 검사', roomId, order: maxOrder(d, roomId) + 1, options: [], optionsText: '', popupOnClick: false }],
  }));
  const deleteTest = (id) => updateDraft(d => ({ ...d, tests: d.tests.filter(t => t.id !== id) }));
  const changeTestRoom = (id, roomId) => updateDraft(d => ({ ...d, tests: d.tests.map(t => (t.id === id ? { ...t, roomId, order: maxOrder(d, roomId) + 1 } : t)) }));
  const moveTest = (id, dir) => updateDraft(d => {
    const target = d.tests.find(x => x.id === id);
    if (!target) return d;
    const list = d.tests.filter(x => x.roomId === target.roomId).sort((a, b) => a.order - b.order);
    const i = list.findIndex(x => x.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return d;
    const orders = new Map(list.map((x, k) => [x.id, k]));
    orders.set(id, j);
    orders.set(list[j].id, i);
    return { ...d, tests: d.tests.map(x => (orders.has(x.id) ? { ...x, order: orders.get(x.id) } : x)) };
  });

  const save = async () => {
    const cleaned = {
      ...draft,
      rooms: draft.rooms.map(r => ({
        ...r,
        name: (r.name || '').trim() || '이름 없는 검사실',
        patientName: (r.patientName || '').trim() || (r.name || '').trim() || '검사실',
      })),
      tests: draft.tests.map(({ optionsText, noteEnabled, ...t }) => ({
        ...renameTestOptions(t, parseOptions(optionsText ?? (t.options || []).join(','))),
        name: (t.name || '').trim() || '이름 없는 검사',
        short: (t.short || '').trim() || (t.name || '').trim() || '검사',
        options: parseOptions(optionsText ?? (t.options || []).join(',')),
        popupOnClick: !!t.popupOnClick,
        machine: String(t.machine || '').trim(),
      })),
      procedures: (draft.procedures || [])
        .map(x => ({ ...x, name: (x.name || '').trim() }))
        .filter(x => x.name),
      dilationWaitMin: Math.max(1, Math.round(Number(draft.dilationWaitMin) || 15)),
      lateGraceMin: Math.max(0, Math.round(Number(draft.lateGraceMin) || 0)),
    };
    setDraft(toDraft(cleaned));
    setDirty(false);
    await mutateSettings(() => cleaned);
    setNotice('저장했습니다. 다른 컴퓨터에도 몇 초 안에 반영됩니다.');
  };
  const revert = () => { setDraft(toDraft(settings)); setDirty(false); setNotice(''); };

  const addDoctor = () => {
    const name = newDoctor.trim();
    if (!name || doctors.includes(name)) return;
    mutateDoctors(prev => (prev.includes(name) ? prev : [...prev, name]));
    setNewDoctor('');
  };
  const removeDoctor = (name) => mutateDoctors(prev => prev.filter(d => d !== name));
  const setPref = (name, key, val) => mutateDoctorPrefs(prev => ({ ...prev, [name]: { ...(prev[name] || {}), [key]: val } }));

  const updateProc = (id, patch) => updateDraft(d => ({ ...d, procedures: (d.procedures || []).map(x => (x.id === id ? { ...x, ...patch } : x)) }));
  const addProc = () => updateDraft(d => ({ ...d, procedures: [...(d.procedures || []), { id: newId('p'), name: '', performer: 'prof' }] }));
  const deleteProc = (id) => updateDraft(d => ({ ...d, procedures: (d.procedures || []).filter(x => x.id !== id) }));
  const moveProc = (id, dir) => updateDraft(d => {
    const list = [...(d.procedures || [])];
    const i = list.findIndex(x => x.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return d;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...d, procedures: list };
  });
  const moveDoctor = (name, dir) => mutateDoctors(prev => {
    const i = prev.indexOf(name);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const TABS = [
    { key: 'rooms', label: '검사실 · 검사' },
    { key: 'procedures', label: '처치' },
    { key: 'doctors', label: '교수 관리' },
    { key: 'etc', label: '기타' },
  ];

  return (
    <ScreenShell title="설정" color="slate" onBack={onBack} lastSync={lastSync}>
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && <div className="bg-slate-800 text-white text-sm rounded-xl px-4 py-3 mb-4">{notice}</div>}

      {tab === 'rooms' && (
        <div>
          <p className="text-sm text-slate-500 mb-4">
            검사실마다 검사를 추가하고 순서를 정할 수 있어요. 목록에서 위에 있는 검사일수록 우선순위가 높습니다. 짧은 이름은 버튼과 환자용 화면에 쓰입니다.
          </p>
          <p className="text-sm text-slate-500 mb-4">
            세부 종류를 적어두면 창에서 종류를 고를 수 있어요 (예: OCT의 Macular, Disc, Angio). 어떤 검사든 오른쪽 클릭(터치스크린은 길게 누르기)하면 양안·우안·좌안과 검사 프로토콜을 지정하는 창이 떠요. 연구처럼 매번 적어야 하는 항목은 '누를 때마다 세부 창 띄우기'를 켜두세요.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <div className="font-medium text-slate-900">시력 / 안압 검사실</div>
            <div className="text-xs text-slate-500 mt-1">모든 환자가 가장 먼저 거치는 단계라 바꿀 수 없어요. 나안·교정 시력과 NCT를 여기서 입력합니다.</div>
          </div>

          {draft.rooms.map((r, ri) => {
            const tests = draft.tests.filter(t => t.roomId === r.id).sort((a, b) => a.order - b.order);
            const c = COLOR_MAP[ROOM_PALETTE[ri % ROOM_PALETTE.length]];
            return (
              <div key={r.id} className={`bg-white border-2 ${c.border} rounded-xl p-4 mb-4`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label="검사실 이름 (직원 화면)">
                      <input value={r.name} onChange={e => updateRoom(r.id, { name: e.target.value })} className={INPUT} />
                    </Field>
                    <Field label="환자에게 보이는 이름">
                      <input value={r.patientName || ''} onChange={e => updateRoom(r.id, { patientName: e.target.value })} className={INPUT} />
                    </Field>
                  </div>
                  <div className="flex flex-col gap-1 pt-5">
                    <button type="button" aria-label="검사실 위로" onClick={() => moveRoom(r.id, 'up')} className="p-1.5 rounded border border-slate-200 text-slate-500"><ChevronUp size={16} /></button>
                    <button type="button" aria-label="검사실 아래로" onClick={() => moveRoom(r.id, 'down')} className="p-1.5 rounded border border-slate-200 text-slate-500"><ChevronDown size={16} /></button>
                  </div>
                </div>

                <label className="flex items-start gap-2 text-sm text-slate-700 mb-4 cursor-pointer">
                  <input type="checkbox" checked={!!r.showPriority} onChange={e => updateRoom(r.id, { showPriority: e.target.checked })} className="w-4 h-4 mt-0.5" />
                  <span>
                    우선순위 안내 보이기
                    <span className="block text-xs text-slate-400">검사가 2개 이상일 때, 맨 위 검사부터 채우도록 검사실 화면에 안내합니다</span>
                  </span>
                </label>

                <div className="space-y-2">
                  {tests.length === 0 && <div className="text-sm text-slate-400">아직 검사가 없습니다</div>}
                  {tests.map((t, ti) => (
                    <div key={t.id} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-7 h-7 rounded-full ${c.solid} text-white text-sm flex items-center justify-center shrink-0`}>{ti + 1}</span>
                        <label className="flex-1 min-w-0 text-xs text-slate-500">환자용 검사 이름
                          <input value={t.name} placeholder="예: 시야검사" onChange={e => updateTest(t.id, { name: e.target.value })} className={INPUT} />
                        </label>
                        <label className="w-28 text-xs text-slate-500">직원용 이름
                          <input value={t.short} placeholder="예: VF" onChange={e => updateTest(t.id, { short: e.target.value })} className={INPUT} />
                        </label>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <select value={t.roomId} onChange={e => changeTestRoom(t.id, e.target.value)} className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                          {draft.rooms.map(rr => <option key={rr.id} value={rr.id}>{rr.name}에서 진행</option>)}
                        </select>
                        <button type="button" aria-label="우선순위 올리기" onClick={() => moveTest(t.id, 'up')} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white"><ChevronUp size={14} /></button>
                        <button type="button" aria-label="우선순위 내리기" onClick={() => moveTest(t.id, 'down')} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white"><ChevronDown size={14} /></button>
                        {t.builtin === 'gat' ? (
                          <span className="ml-auto text-xs text-slate-400">GAT 값을 이 검사실에서 입력해요. 기본 항목이라 삭제할 수 없어요.</span>
                        ) : (
                          <ConfirmButton label="검사 삭제" onConfirm={() => deleteTest(t.id)} className="ml-auto" />
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 items-end">
                        <Field label="장비 / 상단 분류 (OCT 계열은 이 값과 관계없이 OCT로 집계)">
                          <input
                            value={t.machine || ''}
                            placeholder="비워두면 자동"
                            onChange={e => updateTest(t.id, { machine: e.target.value })}
                            className={INPUT}
                          />
                        </Field>
                        <Field label="세부 종류 (쉼표로 구분, 이름 변경 시 기존 순서 유지)">
                          <input
                            value={t.optionsText ?? ''}
                            placeholder="예: Macular, Disc, Angio"
                            onChange={e => updateTest(t.id, { optionsText: e.target.value })}
                            className={INPUT}
                          />
                        </Field>
                        {parseOptions(t.optionsText || '').length > 0 && <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-xs text-slate-600 mb-2">눈 위치 그룹 · 검사 이름과 별도로 저장됩니다. 항목을 추가하거나 순서를 바꾸면 그룹을 확인해주세요.</div>
                          <div className="flex flex-wrap gap-2">{parseOptions(t.optionsText || '').map(o => {
                            const normalized = renameTestOptions(t, parseOptions(t.optionsText || ''));
                            return <label key={o} className="text-xs text-slate-600">{o} <select aria-label={`${o} 눈 위치 그룹`} value={normalized.optionEyeGroups[o] || 'default'} onChange={e => updateTest(t.id, { optionEyeGroups: { ...t.optionEyeGroups, [o]: e.target.value } })} className="border border-slate-300 rounded px-2 py-1">
                              <option value="default">공통</option><option value="md">M,D OCT</option><option value="angio">OCTA</option>
                            </select></label>;
                          })}</div>
                        </div>}
                        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer py-2">
                          <input type="checkbox" checked={!!t.popupOnClick} onChange={e => updateTest(t.id, { popupOnClick: e.target.checked })} className="w-4 h-4 mt-0.5" />
                          <span>
                            누를 때마다 세부 창 띄우기
                            <span className="block text-xs text-slate-400">끄면 평소엔 바로 체크되고, 필요할 때만 오른쪽 클릭으로 창을 열어요</span>
                          </span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button type="button" onClick={() => addTest(r.id)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 flex items-center gap-1 bg-white">
                    <Plus size={14} /> 검사 추가
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    {tests.length > 0 && <span className="text-xs text-slate-400">검사가 남아 있으면 삭제할 수 없어요</span>}
                    <ConfirmButton label="검사실 삭제" disabled={tests.length > 0} onConfirm={() => deleteRoom(r.id)} />
                  </div>
                </div>
              </div>
            );
          })}

          <button type="button" onClick={addRoom} className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 flex items-center justify-center gap-2">
            <Plus size={16} /> 검사실 추가
          </button>
        </div>
      )}

      {tab === 'rooms' && (() => {
        const picked = orderForPicking(sortedTests(draft), draft);
        const movePick = (i, dir) => updateDraft(d => {
          const ids = orderForPicking(sortedTests(d), d).map(t => t.id);
          const j = i + dir;
          if (j < 0 || j >= ids.length) return d;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          return { ...d, pickOrder: ids };
        });
        return (
          <div className="bg-white border border-slate-200 rounded-xl p-5 mt-4">
            <div className="font-medium text-slate-900 mb-1">검사 선택 창 순서</div>
            <p className="text-sm text-slate-500 mb-3">환자 카드의 '오늘 검사' 버튼과, 진료 중 추가 검사·설명 완료(다음 내원 검사)·처치실 검사 지정·FU 지정 창에서 검사가 이 순서로 나옵니다. 검사실 대기 순서에는 영향이 없어요.</p>
            <div className="space-y-1.5">
              {picked.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="text-xs text-slate-400 w-5">{i + 1}</span>
                  <span className="text-sm text-slate-800 flex-1">{t.short || t.name}</span>
                  <button type="button" aria-label="위로" disabled={i === 0} onClick={() => movePick(i, -1)} className="p-1.5 rounded border border-slate-200 text-slate-500 disabled:opacity-30"><ChevronUp size={14} /></button>
                  <button type="button" aria-label="아래로" disabled={i === picked.length - 1} onClick={() => movePick(i, 1)} className="p-1.5 rounded border border-slate-200 text-slate-500 disabled:opacity-30"><ChevronDown size={14} /></button>
                </div>
              ))}
            </div>
            {Array.isArray(draft.pickOrder) && (
              <button type="button" onClick={() => updateDraft(d => { const { pickOrder, ...rest } = d; return rest; })} className="mt-3 text-xs text-slate-500 underline">검사실 순서로 되돌리기</button>
            )}
          </div>
        );
      })()}

      {tab === 'procedures' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="font-medium text-slate-900 mb-1">처치 목록</div>
          <p className="text-sm text-slate-500 mb-4">
            진료실에서 처치 버튼을 누르면 이 목록이 나와요. 교수님이 하는 처치는 진료실 명단의 처치 대기로, 전공의가 하는 처치는 처치실로 갑니다.
          </p>
          <div className="space-y-2">
            {(draft.procedures || []).length === 0 && <div className="text-sm text-slate-400">등록된 처치가 없습니다</div>}
            {(draft.procedures || []).map(x => (
              <div key={x.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-3 flex-wrap">
                <input value={x.name} placeholder="처치 이름" onChange={e => updateProc(x.id, { name: e.target.value })} className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
                <select value={x.performer} onChange={e => updateProc(x.id, { performer: e.target.value })} className="text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white">
                  <option value="prof">교수님이 직접</option>
                  <option value="resident">전공의</option>
                </select>
                <button type="button" aria-label="위로" onClick={() => moveProc(x.id, 'up')} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white"><ChevronUp size={14} /></button>
                <button type="button" aria-label="아래로" onClick={() => moveProc(x.id, 'down')} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white"><ChevronDown size={14} /></button>
                <ConfirmButton label="삭제" onConfirm={() => deleteProc(x.id)} />
              </div>
            ))}
          </div>
          <button type="button" onClick={addProc} className="mt-3 text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 flex items-center gap-1 bg-white">
            <Plus size={14} /> 처치 추가
          </button>
        </div>
      )}

      {tab === 'doctors' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="font-medium text-slate-900 mb-1">교수 목록</div>
          <p className="text-sm text-slate-500 mb-3">
            교수 목록과 아래 설정은 바로 저장됩니다. 초진 예진 기본값은 처치실에서 새로 검사 지정할 때 적용되며, 환자별로 변경할 수 있어요. 이미 지정한 환자의 예진 여부는 유지됩니다. 기본 산동과 CR 사용도 교수별로 설정할 수 있어요.
          </p>
          <div className="flex gap-2 mb-4">
            <input placeholder="교수님 성함" value={newDoctor} onChange={e => setNewDoctor(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDoctor(); }} className={INPUT} />
            <button type="button" onClick={addDoctor} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium shrink-0">추가</button>
          </div>
          {doctors.length === 0 && <div className="text-sm text-slate-400">등록된 교수가 없습니다</div>}
          <div className="space-y-2">
            {doctors.map(name => (
              <div key={name} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex-wrap">
                  <span className="text-slate-700 flex-1">{name}</span>
                  <DoctorRoomInput name={name} value={doctorPrefs?.[name]?.roomNo} onSave={v => setPref(name, 'roomNo', v)} />
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    초진 예진 기본값
                    <select aria-label={`${name} 초진 예진 기본값`} value={doctorPrefs?.[name]?.triageRequired === false ? 'no' : 'yes'} onChange={e => setPref(name, 'triageRequired', e.target.value === 'yes')} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                      <option value="yes">예진 함</option>
                      <option value="no">예진 안 함</option>
                    </select>
                  </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={!!doctorPrefs?.[name]?.dilate} onChange={e => setPref(name, 'dilate', e.target.checked)} className="w-4 h-4" />
                  기본 산동
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mr-2">
                  <input type="checkbox" checked={!!doctorPrefs?.[name]?.cr} onChange={e => setPref(name, 'cr', e.target.checked)} className="w-4 h-4" />
                  CR 사용
                </label>
                <button type="button" aria-label="위로" onClick={() => moveDoctor(name, 'up')} className="p-1 rounded border border-slate-200 text-slate-500 bg-white"><ChevronUp size={14} /></button>
                <button type="button" aria-label="아래로" onClick={() => moveDoctor(name, 'down')} className="p-1 rounded border border-slate-200 text-slate-500 bg-white"><ChevronDown size={14} /></button>
                <ConfirmButton label="삭제" onConfirm={() => removeDoctor(name)} />
                <div className="w-full border-t border-slate-200 pt-2">
                  <div className="text-xs text-slate-500 mb-2">다음 내원 기본 검사 목록 · 체크한 검사를 먼저 표시합니다. 검사 시행 여부는 설명 완료 창에서 선택합니다.</div>
                  <div className="flex flex-wrap gap-2">{sortedTests(settings).map(t => {
                    const selected = doctorPrefs?.[name]?.followupTests;
                    const checked = !Array.isArray(selected) || selected.includes(t.id);
                    return <label key={t.id} className="flex items-center gap-1 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={e => {
                      const on = e.target.checked;
                      mutateDoctorPrefs(prev => { const current = prev[name]?.followupTests; const ids = Array.isArray(current) ? current : sortedTests(settings).map(x => x.id); return { ...prev, [name]: { ...prev[name], followupTests: on ? [...new Set([...ids, t.id])] : ids.filter(id => id !== t.id) } }; });
                    }} />{t.short || t.name}</label>;
                  })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'etc' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="font-medium text-slate-900 mb-1">산동 대기 시간</div>
            <p className="text-sm text-slate-500 mb-3">점안 후 이 시간이 지나면 '산동 완료'로 표시돼요. CR은 4번째 점안부터 계산합니다.</p>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={draft.dilationWaitMin} onChange={e => updateDraft(d => ({ ...d, dilationWaitMin: e.target.value }))} className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <span className="text-sm text-slate-600">분</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="font-medium text-slate-900 mb-1">지각 유예 시간</div>
            <p className="text-sm text-slate-500 mb-3">예약시간보다 이 시간 안에 접수하면 지각으로 처리하지 않습니다. 0분이면 1분만 늦어도 지각이에요.</p>
            <div className="flex items-center gap-2">
              <input type="number" min="0" value={draft.lateGraceMin} onChange={e => updateDraft(d => ({ ...d, lateGraceMin: e.target.value }))} className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <span className="text-sm text-slate-600">분</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="font-medium text-slate-900 mb-1">같은 날 두 교수님 진료 (2차 진료)</div>
            <p className="text-sm text-slate-500 mb-3">1차 진료의 설명 완료 후 2차 진료로 넘어갈 때, 처치실에서 추가 검사를 먼저 확인할지 정합니다. 끄면 바로 2차 교수님 진료 대기로 갑니다.</p>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-2">
              <input type="checkbox" checked={draft.linkCheckAdded !== false} onChange={e => updateDraft(d => ({ ...d, linkCheckAdded: e.target.checked }))} className="w-4 h-4" />
              진료 중에 추가된 2차 진료 → 처치실에서 추가 검사 확인
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!draft.linkCheckPlanned} onChange={e => updateDraft(d => ({ ...d, linkCheckPlanned: e.target.checked }))} className="w-4 h-4" />
              미리 예정된 2차 진료 → 처치실에서 추가 검사 확인 (예정된 검사는 1차 진료 전에 함께 합니다)
            </label>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-sky-50 p-5">
            <div className="text-xs font-medium text-indigo-500 mb-1">개발자 정보</div>
            <div className="text-lg font-semibold text-slate-900 mb-3">한상원 <span className="text-sm font-normal text-slate-500">(2023년 입국)</span></div>
            <p className="text-sm text-slate-700 leading-relaxed mb-2">
              Ophthalmology Flow의 완성을 진심으로 축하합니다.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              바쁜 수련 생활 속에서도 환자분들의 기다림을 줄이고 함께 일하는 동료들의 수고를 덜기 위해,
              진료 현장의 흐름 하나하나를 고민하며 이 프로그램을 만들었습니다.
              검사실과 진료실, 처치실을 잇는 세심한 배려가 곳곳에 담긴 이 결실에 깊은 감사와 박수를 보냅니다.
            </p>
          </div>
        </div>
      )}

      <div className="h-24" />

      {dirty && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-20">
          <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">저장하지 않은 변경사항이 있어요</span>
            <div className="flex gap-2">
              <button type="button" onClick={revert} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600">되돌리기</button>
              <button type="button" onClick={save} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium">저장</button>
            </div>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ */
/* 최상위 App                                                          */
/* ------------------------------------------------------------------ */
// 각 업무 화면과 같은 조건으로 조회하여 여러 명단에 속한 경우도 함께 표시한다.
function patientQueueLabels(p, settings) {
  if (p.consultDone) return ['진료 완료'];
  const labels = [];
  if (!p.checkin) labels.push('접수 전 · 미접수');
  if (p.checkin && !visionComplete(p)) labels.push('시력방 · 접수 완료 / 시력·안압 검사 대기');
  if (needsTriageAssign(p)) labels.push('처치실 · 초진 검사 지정 대기');
  pendingRooms(p, settings).forEach(r => {
    const tests = pendingTests(p, settings, r.id).map(t => testLabelWithOptions(t, p.detail?.[t.id])).join(', ');
    labels.push(`${r.name} · ${tests}${activeVf(p) ? ' (VF 진행 중 · 다른 장비 호출 금지)' : ' 대기'}`);
  });
  if (needsTriageExam(p, settings)) labels.push('처치실 · 예진 대기');
  if (inProfProcedure(p)) labels.push('진료실 · 교수님 처치 대기');
  if (inResidentProcedure(p)) labels.push('처치실 · 전공의 처치 대기');
  if (awaitingExplain(p)) labels.push('진료실 · 설명 대기');
  if (inConsult(p)) labels.push(`${p.calledRoom} · 진료 중`);
  if (consultWaiting(p, settings)) labels.push('진료실 · 진료 대기');
  if (p.consultHold && !p.seen && !allDone(p, settings)) labels.push('진료실 · 추가 검사 중 (진료 보류)');
  return labels.length ? labels : [getStage(p, settings).label];
}

const DIRECTORY_STATUSES = [
  ['all', '전체 (완료 포함)'],
  ['reception', '접수 전'],
  ['vision', '시력방'],
  ['exam', '검사실'],
  ['consult', '진료'],
  ['treatment', '처치'],
  ['done', '진료 완료'],
];

function matchesDirectoryStatus(p, settings, status) {
  if (status === 'all') return true;
  if (status === 'done') return !!p.consultDone;
  if (p.consultDone) return false;
  switch (status) {
    case 'reception': return !p.checkin && !p.linkWaiting;
    case 'vision': return !!p.checkin && !visionComplete(p);
    case 'exam': return pendingRooms(p, settings).length > 0 || !!activeVf(p);
    case 'consult': return consultWaiting(p, settings) || inConsult(p) || awaitingExplain(p);
    case 'treatment': return inTreatRoom(p, settings) || inProfProcedure(p);
    default: return false;
  }
}

function filterDirectory(patients, settings, date, query, doctor, status) {
  const q = query.trim().toLocaleLowerCase();
  return patients.filter(p => (!date || p.date === date)
    && (!doctor || p.doctor === doctor)
    && matchesDirectoryStatus(p, settings, status)
    && (!q || [p.name, p.id, p.doctor, ...patientQueueLabels(p, settings)].some(v => String(v || '').toLocaleLowerCase().includes(q))))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || byQueue(a, b) || String(a.id).localeCompare(String(b.id)));
}

function PatientDirectory({ patients, settings, lastSync, onClose }) {
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(todayISO());
  const [doctor, setDoctor] = useState('');
  const [status, setStatus] = useState('all');
  const closeRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const archived = useArchivedPatients(date);
  const source = archived.isArchived ? archived.list : patients;
  const list = filterDirectory(source, settings, date, query, doctor, status);
  const doctors = [...new Set(source.map(p => p.doctor).filter(Boolean))];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="directory-title" className="fixed inset-0 z-[60] overflow-y-auto bg-slate-50" onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const items = e.currentTarget.querySelectorAll('button, input, select, [tabindex="0"]');
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between gap-3">
          <div><h2 id="directory-title" className="text-xl font-semibold text-slate-900">전체 환자 명단</h2><p className="t-hint text-sm text-slate-500">현재 등록된 대기 명단을 조회합니다. 여러 검사실에 대기 중이면 모두 표시됩니다.</p></div>
          <button ref={closeRef} type="button" onClick={onClose} className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm">닫기</button>
        </div>
      </div>
      <div className="mx-auto max-w-5xl space-y-4 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <Field label="환자 검색"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 · 환자번호 · 교수 · 대기 명단" className={INPUT} /></Field>
          <Field label="진료 날짜 (비우면 어제~앞으로의 모든 날짜)"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></Field>
          <Field label="담당 교수"><select value={doctor} onChange={e => setDoctor(e.target.value)} className={INPUT}><option value="">전체 교수</option>{doctors.map(d => <option key={d} value={d}>{d}</option>)}</select></Field>
          <Field label="진행 상태"><select value={status} onChange={e => setStatus(e.target.value)} className={INPUT}>{DIRECTORY_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500"><span>조회 결과 {list.length}명 · {date || '모든 날짜'}</span><button type="button" onClick={() => { setQuery(''); setDoctor(''); setStatus('all'); setDate(todayISO()); }} className="underline">오늘 전체로 초기화</button></div>
        {archived.isArchived && <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600">{archived.loading ? '지난 명단을 불러오는 중입니다…' : archived.error ? '지난 명단을 불러오지 못했습니다. 서버 연결을 확인해주세요.' : '지난 날짜의 보관된 명단입니다.'}</div>}
        {!list.length ? <EmptyState text={archived.loading ? '불러오는 중…' : '조건에 맞는 환자가 없습니다. 검색어나 날짜를 확인해주세요.'} /> : list.map(p => (
          <div key={patientKey(p)} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="t-name text-slate-900">{p.name}</span><span className="text-sm text-slate-500">{p.id} · {p.doctor || '담당 교수 미지정'}</span>{p.firstVisit && <span className="text-xs text-sky-700">초진</span>}</div>
            <div className="mt-1 text-xs text-slate-500">{p.date} · 예약 {p.reservation || '-'} · 접수 {p.checkin || '미접수'}</div>
            <div className="mt-3 flex flex-wrap gap-2">{patientQueueLabels(p, settings).map(label => <span key={label} className={`rounded-lg border px-3 py-2 text-sm ${p.consultDone ? 'border-slate-200 bg-slate-50 text-slate-600' : activeVf(p) ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>{label}</span>)}</div>
            {pendingProcedures(p).length > 0 && <div className="mt-2 text-xs text-slate-600">남은 처치: {pendingProcedures(p).map(x => `${x.name} (${PERFORMER_LABEL[x.performer] || x.performer})`).join(', ')}</div>}
          </div>
        ))}
        {lastSync && <p className="text-center text-xs text-slate-400">마지막 업데이트 {lastSync.toLocaleTimeString('ko-KR')}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  useApplyTextSize();
  // 메인 화면의 '전체 환자 명단'은 화면 전환 없이 명단 창만 엽니다.
  const selectRole = (key) => (key === 'directory' ? setDirectoryOpen(true) : setRole(key));
  const [patients, mutatePatients, syncPatients, markPatients] = useSharedStore('daily-patients', loadDaily, []);
  const [fuMap, mutateFu, syncFu, markFu] = useSharedStore('fu-designations', loadFu, {});
  const [doctors, mutateDoctors, syncDoctors, markDoctors] = useSharedStore('doctors', loadDoctors, []);
  const [settings, mutateSettings, syncSettings, markSettings] = useSharedStore('settings', loadSettings, DEFAULT_SETTINGS);
  const [history, mutateHistory, syncHistory, markHistory] = useSharedStore('measure-history', loadHistory, {});
  const [doctorPrefs, mutateDoctorPrefs, syncDoctorPrefs, markDoctorPrefs] = useSharedStore('doctor-prefs', loadDoctorPrefs, {});
  const [lastSync, setLastSync] = useState(null);

  const refresh = useCallback(async () => {
    const marks = [markPatients(), markFu(), markDoctors(), markSettings(), markHistory(), markDoctorPrefs()];
    let p, f, d, s, h, dp;
    try {
      [p, f, d, s, h, dp] = await Promise.all([loadDaily(), loadFu(), loadDoctors(), loadSettings(), loadHistory(), loadDoctorPrefs()]);
    } catch {
      return; // 서버 연결이 끊기면 지금 화면을 그대로 두고 다음에 다시 시도합니다.
    }
    syncPatients(p, marks[0]);
    syncFu(f, marks[1]);
    syncDoctors(d, marks[2]);
    syncSettings(s, marks[3]);
    syncHistory(h, marks[4]);
    syncDoctorPrefs(dp, marks[5]);
    setLastSync(new Date());
  }, [markPatients, markFu, markDoctors, markSettings, markHistory, markDoctorPrefs, syncPatients, syncFu, syncDoctors, syncSettings, syncHistory, syncDoctorPrefs]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const renderView = () => {
  if (!role) return <RoleSelect settings={settings} onSelect={selectRole} />;

  const onBack = () => setRole(null);
  const today = todayISO();
  // 1차 진료 설명 완료를 기다리는 2차 진료는 관리자·전체 명단에서만 보입니다.
  const patientsToday = patients.filter(p => p.date === today && !p.linkWaiting);

  if (role === 'vision' || role.startsWith('room:')) {
    return (
      <StationView
        key={role}
        mode={role === 'vision' ? 'vision' : role.slice('room:'.length)}
        settings={settings}
        doctorPrefs={doctorPrefs}
        patients={patientsToday}
        history={history}
        mutatePatients={mutatePatients}
        mutateHistory={mutateHistory}
        onBack={onBack}
        lastSync={lastSync}
      />
    );
  }
  if (role === 'procedure') {
    return (
      <ProcedureRoomView
        patients={patientsToday}
        settings={settings}
        doctorPrefs={doctorPrefs}
        history={history}
        mutatePatients={mutatePatients}
        onBack={onBack}
        lastSync={lastSync}
      />
    );
  }
  if (role === 'consult') {
    return (
      <ConsultView
        patients={patientsToday}
        doctors={doctors}
        doctorPrefs={doctorPrefs}
        settings={settings}
        history={history}
        mutatePatients={mutatePatients}
        mutateFu={mutateFu}
        onBack={onBack}
        lastSync={lastSync}
        allPatients={patients.filter(p => p.date === today)}
      />
    );
  }
  if (role === 'admin') {
    return (
      <AdminView
        patients={patients}
        doctors={doctors}
        doctorPrefs={doctorPrefs}
        settings={settings}
        fuMap={fuMap}
        mutatePatients={mutatePatients}
        mutateFu={mutateFu}
        mutateDoctors={mutateDoctors}
        mutateDoctorPrefs={mutateDoctorPrefs}
        onBack={onBack}
        lastSync={lastSync}
      />
    );
  }
  if (role === 'settings') {
    return (
      <SettingsView
        settings={settings}
        doctors={doctors}
        doctorPrefs={doctorPrefs}
        mutateSettings={mutateSettings}
        mutateDoctors={mutateDoctors}
        mutateDoctorPrefs={mutateDoctorPrefs}
        onBack={onBack}
        lastSync={lastSync}
      />
    );
  }
  if (role === 'board') {
    return <BoardSelect doctors={doctors} onSelect={k => setRole(`board:${k}`)} onBack={onBack} />;
  }
  if (role.startsWith('board:')) {
    return (
      <BoardView
        kind={role.slice('board:'.length)}
        patients={patientsToday.filter(p => p.checkin)}
        settings={settings}
        doctors={doctors}
        doctorPrefs={doctorPrefs}
        onBack={() => setRole('board')}
      />
    );
  }
  return <RoleSelect settings={settings} onSelect={selectRole} />;
  };
  return <>
    <div inert={directoryOpen ? true : undefined}>{renderView()}</div>
    {directoryOpen && <PatientDirectory patients={patients} settings={settings} lastSync={lastSync} onClose={() => setDirectoryOpen(false)} />}
  </>;
}




