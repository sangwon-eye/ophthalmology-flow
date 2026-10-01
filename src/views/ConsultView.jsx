// 진료실 화면
import React, { useState, useEffect } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { nctMeasured, hxPending, COLOR_MAP, INPUT, VISION_KEY, activateLinked, allDone, awaitingExplain, buildPatient, byQueue, clearOrders, consultWaiting, deactivateLinked, dilateEyeOf, fmtClock, getStage, inConsult, inTreatRoom, markFollowupLater, mergePatientList, moveInQueue, needsDilation, newId, notesOf, orderForPicking, patchPatient, patientKey, pickDetail, pendingProcedures, pendingRooms, prepPositiveNames, previousMeasure, procedureStatus, saveFollowup, sortedTests, testLabelWithOptions, unmarkFollowupLater, mainTestIds } from '../core/flow.jsx';
import { loadFu } from '../core/storage.jsx';
import { ChimeControl, useChime } from '../ui/chime.jsx';
import { DilationRow, DoctorChip, DraggableList, EmptyState, HistoryLine, MeasureLine, MeasureTable, PatientMemo, PatientRow, ProcedureList, ProcedureModal, RecentDone, RecentRow, ScreenShell, StaleChip, SummaryBar, TodayDoneLine, TestDetailEditor, TestCheckModal, UndoButton, VisitTimes, cancelProcedure, useUndoToast } from '../ui/common.jsx';

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

export function ConsultView({ patients, allPatients = patients, doctors, doctorPrefs, settings, history, mutatePatients, mutateFu, onBack, lastSync }) {
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
  const inRoom = mine.find(inConsult);
  // 띵동: 이 교수님 진료실에 진료 호출이 생기면 (진료실 앞 PC 등). 교수님을 바꾸면 기준만 다시 잡음
  useChime(mine.filter(inConsult).map(patientKey), { ready: !!lastSync && !!selectedDoctor, context: selectedDoctor });
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

  // 실수로 진료 완료를 눌렀을 때: 설명 대기에서 다시 진료 중(또는 진료 대기 앞)으로
  const undoFinishConsult = (p) => {
    const pk = patientKey(p);
    const someoneIn = allPatients.some(x => patientKey(x) !== pk && x.doctor === doctor && inConsult(x));
    backToRoom(pk);
    showToast(`${p.name} 진료 완료 취소, ${someoneIn ? '진료 대기로' : '다시 진료 중으로'}`, () => patch(pk, () => ({ seen: true, seenAt: p.seenAt || Date.now(), calledRoom: null })));
  };

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
    // 설명 대기 중에 보낸 처치(진료 후 외래 간호사 입력): 설명 대기 순서는 그대로 두고 처치만 추가
    const already = !!p.seen;
    patch(pk, x => ({ seen: true, seenAt: x.seen ? x.seenAt : at, calledRoom: null, procOrderedAt: at, procedures: [...(x.procedures || []), ...items] }));
    const where = items.some(i => i.performer === 'prof') ? '설명 대기에서 교수님 처치' : '처치실로';
    const removeItems = x => ({ procedures: (x.procedures || []).filter(i => i.orderedAt !== at) });
    showToast(`${p.name} 처치 지정, ${where} (설명 대기에 '처치 중' 표시)`, () => (already ? patch(pk, removeItems) : backToRoom(pk, removeItems)));
  };

  const finishProfProcedure = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    patch(pk, x => ({ procedures: (x.procedures || []).map(i => (i.performer === 'prof' && !i.done ? { ...i, done: true, doneAt: at } : i)) }));
    const next = pendingProcedures(p, 'resident').length ? '처치실로' : p.explainedEarly ? '귀가 대기' : '설명 가능';
    showToast(`${p.name} 처치 완료, ${next}`, () => patch(pk, x => ({
      procedures: (x.procedures || []).map(i => (i.doneAt === at ? { ...i, done: false, doneAt: null } : i)),
    })));
  };

  const completeExplain = async (sel, detail, dil, _triage, linkDoctor, { later = false, patient } = {}) => {
    const p = patient || explainFor;
    const pk = patientKey(p);
    const at = Date.now();
    setExplainFor(null);
    if (later) mutateFu(prev => markFollowupLater(prev, p.id, { doctor: p.doctor, name: p.name, date: p.date, at }));
    else mutateFu(prev => saveFollowup(prev, p.id, dil?.doctor || p.doctor, {
        ...sel,
        detail,
        dilate: dil?.mode === 'yes' || dil?.mode === 'no' ? dil.mode : undefined,
        dilateEye: dil?.mode === 'yes' ? dilateEyeOf(dil.eye) : undefined,
        cr: dil?.cr || undefined,
        preProcs: dil?.preProcs?.length ? dil.preProcs : undefined,
        name: p.name,
        visitDate: p.date,
        updatedAt: at,
    }));
    // 오늘 다른 교수 진료 추가: 그 교수님의 이전 정보(FU)를 붙여 2차 진료로 연결
    let extra = null;
    if (linkDoctor) {
      let fu = {};
      try { fu = await loadFu(); } catch { /* 이전 정보 없이 추가 */ }
      extra = buildPatient({ id: p.id, name: p.name, date: p.date, doctor: linkDoctor, reservation: '', firstVisit: false }, fu, settings);
    }
    // 처치가 아직 남아 있으면: 설명만 끝내고 처치 후 [귀가] 로 마무리 (2차 진료도 귀가 때 시작)
    const current = allPatients.find(x => patientKey(x) === pk) || p;
    if (pendingProcedures(current).length) {
      mutatePatients(prev => {
        let next = prev.map(x => (patientKey(x) === pk ? { ...x, explainedEarly: at, fuLater: later }
          : later && x.id === p.id && x.date > p.date ? { ...x, fuMissing: true } : x));
        if (extra) next = mergePatientList(next, [extra], doctorPrefs, settings).next;
        return next;
      });
      showToast(`${p.name} 설명 완료 · 처치 후 귀가${later ? ' (FU 나중에)' : ''}`, () => {
        patch(pk, () => ({ explainedEarly: null, fuLater: false }));
        if (later) mutateFu(prev => unmarkFollowupLater(prev, p.id));
      });
      return;
    }
    const undoDone = () => {
      mutatePatients(prev => deactivateLinked(prev.map(x => (patientKey(x) === pk ? { ...x, consultDone: false, consultDoneAt: null, fuLater: false } : x)), pk));
      if (later) mutateFu(prev => unmarkFollowupLater(prev, p.id));
    };
    mutatePatients(prev => {
      let next = prev.map(x => (patientKey(x) === pk ? { ...x, consultDone: true, consultDoneAt: at, fuLater: later }
        : later && x.id === p.id && x.date > p.date ? { ...x, fuMissing: true } : x));
      if (extra) next = mergePatientList(next, [extra], doctorPrefs, settings).next;
      return activateLinked(next, pk, settings, at);
    });
    const nextVisit = linkDoctor || allPatients.find(x => x.primaryKey === pk && x.linkWaiting)?.doctor;
    const via = settings.linkCheckAdded !== false && linkDoctor ? '처치실 추가 검사 확인 후 ' : '';
    showToast(`${p.name} 설명 완료${later ? ' · FU는 관리자 > FU 지정 관리에서 나중에' : ''}${nextVisit ? `, ${via}${nextVisit} 2차 진료로` : ''}`, undoDone);
  };

  const goHome = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    mutatePatients(prev => activateLinked(prev.map(x => (patientKey(x) === pk ? { ...x, consultDone: true, consultDoneAt: at } : x)), pk, settings, at));
    const nextVisit = allPatients.find(x => x.primaryKey === pk && x.linkWaiting)?.doctor;
    showToast(`${p.name} 귀가${nextVisit ? `, ${nextVisit} 2차 진료로` : ''}`, () => mutatePatients(prev => deactivateLinked(prev.map(x => (patientKey(x) === pk ? { ...x, consultDone: false, consultDoneAt: null } : x)), pk)));
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
  const sendPatient = (p, { dest, sel, note, detail }) => {
    const pk = patientKey(p);
    const at = Date.now();
    setSendFor(null);
    const sendNote = note ? { text: note, from: doctor, at } : null;
    const before = { done: p.done, doneAt: p.doneAt, assigned: p.assigned, detail: p.detail, queueKey: p.queueKey, calledRoom: p.calledRoom, consultHold: p.consultHold, sendNote: p.sendNote, treatRequest: p.treatRequest };
    const undo = () => patch(pk, () => before);
    if (dest === 'exam') {
      const ids = allTests.filter(t => sel[t.id]).map(t => t.id);
      applyExtraTests(pk, ids, detail || {}, sendNote);
      showToast(`${p.name} 검사실로 보냈습니다 (${allTests.filter(t => sel[t.id]).map(t => testLabelWithOptions(t, detail?.[t.id])).join(', ')})`, undo);
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
      extra={<><ChimeControl /><DoctorPicker doctors={doctors} value={selectedDoctor} onChange={setSelectedDoctor} /></>}
      sub={selectedDoctor ? <SummaryBar label="진료실 할 일 요약" items={[
        { id: 'consult-explain', label: '설명 대기', n: explainList.length },
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

          {inRoom && (
            <div className="bg-white border-2 border-amber-300 rounded-2xl p-6 mb-6">
              <div className="text-sm text-amber-600 font-medium mb-1">현재 진료 중</div>
              <div className="text-2xl font-semibold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
                {inRoom.name}
                {inRoom.firstVisit && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-normal">초진</span>}
                {inRoom.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 font-normal">2차 진료 · {inRoom.primaryDoctor} 후</span>}
                {nextVisitNote(inRoom)}
                <PatientMemo p={inRoom} />
              </div>
              <div className="text-sm text-slate-400 mb-3">{inRoom.id} · 예약 {inRoom.reservation}</div>
              <div className="bg-slate-50 rounded-xl p-3 mb-3">
                <MeasureTable today={inRoom.measure} prev={previousMeasure(inRoom, history)} />
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
                    <div className="w-full mb-1">
                      <MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" />
                    </div>
                    <HistoryLine p={p} />
                    <DilationRow compact p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
                    <button
                      type="button"
                      disabled={!!inRoom}
                      onClick={() => patch(pk, () => ({ calledRoom: doctor, calledAt: Date.now(), sendNote: null }))}
                      className={`text-sm px-3 py-1.5 rounded-lg font-medium ${inRoom ? 'bg-slate-200 text-slate-400' : 'bg-amber-600 text-white'}`}
                    >
                      진료 호출
                    </button>
                    <button type="button" onClick={() => setSendFor(p)} className="text-sm px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700">보내기</button>
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
                  if (p.fuLater) mutateFu(prev => unmarkFollowupLater(prev, p.id));
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
          onConfirm={orderProcedures}
          onCancel={() => setProcFor(null)}
        />
      )}
      {toastNode}
    </ScreenShell>
  );
}
