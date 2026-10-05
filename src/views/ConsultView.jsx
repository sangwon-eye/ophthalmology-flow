// 진료실 화면
import React, { useState, useEffect } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { VISION_KEY, procLabel, restoreKeys, revisionPatch, applyFollowupToList, markDilateSet, unreleaseRedo, cancelRedoPatch, REDO_SHORT, procDilatePending, procDilatePatch, crActive, dilationState, dropsPending, redoActive, redoPatch, releaseRedo, deleteFollowup, nctMeasured, hxPending, COLOR_MAP, INPUT, activateLinked, allDone, awaitingExplain, buildPatient, byQueue, clearOrders, consultWaiting, deactivateLinked, dilateEyeOf, fmtClock, getStage, inConsult, inTreatRoom, markFollowupLater, mergePatientList, moveInQueue, needsDilation, newId, notesOf, orderForPicking, patchPatient, patientKey, pickDetail, pendingProcedures, prepPositiveNames, previousMeasure, procedureStatus, saveFollowup, sortedTests, testLabelWithOptions, unmarkFollowupLater, mainTestIds } from '../core/flow.jsx';
import { loadEntries } from '../core/storage.jsx';
import { ChimeControl, useChime } from '../ui/chime.jsx';
import { ResultTable, DilationRow, DoctorChip, DraggableList, EmptyState, HistoryLine, MeasureLine, MeasureTable, PatientMemo, PatientRow, ProcedureList, ProcedureModal, RecentDone, RecentRow, ScreenShell, StaleChip, SummaryBar, TodayDoneLine, TestDetailEditor, TestCheckModal, UndoButton, VisitTimes, cancelProcedure, useUndoToast } from '../ui/common.jsx';

/* ------------------------------------------------------------------ */
/* 진료실 화면                                                          */
/* ------------------------------------------------------------------ */
export function DoctorPicker({ doctors, value, onChange }) {
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

// 작은 밑줄 글씨 버튼: 한 번 누르면 확인 문구로 바뀌고 3초 안에 한 번 더 누르면 실행
function ConfirmLink({ label, confirmLabel, onConfirm, className = '' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      className={`${className} text-xs underline ${armed ? 'text-rose-700 font-medium' : 'text-slate-400 hover:text-rose-600'}`}>
      {armed ? confirmLabel : label}
    </button>
  );
}

export function SectionTitle({ children, hint }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-medium text-slate-600" title={hint || undefined}>{children}</div>
    </div>
  );
}

export function SimpleCard({ p, tone = 'slate', badges, stale = 0, children }) {
  const c = COLOR_MAP[tone] || COLOR_MAP.slate;
  return (
    <div className={`bg-white border ${stale ? 'border-orange-400 ring-2 ring-orange-200' : c.border} rounded-xl px-4 py-3 mb-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="t-name text-slate-900">{p.name}</span>
        <span className="text-xs text-slate-400">{p.id}</span>
        <StaleChip min={stale} />
        {badges}
        {prepPositiveNames(p).length > 0 && !p.consultDone && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold border border-red-300">{prepPositiveNames(p).join(', ')} 검사 취소</span>}
        <DoctorChip p={p} />
        {p.firstVisit && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">초진</span>}
        {p.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">2차 진료 · {p.primaryDoctor} 후</span>}
        {p.fuMissing && !p.consultDone && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold border border-orange-300">지난 진료 FU 미지정</span>}
        <PatientMemo p={p} />
        <VisitTimes p={p} />
      </div>
      {p.sendNote?.text && !p.consultDone && <div className="w-full text-sm bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg px-3 py-1.5 mt-1"><span className="font-medium">{p.sendNote.from || '진료실'} 메모</span> {p.sendNote.text}</div>}
      <div className="flex flex-wrap items-center gap-2 mt-2">{children}</div>
    </div>
  );
}

// 진료실 → 원하는 곳으로 보내기 창
export const SEND_DESTS = [
  ['vision', '시력/안압 다시', '시력·안압을 다시 측정합니다'],
  ['exam', '검사실', '누락된 검사를 추가하거나 검사를 다시 합니다'],
  ['treat', '처치실', '처치실에서 확인한 뒤 진료 대기로 돌아옵니다'],
];
export function SendPatientModal({ patient, tests, settings, onConfirm, onCancel }) {
  const [dest, setDest] = useState('treat');
  const [sel, setSel] = useState({});
  const [note, setNote] = useState('');
  // 세부 창(예: OCT 종류·단안): [세부 창] 검사는 고르면 바로, 다른 검사는 오른쪽 클릭으로 펼침
  const [detail, setDetail] = useState({});
  const [extraOpen, setExtraOpen] = useState({});
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
                  onContextMenu={e => { e.preventDefault(); setSel(x => ({ ...x, [t.id]: true })); setExtraOpen(x => ({ ...x, [t.id]: true })); }}
                  title={t.popupOnClick ? undefined : '오른쪽 클릭: 단안·프로토콜 지정'}
                  className={`text-sm px-3 py-1.5 rounded-lg border flex items-center gap-1 ${on ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>
                  {on && <Check size={12} />}{t.short || t.name}{doneToday && <span className={`text-xs ${on ? 'text-violet-100' : 'text-slate-400'}`}>(오늘 함 · 다시)</span>}
                </button>
              );
            })}
            {ordered.filter(t => sel[t.id] && (t.popupOnClick || extraOpen[t.id])).map(t => (
              <div key={`d-${t.id}`} className="w-full rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                <div className="text-sm font-medium text-slate-800 mb-2">{t.short || t.name}</div>
                <TestDetailEditor test={t} value={detail[t.id]} onChange={v => setDetail(d => ({ ...d, [t.id]: v }))} />
              </div>
            ))}
          </div>
        )}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder={dest === 'treat' ? '전달 메모 (예: 추가 검사 있는지 확인해주세요)' : '전달 메모 (선택, 예: VF 누락되어 다시 부탁드립니다)'}
          className={`${INPUT} mb-6`} />
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="button" disabled={!ready} onClick={() => onConfirm({ dest, sel, note: note.trim(), detail: pickDetail(detail, sel, ordered) })} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-40">보내기</button>
        </div>
      </div>
    </div>
  );
}

// 진료실 PC마다 마지막으로 고른 교수님을 기억 (다시 열어도 그 교수님)
const DOCTOR_KEY = 'oph-consult-doctor';
const storedDoctor = () => { try { return localStorage.getItem(DOCTOR_KEY) || ''; } catch { return ''; } };

export function ConsultView({ patients, allPatients = patients, doctors, doctorPrefs, settings, history, mutatePatients, updateFu, onBack, lastSync }) {
  const [selectedDoctor, setDoctorState] = useState(storedDoctor);
  const setSelectedDoctor = (d) => {
    setDoctorState(d);
    try { localStorage.setItem(DOCTOR_KEY, d); } catch { /* 기억 못 해도 지금은 그대로 */ }
  };
  const [explainFor, setExplainFor] = useState(null);
  const [extraModalFor, setExtraModalFor] = useState(null);
  const [procFor, setProcFor] = useState(null);
  const [toastNode, showToast] = useUndoToast();

  useEffect(() => {
    if (doctors.length && !doctors.includes(selectedDoctor)) setDoctorState(doctors[0]);
  }, [doctors, selectedDoctor]);

  const allTests = sortedTests(settings);
  const waitMin = settings.dilationWaitMin;
  const mine = patients.filter(p => p.doctor === selectedDoctor);
  const explainList = mine.filter(awaitingExplain).sort((a, b) => (a.seenAt || 0) - (b.seenAt || 0));
  const inRoom = mine.find(inConsult);
  // 안전망: 어떤 이유로든 '진료 중'이 두 명 이상이면 나머지도 보이게 (화면에서 사라지지 않도록)
  const extraInRoom = mine.filter(inConsult).filter(x => x !== inRoom);
  // CR(진료실 간호사 담당)·점안 후 다시 진료: 점안이 끝날 때까지 'CR·산동 점안' 칸에 (시간이 되면 띵동 + 노란 [확인], 눌러야 진료 대기로)
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(n => n + 1), 15000); return () => clearInterval(i); }, []);
  const dropsList = mine.filter(p => p.checkin && !inConsult(p) && dropsPending(p, doctorPrefs, waitMin)).sort(byQueue);
  const dropsReady = mine.filter(p => p.checkin && !p.consultDone && !p.seen && (redoActive(p) || crActive(p, doctorPrefs)) && ['due', 'ready'].includes(dilationState(p, doctorPrefs, waitMin).status));
  // 띵동: 이 교수님 진료실에 진료 호출이 생기면 (진료실 앞 PC 등), CR·산동 점안 시간이 되면. 교수님을 바꾸면 기준만 다시 잡음
  useChime([...mine.filter(inConsult).map(patientKey), ...dropsReady.map(p => `drop:${patientKey(p)}`)], { ready: !!lastSync && !!selectedDoctor, context: selectedDoctor });
  const waiting = mine.filter(p => consultWaiting(p, settings, doctorPrefs)).sort(byQueue);
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
  // only: 서버의 최신 기록이 아직 이 버튼이 바꾼 그대로일 때만 (그사이 다른 PC가 다른 일을 했으면 되돌리지 않음)
  const backToRoom = (pk, extra = () => ({}), only = () => true) => mutatePatients(prev => {
    const someoneIn = prev.some(x => patientKey(x) !== pk && x.doctor === doctor && inConsult(x));
    // 그사이 다른 PC가 설명 완료(귀가)까지 했으면 되돌리지 않음
    return prev.map(x => (patientKey(x) === pk && !x.consultDone && only(x) ? { ...x, ...extra(x), seen: false, seenAt: null, calledRoom: someoneIn ? null : doctor } : x));
  });

  // 진료 호출: 서버의 최신 명단으로 다시 확인 (다른 PC가 1~2초 사이에 다른 환자를 먼저 불렀거나, 이 환자를 다른 곳으로 보냈으면 부르지 않음)
  const callPatient = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    mutatePatients(prev => {
      const target = prev.find(x => patientKey(x) === pk);
      if (prev.some(x => patientKey(x) !== pk && x.doctor === doctor && inConsult(x))) return prev;
      if (!target || !consultWaiting(target, settings, doctorPrefs)) return prev;
      return prev.map(x => (x === target ? { ...x, calledRoom: doctor, calledAt: at, sendNote: null } : x));
    }).then(next => {
      // 서버에 저장된 결과로 확인: 이 호출이 들어가지 않았으면 이유를 알림
      const t = Array.isArray(next) ? next.find(x => patientKey(x) === pk) : null;
      if (!Array.isArray(next) || (t?.calledRoom === doctor && t.calledAt === at)) return;
      const other = next.find(x => patientKey(x) !== pk && x.doctor === doctor && inConsult(x));
      showToast(`진료 호출 안 됨 · ${other ? `${other.name} 환자가 이미 진료 중입니다` : `${p.name} 환자는 이미 다른 곳에서 처리되었습니다`}`);
    }, () => {});
  };

  // 환자 찾기: 진료실 앞으로 안 온 환자를 복도 끝 모니터(진료실 대기 명단 전체)에 크게 띄우고 띵동 (환자 기록에 새 칸 boardCall)
  // 서버의 최신 기록으로 다시 확인: 그사이 진료 호출·귀가 등으로 진료 대기가 아니면 띄우지 않고 안내
  const findPatient = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    mutatePatients(prev => prev.map(x => (patientKey(x) === pk && consultWaiting(x, settings, doctorPrefs) ? { ...x, boardCall: { at } } : x))).then(next => {
      if (!Array.isArray(next)) return; // 저장 실패: 위쪽 빨간 띠로 안내
      const rec = next.find(x => patientKey(x) === pk);
      showToast(rec?.boardCall?.at === at ? `${p.name} 환자 찾기 · 복도 끝 모니터에 띄웠습니다` : `환자 찾기 안 됨 · ${p.name} 환자는 이미 다른 곳에서 처리되었습니다`);
    }, () => {});
  };

  // 실수로 진료 완료를 눌렀을 때: 설명 대기에서 다시 진료 중(또는 진료 대기 앞)으로
  const undoFinishConsult = (p) => {
    const pk = patientKey(p);
    const someoneIn = allPatients.some(x => patientKey(x) !== pk && x.doctor === doctor && inConsult(x));
    // 아직 설명 대기일 때만 (그사이 다른 PC가 다시 진료로 보냈으면 그대로)
    backToRoom(pk, x => unreleaseRedo(x), x => !!x.seen);
    showToast(`${p.name} 진료 완료 취소, ${someoneIn ? '진료 대기로' : '다시 진료 중으로'}`, () => patch(pk, x => (x.seen || x.consultDone ? {}
      : { seen: true, seenAt: p.seenAt || Date.now(), calledRoom: null, ...releaseRedo(x) })));
  };

  const finishConsult = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    // 다른 PC가 먼저 진료 완료했으면 그대로 (설명 대기 순서 유지), 되돌리기도 이 버튼으로 바뀐 경우에만
    patch(pk, x => (x.seen || x.consultDone ? {} : { seen: true, seenAt: at, calledRoom: null, ...releaseRedo(x) }));
    showToast(`${p.name} 진료 완료, 설명 대기로`, () => backToRoom(pk, x => unreleaseRedo(x), x => x.seenAt === at));
  };

  // 다시 진료 취소: 원래 있던 곳으로 (설명 대기에서 보냈으면 설명 대기, 진료 중에 보냈으면 진료 대기 맨 앞)
  const cancelRedo = async (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    const keys = ['redo', 'seen', 'seenAt', 'calledRoom', 'explainedEarly', 'cr', 'dilateOverride', 'drops', 'dropsExtra', 'dropsBefore', 'procOrderedAt'];
    const before = Object.fromEntries(keys.map(k => [k, p[k]]));
    // 취소하면서 시작한 처치(설명 대기에서 보냈던 경우)는 되돌릴 때 그 처치만 다시 빼기 (다른 처치 기록은 그대로)
    const added = new Set((p.redo?.prev?.seen ? (p.redo?.pending || []) : []).map(i => i.uid));
    // 서버의 최신 기록으로 다시 확인: 그사이 진료 호출됐거나 다른 PC가 먼저 취소했으면 그대로
    const next = await patch(pk, x => (redoActive(x) && !x.calledRoom ? cancelRedoPatch(x, at) : {})).catch(() => null);
    if (!Array.isArray(next)) return; // 저장 실패: 위쪽 빨간 띠로 안내
    if (next.find(x => patientKey(x) === pk)?.redo?.cancelledAt !== at) {
      showToast(`다시 진료 취소 안 됨 · ${p.name} 환자는 이미 다른 곳에서 처리되었습니다`);
      return;
    }
    showToast(`${p.name} 다시 진료 취소, ${p.redo?.prev?.seen ? '설명 대기로' : '진료 대기로'}`,
      () => patch(pk, x => (x.redo?.cancelledAt === at ? { ...before, procedures: (x.procedures || []).filter(i => !added.has(i.uid)) } : {})));
  };

  const orderProcedures = async (chosen, redoKind) => {
    const p = procFor;
    const pk = patientKey(p);
    const at = Date.now();
    setProcFor(null);
    const items = chosen.map(c => ({
      uid: newId('pr'), procId: c.id, name: c.name, performer: c.performer, note: c.note || '', done: false, doneAt: null, orderedAt: at,
      ...(c.eye ? { eye: c.eye } : {}), ...(c.dilate ? { dilate: true } : {}),
    }));
    // 설명 대기 중에 보낸 처치(진료 후 외래 간호사 입력): 설명 대기 순서는 그대로 두고 처치만 추가
    const already = !!p.seen;
    // 서버의 최신 기록으로 다시 확인: 그사이 다른 PC가 설명 완료(귀가)했거나 다른 곳으로 보냈으면 넣지 않음
    // (귀가한 환자에게 넣은 처치는 처치실·설명 대기 어디에도 보이지 않아 빠지게 됨)
    const changed = (x) => !x || x.consultDone || (already ? !x.seen : redoActive(x));
    const notApplied = (next, ok) => {
      if (!Array.isArray(next)) return true; // 저장 실패: 위쪽 빨간 띠로 안내
      const rec = next.find(x => patientKey(x) === pk);
      if (rec && ok(rec)) return false;
      showToast(`처치 지정 안 됨 · ${p.name} 환자는 ${rec?.consultDone ? '이미 설명 완료(귀가)되었습니다' : '이미 다른 곳에서 처리되었습니다'}`);
      return true;
    };
    // CR·산동 후 다시 진료: 진료실 'CR·산동 점안' 칸으로, 같이 고른 처치는 다시 진료가 끝난 뒤 시작. 점안이 끝나면 진료 대기 맨 앞
    if (redoKind) {
      const keys = ['redo', 'seen', 'seenAt', 'calledRoom', 'dropsBefore', 'drops', 'dropsExtra', 'cr', 'dilateOverride', 'queueKey'];
      const before = Object.fromEntries(keys.map(k => [k, p[k]]));
      const next = await mutatePatients(prev => {
        const cur = prev.find(x => patientKey(x) === pk);
        if (changed(cur)) return prev;
        const others = prev.filter(x => patientKey(x) !== pk && x.date === p.date && x.doctor === p.doctor && !x.consultDone && !x.seen && typeof x.queueKey === 'number');
        const frontKey = others.length ? Math.min(...others.map(x => x.queueKey)) - 0.001 : undefined;
        return prev.map(x => (x === cur ? { ...x, ...redoPatch(x, redoKind, { at, from: doctor, pending: items, frontKey }) } : x));
      }).catch(() => null);
      if (notApplied(next, rec => rec.redo?.at === at)) return;
      // 되돌리기: 아직 이 다시 진료 그대로일 때만
      showToast(`${p.name} ${REDO_SHORT[redoKind]}: 진료실 'CR·산동 점안' 칸으로`, () => patch(pk, x => (x.redo?.at === at && !x.redo.cancelledAt && !x.consultDone ? before : {})));
      return;
    }
    // '산동 필요' 처치(예: YAG)는 산동 예정을 켬 (이미 점안했으면 그 시각 그대로)
    const next = await mutatePatients(prev => {
      const cur = prev.find(x => patientKey(x) === pk);
      if (changed(cur)) return prev;
      return prev.map(x => {
        if (x !== cur) return x;
        const r = releaseRedo(x);
        // 설명 대기에서 넣은 처치는 취소해도 설명 대기에 남도록 표시, 처치 때문에 켠 산동도 표시
        const marked = markDilateSet(x, items.map(i => (already ? { ...i, fromExplain: true } : i)));
        return { ...x, seen: true, seenAt: x.seen ? x.seenAt : at, calledRoom: null, procOrderedAt: at, ...r, ...procDilatePatch(x, items), procedures: [...(r.procedures || x.procedures || []), ...marked] };
      });
    }).catch(() => null);
    if (notApplied(next, rec => (rec.procedures || []).some(i => i.orderedAt === at))) return;
    const where = items.some(i => i.performer === 'prof') ? '설명 대기에서 교수님 처치' : '처치실로';
    // 되돌리기: 이번에 넣은 처치만 빼고, 이 처치 때문에 켠 산동은 아직 점안 전이면 원래대로
    const removeItems = x => {
      const setBy = (x.procedures || []).find(i => i.orderedAt === at && i.dilateSet);
      return {
        procedures: (x.procedures || []).filter(i => i.orderedAt !== at),
        ...(setBy && !(x.drops || []).some(Boolean) ? { dilateOverride: typeof setBy.dilateWas === 'boolean' ? setBy.dilateWas : undefined } : {}),
      };
    };
    showToast(`${p.name} 처치 지정, ${where} (설명 대기에 '처치 중' 표시)`, () => (already ? patch(pk, removeItems) : backToRoom(pk, removeItems, x => x.procOrderedAt === at)));
  };

  // 교수님 처치 완료: 화면에 보이던 처치만 완료 (그사이 다른 PC가 새로 보낸 처치는 그대로 남김)
  const finishProfProcedure = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    const ids = new Set(pendingProcedures(p, 'prof').map(i => i.uid));
    patch(pk, x => ({ procedures: (x.procedures || []).map(i => (ids.has(i.uid) && !i.done ? { ...i, done: true, doneAt: at } : i)) })).then(list => {
      const rec = Array.isArray(list) ? list.find(x => patientKey(x) === pk) : null;
      if (!rec) return;
      const leftProf = pendingProcedures(rec, 'prof');
      const next = leftProf.length ? `새로 들어온 교수님 처치가 남아 있습니다: ${leftProf.map(procLabel).join(', ')}`
        : pendingProcedures(rec, 'resident').length ? '처치실로' : rec.explainedEarly ? '귀가 대기' : '설명 가능';
      showToast(`${p.name} 처치 완료, ${next}`, () => patch(pk, x => ({
        procedures: (x.procedures || []).map(i => (i.doneAt === at ? { ...i, done: false, doneAt: null } : i)),
      })));
    }, () => {});
  };

  const completeExplain = async (sel, detail, dil, _triage, linkDoctor, { later = false, noFu = false, patient } = {}) => {
    const p = patient || explainFor;
    const pk = patientKey(p);
    const at = Date.now();
    setExplainFor(null);
    const fuDoctor = dil?.doctor || p.doctor;
    const fuValue = noFu || later ? null : {
      ...sel,
      detail,
      dilate: dil?.mode === 'yes' || dil?.mode === 'no' ? dil.mode : undefined,
      dilateEye: dil?.mode === 'yes' ? dilateEyeOf(dil.eye) : undefined,
      cr: dil?.cr || undefined,
      preProcs: dil?.preProcs?.length ? dil.preProcs : undefined,
      name: p.name,
      visitDate: p.date,
      updatedAt: at,
    };
    // 이미 올라가 있는 다음 내원 명단(접수 전)에도 새 FU 적용
    const withFu = (list) => (fuValue ? applyFollowupToList(list, p.id, fuDoctor, fuValue, settings, p.date) : list);
    // 'FU 나중에': 다음 명단의 그 교수님 기록에 'FU 미지정'
    const markFuture = (x) => (later && x.id === p.id && x.doctor === p.doctor && x.date > p.date ? { ...x, fuMissing: true } : x);
    // 오늘 다른 교수 진료 추가: 그 교수님의 이전 정보(FU)를 붙여 2차 진료로 연결
    let extra = null;
    if (linkDoctor) {
      let fu = {};
      try { fu = await loadEntries('fu-designations', [p.id]); } catch { /* 이전 정보 없이 추가 */ }
      extra = buildPatient({ id: p.id, name: p.name, date: p.date, doctor: linkDoctor, reservation: '', firstVisit: false }, fu, settings);
    }
    // 서버의 최신 명단으로 다시 확인: 다른 PC가 먼저 설명 완료했으면 아무것도 바꾸지 않음 (FU도 다시 저장하지 않음 — 먼저 정한 FU를 덮어쓰지 않게)
    // 처치가 아직 남아 있으면: 설명만 끝내고 처치 후 [귀가] 로 마무리 (2차 진료도 귀가 때 시작)
    const next = await mutatePatients(prev => {
      const cur = prev.find(x => patientKey(x) === pk);
      if (!cur || cur.consultDone || cur.explainedEarly || !cur.seen) return prev;
      const early = pendingProcedures(cur).length > 0;
      let list = withFu(prev.map(x => (x !== cur ? markFuture(x) : early
        ? { ...x, explainedEarly: at, fuLater: later, referred: noFu ? at : undefined }
        : { ...x, consultDone: true, consultDoneAt: at, fuLater: later, referred: noFu ? at : undefined })));
      if (extra) list = mergePatientList(list, [extra], doctorPrefs, settings).next;
      return early ? list : activateLinked(list, pk, settings, at);
    }).catch(() => null);
    if (!Array.isArray(next)) return; // 저장 실패: 위쪽 빨간 띠로 안내
    const rec = next.find(x => patientKey(x) === pk);
    const asEarly = rec?.explainedEarly === at;
    if (!asEarly && rec?.consultDoneAt !== at) {
      showToast(`${p.name} 환자는 이미 다른 곳에서 설명 완료되었습니다 · 다시 저장하지 않았습니다`);
      return;
    }
    // FU: 환자 기록이 들어간 뒤에만 저장
    // FU 없음(회송): 이 교수님 FU 지정과 'FU 나중에' 표시를 지움. 되돌리기용으로 지우기 전 기록을 보관
    let savedFu;
    if (noFu) updateFu(p.id, prev => { savedFu = prev[p.id]; return unmarkFollowupLater(deleteFollowup(prev, p.id, p.doctor), p.id, p.doctor); });
    else if (later) updateFu(p.id, prev => markFollowupLater(prev, p.id, { doctor: p.doctor, name: p.name, date: p.date, at }));
    else updateFu(p.id, prev => saveFollowup(prev, p.id, fuDoctor, fuValue));
    const restoreFu = () => { if (noFu) updateFu(p.id, () => (savedFu ? { [p.id]: savedFu } : {})); };
    // 되돌리기: 서버 기록이 아직 이 설명 완료 그대로일 때만 (그사이 귀가 처리 등 다른 일이 있었으면 그대로 두고 FU도 건드리지 않음)
    // mine: 아직 이 버튼이 바꾼 그대로인지, reverted: 저장된 결과가 되돌려진 상태인지 (그때만 FU도 되돌림)
    const undoWhen = (mine, apply, reverted) => mutatePatients(prev => {
      const cur = prev.find(x => patientKey(x) === pk);
      return cur && mine(cur) ? apply(prev, cur) : prev;
    }).then(list => {
      const r = Array.isArray(list) ? list.find(x => patientKey(x) === pk) : null;
      if (!r || !reverted(r)) return; // 되돌리지 못함 (다른 PC가 그사이 바꿈)
      if (later) updateFu(p.id, prev => unmarkFollowupLater(prev, p.id, p.doctor));
      restoreFu();
    }, () => {});
    if (asEarly) {
      showToast(`${p.name} 설명 완료 · 처치 후 귀가${later ? ' (FU 나중에)' : noFu ? ' (FU 없음 · 회송)' : ''}`, () => undoWhen(
        x => x.explainedEarly === at && !x.consultDone,
        (prev, cur) => prev.map(x => (x === cur ? { ...x, explainedEarly: null, fuLater: false, referred: undefined } : x)),
        r => !r.explainedEarly && !r.consultDone,
      ));
      return;
    }
    const undoDone = () => undoWhen(
      x => x.consultDone && x.consultDoneAt === at,
      (prev, cur) => deactivateLinked(prev.map(x => (x === cur ? { ...x, consultDone: false, consultDoneAt: null, fuLater: false, referred: undefined } : x)), pk),
      r => !r.consultDone,
    );
    const nextVisit = linkDoctor || next.find(x => x.primaryKey === pk && x.linkActivatedAt === at)?.doctor;
    const via = settings.linkCheckAdded !== false && linkDoctor ? '처치실 추가 검사 확인 후 ' : '';
    showToast(`${p.name} 설명 완료${later ? ' · FU는 관리자 > FU 지정 관리에서 나중에' : noFu ? ' · FU 없음 (회송)' : ''}${nextVisit ? `, ${via}${nextVisit} 2차 진료로` : ''}`, undoDone);
  };

  // 귀가: 서버의 최신 기록으로 다시 확인 (그사이 다른 PC가 처치를 새로 보냈으면 귀가 처리하지 않음 — 처치가 빠지지 않게,
  // 이미 귀가 처리됐으면 다시 하지 않음). 되돌리기도 이 버튼의 귀가일 때만
  const goHome = async (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    const next = await mutatePatients(prev => {
      const cur = prev.find(x => patientKey(x) === pk);
      if (!cur || cur.consultDone || !cur.explainedEarly || pendingProcedures(cur).length) return prev;
      return activateLinked(prev.map(x => (x === cur ? { ...x, consultDone: true, consultDoneAt: at } : x)), pk, settings, at);
    }).catch(() => null);
    if (!Array.isArray(next)) return; // 저장 실패: 위쪽 빨간 띠로 안내
    const rec = next.find(x => patientKey(x) === pk);
    if (rec?.consultDoneAt !== at) {
      showToast(`귀가 처리 안 됨 · ${p.name} 환자는 ${rec?.consultDone ? '이미 귀가 처리되었습니다' : rec && pendingProcedures(rec).length ? '처치가 새로 들어와 있습니다' : '이미 다른 곳에서 처리되었습니다'}`);
      return;
    }
    const nextVisit = next.find(x => x.primaryKey === pk && x.linkActivatedAt === at)?.doctor;
    showToast(`${p.name} 귀가${nextVisit ? `, ${nextVisit} 2차 진료로` : ''}`, () => mutatePatients(prev => {
      const cur = prev.find(x => patientKey(x) === pk);
      if (!cur || cur.consultDoneAt !== at) return prev;
      return deactivateLinked(prev.map(x => (x === cur ? { ...x, consultDone: false, consultDoneAt: null } : x)), pk);
    }));
  };

  const confirmExtra = (sel, detail) => {
    const pk = patientKey(extraModalFor);
    setExtraModalFor(null);
    applyExtraTests(pk, allTests.filter(t => sel[t.id]).map(t => t.id), detail, undefined);
  };
  // 검사를 추가(또는 다시)합니다. sendNote 가 있으면 전달 메모도 남깁니다.
  // 순서(queueKey)는 바꾸지 않음 — 검사실·진료실 모두 원래 예약 순서대로 (10-05 사용자: 공평하게, 앞으로 당기지 않음)
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
      return prev.map(p => (patientKey(p) === pk
        ? { ...p, assigned, done, detail: nextDetail, orders: clearOrders(p, chosen), calledRoom: null, consultHold: true, ...(sendNote !== undefined ? { sendNote } : {}) }
        : p));
    });
  };

  // 진료실에서 원하는 곳으로 환자 보내기 (누락 검사·재검·처치실 확인)
  const [sendFor, setSendFor] = useState(null);
  const sendPatient = (p, { dest, sel, note, detail }) => {
    const pk = patientKey(p);
    const at = Date.now();
    setSendFor(null);
    const sendNote = note ? { text: note, from: doctor, at } : null;
    const tests = { done: p.done, doneAt: p.doneAt, assigned: p.assigned, detail: p.detail };
    const scalars = { queueKey: p.queueKey, calledRoom: p.calledRoom, consultHold: p.consultHold, sendNote: p.sendNote, treatRequest: p.treatRequest, orders: p.orders,
      ...(dest === 'vision' ? { measureOk: p.measureOk ?? null, vaOk: p.vaOk ?? null, nctOk: p.nctOk ?? null } : {}) };
    // 되돌리기: 보낼 때 바꾼 검사(고른 검사·시력/안압)만 원래대로, 그사이 다른 PC가 완료한 다른 검사는 그대로
    const touched = dest === 'exam' ? allTests.filter(t => sel[t.id]).map(t => t.id) : dest === 'vision' ? [VISION_KEY] : [];
    const undo = () => patch(pk, x => ({ ...scalars, ...restoreKeys(x, tests, touched) }));
    if (dest === 'exam') {
      const ids = allTests.filter(t => sel[t.id]).map(t => t.id);
      applyExtraTests(pk, ids, detail || {}, sendNote);
      showToast(`${p.name} 검사실로 보냈습니다 (${allTests.filter(t => sel[t.id]).map(t => testLabelWithOptions(t, detail?.[t.id])).join(', ')})`, undo);
      return;
    }
    patch(pk, x => (dest === 'vision'
      ? { calledRoom: null, consultHold: true, sendNote, ...revisionPatch(x) }
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
      extra={<><ChimeControl /><DoctorPicker doctors={doctors} value={selectedDoctor} onChange={setSelectedDoctor} /></>}
      sub={selectedDoctor ? <SummaryBar label="진료실 할 일 요약" items={[
        { id: 'consult-explain', label: '설명 대기', n: explainList.length },
        { id: 'consult-drops', label: 'CR·산동', n: dropsList.length },
        { id: 'consult-waiting', label: '진료 대기', n: waiting.length },
        { id: 'consult-hold', label: '진료 보류', n: onHold.length },
      ]} /> : null}
    >
      {!selectedDoctor ? (
        <EmptyState text="상단에서 교수님을 선택해주세요" />
      ) : (
        <>
          {explainList.length > 0 && (
            <div id="consult-explain" className="mb-6 scroll-mt-36">
              <SectionTitle hint="안내가 끝나면 설명 완료를 누르고 다음 내원 검사를 지정하세요">설명 대기 · {explainList.length}명</SectionTitle>
              {explainList.map(p => {
                const ps = procedureStatus(p);
                const early = !!p.explainedEarly;
                return (
                <SimpleCard key={patientKey(p)} p={p} tone="emerald" badges={<>
                  {ps === 'doing' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-300">처치 중</span>}
                  {ps === 'done' && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold border border-green-300">처치 완료</span>}
                  {early && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-semibold border border-emerald-600">설명 완료{p.fuLater ? ' · FU 나중에' : ''}</span>}
                </>}>
                  <TodayDoneLine p={p} tests={allTests} prefs={doctorPrefs} />
                  <ProcedureList p={p} onCancel={early ? undefined : uid => cancelProcedure(mutatePatients, patientKey(p), uid)} />
                  {procDilatePending(p) && <DilationRow compact p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />}
                  {pendingProcedures(p, 'prof').length > 0 && (
                    <button type="button" onClick={() => finishProfProcedure(p)} className="text-sm px-4 py-2 rounded-lg bg-rose-600 text-white font-medium">교수님 처치 완료</button>
                  )}
                  {nextVisitNote(p)}
                  {early ? (
                    ps === 'doing'
                      ? <span className="text-sm text-slate-500">처치가 끝나면 귀가 처리할 수 있어요</span>
                      : <button type="button" onClick={() => goHome(p)} className="text-sm px-4 py-2 rounded-lg bg-slate-800 text-white font-medium">귀가</button>
                  ) : <>
                    <button type="button" onClick={() => setExplainFor(p)} className="text-sm px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium">
                      설명 완료
                    </button>
                    <button type="button" onClick={() => completeExplain(null, null, null, false, '', { later: true, patient: p })} title="다음 내원 검사는 관리자 > FU 지정 관리에서 나중에 지정합니다"
                      className="text-sm px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 font-medium">
                      설명 완료 · FU 나중에
                    </button>
                    <button type="button" onClick={() => undoFinishConsult(p)} className="ml-auto text-xs px-2 py-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                      <RotateCcw size={12} />진료 완료 취소
                    </button>
                  </>}
                  {/* 진료 후 외래 간호사가 처치를 넣을 때 (진료 호출을 다시 하지 않아도 됨). 드물어서 맨 오른쪽 끝 */}
                  <button type="button" onClick={() => setProcFor(p)} className={`${early ? 'ml-auto ' : ''}text-sm px-3 py-2 rounded-lg border border-rose-300 text-rose-700 font-medium`}>처치 보내기</button>
                </SimpleCard>
                );
              })}
            </div>
          )}

          {extraInRoom.length > 0 && (
            <div role="alert" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 flex flex-wrap items-center gap-2">
              <span>진료 중으로 함께 표시된 환자가 있습니다:</span>
              {extraInRoom.map(x => (
                <span key={patientKey(x)} className="flex items-center gap-1">
                  <span className="t-name">{x.name}</span>
                  <button type="button" onClick={() => patch(patientKey(x), () => ({ calledRoom: null }))} className="text-xs px-2 py-1 rounded border border-amber-400 bg-white">진료 대기로</button>
                </span>
              ))}
            </div>
          )}
          {inRoom && (
            <div className="bg-white border-2 border-amber-300 rounded-2xl p-6 mb-6">
              <div className="text-sm text-amber-600 font-medium mb-1">현재 진료 중</div>
              <div className="text-2xl font-semibold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
                {inRoom.name}
                {inRoom.firstVisit && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-normal">초진</span>}
                {redoActive(inRoom) && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-300 font-normal">{REDO_SHORT[inRoom.redo.kind]}</span>}
                {inRoom.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 font-normal">2차 진료 · {inRoom.primaryDoctor} 후</span>}
                {nextVisitNote(inRoom)}
                <PatientMemo p={inRoom} />
              </div>
              <div className="text-sm text-slate-400 mb-3">{inRoom.id} · 예약 {inRoom.reservation}</div>
              <div className="bg-slate-50 rounded-xl p-3 mb-3">
                <MeasureTable today={inRoom.measure} prev={previousMeasure(inRoom, history)} />
                <ResultTable tests={allTests} today={inRoom.results} />
              </div>
              {(inRoom.hx || hxPending(inRoom)) && <div className="mb-3"><HistoryLine p={inRoom} /></div>}
              {(inRoomTests.length > 0 || nctMeasured(inRoom)) && (
                <div className="text-sm text-slate-700 mb-2">
                  <span className="text-xs text-slate-400 mr-2">오늘 검사</span>
                  {[...(nctMeasured(inRoom) ? ['NCT'] : []), ...inRoomTests.map(t => testLabelWithOptions(t, inRoom.detail?.[t.id]))].join(', ')}
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

          {dropsList.length > 0 && (
            <div id="consult-drops" className="mb-6 scroll-mt-36">
              <SectionTitle hint="CR과 '점안 후 다시 진료' 환자의 점안을 기록합니다. 점안을 마치고 기다리는 시간이 지나면 저절로 진료 대기로 갑니다 (띵동)">CR·산동 점안 · {dropsList.length}명</SectionTitle>
              {dropsList.map(p => {
                const stage = getStage(p, settings);
                return (
                  <SimpleCard key={patientKey(p)} p={p} tone="rose" badges={redoActive(p)
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-300">{REDO_SHORT[p.redo.kind]}</span>
                    : null}>
                    <div className="w-full flex flex-wrap items-center gap-2">
                      <DilationRow group dropsOnly={redoActive(p)} p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
                      {!redoActive(p) && !['consult', 'inRoom'].includes(stage.area) && <span className="text-xs text-slate-400">지금: {stage.label}</span>}
                      {(p.redo?.pending || []).length > 0 && <span className="text-xs text-slate-500">다시 진료 뒤 처치: {p.redo.pending.map(x => x.name).join(', ')}</span>}
                      {redoActive(p) && <ConfirmLink className="ml-auto" label="다시 진료 취소" confirmLabel="한 번 더 누르면 다시 진료 취소" onConfirm={() => cancelRedo(p)} />}
                    </div>
                  </SimpleCard>
                );
              })}
            </div>
          )}

          <div id="consult-waiting" className="scroll-mt-36" />
          <SectionTitle>
            진료 대기 · {waiting.length}명
            {testing > 0 ? ` (검사 진행 중 ${testing}명)` : ''}
            {residentCount > 0 ? ` (처치실 ${residentCount}명)` : ''}
          </SectionTitle>
          {waiting.length === 0 ? (
            <EmptyState compact text="검사를 모두 마친 환자가 없습니다" />
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
                    {redoActive(p) && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-300">{REDO_SHORT[p.redo.kind]}</span>}
                    <div className="w-full mb-1">
                      <MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" />
                    </div>
                    <HistoryLine p={p} />
                    <DilationRow compact p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
                    <button
                      type="button"
                      disabled={!!inRoom}
                      onClick={() => callPatient(p)}
                      className={`text-sm px-3 py-1.5 rounded-lg font-medium ${inRoom ? 'bg-slate-200 text-slate-400' : 'bg-amber-600 text-white'}`}
                    >
                      진료 호출
                    </button>
                    <button type="button" onClick={() => setSendFor(p)} className="text-sm px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700">보내기</button>
                    {/* 진료실 앞으로 안 온 환자: 복도 끝 모니터에 이름을 크게 띄움 (드물게 써서 작은 글씨) */}
                    <button type="button" onClick={() => findPatient(p)} title="복도 끝 모니터에 '○○○님 진료실 앞으로 오세요'를 띵동과 함께 크게 띄웁니다"
                      className="ml-auto text-xs underline text-slate-500 hover:text-amber-700">
                      환자 찾기{p.boardCall?.at ? ` · ${fmtClock(p.boardCall.at)}` : ''}
                    </button>
                  </PatientRow>
                );
              }}
            />
          )}

          {onHold.length > 0 && (
            <div id="consult-hold" className="mt-8 scroll-mt-36">
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
                {p.fuLater && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">FU 나중에</span>}
                <UndoButton label="설명 완료 취소" onClick={() => {
                  mutatePatients(prev => deactivateLinked(prev.map(x => (patientKey(x) === patientKey(p) ? { ...x, consultDone: false, consultDoneAt: null, fuLater: false } : x)), patientKey(p)));
                  if (p.fuLater) updateFu(p.id, prev => unmarkFollowupLater(prev, p.id, p.doctor));
                }} />
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
          preProcChoice={{ initial: [] }}
          confirmLabel="설명 완료"
          onConfirm={completeExplain}
          onLater={(linkDoctor) => completeExplain(null, null, null, false, linkDoctor, { later: true })}
          onNoFu={(linkDoctor) => completeExplain(null, null, null, false, linkDoctor, { noFu: true })}
          onCancel={() => setExplainFor(null)}
        />
      )}
      {extraModalFor && (
        <TestCheckModal
          key={`extra-${patientKey(extraModalFor)}`}
          mainIds={mainTestIds(doctorPrefs, extraModalFor.doctor)}
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
          crAvailable={!!doctorPrefs?.[procFor.doctor]?.cr}
          onConfirm={orderProcedures}
          onCancel={() => setProcFor(null)}
        />
      )}
      {toastNode}
    </ScreenShell>
  );
}
