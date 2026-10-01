// 처치실 화면
import React, { useState, useEffect, useRef } from 'react';
import { hxPending, INPUT, VISION_KEY, activeVf, assignAtTreat, byQueue, clearOrders, fmtClock, hasFollowupApplied, inResidentProcedure, needsTriageAssign, needsTriageExam, patchPatient, patientKey, pendingRooms, prepOf, prepPendingTests, prepWaitMin, roomTests, sortedTests, treatRoomOf, mainTestIds, prepGoMode, prepDue, prepChecks, orderForPicking, prepLabel, prepCompletesTest, isTimed, prepRunning, staleMinutes, staleMinOf, prepConfirmPatch, treatWork, treatTimedDue, treatChimeKeys } from '../core/flow.jsx';
import { ConfirmButton, DilationRow, Field, HistoryDetail, MeasureLine, ProcedureList, RecentDone, RecentRow, SORT_OPTIONS, ScreenShell, SegmentedToggle, TestCheckModal, TodayTestsLine, UndoButton, byName, cancelProcedure, useSortMode, useUndoToast, useTestEditing, TestPicker, SummaryBar } from '../ui/common.jsx';
import { StationView } from './StationView.jsx';
import { SectionTitle, SimpleCard } from './ConsultView.jsx';
import { ChimeControl, useChime } from '../ui/chime.jsx';

/* ------------------------------------------------------------------ */
/* 처치실 화면 (초진 예진 + 전공의 처치)                                  */
/* ------------------------------------------------------------------ */
export function defaultTriageRequired(p, doctorPrefs) {
  // 이미 지정한 환자별 선택을 우선하고, 신규 지정은 담당 교수 기본값을 사용한다.
  if (typeof p.triageRequired === 'boolean') return p.triageRequired;
  return doctorPrefs?.[p.doctor]?.triageRequired !== false;
}

export function ProcedureRoomView({ patients, settings, doctorPrefs, history, mutatePatients, mutateHistoryEntry, onBack, lastSync }) {
  const [triageFor, setTriageFor] = useState(null);
  const [sortMode, changeSort] = useSortMode('sort-procedure');
  const order = sortMode === 'name' ? byName : byQueue;
  const [toastNode, showToast] = useUndoToast();
  const testEdit = useTestEditing(patients, settings, mutatePatients);
  const allTests = sortedTests(settings);
  const waitMin = settings.dilationWaitMin;

  // 묶음별 목록은 메인 화면 숫자·띵동 알림과 같은 기준(treatWork)
  const work = treatWork(patients, settings);
  const requests = [...work.requests].sort(order);
  // 띵동: 처치실 어느 묶음이든 새 환자, 또는 '시간 됨'
  useChime(treatChimeKeys(patients, settings), { ready: !!lastSync });
  const [reqFor, setReqFor] = useState(null);
  // 진료실 요청: 확인 끝 → 진료 대기로 (필요하면 검사를 붙여서 검사실로)
  // 진료실 요청 처리. 여러 가지를 함께 할 수 있습니다: 검사 추가, 시력/안압 다시, 예진 추가
  const finishRequest = (p, testIds = [], detail = {}, { vision = false, triage = false } = {}) => {
    const pk = patientKey(p);
    const before = { treatRequest: p.treatRequest, assigned: p.assigned, done: p.done, doneAt: p.doneAt, detail: p.detail, extraTriage: p.extraTriage, triageDone: p.triageDone, triageAt: p.triageAt, orders: p.orders };
    patchPatient(mutatePatients, pk, x => {
      const assigned = { ...x.assigned }, done = { ...x.done }, doneAt = { ...x.doneAt }, nd = { ...(x.detail || {}) };
      testIds.forEach(id => { assigned[id] = true; done[id] = false; if (detail?.[id]) nd[id] = detail[id]; });
      if (vision) { done[VISION_KEY] = false; doneAt[VISION_KEY] = null; }
      return {
        treatRequest: null, assigned, done, doneAt, detail: nd, orders: clearOrders(x, testIds),
        ...(triage ? { extraTriage: true, triageDone: false, triageAt: null } : {}),
      };
    });
    const steps = [vision && '시력/안압', testIds.length && '검사', triage && '예진'].filter(Boolean);
    showToast(`${p.name} ${steps.length ? `${steps.join(' → ')} 후 진료 대기로` : '확인 완료, 진료 대기로'}`, () => patchPatient(mutatePatients, pk, () => before));
  };
  const triage = [...work.triage].sort(order);
  const procs = [...work.procs].sort(order);
  const recent = [
    ...patients.filter(p => (assignAtTreat(p) || p.extraTriage) && p.triageDone).map(p => ({ p, kind: 'triage', at: p.triageAt || 0 })),
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
      return { assigned, done, detail: nd, triageAssigned: true, triageAssignedAt: at, triageRequired: assignAtTreat(x) ? triageRequired : false };
    });
    const pending = chosen.filter(t => !p.done?.[t.id]);
    const withTriage = assignAtTreat(p) && triageRequired;
    showToast(`${p.name} ${assignAtTreat(p) ? '검사 지정' : '추가 검사 확인'} 완료, ${pending.length ? (withTriage ? '검사 후 처치실 예진으로' : '검사 후 진료 대기로') : (withTriage ? '처치 대기에서 예진' : '진료 대기로')}`, () => patchPatient(mutatePatients, pk, x => (!activeVf(x) && !x.triageDone ? { triageAssigned: false, triageAssignedAt: null, triageRequired: p.triageRequired } : {})));
  };

  const finishTriage = (p) => {
    const at = Date.now();
    patchPatient(mutatePatients, patientKey(p), x => needsTriageExam(x, settings) ? { triageDone: true, triageAt: at } : {});
    showToast(p.name + ' 예진 완료, 진료 대기로', () => patchPatient(mutatePatients, patientKey(p), () => ({ triageDone: false, triageAt: null })));
  };

  // 검사 준비 (예: FAG 동의서 · skin test): 시작 → 대기 시간 → 음성이면 검사실로, 양성이면 보류
  const prepList = [...work.prep].sort(order);
  // '바로 넘어감'(예: MMP): 시작하면 검사는 완료로 넘어가고, 시간이 되면 여기서 결과를 확인
  // '[끝 · 확인]을 눌러야 완료'(예: Schirmer) 처치실 검사도 시간이 되면 여기에 함께 (진료 전 검사 칸에서도 확인 가능)
  const timedDue = (p, now = Date.now()) => treatTimedDue(p, settings, now);
  const checkList = [...work.check].sort(order);
  // 시간 표시를 새로 그리고, 시간이 된 준비·확인이 새로 생기면 알림
  const [, setTick] = useState(0);
  const seenDue = useRef(null);
  const latest = useRef({});
  latest.current = { prepList, checkList, settings, showToast, patients };
  useEffect(() => {
    const check = () => {
      const { prepList, checkList, settings, showToast, patients } = latest.current;
      setTick(n => n + 1);
      const now = Date.now();
      const due = [];
      patients.forEach(p => sortedTests(settings).filter(t => isTimed(t) && p.assigned?.[t.id] && prepRunning(p, t)).forEach(t => { if (prepDue(prepOf(p, t), t, now)) due.push({ k: `${patientKey(p)}:${t.id}`, text: `${p.name} ${prepLabel(t)} 끝 · 확인해주세요` }); }));
      prepList.forEach(p => prepPendingTests(p, settings).forEach(t => { if (prepDue(prepOf(p, t), t, now)) due.push({ k: `${patientKey(p)}:${t.id}`, text: `${p.name} ${prepLabel(t)} 끝 · 확인해주세요` }); }));
      checkList.forEach(p => prepChecks(p, settings).forEach(t => { if (prepDue(prepOf(p, t), t, now)) due.push({ k: `${patientKey(p)}:${t.id}`, text: `${p.name} ${t.short || t.name} 확인할 시간` }); }));
      const fresh = seenDue.current ? due.filter(d => !seenDue.current.has(d.k)) : [];
      seenDue.current = new Set(due.map(d => d.k));
      if (fresh.length) showToast(`시간 됨 · ${fresh.map(d => d.text).join(' · ')}`);
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);
  // 바로 넘어감: 시작하면 검사 완료로 두고(다음 검사·진료로 이동), 확인은 나중에
  const startGo = (p, t) => {
    const pk = patientKey(p);
    const at = Date.now();
    const before = { prep: p.prep, done: p.done, doneAt: p.doneAt };
    patchPatient(mutatePatients, pk, x => ({
      prep: { ...(x.prep || {}), [t.id]: { startedAt: at, go: true, name: t.short || t.name } },
      done: { ...x.done, [t.id]: true }, doneAt: { ...(x.doneAt || {}), [t.id]: at },
    }));
    showToast(`${p.name} ${prepLabel(t)} 시작 · 시간이 되면 알려드려요`, () => patchPatient(mutatePatients, pk, () => before));
  };
  const cancelGo = (p, t) => {
    const pk = patientKey(p);
    const before = { prep: p.prep, done: p.done, doneAt: p.doneAt };
    patchPatient(mutatePatients, pk, x => ({ prep: { ...(x.prep || {}), [t.id]: null }, done: { ...x.done, [t.id]: false }, doneAt: { ...(x.doneAt || {}), [t.id]: null } }));
    showToast(`${p.name} ${t.short || t.name} 시작 취소`, () => patchPatient(mutatePatients, pk, () => before));
  };
  const checkGo = (p, t) => {
    const pk = patientKey(p);
    const st = prepOf(p, t);
    patchPatient(mutatePatients, pk, x => ({ prep: { ...(x.prep || {}), [t.id]: { ...(x.prep?.[t.id] || st), checked: Date.now() } } }));
    showToast(`${p.name} ${t.short || t.name} 확인`, () => patchPatient(mutatePatients, pk, x => ({ prep: { ...(x.prep || {}), [t.id]: st } })));
  };
  const confirmTimed = (p, t) => {
    const pk = patientKey(p);
    const before = { prep: p.prep, done: p.done, doneAt: p.doneAt };
    patchPatient(mutatePatients, pk, x => prepConfirmPatch(x, t, settings, Date.now()));
    showToast(`${p.name} ${t.short || t.name} 완료`, () => patchPatient(mutatePatients, pk, () => before));
  };
  const setPrep = (p, t, value, msg) => {
    const pk = patientKey(p);
    const before = p.prep?.[t.id] || null;
    patchPatient(mutatePatients, pk, x => ({ prep: { ...(x.prep || {}), [t.id]: value } }));
    if (msg) showToast(msg, () => patchPatient(mutatePatients, pk, x => ({ prep: { ...(x.prep || {}), [t.id]: before } })));
  };
  // [확인]: 검사실에서 검사할 수 있게 열어 줌. '확인하면 검사 완료'(예: Schirmer, MMP)면 검사도 완료로
  const confirmPrep = (p, t, st) => {
    const pk = patientKey(p);
    const at = Date.now();
    const before = { prep: p.prep, done: p.done, doneAt: p.doneAt };
    patchPatient(mutatePatients, pk, x => ({
      prep: { ...(x.prep || {}), [t.id]: { ...st, result: 'neg', at } },
      ...(prepCompletesTest(t) ? { done: { ...x.done, [t.id]: true }, doneAt: { ...(x.doneAt || {}), [t.id]: at } } : {}),
    }));
    showToast(`${p.name} ${t.short || t.name} ${prepCompletesTest(t) ? '완료' : '확인, 검사실로'}`, () => patchPatient(mutatePatients, pk, () => before));
  };
  // 진료 전 처치 (예: PRP, YAG): 처치 완료 후 검사가 있으면 검사실, 없으면 진료 대기로
  const preProcList = [...work.preProc].sort(order);
  const finishPreProcs = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    patchPatient(mutatePatients, pk, x => ({ preProcs: (x.preProcs || []).map(i => (i.done ? i : { ...i, done: true, doneAt: at })) }));
    const next = { ...p, preProcs: (p.preProcs || []).map(i => ({ ...i, done: true })) };
    showToast(`${p.name} 진료 전 처치 완료, ${pendingRooms(next, settings).length ? '검사실로' : '진료 대기로'}`, () => patchPatient(mutatePatients, pk, x => ({
      preProcs: (x.preProcs || []).map(i => (i.doneAt === at ? { ...i, done: false, doneAt: null } : i)),
    })));
  };

  const finishResident = (p) => {
    const pk = patientKey(p);
    const at = Date.now();
    patchPatient(mutatePatients, pk, x => ({
      procedures: (x.procedures || []).map(i => (i.performer === 'resident' && !i.done ? { ...i, done: true, doneAt: at } : i)),
    }));
    showToast(`${p.name} 처치 완료, ${p.explainedEarly ? '진찰실에서 귀가 처리' : '설명 대기로'}`, () => patchPatient(mutatePatients, pk, x => ({
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

  // 위쪽 요약 줄: 묶음마다 인원 · 시간 된 환자(초록) · 오래 그대로인 환자(주황). 누르면 그 묶음으로 이동
  const now = Date.now();
  const treatId = treatRoomOf(settings).id;
  const treatTests = roomTests(settings, treatId);
  const examList = work.exams;
  const timedRunning = (p) => treatTests.some(t => isTimed(t) && p.assigned?.[t.id] && prepRunning(p, t));
  const prepStarted = (p) => prepPendingTests(p, settings).some(t => prepOf(p, t)?.startedAt);
  const staleOf = (p) => staleMinutes(p, settings, now);
  const summary = [
    { id: 'treat-check', label: '결과 확인', list: checkList, due: checkList.filter(p => timedDue(p, now).length > 0 || prepChecks(p, settings).some(t => prepDue(prepOf(p, t), t, now))).length },
    { id: 'treat-preproc', label: '진료 전 처치', list: preProcList, stale: preProcList.filter(staleOf).length },
    { id: 'treat-prep', label: '검사 준비', list: prepList,
      due: prepList.filter(p => prepPendingTests(p, settings).some(t => prepDue(prepOf(p, t), t, now))).length,
      stale: prepList.filter(p => !prepStarted(p) && staleOf(p)).length },
    ...(treatTests.length ? [{ id: 'treat-exams', label: '진료 전 검사', list: examList,
      due: examList.filter(p => treatTests.some(t => isTimed(t) && p.assigned?.[t.id] && prepRunning(p, t) && prepDue(prepOf(p, t), t, now))).length,
      stale: examList.filter(p => !activeVf(p) && !timedRunning(p) && staleOf(p)).length }] : []),
    { id: 'treat-request', label: '진료실 요청', list: requests, stale: requests.filter(staleOf).length },
    { id: 'treat-triage', label: '검사 지정', list: triage, stale: triage.filter(staleOf).length },
    { id: 'treat-procs', label: '처치 대기', list: procs, stale: procs.filter(staleOf).length },
  ];
  const summaryBar = <SummaryBar label="처치실 할 일 요약" staleMin={staleMinOf(settings)} items={summary.map(x => ({ ...x, n: x.list.length }))} />;

  return (
    <ScreenShell title={treatRoomOf(settings).name} color="indigo" onBack={onBack} lastSync={lastSync} sub={summaryBar} extra={<ChimeControl />} count={requests.length + triage.length + procs.length + preProcList.length + prepList.length + checkList.length + examList.length}>
      {checkList.length > 0 && (
        <div id="treat-check" className="mb-8 scroll-mt-36">
          <SectionTitle hint="시간이 된 검사를 모아 봅니다. 바로 넘어가는 검사(예: MMP)는 시작부터 여기 있고, [끝 · 확인]을 눌러야 하는 검사(예: Schirmer)는 시간이 되면 올라옵니다. 결과를 보고 [확인]을 눌러주세요.">결과 확인 · {checkList.length}명</SectionTitle>
          {checkList.map(p => (
            <SimpleCard key={patientKey(p)} p={p} tone="violet">
              {timedDue(p).map(t => (
                <div key={`due-${t.id}`} className="flex items-center gap-2 flex-wrap mr-4">
                  <span className="text-sm font-semibold text-slate-900">{t.short || t.name}</span>
                  <button type="button" onClick={() => confirmTimed(p, t)} title="누르면 검사 완료 (진료 전 검사 칸에서 눌러도 같음)"
                    className="text-sm px-4 py-2 rounded-lg bg-green-600 text-white font-medium">{prepLabel(t)} {fmtClock(prepOf(p, t).startedAt)} · 확인</button>
                </div>
              ))}
              {prepChecks(p, settings).map(t => {
                const st = prepOf(p, t);
                const due = prepDue(st, t);
                return (
                  <div key={t.id} className="flex items-center gap-2 flex-wrap mr-4">
                    <span className="text-sm font-semibold text-slate-900">{t.short || t.name}</span>
                    {due ? (
                      <button type="button" onClick={() => checkGo(p, t)} className="text-sm px-4 py-2 rounded-lg bg-green-600 text-white font-medium">{prepLabel(t)} {fmtClock(st.startedAt)} · 확인</button>
                    ) : <>
                      <span className="text-sm px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-medium">{prepLabel(t)} {fmtClock(st.startedAt)}</span>
                      <button type="button" onClick={() => checkGo(p, t)} title="시간 전이지만 지금 확인" className="text-xs text-green-700 underline">지금 확인</button>
                      <button type="button" onClick={() => cancelGo(p, t)} className="text-xs text-slate-400 hover:text-rose-600 underline">시작 취소</button>
                    </>}
                  </div>
                );
              })}
            </SimpleCard>
          ))}
        </div>
      )}
      {preProcList.length > 0 && (
        <div id="treat-preproc" className="mb-8 scroll-mt-36">
          <SectionTitle hint="시력검사 없이 처치부터 하러 온 환자입니다 (예: PRP, YAG). 처치가 끝나면 검사가 있으면 검사실, 없으면 진료 대기로 갑니다.">진료 전 처치 · {preProcList.length}명</SectionTitle>
          {preProcList.map(p => (
            <SimpleCard key={patientKey(p)} p={p} tone="rose" stale={staleOf(p)}>
              <div className="w-full flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-slate-800">
                  {(p.preProcs || []).filter(x => !x.done).map(x => <span key={x.uid} className="font-semibold mr-3">{x.name}</span>)}
                  {sortedTests(settings).some(t => p.assigned?.[t.id] && !p.done?.[t.id]) && <span className="text-xs text-slate-500">처치 후 검사: {sortedTests(settings).filter(t => p.assigned?.[t.id] && !p.done?.[t.id]).map(t => t.short || t.name).join(', ')}</span>}
                </div>
                <button type="button" onClick={() => finishPreProcs(p)} className="text-sm px-4 py-2 rounded-lg bg-rose-600 text-white font-medium shrink-0">처치 완료</button>
              </div>
              <DilationRow compact p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
            </SimpleCard>
          ))}
        </div>
      )}
      {prepList.length > 0 && (
        <div id="treat-prep" className="mb-8 scroll-mt-36">
          <SectionTitle hint="처치실에서 시간을 재는 검사·준비입니다 (예: FAG skin test, Schirmer, MMP). 버튼을 누르면 시작 시각이 적히고, 정한 시간이 되면 초록 [확인]으로 바뀝니다.">검사 준비 · {prepList.length}명</SectionTitle>
          {prepList.map(p => (
            <SimpleCard key={patientKey(p)} p={p} tone="violet" stale={prepStarted(p) ? 0 : staleOf(p)}>
              {prepPendingTests(p, settings).map(t => {
                const st = prepOf(p, t);
                const label = prepLabel(t);
                const due = prepDue(st, t);
                // 산동처럼 버튼 하나: 누르면 시작 시각 · 다시 누르면 시작 취소. 시간이 되면 초록 [끝 · 확인]
                return (
                  <div key={t.id} className="flex items-center gap-2 flex-wrap mr-4">
                    <span className="text-sm font-semibold text-slate-900">{t.short || t.name}</span>
                    {!st?.startedAt ? (
                      <button type="button" onClick={() => (prepGoMode(t) ? startGo(p, t) : setPrep(p, t, { startedAt: Date.now(), name: t.short || t.name }, `${p.name} ${label} 시작`))}
                        className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white font-medium">{label}</button>
                    ) : due ? (
                      <button type="button" onClick={() => confirmPrep(p, t, st)} title={prepCompletesTest(t) ? '누르면 검사 완료' : '누르면 검사실에서 검사할 수 있어요'}
                        className="text-sm px-4 py-2 rounded-lg bg-green-600 text-white font-medium">{label} 끝 · 확인</button>
                    ) : (
                      <button type="button" onClick={() => setPrep(p, t, null, `${p.name} ${label} 시작 취소`)} title={`${prepWaitMin(t)}분 뒤 [확인] · 다시 누르면 시작 취소`}
                        className="text-sm px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-medium">{label} {fmtClock(st.startedAt)}</button>
                    )}
                    {st?.startedAt && !due && <button type="button" onClick={() => confirmPrep(p, t, st)} title="시간 전이지만 지금 완료로 처리" className="text-xs text-green-700 underline">지금 확인</button>}
                    {st?.startedAt && <button type="button" onClick={() => setPrep(p, t, { ...st, result: 'pos', at: Date.now() }, `${p.name} ${t.short || t.name} 검사 취소`)} title="반응이 있어 이 검사를 오늘 하지 않음 (진료실에 표시)"
                      className="text-xs text-red-600 underline">검사 취소</button>}
                  </div>
                );
              })}
              {/* 처치실이 전체를 조율: 여기서도 오늘 검사 바꾸기 */}
              <TestPicker p={p} tests={orderForPicking(allTests, settings)} mainIds={mainTestIds(doctorPrefs, p.doctor)} onPick={(t, on) => testEdit.pickTest(p, t, on)} onSpecial={(t) => testEdit.openSpecial(p, t)}>
                <DilationRow togglesOnly inline p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
              </TestPicker>
            </SimpleCard>
          ))}
        </div>
      )}
      {/* 진료 전 검사 (설정에서 처치실에 둔 검사, 예: Syringing) — 검사실 화면과 같은 카드 */}
      {roomTests(settings, treatRoomOf(settings).id).length > 0 && (
        <div id="treat-exams" className="scroll-mt-36"><StationView embedded mode={treatRoomOf(settings).id} settings={settings} doctorPrefs={doctorPrefs} patients={patients}
          history={history} mutatePatients={mutatePatients} mutateHistoryEntry={mutateHistoryEntry} onBack={onBack} lastSync={lastSync} /></div>
      )}
      <div className="flex justify-end mb-3">
        <SegmentedToggle value={sortMode} onChange={changeSort} options={SORT_OPTIONS} />
      </div>
      {requests.length > 0 && (
        <div id="treat-request" className="mb-8 scroll-mt-36">
          <SectionTitle hint="진료실에서 확인을 요청한 환자입니다. 메모를 확인하고, 추가할 검사가 있으면 지정하세요.">진료실 요청 확인 · {requests.length}명</SectionTitle>
          {requests.map(p => (
            <SimpleCard key={patientKey(p)} p={p} tone="amber" stale={staleOf(p)}>
              <div className="w-full"><MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" /></div>
              <button type="button" onClick={() => setReqFor(p)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">검사 추가</button>
              <button type="button" onClick={() => finishRequest(p, [], {}, { vision: true })} className="text-sm px-4 py-2 rounded-lg border border-blue-300 text-blue-700 font-medium">시력/안압 다시</button>
              <button type="button" onClick={() => finishRequest(p, [], {}, { triage: true })} className="text-sm px-4 py-2 rounded-lg border border-sky-300 text-sky-700 font-medium">예진 추가</button>
              <button type="button" onClick={() => finishRequest(p)} className="text-sm px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 font-medium">확인 완료 · 진료 대기로</button>
            </SimpleCard>
          ))}
        </div>
      )}
      <div id="treat-triage" className={`${triage.length ? 'mb-8' : 'mb-4'} scroll-mt-36`}>
        <SectionTitle hint="초진은 오늘 할 검사와 예진 여부를, 2차 진료는 다음 교수님 진료 전에 추가할 검사를 지정하세요.">
          검사 지정 대기 (초진 · History · 2차 진료) · {triage.length}명
        </SectionTitle>
        {triage.map(p => {
          return (
          <SimpleCard key={patientKey(p)} p={p} tone="sky" stale={staleOf(p)}>
            <div className="w-full">
              <MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" />
            </div>
            {p.hx && <HistoryDetail p={p} editable />}
            {allTests.some(t => t.id !== VISION_KEY && p.assigned?.[t.id]) && <TodayTestsLine p={p} tests={allTests} />}
            {/* 한 줄에: History 입력 · 산동 · 검사 지정 (의미 없는 '없음' 줄은 생략) */}
            <div className="w-full flex flex-wrap items-center gap-2">
              <HistoryDetail p={p} button />
              <button type="button" onClick={() => setTriageFor(p)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">
                {assignAtTreat(p) ? '검사 지정' : '추가 검사 확인'}
              </button>
              <DilationRow group p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
            </div>
          </SimpleCard>
          );
        })}
      </div>

      <div id="treat-procs" className="scroll-mt-36">
        <SectionTitle hint="검사를 마친 초진 환자의 예진과 전공의 처치를 진행합니다.">처치 대기 · {procs.length}명</SectionTitle>
        {procs.map(p => (
          <SimpleCard key={patientKey(p)} p={p} tone="indigo" stale={staleOf(p)}
            badges={p.explainedEarly && inResidentProcedure(p) && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-semibold border border-emerald-600">설명 완료 · 처치 후 귀가</span>}>
            {needsTriageExam(p, settings) && <>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">예진</span>
              <div className="w-full"><MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" /></div>
              {p.hx && <HistoryDetail p={p} editable />}
              <TodayTestsLine p={p} tests={allTests} />
              <div className="w-full flex flex-wrap items-center gap-2">
                <HistoryDetail p={p} button />
                <button type="button" onClick={() => finishTriage(p)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">예진 완료</button>
              </div>
            </>}
            {(p.procedures || []).some(x => x.performer === 'resident') && (
              <div className="w-full flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0"><ProcedureList p={p} performer="resident" onCancel={uid => cancelProcedure(mutatePatients, patientKey(p), uid)} /></div>
                {inResidentProcedure(p) && <button type="button" onClick={() => finishResident(p)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium shrink-0">
                  처치 완료
                </button>}
              </div>
            )}
            <DilationRow compact p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
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
          mainIds={mainTestIds(doctorPrefs, reqFor.doctor)}
          title={`${reqFor.name}님 추가 검사`}
          subtitle={`${reqFor.sendNote?.text ? `진료실 메모: ${reqFor.sendNote.text} · ` : ''}추가할 검사를 체크하세요. 검사 후 예진이 필요하면 아래에서 '예진 함'을 고르세요.`}
          tests={allTests}
          settings={settings}
          initial={{}}
          initialDetail={{}}
          triageChoice={false}
          confirmLabel="검사 추가"
          onConfirm={(sel, detail, _dil, triageRequired) => { const p = reqFor; setReqFor(null); finishRequest(p, allTests.filter(t => sel[t.id]).map(t => t.id), detail, { triage: !!triageRequired }); }}
          onCancel={() => setReqFor(null)}
        />
      )}
      {triageFor && (
        <TestCheckModal
          key={`triage-${patientKey(triageFor)}`}
          mainIds={mainTestIds(doctorPrefs, triageFor.doctor)}
          title={assignAtTreat(triageFor) ? `${triageFor.name}님 검사 지정` : `${triageFor.name}님 2차 진료 추가 검사 (${triageFor.doctor})`}
          subtitle={assignAtTreat(triageFor)
            ? '오늘 할 검사와 검사 후 예진 여부를 선택하세요. 검사가 없으면 선택한 대기 명단으로 바로 이동합니다.'
            : `${triageFor.primaryDoctor || '1차'} 진료를 마쳤습니다. ${triageFor.doctor} 진료 전에 할 검사를 체크하세요. 이미 한 검사는 다시 하지 않습니다. 없으면 바로 진료 대기로 이동합니다.${allTests.some(t => triageFor.done?.[t.id]) ? ` (오늘 한 검사: ${allTests.filter(t => triageFor.done?.[t.id]).map(t => t.short || t.name).join(', ')})` : ''}`}
          info={<div className="space-y-2"><TodayTestsLine p={triageFor} tests={allTests} />{(triageFor.hx || hxPending(triageFor)) && <HistoryDetail p={triageFor} />}</div>}
          tests={allTests}
          settings={settings}
          initial={triageFor.assigned}
          initialDetail={triageFor.detail}
          triageChoice={assignAtTreat(triageFor) ? defaultTriageRequired(triageFor, doctorPrefs) : undefined}
          confirmLabel={assignAtTreat(triageFor) ? '검사 지정 완료' : '확인 완료'}
          onConfirm={confirmTriage}
          onCancel={() => setTriageFor(null)}
        />
      )}
      {testEdit.modal}
      {toastNode}
    </ScreenShell>
  );
}

// 명단 관리: 이름·환자번호·예약시간 수정
export function PatientInfoModal({ patient, onSave, onCancel }) {
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
export function UploadResult({ result, patients, onRemove, onShowList }) {
  const { date, doctors = [], perDoctor = [], total, stats, missing, rejected = [] } = result;
  const byKey = new Map(patients.map(p => [patientKey(p), p]));
  const stillMissing = missing.map(k => byKey.get(k)).filter(Boolean);
  const withFu = stats ? stats.added.filter(hasFollowupApplied).length : 0;
  const fv = stats ? stats.added.filter(p => p.firstVisit).length : 0;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
      <div className="font-medium text-slate-900">{date} {doctors.join(', ')} 명단 · 등록 대상 {total}명{perDoctor.length > 1 ? ` (${perDoctor.join(' · ')})` : ''}</div>
      {rejected.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3">
          <div className="font-medium text-red-800 mb-1">등록 안 함: 진료의 불일치 {rejected.length}명</div>
          <p className="text-xs text-red-700 mb-2">엑셀의 진료의가 설정 &gt; 교수 관리에 등록된 이름({(result.allDoctors || []).join(', ') || '없음'})과 맞지 않습니다. 엑셀이나 교수 이름을 고친 뒤 다시 올려주세요.</p>
          {rejected.slice(0, 30).map((r, i) => (
            <div key={`${r.id}-${i}`} className="text-xs text-slate-700 py-0.5">{r.name || '-'} <span className="text-slate-500">{r.id} · 진료의 '{r.doctorText || '비어 있음'}'</span></div>
          ))}
          {rejected.length > 30 && <div className="text-xs text-slate-500">외 {rejected.length - 30}명</div>}
        </div>
      )}
      {stats ? (
        <ul className="space-y-1">
          <li>새로 추가 <b>{stats.added.length}명</b>{stats.added.length > 0 && ` (이전 정보 적용 ${withFu}명 · 이전 정보 없음 ${stats.added.length - withFu}명${fv ? ` · 초진 ${fv}명` : ''})`}</li>
          {stats.timeChanged.length > 0 && <li>이미 있어 <b>예약시간만 변경 {stats.timeChanged.length}명</b>: {stats.timeChanged.slice(0, 8).map(p => `${p.name} ${p.reservation || '-'}→${p.newReservation}`).join(', ')}{stats.timeChanged.length > 8 ? ` 외 ${stats.timeChanged.length - 8}명` : ''}</li>}
          {stats.unchanged.length > 0 && <li>이미 있어 그대로 둠 {stats.unchanged.length}명</li>}
          {stats.linked.length > 0 && <li className="text-fuchsia-800">같은 날 다른 교수님 명단에도 있어 <b>두 교수님 진료로 연결 {stats.linked.length}명</b>: {stats.linked.slice(0, 8).map(p => `${p.name}(${p.first ? `${p.doctor} 먼저 → ${p.others.join(', ')}` : `${p.others.join(', ')} → ${p.doctor}`})`).join(', ')}{stats.linked.length > 8 ? ` 외 ${stats.linked.length - 8}명` : ''} · 검사는 1차 진료 전에 함께 합니다. 순서는 명단 관리에서 바꿀 수 있어요.</li>}
        </ul>
      ) : <div className="text-red-600">저장하지 못했습니다. 서버 연결을 확인하고 다시 올려주세요.</div>}
      {stillMissing.length > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
          <div className="font-medium text-orange-900 mb-1">이번 파일에 없는 환자 {stillMissing.length}명</div>
          <p className="text-xs text-orange-800 mb-2">같은 날짜·같은 교수님 명단에 있었지만 이번 파일에는 없습니다. 예약이 취소된 환자인지 확인한 뒤 삭제하세요. (삭제 버튼은 두 번 눌러야 삭제됩니다)</p>
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
