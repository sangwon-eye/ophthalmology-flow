// 진료 흐름·검사·산동·측정값 등 화면과 무관한 규칙과 계산
import * as XLSX from 'xlsx';

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
  treatStaleMin: 20, // 처치실: 마지막 진행 후 이 시간(분)이 지나면 카드 강조 (0 = 끔)
  lateGraceMin: 0, // 바코드 접수에서만: 예약시간보다 이 시간 넘게 늦게 찍으면 지각
  consultFrontCount: 5, // 복도 끝 모니터(진료실 전체)·QR 다시 찍기: 교수님마다 앞에서부터 이 인원은 '진료실 앞으로 이동' (0 = 끔)
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
// 예약시간(시:분)이 적혀 있는지. 없으면(명단에 없던 환자 등) 접수 전에는 맨 뒤, 접수하면 지각으로 맨 뒤
export function hasReservation(p) {
  return /\d{1,2}:\d{2}/.test(String(p?.reservation || ''));
}
export function reservationQueueKey(reservation) {
  return hasReservation({ reservation }) ? timeToMin(reservation) : 24 * 60;
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
// 설정의 두 가지 칩 (한 검사에 둘 중 하나만):
//  [검사 준비] prepOn : 그 검사 전에 처치실 '검사 준비'에서 할 일 (예: FAG 동의서·skin test). 확인해야 검사실로
//  [시간 재기] timed  : 검사 자체가 시간을 재는 검사 (예: Schirmer, MMP). 검사 칸을 누르면 시작 시각 → [끝 · 확인]
// 시작·확인 기록은 둘 다 p.prep[testId]
export function isTimed(t) { return !!t?.timed; }
// 준비 결과가 음성이어야 검사실에서 검사할 수 있음
export function prepBlocked(p, t) { return hasPrep(t) && prepOf(p, t)?.result !== 'neg'; }
// 양성이면 그 검사는 보류 (검사실 대기에서 빠지고, 진료실에 표시)
export function prepPositive(p, t) { return hasPrep(t) && prepOf(p, t)?.result === 'pos'; }
export function prepWaitMin(t) { return Math.max(0, Number(t?.prepWaitMin ?? 20) || 0); }
// 처치실에서 준비할 검사 (지정됐고, 아직 안 했고, 결과 전)
export function prepPendingTests(p, settings) {
  return sortedTests(settings).filter(t => hasPrep(t) && p.assigned?.[t.id] && !p.done?.[t.id] && !prepOf(p, t)?.result);
}
// 시간 재기 방식: 'confirm'(기본, 시간이 되면 직원이 확인해야 넘어감 · FAG, Schirmer) / 'go'(시작하면 바로 넘어가고 시간이 되면 확인 알림 · MMP)
export function prepGoMode(t) { return t?.prepMode === 'go'; }
export function prepDue(st, t, now = Date.now()) { return !!st?.startedAt && now >= st.startedAt + prepWaitMin(t) * 60000; }
// '바로 넘어감' 검사 중 결과 확인이 남은 것 (시작 때 검사는 완료로 넘어감)
export function prepChecks(p, settings) {
  return sortedTests(settings).filter(t => (hasPrep(t) || isTimed(t)) && prepGoMode(t) && p.assigned?.[t.id] && prepOf(p, t)?.go && !prepOf(p, t)?.checked);
}
// 진행 중 호출 금지: 설정 칩. 정하지 않았으면 VF(시야검사)만 기본으로 켜짐 (다른 검사와 같은 칩으로 끌 수도 있음)
export function holdCallOf(t) { return typeof t?.holdCall === 'boolean' ? t.holdCall : isVfTest(t || {}); }
// 검사 준비·시간 재기 중(시작~확인)이고 호출 금지인 검사 (예: Schirmer): 다른 검사실에서 부르지 않음
export function prepHolding(p, settings) {
  return sortedTests(settings).find(t => (hasPrep(t) || isTimed(t)) && holdCallOf(t) && !prepGoMode(t) && p.assigned?.[t.id] && !p.done?.[t.id] && prepOf(p, t)?.startedAt && !prepOf(p, t)?.result) || null;
}
// 버튼 이름: 시간 재기는 검사 이름, 검사 준비는 적은 준비 이름(예: skin test), 없으면 검사 이름
export function prepLabel(t) {
  if (isTimed(t)) return t?.short || t?.name || '';
  const n = String(t?.prepName || '').trim();
  return n && n !== '검사 준비' ? n : (t?.short || t?.name || '');
}
// 시간 재기 검사는 [확인]이 곧 검사 완료 (검사 준비는 '확인하면 검사 완료'를 켠 경우만)
export function prepCompletesTest(t) {
  return isTimed(t) || !!t?.prepCompletes;
}
// 예전에 확인만 되고 완료가 안 된 처치실 검사 고치기 (바뀐 게 없으면 그대로)
export function fixTreatPreps(p, settings) {
  let done = p.done, doneAt = p.doneAt, changed = false;
  sortedTests(settings).forEach(t => {
    const st = p.prep?.[t.id];
    if (isTimed(t) && p.assigned?.[t.id] && st?.result === 'neg' && !done?.[t.id]) {
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
    ...(prepCompletesTest(t) ? { done: { ...x.done, [t.id]: true }, doneAt: { ...(x.doneAt || {}), [t.id]: at } } : {}),
  };
}
export function prepCancelPatch(x, t) {
  return {
    prep: { ...(x.prep || {}), [t.id]: null },
    ...(x.prep?.[t.id]?.go ? { done: { ...x.done, [t.id]: false }, doneAt: { ...(x.doneAt || {}), [t.id]: null } } : {}),
  };
}
// 시간 재는 중이고(시작, 확인 전) 아직 완료 안 된 검사
export function prepRunning(p, t) { const st = prepOf(p, t); return (hasPrep(t) || isTimed(t)) && !!st?.startedAt && !st.result && !st.go && !p.done?.[t.id]; }
// 검사를 미시행으로 되돌리거나 뺄 때 시간 재기 기록(시작 시각·확인)도 지움 → 처음 상태([검사 이름])로
export function withoutPrep(x, key) {
  if (!x.prep?.[key]) return {};
  const prep = { ...x.prep };
  delete prep[key];
  return { prep };
}
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
// 시력/안압을 다시 재도록 시력방으로 되돌림 (측정 완료 표시도 지워야 시력방 화면이 저절로 다시 완료로 넘기지 않음)
export function revisionPatch(x) {
  return { done: { ...x.done, [VISION_KEY]: false }, doneAt: { ...(x.doneAt || {}), [VISION_KEY]: null }, measureOk: null, vaOk: null, nctOk: null };
}
export function visionComplete(p) {
  return !!p.done?.[VISION_KEY] && VISION_TEST_IDS.every(id => !p.assigned?.[id] || !!p.done?.[id]);
}
// 시력방 할 일: 측정값 [확인], (초진) History [확인], 시력방 검사(ARK 등), (산동 예정) 첫 점안.
// 모두 끝나면 시력/안압 완료로 자동으로 넘어감. 점안은 [점안 없이 넘기기](dilateSkip)나 산동 금지 검사(VF)가 남으면 제외
export function visionTasksLeft(p, prefs) {
  const left = [];
  if (!p.measureOk) left.push('measure');
  if (hxNeeded(p) && !p.hx && !p.hxSheetAt) left.push('hxSheet'); // 초진: History 설문지 드리기
  if (VISION_TEST_IDS.some(id => p.assigned?.[id] && !p.done?.[id])) left.push('tests');
  if (dropDue(p, prefs)) left.push('drop');
  return left;
}
export function dropDue(p, prefs) {
  if (p.dilateSkip) return false;
  if (crActive(p, prefs)) return false; // CR은 진료실 간호사 담당: 시력방에서 첫 점안을 해도 되지만 안 해도 넘어감
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
// 교수님 처치가 같이 남아 있어도 전공의 처치는 처치실에 바로 올라감 (상황에 맞게 먼저 할 수 있게)
export function inResidentProcedure(p) {
  return !p.consultDone && pendingProcedures(p, 'resident').length > 0;
}
// 진료 후 보낸 처치 중 '산동 필요'(설정 > 처치)가 남아 있음 → 설명 대기·처치실 카드에 [산동] 점안 버튼
// (이미 시행하고 확인만 기다리는 처치는 뺌)
export function procDilatePending(p) {
  return pendingProcedures(p).some(x => x.dilate && !x.performedAt);
}
// 처치 이름 + 눈 (예: PRP · OS)
export function procLabel(x) {
  return `${x.name}${['OU', 'OD', 'OS'].includes(x.eye) ? ` · ${x.eye}` : ''}`;
}

/* 처치 후 확인 (10-07 사용자 결정): YAG·Probing처럼 시행하고 N분 뒤 확인해야 끝나는 처치 */
// 설정 > 처치의 '처치 후 확인 N분' (0·비어 있음 = 확인 없음)
export function procCheckMin(settings, procId) {
  const n = Number((settings?.procedures || []).find(x => x.id === procId)?.checkMin);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
// [처치 완료]를 누름: 확인 시간이 있는 처치는 시행 시각만 적고 남겨 둠(확인 대기 — 처치가 남은 것과 같음), 없으면 바로 완료
export function performProcItem(i, settings, at) {
  if (i.done || i.performedAt) return i;
  const m = procCheckMin(settings, i.procId);
  return m ? { ...i, performedAt: at, checkMin: m } : { ...i, done: true, doneAt: at };
}
export function awaitingCheck(i) {
  return !!i && !i.done && !!i.performedAt;
}
// 아직 시행 전인 처치 ([처치 완료] 버튼이 할 일)
export function notPerformed(list) {
  return (list || []).filter(i => !i.done && !i.performedAt);
}
export function procCheckDue(i, now = Date.now()) {
  return awaitingCheck(i) && now - i.performedAt >= (Number(i.checkMin) || 0) * 60000;
}
// 확인을 기다리는 처치 (진료 후 처치 procedures + 진료 전 처치 preProcs)
export function checkItems(p) {
  return [
    ...(p.procedures || []).filter(awaitingCheck).map(i => ({ list: 'procedures', i })),
    ...(p.preProcs || []).filter(awaitingCheck).map(i => ({ list: 'preProcs', i })),
  ];
}
// 확인: 서버 기록이 화면에 보이던 시행 그대로일 때만 (그사이 다른 PC가 확인·취소했으면 그대로)
export function confirmProcCheckPatch(x, list, uid, performedAt, at) {
  const items = x[list] || [];
  if (!items.some(i => i.uid === uid && awaitingCheck(i) && i.performedAt === performedAt)) return {};
  return { [list]: items.map(i => (i.uid === uid ? { ...i, done: true, doneAt: at, checkedAt: at } : i)) };
}
// 시행 취소 (확인 전): 시행 전으로 되돌림
export function cancelProcCheckPatch(x, list, uid, performedAt) {
  const items = x[list] || [];
  if (!items.some(i => i.uid === uid && awaitingCheck(i) && i.performedAt === performedAt)) return {};
  return { [list]: items.map(i => (i.uid === uid ? { ...i, performedAt: undefined, checkMin: undefined } : i)) };
}

/* 처치 후 검사 (10-07 사용자 결정): [처치 완료] 옆 '검사 추가 후 완료' — 직원이 그때그때 (예: PRP 후 그 눈 WFP) */
// 고른 검사를 오늘 검사에 넣음 (이미 했으면 다시). 진료 전 처치는 검사 후 진료 대기로, 진료 후 처치는 검사 후 설명 대기로
export function addPostTestsPatch(x, ids, detail) {
  if (!ids.length) return {};
  const assigned = { ...x.assigned }, done = { ...x.done }, doneAt = { ...(x.doneAt || {}) }, nextDetail = { ...(x.detail || {}) };
  ids.forEach(k => {
    assigned[k] = true; done[k] = false; doneAt[k] = null;
    if (detail?.[k]) nextDetail[k] = detail[k]; else delete nextDetail[k];
  });
  return { assigned, done, doneAt, detail: nextDetail, orders: clearOrders(x, ids), postTests: [...new Set([...(x.postTests || []), ...ids])] };
}
// 처치 후 검사가 남음 (진료 후 처치면 이게 끝나야 [귀가] — 설명 먼저는 됨)
export function postTestsPending(p) {
  return (p.postTests || []).some(id => p.assigned?.[id] && !p.done?.[id]);
}
// 귀가(설명 완료로 바로 끝내기)를 막는 것: 남은 처치(확인 대기 포함) 또는 처치 후 검사
export function homeBlocked(p) {
  return pendingProcedures(p).length > 0 || postTestsPending(p);
}
// 처치를 보낼 때: '산동 필요' 처치가 있으면 산동 예정을 켬. 이미 점안한 기록은 그대로 (그 시각부터 계속)
export function procDilatePatch(x, items) {
  if (!items.some(i => i.dilate) || x.dilateOverride === true) return {};
  return { dilateOverride: true };
}
// 처치 때문에 산동을 켰으면 그 처치에 표시 (처치 취소 때 산동도 원래대로 되돌리려고)
export function markDilateSet(x, items) {
  if (!procDilatePatch(x, items).dilateOverride) return items;
  const was = typeof x.dilateOverride === 'boolean' ? x.dilateOverride : null;
  return items.map(i => (i.dilate ? { ...i, dilateSet: true, dilateWas: was } : i));
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
// prefs(교수님 설정)를 주면 CR 환자는 CR 점안이 끝나야 진료 대기 (진료실 간호사가 CR 담당)
export function consultWaiting(p, settings, prefs) {
  return !p.consultDone && !p.seen && !p.calledRoom && !p.treatRequest && allDone(p, settings)
    && !dropsPending(p, prefs, settings?.dilationWaitMin);
}
// 진료 대기 순서 (10-05 사용자 결정): 시력·검사·진료 모두 같은 기준(queueKey: 예약시간 → 접수시각, 지각은 뒤).
// 진료 대기에서만 consultKey(새 칸)가 있으면 그것을 씀 — 아래 placeConsultArrivals 가 정함
export function consultOrderKey(p) { return typeof p.consultKey === 'number' ? p.consultKey : p.queueKey; }
export function byConsultQueue(a, b) { return consultOrderKey(a) - consultOrderKey(b); }
// 그 교수님 진료 대기 순서 (진료실 화면·환자용 화면·QR 접수가 같은 순서를 씀)
export function consultQueue(patients, doctor, settings, prefs) {
  return patients.filter(p => p.doctor === doctor && consultWaiting(p, settings, prefs)).sort(byConsultQueue);
}
// 검사·점안이 끝나 진료 대기로 '새로' 들어온 환자 자리 (모든 명단 저장에서 서버 최신 값으로 다시 계산 — App의 mutatePatients)
//  - 앞 N명 보호 (10-07 사용자, 예전 '1번 보호'를 넓힘): N = 설정 '진료실 앞으로 안내할 인원'(0이면 1). 이미 진료실 앞으로
//    안내받은 앞 N명은 절대 뒤로 밀리지 않음 → 예약 순서로 그 안에 들어가게 되면 N번째 바로 뒤로 (새 환자의 consultKey)
//  - 예약시간이 같으면 진료 대기에 먼저 들어온(검사가 먼저 끝난) 사람이 앞 (10-07 사용자, 접수 순서 아님. 지각은 예전대로)
//  - 그 밖에는 예약 순서 자리 그대로. 추가 검사에서 돌아온 환자·CR·산동 후 다시 진료도 같은 규칙 (예외 없음)
//  - 되돌리기는 새로 들어온 것이 아님: [호출 취소](진료 중에서)·[진료 완료 취소](설명 대기에서)는 그대로,
//    [보내기]의 [되돌리기]는 restoredAt(새 칸)이 바뀐 저장이라 그대로, [다시 진료 취소](진료 중에 보낸 것)는 예전처럼 맨 앞
//  - 시력·검사 순서(queueKey)는 건드리지 않음
function wasBeforeConsult(p, settings, prefs) {
  return !p.consultDone && !p.seen && !inConsult(p) && !consultWaiting(p, settings, prefs);
}
export function placeConsultArrivals(prev, next, settings, prefs) {
  if (!Array.isArray(prev) || !Array.isArray(next) || prev === next || !settings) return next;
  const before = new Map(prev.map(p => [patientKey(p), p]));
  const arrivals = [];
  next.forEach((p, i) => {
    const b = before.get(patientKey(p));
    if (!b || b === p || !p.checkin) return;
    if (p.restoredAt && p.restoredAt !== b.restoredAt) return; // 되돌리기: 원래 자리 그대로
    if (consultWaiting(p, settings, prefs) && wasBeforeConsult(b, settings, prefs)) arrivals.push(i);
  });
  if (!arrivals.length) return next;
  const out = [...next];
  const pendingIdx = new Set(arrivals);
  arrivals.forEach(i => {
    pendingIdx.delete(i);
    const b = before.get(patientKey(out[i]));
    const a = { ...out[i], consultKey: null }; // 새로 들어올 때마다 다시 정함 (예전 자리 기록은 지움)
    const cancelRedo = !!a.redo?.cancelledAt && a.redo.cancelledAt !== b.redo?.cancelledAt;
    const others = out.map((p, j) => [p, j])
      .filter(([p, j]) => j !== i && !pendingIdx.has(j) && p.doctor === a.doctor && p.date === a.date && consultWaiting(p, settings, prefs))
      .sort((x, y) => consultOrderKey(x[0]) - consultOrderKey(y[0]));
    if (others.length) {
      const keys = others.map(([p]) => consultOrderKey(p));
      // k 바로 뒤 자리 (아주 작은 틈 안에서 예약 순서를 지킴 — 그 뒤 예약의 환자보다 앞, 같은 자리로 밀린 환자끼리는 예약 순서)
      const after = (k) => k + 1e-5 * (0.1 + 0.8 * Math.min(1, Math.max(0, a.queueKey / 200000)));
      if (cancelRedo) a.consultKey = keys[0] - 0.001;
      else if (typeof a.queueKey === 'number') {
        let must = -Infinity;
        // 앞 N명(진료실 앞으로 안내받은 사람)은 밀지 않음
        const guard = Math.min(Math.max(1, consultFrontCount(settings)), keys.length);
        if (a.queueKey < keys[guard - 1]) must = keys[guard - 1];
        // 같은 예약시간(지각 제외)이면 먼저 들어와 기다리는 사람 뒤 = 검사가 끝난 순서 (10-07 사용자)
        if (!a.late) {
          const base = Math.floor(a.queueKey);
          const same = others.filter(([p]) => !p.late && typeof p.queueKey === 'number' && Math.floor(p.queueKey) === base).map(([p]) => consultOrderKey(p));
          if (same.length) must = Math.max(must, ...same);
        }
        if (a.queueKey <= must) a.consultKey = after(must);
      }
    }
    out[i] = a;
  });
  return out;
}
// 진료실 앞으로 안내할 인원 (설정 > 기타, 기본 5명, 0 = 끔)
export function consultFrontCount(settings) {
  const n = Math.round(Number(settings?.consultFrontCount ?? 5));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
// 진료 중에 [보내기]·[추가 검사]·CR·산동 다시 진료로 나갔다 돌아온 환자 → 환자용 진료실 명단에 '재진료' (10-07 사용자:
// 예약이 빨라 앞에 들어가도 다른 환자가 이해하게). 직원 화면은 예전 표시('진료 후 추가검사'·'CR/산동 후 재진') 그대로
export function isReconsult(p) {
  return !!p && (!!p.consultHold || (!!p.redo?.kind && !p.redo.cancelledAt));
}
// 환자용 진료실 명단의 예약시간 '9:30' (10-07 사용자: 순서가 바뀐 이유를 보여 줌). 지각·예약시간 없음은 ''
export function boardReservation(p) {
  if (!p || p.late || !hasReservation(p)) return '';
  const m = String(p.reservation).match(/(\d{1,2}):(\d{2})/);
  return m ? `${Number(m[1])}:${m[2]}` : '';
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
  if (redoActive(p) && p.redo.kind && dropsPending(p, { [p.doctor]: { cr: true } }, settings?.dilationWaitMin)) return { label: `${REDO_SHORT[p.redo.kind]} · 점안 중`, area: 'consult' };
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
/* 점안 후 다시 진료: 진료실 [처치]·설명 대기 [처치 보내기]에서 'CR 후 다시 진료' / '산동 후 다시 진료'
   p.redo = { kind: 'cr' | 'dilate', at, from, pending: [같이 고른 처치] } (새 칸, 기존 기록은 그대로)
   점안은 진료실 간호사가 진료실 화면 'CR·산동 점안' 칸에서. 끝나면 진료 대기로 — 다른 환자와 같은 규칙 (placeConsultArrivals) */
export const REDO_LABEL = { cr: 'CR 후 다시 진료', dilate: '산동 후 다시 진료' };
export const REDO_SHORT = { cr: 'CR 후 재진', dilate: '산동 후 재진' };
// 다시 진료 중인지: 취소하지 않았고, 그 점안(산동·CR)이 아직 켜져 있을 때만 (다른 화면에서 꺼 버리면 '재진' 표시도 사라짐)
export function redoActive(p) {
  if (!p.redo?.kind || p.redo.cancelledAt || p.consultDone || p.seen) return false;
  return p.redo.kind === 'cr' ? !!p.cr : p.dilateOverride === true;
}
// CR(진료실 간호사 담당) 또는 점안 후 다시 진료: 점안이 끝나고 기다리는 시간이 지나야 진료 대기로
export function dropsPending(p, prefs, waitMin, now = Date.now()) {
  if (p.consultDone || p.seen) return false;
  if (!redoActive(p) && !crActive(p, prefs)) return false;
  const st = dilationState(p, prefs, waitMin, now);
  return !!st.need && st.status !== 'ready';
}
// 다시 진료로 보낼 때 바뀌는 칸. 예전 점안 기록은 dropsBefore 에 남기고 점안은 1회부터 새로
export function redoPatch(x, kind, { at, from, pending = [], frontKey }) {
  const before = [...(x.drops || []), ...(x.dropsExtra || [])].filter(Boolean);
  // 보내기 전 상태 (다시 진료 취소 때 되돌림)
  const prev = { seen: !!x.seen, seenAt: x.seenAt ?? null, explainedEarly: !!x.explainedEarly, cr: !!x.cr,
    dilateOverride: typeof x.dilateOverride === 'boolean' ? x.dilateOverride : null,
    drops: x.drops || [], dropsExtra: x.dropsExtra || [], dropsBefore: x.dropsBefore || [] };
  return {
    redo: { kind, at, from, pending, prev, ...(x.cr ? { crWas: true } : {}) },
    seen: false, seenAt: null, calledRoom: null, explainedEarly: false,
    ...(before.length ? { dropsBefore: [...(x.dropsBefore || []), ...before] } : {}),
    drops: [], dropsExtra: [],
    ...(kind === 'cr' ? { cr: true } : { dilateOverride: true, cr: false }),
    ...(typeof frontKey === 'number' ? { queueKey: Math.min(x.queueKey, frontKey) } : {}),
  };
}
// 다시 진료 취소: 표시를 지우고 산동·점안 기록을 보내기 전으로, 환자는 원래 있던 곳으로
// (설명 대기에서 보냈으면 설명 대기 원래 순서 + 같이 고른 처치 시작, 진료 중에 보냈으면 진료 대기 맨 앞)
export function cancelRedoPatch(x, at = Date.now()) {
  if (!x.redo?.kind) return {};
  const pv = x.redo.prev || {};
  const pending = x.redo.pending || [];
  const fromExplain = !!pv.seen;
  return {
    redo: { ...x.redo, cancelledAt: at, pending: fromExplain ? [] : pending },
    cr: !!pv.cr,
    dilateOverride: typeof pv.dilateOverride === 'boolean' ? pv.dilateOverride : undefined,
    drops: pv.drops || [], dropsExtra: pv.dropsExtra || [], dropsBefore: pv.dropsBefore || [],
    ...(fromExplain
      ? { seen: true, seenAt: pv.seenAt || at, explainedEarly: !!pv.explainedEarly, calledRoom: null, ...(pending.length ? { procedures: [...(x.procedures || []), ...pending], procOrderedAt: at } : {}) }
      : { seen: false, calledRoom: null }),
  };
}
// 다시 진료가 끝나면(진료 완료·처치 지정) 같이 골라 둔 처치를 그때 시작
export function releaseRedo(x) {
  if (!x.redo?.pending?.length) return {};
  const items = markDilateSet(x, x.redo.pending);
  // released: 진료 완료 취소 때 다시 대기로 되돌릴 처치
  return { procedures: [...(x.procedures || []), ...items], redo: { ...x.redo, pending: [], released: items.map(i => i.uid) }, ...procDilatePatch(x, items) };
}
// 다시 진료 뒤 [진료 완료 취소]: 그때 시작한 처치(아직 안 한 것)를 다시 '다시 진료 뒤 처치'로
export function unreleaseRedo(x) {
  const ids = new Set(x.redo?.released || []);
  if (!ids.size) return {};
  const back = (x.procedures || []).filter(i => ids.has(i.uid) && !i.done);
  return { procedures: (x.procedures || []).filter(i => !(ids.has(i.uid) && !i.done)), redo: { ...x.redo, pending: [...(x.redo.pending || []), ...back], released: [] } };
}
// CR 점안 횟수 (10-07 사용자: 총 3회, 예전 4회 — 예전 기록의 4번째 점안은 보지 않음)
export const CR_DROPS = 3;
export function dilationState(p, prefs, waitMin, now = Date.now()) {
  const cr = crActive(p, prefs);
  if (!cr && !needsDilation(p, prefs)) return { need: false };
  const total = cr ? CR_DROPS : 1;
  const drops = Array.from({ length: total }, (_, i) => (p.drops || [])[i] || null);
  const given = drops.filter(Boolean).length;
  // 추가 점안(산동이 덜 됐을 때, CR 제외): 기존 점안 기록과 따로 두고, 기다리는 시간은 마지막 추가 점안부터 다시
  const extra = !cr && given === total ? (p.dropsExtra || []).filter(Boolean) : [];
  const last = Math.max(0, ...drops.filter(Boolean), ...extra);
  const mins = last ? Math.floor((now - last) / 60000) : 0;
  // 산동 확인(10-03): 직원이 [산동 확인 · 완료]를 누른 시각 dilateOkAt. 마지막 점안 뒤에 누른 것만 유효
  // (추가 점안·다시 진료로 새로 점안하면 다시 확인). 확인하면 시간 전이어도 완료
  const ok = !!last && Number(p.dilateOkAt) >= last;
  // 진료실 'CR·산동 점안' 칸(CR, CR·산동 후 다시 진료)은 시간이 지나도 확인해야 진료 대기로: 시간이 되면 'due'
  const gate = !p.consultDone && !p.seen && (cr || redoActive(p));
  const base = { need: true, cr, total, drops, given, mins, extra, last, ok, gate };
  if (given === 0) return { ...base, status: 'todo' };
  if (given < total) return { ...base, status: 'progress' };
  if (ok) return { ...base, status: 'ready' };
  if (mins < (Number(waitMin) || 15)) return { ...base, status: 'waiting' };
  return { ...base, status: gate ? 'due' : 'ready' };
}
// [산동 확인 · 완료]: 화면에 보이던 마지막 점안(last) 그대로일 때만 (그사이 추가 점안·취소가 있으면 안 함)
export function confirmDilationPatch(x, prefs, waitMin, last, at) {
  const st = dilationState(x, prefs, waitMin);
  return st.need && st.given === st.total && st.last === last && !st.ok ? { dilateOkAt: at } : {};
}
// 되돌리기: 그 버튼이 바꾼 검사 칸만 원래대로 (그사이 다른 컴퓨터가 완료한 다른 검사·칸은 그대로 둠)
// before: 누르기 전 { done, doneAt, assigned, detail, prep } 중 일부, ids: 그 버튼이 바꾼 검사 id
export function restoreKeys(x, before, ids) {
  const out = {};
  ['done', 'doneAt', 'assigned', 'detail', 'prep'].forEach(field => {
    if (!(field in before)) return;
    const cur = { ...(x[field] || {}) };
    ids.forEach(id => {
      const v = before[field]?.[id];
      if (v === undefined) delete cur[id]; else cur[id] = v;
    });
    out[field] = cur;
  });
  return out;
}
// 저장이 끝나면 서버에 저장된 명단으로 끝나는 약속(Promise)을 돌려줌 (실제로 반영됐는지 확인할 때)
export function patchPatient(mutatePatients, pk, fn) {
  return mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? { ...x, ...fn(x) } : x)));
}
// 추가 점안 기록 / 마지막 추가 점안만 취소 (처음 점안 기록 drops 는 건드리지 않음)
export function addExtraDrop(mutatePatients, pk) {
  const at = Date.now();
  patchPatient(mutatePatients, pk, x => ({ dropsExtra: [...(x.dropsExtra || []), at] }));
}
// 점안 버튼은 '화면에 보이던 상태'대로 바꿉니다 (두 PC가 거의 동시에 누르면 서로 뒤집어 없던 일이 되는 것 방지)
// at: 화면에 보이던 마지막 추가 점안 시각 (그 기록만 지움, 이미 지워졌으면 그대로)
export function undoExtraDrop(mutatePatients, pk, at) {
  patchPatient(mutatePatients, pk, x => {
    const list = [...(x.dropsExtra || [])];
    const i = at ? list.lastIndexOf(at) : list.length - 1;
    if (i < 0) return {};
    list.splice(i, 1);
    return { dropsExtra: list };
  });
}
// on: true = 점안 기록(이미 있으면 그 시각 그대로), false = 기록 취소
export function toggleDrop(mutatePatients, pk, i, on) {
  const at = Date.now();
  patchPatient(mutatePatients, pk, x => {
    const drops = [...(x.drops || [])];
    drops[i] = on ? (drops[i] || at) : null;
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
// [▶ 시작]·[종료]로 하는 검사: '진행 중 호출 금지'를 켠 일반 검사 (VF는 기본으로 켜짐). 검사 준비·시간 재기 검사는 따로
export function startStopTest(t) {
  return holdCallOf(t) && !hasPrep(t) && !isTimed(t);
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
// 'FU 나중에' 표시: 교수님별로 fuLaterBy { [교수]: { doctor, date, at } } (두 교수님이 같은 날 눌러도 둘 다 남음).
// 예전 기록의 fuLater(한 칸)도 그대로 읽고, fuLater 에는 가장 최근 표시 하나를 같이 남겨 둠 (예전 형식과 호환)
export function laterEntries(rec) {
  const map = { ...(rec?.fuLaterBy || {}) };
  const legacy = rec?.fuLater;
  if (legacy && !map[legacy.doctor || '']) map[legacy.doctor || ''] = legacy;
  return Object.values(map).filter(Boolean);
}
// 그 교수님의 'FU 나중에' 표시 (교수님을 모르는 예전 표시는 어느 교수님에게나 해당)
export function laterFor(rec, doctor) {
  return laterEntries(rec).find(e => !e.doctor || !doctor || e.doctor === doctor) || null;
}
function withLater(rec, entries) {
  const { fuLater: ignoredL, fuLaterBy: ignoredB, ...rest } = rec;
  if (!entries.length) return rest;
  const latest = [...entries].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  return { ...rest, fuLaterBy: Object.fromEntries(entries.map(e => [e.doctor || '', e])), fuLater: latest };
}
export function saveFollowup(prev, id, doctor, value) {
  const old = prev[id] || {};
  const byDoctor = { ...old.byDoctor };
  if (old.doctor && !byDoctor[old.doctor]) { const { byDoctor: ignored, ...legacy } = old; byDoctor[old.doctor] = legacy; }
  const next = { ...value, doctor };
  if (doctor) byDoctor[doctor] = next;
  // 다른 교수님의 'FU 나중에' 표시는 남김 (그 교수님 FU는 아직 정해지지 않았으므로)
  const keep = doctor ? laterEntries(old).filter(e => e.doctor && e.doctor !== doctor) : [];
  return { ...prev, [id]: withLater({ ...next, name: value.name || old.name, byDoctor }, keep) };
}
// 바빠서 다음 내원 검사를 못 정하고 보낸 환자: FU 기록에 '나중에 지정' 표시만 남깁니다 (기존 지정은 그대로).
// FU 지정 관리에서 지정해 저장하면 saveFollowup 이 이 표시를 지웁니다.
export function markFollowupLater(prev, id, { doctor, name, date, at }) {
  const old = prev[id] || {};
  const others = laterEntries(old).filter(e => (e.doctor || '') !== (doctor || ''));
  return { ...prev, [id]: withLater({ ...old, name: name || old.name }, [...others, { doctor, date, at }]) };
}
// doctor 를 주면 그 교수님의 '나중에' 표시만 지움 (다른 교수님 것은 그대로, 교수님을 모르는 예전 표시는 지움). 없으면 모두 지움
export function unmarkFollowupLater(prev, id, doctor) {
  const all = laterEntries(prev[id]);
  if (!all.length) return prev;
  const keep = doctor ? all.filter(e => e.doctor && e.doctor !== doctor) : [];
  if (keep.length === all.length) return prev;
  return { ...prev, [id]: withLater(prev[id], keep) };
}

// 한 교수님의 FU 지정만 지웁니다. 다른 교수님 기록이 남아 있으면 그중 가장 최근 것이 대표 기록이 됩니다.
// 예전 방식 기록(교수님별 칸 없이 저장된 것)도 그 교수님 칸으로 옮긴 뒤 지우므로, 다른 교수님 FU와 '나중에' 표시는 남습니다.
export function deleteFollowup(prev, id, doctor) {
  const old = prev[id];
  if (!old) return prev;
  const next = { ...prev };
  if (!doctor) { delete next[id]; return next; }
  const byDoctor = { ...old.byDoctor };
  if (old.doctor && !byDoctor[old.doctor]) { const { byDoctor: ignoredB, fuLater: ignoredL, name: ignoredN, ...legacy } = old; byDoctor[old.doctor] = legacy; }
  delete byDoctor[doctor];
  const keepLater = laterEntries(old).filter(e => (e.doctor || '') !== doctor);
  const rest = Object.values(byDoctor);
  if (!rest.length) {
    if (keepLater.length) next[id] = withLater({ name: old.name }, keepLater);
    else delete next[id];
    return next;
  }
  const latest = [...rest].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const { fuLater: ignoredL, fuLaterBy: ignoredB, ...latestRest } = latest;
  next[id] = withLater({ ...latestRest, name: old.name, byDoctor }, keepLater);
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
// FU(다음 내원 지정)에서 오는 환자 기록 칸: 검사 지정·세부·산동·CR·진료 전 처치
function followupFields(fu, settings) {
  const assigned = { [VISION_KEY]: true };
  const detail = {};
  settings.tests.forEach(t => {
    assigned[t.id] = !!fu?.[t.id];
    if (assigned[t.id] && fu?.detail?.[t.id]) detail[t.id] = cleanDetail(fu.detail[t.id]);
  });
  return {
    assigned,
    detail,
    dilateOverride: fu?.dilate === 'yes' ? true : fu?.dilate === 'no' ? false : undefined,
    dilateEye: fu?.dilate === 'yes' ? dilateEyeOf(fu.dilateEye) : undefined,
    cr: !!fu?.cr,
    preProcs: makePreProcs(fu?.preProcs, settings),
  };
}
// FU를 저장하면 이미 올라가 있는 다음 내원 명단에도 바로 적용합니다 (명단을 미리 올려 둔 경우):
// 같은 환자·같은 교수님·from 날짜 이후(같은 날 포함)·아직 접수 전인 기록의 검사 지정·산동·CR·진료 전 처치를 새 FU로.
// 2차 진료로 이어진 기록은 두 교수님 계획이 합쳐져 있어 건드리지 않고, 'FU 미지정' 표시는 이 환자의 그 교수님 기록에서 지웁니다.
export function applyFollowupToList(list, id, doctor, fu, settings, from) {
  let changed = false;
  const next = list.map(x => {
    if (x.id !== id) return x;
    const linked = !!x.primaryKey || !!x.linkWaiting || list.some(y => y.primaryKey === patientKey(x));
    if (doctor && x.doctor === doctor && !x.checkin && !x.consultDone && String(x.date || '') >= String(from || '') && !linked) {
      const f = followupFields(fu, settings);
      changed = true;
      // 진료 전 처치가 있으면 시력검사 없이 (예전 FU의 진료 전 처치 때문에 켜졌던 것은 끔, 직접 켠 것은 그대로)
      return { ...x, ...f, fuMissing: false, skipVision: f.preProcs.length ? true : (x.preProcs || []).length ? undefined : x.skipVision };
    }
    // 'FU 미지정'은 그 교수님 기록에서만 지움 (다른 교수님 FU 나중에는 아직 남아 있을 수 있음)
    if (!x.fuMissing || (doctor && x.doctor !== doctor)) return x;
    changed = true;
    return { ...x, fuMissing: false };
  });
  return changed ? next : list;
}
export function buildPatient(raw, fuMap, settings) {
  const fu = followupForDoctor(fuMap[raw.id], raw.doctor);
  const { assigned, detail, dilateOverride, dilateEye, cr, preProcs } = followupFields(fu, settings);
  return {
    id: raw.id,
    name: raw.name,
    date: raw.date,
    doctor: raw.doctor,
    reservation: raw.reservation,
    firstVisit: !!raw.firstVisit,
    // 명단 엑셀의 성별·나이 (화면에 'M/80'). 칸이 없는 명단이면 저장하지 않음 (예전 기록과 같음)
    sex: raw.sex === 'M' || raw.sex === 'F' ? raw.sex : undefined,
    age: Number.isInteger(raw.age) ? raw.age : undefined,
    checkin: '',
    late: false,
    queueKey: reservationQueueKey(raw.reservation),
    assigned,
    detail,
    done: { [VISION_KEY]: false },
    doneAt: {},
    dilateOverride,
    dilateEye,
    // 지난 진료에서 'FU 나중에'로 보내고 아직 지정하지 않은 환자
    fuMissing: laterEntries(fuMap[raw.id]).some(e => (!e.doctor || e.doctor === raw.doctor) && String(e.date || '') < String(raw.date || '')),
    cr,
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
      dropsExtra: (x.drops || []).some(Boolean) ? (x.dropsExtra || []) : [...(primary.dropsExtra || [])],
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
// 이름·환자번호(그리고 성별·나이)는 같은 날 같은 환자의 모든 진료에, 예약시간은 이 진료에만 적용합니다.
// sex·age: undefined면 그대로, ''/null이면 지움 (정보 수정 창에서 비운 경우)
export function editPatientInfo(list, pk, { id, name, reservation, sex, age }) {
  const rec = list.find(x => patientKey(x) === pk);
  if (!rec) return list;
  const newId = String(id || '').trim() || rec.id;
  if (newId !== rec.id && list.some(x => x.id === newId && x.date === rec.date)) return list;
  const keyMap = new Map();
  const next = list.map(x => {
    if (x.id !== rec.id || x.date !== rec.date) return x;
    let y = { ...x, id: newId, name: String(name || '').trim() || x.name };
    if (sex !== undefined) y.sex = sex === 'M' || sex === 'F' ? sex : undefined;
    if (age !== undefined) y.age = Number.isInteger(age) ? age : undefined;
    if (x === rec && reservation !== undefined && reservation !== x.reservation) {
      y = x.checkin ? { ...y, reservation } : { ...y, reservation, queueKey: reservationQueueKey(reservation) };
    }
    keyMap.set(patientKey(x), patientKey(y));
    return y;
  });
  return next.map(x => (x.primaryKey && keyMap.has(x.primaryKey) ? { ...x, primaryKey: keyMap.get(x.primaryKey) } : x));
}

// 명단을 다시 올려도 이미 있는 환자의 진행 상황·검사 지정은 그대로 두고, 예약시간만 새 값으로 바꿉니다.
// 이미 접수한 환자는 대기 순서(직접 끌어서 바꾼 순서 포함)를 건드리지 않고 예약시간 글자만 바꿉니다.
// 같은 날 다른 교수님 명단에 이미 있으면 2차 진료로 연결합니다.
// 성별·나이는 진행 상황과 무관한 정보라 같은 날 같은 환자의 모든 기록에 새 값으로 맞춥니다
// (이 기능 전에 올린 명단도 다시 올리면 표시됨, 새 값이 없으면 이미 있던 값을 2차 진료 기록에 이어 씀).
export function mergePatientList(prev, news, prefs, settings) {
  const stats = { added: [], timeChanged: [], unchanged: [], linked: [] };
  let list = prev;
  news.forEach(raw => {
    let group = visitGroup(list, raw.id, raw.date);
    const np = withKnownSexAge(raw, group);
    if (group.some(x => sexAgePatch(x, np))) {
      list = list.map(x => (x.id === np.id && x.date === np.date && sexAgePatch(x, np) ? { ...x, ...sexAgePatch(x, np) } : x));
      group = visitGroup(list, np.id, np.date);
    }
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
        : { ...old, reservation: np.reservation, queueKey: reservationQueueKey(np.reservation) }));
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
// 예약시간이 없는 환자는 어느 접수든 지각 (나중에 예약시간을 넣어도 순서는 그대로 — 필요하면 직원이 끌어서 옮김).
// 지각 환자는 제시간 환자들 뒤로 갑니다. 예약시간이 없으면 접수 시각을 예약시간처럼 씁니다 ([지각]을 풀면 접수 시각 순서로).
export function lateQueueKey(p, late) {
  return (late ? 100000 : 0) + timeToMin(hasReservation(p) ? p.reservation : p.checkin) + timeToMin(p.checkin) / 10000;
}
// 시범 운영 '시력방 건너뛰기'(설정 > 기타, 10-07 사용자 결정): 켜 두면 접수(QR·직원)하는 모든 환자가
// 시력방을 건너뜀 — 프로그램에서만 시력방을 빼는 것(실제 시력검사는 프로그램 밖). 끄면 원래대로, 이미 접수한 환자는 그대로.
export function pilotSkipVision(settings) {
  return settings?.pilotSkipVision === true;
}
export function applyCheckin(p, { autoLate = false, graceMin = 0, skipVisionRoom = false } = {}) {
  const checkin = nowHHMM();
  const late = !hasReservation(p) || (autoLate
    ? !!p.late || timeToMin(checkin) > timeToMin(p.reservation) + (Number(graceMin) || 0)
    : !!p.late);
  let next = { ...p, checkin, late, queueKey: lateQueueKey({ ...p, checkin }, late) };
  // 명단 관리에서 '시력검사 없이 바로 진료'로 정한 환자(또는 시범 운영 '시력방 건너뛰기')는 접수하자마자 시력/안압을 건너뜁니다.
  if ((p.skipVision || skipVisionRoom) && !p.done?.[VISION_KEY]) {
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
  const undone = { ...p, checkin: '', late: false, queueKey: reservationQueueKey(p.reservation) };
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

// 보이는 목록(list, 그 화면 순서) 안에서 pk 환자를 toIndex 자리로 옮김
// consult: 진료 대기 화면 — 진료 순서 칸(consultKey)만 옮김 (시력·검사 순서는 그대로)
export function moveInQueue(mutatePatients, list, pk, toIndex, { consult = false } = {}) {
  const keyOf = consult ? consultOrderKey : (p) => p.queueKey;
  const from = list.findIndex(p => patientKey(p) === pk);
  if (from < 0 || toIndex === from || toIndex < 0 || toIndex >= list.length) return;
  const rest = list.filter(p => patientKey(p) !== pk);
  const before = rest[toIndex - 1];
  const after = rest[toIndex];
  let newKey;
  if (before && after) newKey = (keyOf(before) + keyOf(after)) / 2;
  else if (before) newKey = keyOf(before) + 0.5;
  else if (after) newKey = keyOf(after) - 0.5;
  else return;
  mutatePatients(prev => prev.map(p => (patientKey(p) !== pk ? p : consult ? { ...p, consultKey: newKey } : { ...p, queueKey: newKey })));
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
// 환자번호별로 오늘 + 지난 1회 측정 기록만 보관 (이전 시력·안압은 다음 내원 때 한 번 보면 됨).
// 매 내원 측정값은 그날 명단 기록(월별 보관 파일)에 모두 남아 있어, 나중에 추이를 볼 때는 그것을 씁니다.
export const HISTORY_KEEP = 2;
export function mergeHistoryEntry(list, date, patch) {
  const cur = Array.isArray(list) ? list : [];
  const existing = cur.find(r => r.date === date);
  const merged = { ...normalizeMeasure(existing), ...patch, date };
  const others = cur.filter(r => r.date !== date);
  const next = (hasAnyValue(merged) ? [merged, ...others] : others)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, HISTORY_KEEP);
  return next.length ? next : null;
}

/* 검사 결과 입력 (설정에서 검사마다 [결과 입력]을 켜고 칸을 고름. 예: MR = S·C·A·Add·VA, WG = S·C·A)
   결과는 그날 명단 기록에만 (다음 내원 때 이전 값으로 보이지 않음) */
export const RESULT_FIELDS = [
  { key: 's', label: 'S' },
  { key: 'c', label: 'C' },
  { key: 'a', label: 'A' },
  { key: 'add', label: 'Add' },
  { key: 'va', label: 'VA' },
];
export function resultFieldsOf(t) {
  return Array.isArray(t?.resultFields) ? RESULT_FIELDS.filter(f => t.resultFields.includes(f.key)) : [];
}
export function hasResultValue(r) {
  return !!r && ['od', 'os'].some(e => Object.values(r[e] || {}).some(v => String(v ?? '').trim()));
}
// 한 눈 결과를 한 줄로: "S -1.25 C -0.50 A 180"
export function resultEyeText(r, eye, fields) {
  return fields.map(f => [f.label, String(r?.[eye]?.[f.key] ?? '').trim()]).filter(([, v]) => v).map(([l, v]) => `${l} ${v}`).join(' ');
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
// 성별·나이 (없어도 되는 칸): 병원 엑셀은 성별 '남'/'여', 나이 '80세' (아이는 '11세5개월' → 11). 화면에는 'M/80'.
// 제목은 '성별'·'나이' 두 칸 또는 '성별/나이' 한 칸 (띄어쓰기·괄호는 무시, '연령'도 됨)
const SEX_TITLES = ['성별', '성', 'sex'];
const AGE_TITLES = ['나이', '연령', '만나이', 'age'];
const SEX_AGE_TITLES = SEX_TITLES.flatMap(a => AGE_TITLES.flatMap(b => ['', '/', '·', ','].flatMap(sep => [a + sep + b, b + sep + a])));
export function rosterInfoColumns(row) {
  const cols = {};
  row.forEach((cell, i) => {
    const h = String(cell ?? '').replace(/[\s()[\]]/g, '').toLowerCase();
    if (cols.sex === undefined && SEX_TITLES.includes(h)) cols.sex = i;
    else if (cols.age === undefined && AGE_TITLES.includes(h)) cols.age = i;
    else if (cols.sexAge === undefined && SEX_AGE_TITLES.includes(h)) cols.sexAge = i;
  });
  return cols;
}
// '남'·'남자'·'M' → M, '여'·'여자'·'F' → F (한 칸에 '남/80세'처럼 같이 있어도 됨), 모르면 ''
export function sexCode(v) {
  const s = String(v ?? '').trim();
  if (s.includes('남')) return 'M';
  if (s.includes('여')) return 'F';
  const words = s.toLowerCase().split(/[^a-z]+/);
  if (words.some(w => w === 'm' || w === 'male')) return 'M';
  if (words.some(w => w === 'f' || w === 'female')) return 'F';
  return '';
}
// '80세' → 80, '11세5개월' → 11 (개월은 버림), '5개월' → 0, '80' → 80. 모르면 null
export function ageYears(v) {
  const ok = (n) => (Number.isInteger(n) && n >= 0 && n < 150 ? n : null);
  if (typeof v === 'number') return Number.isFinite(v) ? ok(Math.floor(v)) : null;
  const s = String(v ?? '').trim();
  const years = s.match(/(\d+)\s*세/);
  if (years) return ok(Number(years[1]));
  if (/\d+\s*개월/.test(s)) return 0;
  const n = s.match(/\d+/);
  return n ? ok(Number(n[0])) : null;
}
// 화면 표시: 'M/80' (한쪽만 있으면 그것만, 둘 다 없으면 '' — 예전 기록·칸이 없는 명단)
export function sexAgeLabel(p) {
  const sex = p?.sex === 'M' || p?.sex === 'F' ? p.sex : '';
  const age = Number.isInteger(p?.age) ? String(p.age) : '';
  return sex && age ? `${sex}/${age}` : sex || age;
}
// 새 값(np)과 다를 때만 바꿀 칸 (새 값이 비어 있으면 기존 값을 지우지 않음)
export function sexAgePatch(x, np) {
  const patch = {};
  if ((np.sex === 'M' || np.sex === 'F') && np.sex !== x.sex) patch.sex = np.sex;
  if (Number.isInteger(np.age) && np.age !== x.age) patch.age = np.age;
  return Object.keys(patch).length ? patch : null;
}
// 새 기록에 성별·나이가 없으면 같은 날 같은 환자의 다른 기록 값을 이어 씀 (직접 추가한 2차 진료 등)
function withKnownSexAge(np, group) {
  const sex = np.sex || group.find(x => x.sex === 'M' || x.sex === 'F')?.sex;
  const age = Number.isInteger(np.age) ? np.age : group.find(x => Number.isInteger(x.age))?.age;
  if (sex === np.sex && age === np.age) return np;
  return { ...np, ...(sex ? { sex } : {}), ...(Number.isInteger(age) ? { age } : {}) };
}
export function readRoster(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // 환자번호·이름은 엑셀 화면에 보이는 글자 그대로 읽습니다 (예: 앞자리 0 유지)
  const shown = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const hi = raw.slice(0, 10).findIndex(r => { const c = rosterColumns(r); return c.id !== undefined && c.name !== undefined; });
  if (hi < 0) return null;
  const cols = rosterColumns(raw[hi]);
  const info = rosterInfoColumns(raw[hi]);
  const rows = raw.slice(hi + 1).map((r, j) => {
    const view = shown[hi + 1 + j] || [];
    const cell = (i) => (i === undefined ? '' : String(view[i] ?? r[i] ?? '').trim());
    const text = (k) => cell(cols[k]);
    const both = cell(info.sexAge);
    return {
      id: text('id'),
      name: text('name'),
      reservation: cols.reservation === undefined ? '' : normalizeTime(r[cols.reservation]),
      firstVisit: !text('visit').includes('재진'), // '재진'이 아니면 모두 초진
      doctorText: text('doctor'),
      sex: sexCode(info.sex !== undefined ? cell(info.sex) : both),
      age: ageYears(info.age !== undefined ? cell(info.age) : both),
    };
  }).filter(r => r.id);
  return { cols, rows, hasSexAge: Object.keys(info).length > 0 };
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
    { id: '10001', name: '김민수', reservation: '09:00', sex: 'M', age: 72 },
    { id: '10002', name: '이서연', reservation: '09:00', sex: 'F', age: 34 },
    { id: '10003', name: '박지훈', reservation: '09:10', sex: 'M', age: 58 },
    { id: '10004', name: '최유진', reservation: '09:20', sex: 'F', age: 66 },
    { id: '10005', name: '정하늘', reservation: '09:30', sex: 'F', age: 11 },
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
// 시력방 NCT: GAT(검사실 안압)이 지정됐거나, 관리자 명단 관리에서 '안압 안 잼'(소아 등)이면 NCT를 재지 않음
export function nctNeeded(p) {
  return !p.noIop && !p.assigned?.[GAT_ID];
}
// 오늘 NCT를 쟀는지 (오늘 검사 목록에 'NCT'로 표시)
export function nctMeasured(p) {
  return !!(String(p.measure?.nct?.od ?? '').trim() || String(p.measure?.nct?.os ?? '').trim());
}
// History는 처치실(검사 지정·예진)에서 입력합니다. 초진인데 아직 없으면 '입력 필요'
export function hxPending(p) {
  return !p.hx && (!!p.hxMissing || hxNeeded(p));
}

// 처치실 '오래 기다린 환자': 마지막으로 무언가 진행된 뒤(접수·검사 완료·산동·처치 등) 몇 분 지났는지
export function staleMinOf(settings) {
  const n = Number(settings?.treatStaleMin);
  return Number.isFinite(n) && n >= 0 ? n : 20;
}
export function lastActivityAt(p) {
  const times = [];
  if (p.checkin && p.date) times.push(new Date(`${p.date}T${String(p.checkin).padStart(5, '0')}:00`).getTime());
  Object.values(p.doneAt || {}).forEach(v => times.push(v));
  Object.values(p.prep || {}).forEach(s => { if (s) times.push(s.startedAt, s.at, s.checked); });
  Object.values(p.orders || {}).forEach(o => times.push(o?.at));
  (p.procedures || []).forEach(i => times.push(i.orderedAt, i.doneAt));
  (p.preProcs || []).forEach(i => times.push(i.doneAt));
  (p.drops || []).forEach(v => times.push(v));
  (p.dropsExtra || []).forEach(v => times.push(v));
  times.push(p.triageAssignedAt, p.triageAt, p.seenAt, p.calledAt, p.consultDoneAt, p.vfStartedAt, p.treatRequest?.at);
  const valid = times.filter(t => typeof t === 'number' && Number.isFinite(t) && t > 1e12);
  return valid.length ? Math.max(...valid) : null;
}
// 기준(분)을 넘었으면 지난 분, 아니면 0 (기준 0 = 끔)
export function staleMinutes(p, settings, now = Date.now()) {
  const limit = staleMinOf(settings);
  const last = lastActivityAt(p);
  if (!limit || !last) return 0;
  const m = Math.floor((now - last) / 60000);
  return m >= limit ? m : 0;
}

// 대기 시간 추정 (환자용 화면 "현재 … 대기 약 N분")
//  시력: 접수 → 시력방 완료, 검사: 시력방 완료(차트가 검사실로) → 첫 검사 완료
//  최근 60분 동안 마친 환자의 중간값과 지금 기다리는 환자의 경과 시간 중간값 중 큰 값, 5분 단위 올림
export const WAIT_WINDOW_MIN = 60;
function medianOf(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function checkinMs(p) {
  if (!p.checkin || !p.date) return null;
  const t = new Date(`${p.date}T${String(p.checkin).padStart(5, '0')}:00`).getTime();
  return Number.isFinite(t) ? t : null;
}
function visionDoneMs(p) {
  if (!visionComplete(p)) return null;
  const ids = [VISION_KEY, ...VISION_TEST_IDS.filter(id => p.assigned?.[id])];
  const ts = ids.map(id => p.doneAt?.[id]).filter(t => typeof t === 'number');
  return ts.length ? Math.max(...ts) : null;
}
function waitExcluded(p) {
  return !!(p.late || p.primaryKey || p.skipVision || p.visionSkipped || (p.preProcs || []).length);
}
export function estimateWait(patients, kind, now = Date.now()) {
  const since = now - WAIT_WINDOW_MIN * 60000;
  const done = [], waiting = [];
  patients.filter(p => p.date === todayISO() && !waitExcluded(p)).forEach(p => {
    const start = kind === 'vision' ? checkinMs(p) : visionDoneMs(p);
    if (!start) return;
    let end = null;
    if (kind === 'vision') {
      end = visionDoneMs(p);
      if (!end && visionComplete(p)) return; // 끝났는데 시각이 없음 → 빼기
    } else {
      const ids = Object.keys(p.assigned || {}).filter(id => p.assigned[id] && id !== VISION_KEY && !VISION_TEST_IDS.includes(id));
      if (!ids.length) return;
      const doneIds = ids.filter(id => p.done?.[id]);
      const ts = doneIds.map(id => p.doneAt?.[id]).filter(t => typeof t === 'number' && t >= start);
      if (doneIds.length && !ts.length) return;
      end = ts.length ? Math.min(...ts) : null;
    }
    if (end) { if (end >= since && end <= now) done.push((end - start) / 60000); }
    else if (!p.consultDone && start <= now) waiting.push((now - start) / 60000);
  });
  if (done.length + waiting.length < 3) return { min: null, done: done.length, waiting: waiting.length };
  const raw = Math.max(medianOf(done), medianOf(waiting));
  return { min: Math.max(5, Math.ceil(raw / 5) * 5), done: done.length, waiting: waiting.length };
}
export const WAIT_TEXT = { vision: '현재 시력검사 대기 약 {n}분', exams: '현재 검사 대기 약 {n}분' };
// 환자용 화면에 보일 대기 시간 (반자동: 관리자가 띄운 값 · 자동: 기준 이상일 때 지금 계산값)
export function shownWait(waits, patients, kind, now = Date.now()) {
  const w = waits?.[kind] || {};
  if (w.mode === 'auto') {
    const est = estimateWait(patients, kind, now);
    const limit = Number.isFinite(Number(waits?.autoMin)) ? Number(waits.autoMin) : 20;
    return est.min && est.min >= limit ? est.min : null;
  }
  return w.shown && w.shownDate === todayISO() ? w.shown : null;
}

/* 방별 대기 인원 (메인 화면 숫자·띵동 알림·각 화면이 같은 기준을 씀) */
export function visionWaiting(patients) {
  return patients.filter(p => !p.consultDone && p.checkin && !visionComplete(p));
}
// 검사실 묶음 = 시력방·처치실을 뺀 모든 검사실 (자동)
export function examRooms(settings) {
  return settings.rooms.filter(r => r.builtin !== 'treat');
}
export function roomWaiting(patients, settings, roomId) {
  return patients.filter(p => !p.consultDone && roomPending(p, settings, roomId));
}
// 검사실 묶음에서 대기 순서가 가장 빠른 환자 (지금 검사 중·호출 금지 중인 환자는 뺌)
export function earliestExamPatient(patients, settings) {
  const ids = examRooms(settings).map(r => r.id);
  const list = patients.filter(p => !p.consultDone && !activeVf(p) && !prepHolding(p, settings) && ids.some(id => roomPending(p, settings, id)));
  return [...list].sort(byQueue)[0] || null;
}
// '[끝 · 확인]'을 눌러야 완료되는 처치실 시간 재기 검사 중 시간이 된 것 (예: Schirmer)
export function treatTimedDue(p, settings, now = Date.now()) {
  return roomTests(settings, treatRoomOf(settings).id)
    .filter(t => isTimed(t) && !prepGoMode(t) && p.assigned?.[t.id] && prepRunning(p, t) && prepDue(prepOf(p, t), t, now));
}
// 처치실 할 일 묶음별 환자 (정렬 전)
export function treatWork(patients, settings, now = Date.now()) {
  const treatId = treatRoomOf(settings).id;
  return {
    requests: patients.filter(treatRequested),
    triage: patients.filter(needsTriageAssign),
    procs: patients.filter(p => needsTriageExam(p, settings) || inResidentProcedure(p)),
    prep: patients.filter(p => !p.consultDone && pastVision(p) && prepPendingTests(p, settings).length > 0),
    check: patients.filter(p => prepChecks(p, settings).length > 0 || treatTimedDue(p, settings, now).length > 0 || (!p.consultDone && checkItems(p).some(c => procCheckDue(c.i, now)))),
    preProc: patients.filter(p => !p.consultDone && pastVision(p) && preProcPending(p)),
    exams: patients.filter(p => !p.consultDone && roomPending(p, settings, treatId)),
  };
}
export function treatWorkCount(work) {
  return Object.values(work).reduce((n, list) => n + list.length, 0);
}
// 처치실 띵동: 어느 묶음이든 새 환자, 또는 시간 재기·검사 준비·결과 확인의 '시간 됨'
export function treatChimeKeys(patients, settings, now = Date.now()) {
  const work = treatWork(patients, settings, now);
  const keys = Object.entries(work).flatMap(([name, list]) => list.map(p => `${name}:${patientKey(p)}`));
  patients.forEach(p => {
    const pk = patientKey(p);
    treatTimedDue(p, settings, now).forEach(t => keys.push(`due:${pk}:${t.id}`));
    prepPendingTests(p, settings).forEach(t => { if (prepDue(prepOf(p, t), t, now)) keys.push(`due:${pk}:${t.id}`); });
    prepChecks(p, settings).forEach(t => { if (prepDue(prepOf(p, t), t, now)) keys.push(`due:${pk}:${t.id}`); });
    if (inResidentProcedure(p) && procDilatePending(p) && dilationState(p, null, settings.dilationWaitMin, now).status === 'ready') keys.push(`dil:${pk}`);
    // 처치 후 확인 시간이 됨 (교수님 처치도 처치실에서 알림 — 10-07 사용자)
    if (!p.consultDone) checkItems(p).forEach(c => { if (procCheckDue(c.i, now)) keys.push(`pchk:${pk}:${c.i.uid}`); });
  });
  return keys;
}
