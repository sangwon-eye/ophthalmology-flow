// 처치실 화면
import React, { useState, useEffect, useRef } from 'react';
import { profConsentPending, treatPrepTodo, prepAtConsult, preProcsLeft, examAsked, treatRequestFrom, consentMissing, checkReconsultPatch, undoCheckReconsultPatch, procDilatePatch, markDilateSet, newId, treatTimedRunning, prepStartedTests, treatCheckDue, prepCancelPatch, nctMeasured, testLabelWithOptions, procReconsultPatch, undoProcReconsultPatch, performProcItem, notPerformed, addPostTestsPatch, checkItems, procCheckDue, pickDetail, dilationState, treatRequested, pendingProcedures, procDilatePending, procLabel, hxPending, INPUT, VISION_KEY, activeVf, assignAtTreat, byQueue, clearOrders, fmtClock, hasFollowupApplied, inResidentProcedure, needsTriageAssign, needsTriageExam, patchPatient, patientKey, pendingRooms, prepOf, prepPendingTests, prepWaitMin, roomTests, sortedTests, treatRoomOf, mainTestIds, prepDue, prepChecks, orderForPicking, prepLabel, isTimed, prepRunning, staleMinutes, staleMinOf, prepConfirmPatch, treatWork, treatChimeKeys, restoreKeys } from '../core/flow.jsx';
import { PrepButtons, prepWhat, CONSENT_TITLE, ConsentChips, TestConsentChip, ProcedureModal, TaskLine, RefLine, RefItem, CardDetail, HxRef, TwoStepButton, ProcCheckRow, PostTestModal, ConfirmButton, DilationRow, Field, HistoryDetail, MeasureLine, RecentDone, RecentRow, SORT_OPTIONS, ScreenShell, SegmentedToggle, TestCheckModal, TodayTestsLine, UndoButton, byName, cancelProcedure, useSortMode, useUndoToast, useTestEditing, TestPicker, SummaryBar } from '../ui/common.jsx';
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

export function ProcedureRoomView({ patients, settings, doctorPrefs, history, mutatePatients, onBack, lastSync }) {
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
    const at = Date.now();
    const before = { measureOk: p.measureOk ?? null, vaOk: p.vaOk ?? null, nctOk: p.nctOk ?? null, treatRequest: p.treatRequest, assigned: p.assigned, done: p.done, doneAt: p.doneAt, detail: p.detail, extraTriage: p.extraTriage, triageDone: p.triageDone, triageAt: p.triageAt, orders: p.orders };
    // 서버의 최신 기록으로 다시 확인: 그 요청이 아직 남아 있을 때만 (다른 PC가 먼저 처리했으면 다시 적용하지 않고 안내)
    // treatHandledAt: 이 버튼으로 처리했다는 표시 (되돌리기·안내 판단용)
    patchPatient(mutatePatients, pk, x => {
      if (!treatRequested(x) || (p.treatRequest?.at && x.treatRequest?.at !== p.treatRequest.at)) return {};
      const assigned = { ...x.assigned }, done = { ...x.done }, doneAt = { ...x.doneAt }, nd = { ...(x.detail || {}) };
      testIds.forEach(id => { assigned[id] = true; done[id] = false; if (detail?.[id]) nd[id] = detail[id]; });
      if (vision) { done[VISION_KEY] = false; doneAt[VISION_KEY] = null; }
      return {
        ...(vision ? { measureOk: null, vaOk: null, nctOk: null } : {}),
        treatRequest: null, treatHandledAt: at, assigned, done, doneAt, detail: nd, orders: clearOrders(x, testIds),
        ...(triage ? { extraTriage: true, triageDone: false, triageAt: null } : {}),
      };
    }).then(next => {
      const rec = Array.isArray(next) ? next.find(x => patientKey(x) === pk) : null;
      if (!rec) return;
      if (rec.treatHandledAt !== at) { showToast(`${p.name} 환자의 ${treatRequestFrom(p)}은 이미 다른 곳에서 처리되었습니다 · 바꾸지 않았습니다`); return; }
      const steps = [vision && '시력/안압', testIds.length && '검사', triage && '예진'].filter(Boolean);
      // 되돌리기: 이 버튼이 바꾼 검사(추가한 검사·시력/안압)만 원래대로, 다른 PC가 그사이 완료한 검사는 그대로
      const touched = [...testIds, ...(vision ? [VISION_KEY] : [])];
      const { assigned: bA, done: bD, doneAt: bT, detail: bDe, ...scalars } = before;
      showToast(`${p.name} ${examAsked(p) ? '확인 완료, 검사실로' : steps.length ? `${steps.join(' → ')} 후 진료 대기로` : '확인 완료, 진료 대기로'}`, () => patchPatient(mutatePatients, pk, x => (x.treatHandledAt !== at ? {} : {
        ...(vision ? scalars : { treatRequest: scalars.treatRequest, extraTriage: scalars.extraTriage, triageDone: scalars.triageDone, triageAt: scalars.triageAt, orders: scalars.orders }),
        ...restoreKeys(x, { assigned: bA, done: bD, doneAt: bT, detail: bDe }, touched),
        treatHandledAt: null,
      })));
    }, () => {});
  };
  // 요청 카드 [처치 추가] (10-10 사용자: 예 — 검사실에서 안압이 높아 만니톨을 맞을지 확인 요청)
  // 진료 전이면 '진료 전 처치'로(끝나면 남은 검사 → 진료 대기, 지금 규칙 그대로), 진료 뒤(설명 대기)면 진료 후 처치로. 요청은 처리됨
  const [addFor, setAddFor] = useState(null);
  const addProcedures = (chosen) => {
    const p = addFor;
    const pk = patientKey(p);
    const at = Date.now();
    setAddFor(null);
    const from = examAsked(p) ? (p.treatRequest.from || '검사실') : '진료실';
    const items = chosen.map(c => ({
      uid: newId(p.seen ? 'pr' : 'pp'), procId: c.id, name: c.name, performer: c.performer, note: c.note || '', done: false, doneAt: null,
      ...(c.eye ? { eye: c.eye } : {}), ...(c.dilate ? { dilate: true } : {}), addedAt: at, fromRequest: from,
    }));
    const before = { treatRequest: p.treatRequest, treatHandledAt: p.treatHandledAt ?? null };
    // 서버 최신 값으로: 그 요청이 아직 남아 있을 때만 (다른 PC가 먼저 처리했으면 넣지 않음)
    patchPatient(mutatePatients, pk, x => {
      if (!treatRequested(x) || x.treatRequest?.at !== p.treatRequest?.at) return {};
      const marked = markDilateSet(x, x.seen ? items.map(i => ({ ...i, orderedAt: at, fromExplain: true })) : items);
      return {
        treatRequest: null, treatHandledAt: at, ...procDilatePatch(x, items),
        ...(x.seen ? { procedures: [...(x.procedures || []), ...marked] } : { preProcs: [...(x.preProcs || []), ...marked] }),
      };
    }).then(next => {
      const rec = Array.isArray(next) ? next.find(x => patientKey(x) === pk) : null;
      if (!rec) return;
      if (rec.treatHandledAt !== at) { showToast(`처치 추가 안 됨 · ${p.name} 환자의 ${treatRequestFrom(p)}은 이미 다른 곳에서 처리되었습니다`); return; }
      // 되돌리기: 이번에 넣은 처치가 아직 시행 전이면 빼고 요청을 다시 남김 (이 처치 때문에 켠 산동은 점안 전이면 원래대로)
      const undo = () => patchPatient(mutatePatients, pk, x => {
        const list = rec.seen ? 'procedures' : 'preProcs';
        const mine = (x[list] || []).filter(i => i.addedAt === at);
        if (x.treatHandledAt !== at || mine.some(i => i.performedAt || i.done)) return {};
        const setBy = mine.find(i => i.dilateSet);
        return {
          ...before, [list]: (x[list] || []).filter(i => i.addedAt !== at),
          ...(setBy && !(x.drops || []).some(Boolean) ? { dilateOverride: typeof setBy.dilateWas === 'boolean' ? setBy.dilateWas : undefined } : {}),
        };
      });
      showToast(`${p.name} ${items.map(procLabel).join(', ')} ${rec.seen ? '처치 추가' : '진료 전 처치로'}`, undo);
    }, () => {});
  };
  // 처치 후 확인 + 재진료 (10-10): 진료 뒤 처치의 확인 시간이 되면 '확인 · 재진료' — 확인하고 같은 교수님 진료 대기로
  const checkAndReconsult = (p, c) => {
    const pk = patientKey(p);
    const at = Date.now();
    patchPatient(mutatePatients, pk, x => checkReconsultPatch(x, c.list, c.i.uid, c.i.performedAt, procLabel(c.i), at)).then(next => {
      const rec = Array.isArray(next) ? next.find(x => patientKey(x) === pk) : null;
      if (!rec) return;
      if (rec.procReconsult?.at !== at) { showToast(`재진료 안 됨 · ${p.name} 환자는 그사이 다른 곳에서 처리되었습니다`); return; }
      showToast(`${p.name} ${procLabel(c.i)} 확인, 진료 대기로 (재진료)`, () => patchPatient(mutatePatients, pk, x => undoCheckReconsultPatch(x, c.list, c.i.uid, at)));
    }, () => {});
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
    const saving = patchPatient(mutatePatients, pk, x => {
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
    // 다른 PC가 먼저 검사 지정을 했으면 바꾸지 않고 안내만
    const applied = (next) => Array.isArray(next) && next.find(x => patientKey(x) === pk)?.triageAssignedAt === at;
    const notice = (next) => { if (Array.isArray(next) && !applied(next)) showToast(`${p.name} 환자는 이미 다른 곳에서 검사 지정되었습니다 · 바꾸지 않았습니다`); };
    showToast(`${p.name} ${assignAtTreat(p) ? '검사 지정' : '추가 검사 확인'} 완료, ${pending.length ? (withTriage ? '검사 후 처치실 예진으로' : '검사 후 진료 대기로') : (withTriage ? '처치 대기에서 예진' : '진료 대기로')}`, () => patchPatient(mutatePatients, pk, x => (x.triageAssignedAt === at && !activeVf(x) && !x.triageDone ? { triageAssigned: false, triageAssignedAt: null, triageRequired: p.triageRequired } : {})));
    saving.then(notice, () => {});
  };

  const finishTriage = (p) => {
    const at = Date.now();
    const pk = patientKey(p);
    // 다른 PC가 먼저 예진 완료했으면 바꾸지 않고 안내만 (되돌리기도 그 예진 완료를 지우지 않게)
    patchPatient(mutatePatients, pk, x => needsTriageExam(x, settings) ? { triageDone: true, triageAt: at } : {}).then(next => {
      if (!Array.isArray(next)) return;
      if (next.find(x => patientKey(x) === pk)?.triageAt !== at) { showToast(`${p.name} 환자는 이미 예진 완료되었습니다`); return; }
      showToast(p.name + ' 예진 완료, 진료 대기로', () => patchPatient(mutatePatients, pk, x => (x.triageAt === at ? { triageDone: false, triageAt: null } : {})));
    }, () => {});
  };

  // 검사 준비 (예: FAG 동의서 · skin test): 시작 → 대기 시간 → 음성이면 검사실로, 양성이면 보류
  const prepList = [...work.prep].sort(order);
  // 결과 확인: 시행(시작)한 처치·검사 — 확인 시간이 있는 처치, 시작한 검사 준비·시간 재기 검사, 바로 넘어감(예: MMP) (10-10)
  const checkList = [...work.check].sort(order);
  // 시간 표시를 새로 그리고, 시간이 된 준비·확인이 새로 생기면 알림
  const [, setTick] = useState(0);
  const seenDue = useRef(null);
  const latest = useRef({});
  latest.current = { checkList, settings, showToast, patients };
  useEffect(() => {
    const check = () => {
      const { checkList, settings, showToast, patients } = latest.current;
      setTick(n => n + 1);
      const now = Date.now();
      const due = [];
      patients.forEach(p => sortedTests(settings).filter(t => isTimed(t) && p.assigned?.[t.id] && prepRunning(p, t)).forEach(t => { if (prepDue(prepOf(p, t), t, now)) due.push({ k: `${patientKey(p)}:${t.id}`, text: `${p.name} ${prepLabel(t)} 끝 · 확인해주세요` }); }));
      patients.filter(p => !p.consultDone).forEach(p => prepStartedTests(p, settings).forEach(t => { if (prepDue(prepOf(p, t), t, now)) due.push({ k: `${patientKey(p)}:${t.id}`, text: `${p.name} ${prepLabel(t)} 끝 · 확인해주세요` }); }));
      checkList.forEach(p => prepChecks(p, settings).forEach(t => { if (prepDue(prepOf(p, t), t, now)) due.push({ k: `${patientKey(p)}:${t.id}`, text: `${p.name} ${t.short || t.name} 확인할 시간` }); }));
      patients.filter(p => !p.consultDone).forEach(p => checkItems(p).forEach(c => { if (procCheckDue(c.i, now)) due.push({ k: `${patientKey(p)}:pchk:${c.i.uid}`, text: `${p.name} ${procLabel(c.i)} 확인할 시간` }); }));
      patients.filter(p => inResidentProcedure(p) && procDilatePending(p)).forEach(p => { if (dilationState(p, null, settings.dilationWaitMin, now).status === 'ready') due.push({ k: `${patientKey(p)}:dil`, text: `${p.name} 산동 완료 · ${pendingProcedures(p, 'resident').map(procLabel).join(', ')}` }); });
      const fresh = seenDue.current ? due.filter(d => !seenDue.current.has(d.k)) : [];
      seenDue.current = new Set(due.map(d => d.k));
      if (fresh.length) showToast(`시간 됨 · ${fresh.map(d => d.text).join(' · ')}`);
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);
  // 바로 넘어감: 시작하면 검사 완료로 두고(다음 검사·진료로 이동), 확인은 나중에
  // 시간 재는 검사·준비 버튼은 모두 서버의 최신 기록으로 다시 확인합니다: 다른 PC가 먼저 시작·확인·취소했으면 다시 적용하지 않고,
  // 되돌리기도 아직 이 버튼이 바꾼 그대로일 때만 (늦게 누른 [시작 취소]가 방금 한 확인을 지우지 않게)
  const prepNow = (x, t) => x.prep?.[t.id] || null;
  // 저장된 결과로 이 버튼이 들어갔는지 확인한 뒤 안내 (안 들어갔으면 '이미 다른 곳에서' 안내, 되돌리기 없음)
  const prepSave = (p, fn, applied, msg, undo) => patchPatient(mutatePatients, patientKey(p), fn).then(next => {
    const rec = Array.isArray(next) ? next.find(x => patientKey(x) === patientKey(p)) : null;
    if (!rec) return;
    if (applied(rec)) showToast(msg, undo);
    else showToast(`${p.name} 환자는 이미 다른 곳에서 처리되었습니다 · 바꾸지 않았습니다`);
  }, () => {});
  const cancelGo = (p, t) => {
    const pk = patientKey(p);
    const st = prepOf(p, t);
    const before = { prep: p.prep, done: p.done, doneAt: p.doneAt };
    prepSave(p, x => (prepNow(x, t)?.startedAt === st?.startedAt && !prepNow(x, t)?.checked
      ? { prep: { ...(x.prep || {}), [t.id]: null }, done: { ...x.done, [t.id]: false }, doneAt: { ...(x.doneAt || {}), [t.id]: null } } : {}),
    rec => !prepNow(rec, t), `${p.name} ${t.short || t.name} 시작 취소`,
    () => patchPatient(mutatePatients, pk, x => (!prepNow(x, t) ? restoreKeys(x, before, [t.id]) : {})));
  };
  const checkGo = (p, t) => {
    const pk = patientKey(p);
    const st = prepOf(p, t);
    const at = Date.now();
    prepSave(p, x => (prepNow(x, t)?.checked ? {} : { prep: { ...(x.prep || {}), [t.id]: { ...(prepNow(x, t) || st), checked: at } } }),
      rec => prepNow(rec, t)?.checked === at, `${p.name} ${t.short || t.name} 확인`,
      () => patchPatient(mutatePatients, pk, x => (prepNow(x, t)?.checked === at ? { prep: { ...(x.prep || {}), [t.id]: st } } : {})));
  };
  const confirmTimed = (p, t) => {
    const pk = patientKey(p);
    const at = Date.now();
    const before = { prep: p.prep, done: p.done, doneAt: p.doneAt };
    prepSave(p, x => (prepNow(x, t)?.startedAt && !prepNow(x, t).result ? prepConfirmPatch(x, t, settings, at) : {}),
      rec => prepNow(rec, t)?.at === at, `${p.name} ${t.short || t.name} 완료`,
      () => patchPatient(mutatePatients, pk, x => (prepNow(x, t)?.at === at ? restoreKeys(x, before, [t.id]) : {})));
  };
  // 같은 시작에 아직 결과가 없을 때만 시작 취소
  const sameRun = (st) => (cur) => !!cur?.startedAt && cur.startedAt === st?.startedAt && !cur.result;
  // 처치 후 검사 (10-07): [처치 완료] 옆 '검사 추가 후 완료' → 검사 고르기 창
  const [postFor, setPostFor] = useState(null); // { p, kind: 'pre' | 'resident', uid }
  const postIds = (sel) => allTests.filter(t => sel[t.id]).map(t => t.id);
  // [처치 완료] 되돌리기: 이 버튼이 시행·완료한 항목만 시행 전으로 (처치 후 검사는 아직 시작 전이면 원래대로)
  const unperform = (list, at) => (x) => ({
    [list]: (x[list] || []).map(i => (i.doneAt === at || (!i.done && i.performedAt === at) ? { ...i, done: false, doneAt: null, performedAt: undefined, checkMin: undefined } : i)),
  });
  const undoPost = (before, ids) => (x) => (ids.length ? { ...restoreKeys(x, before, ids), postTests: before.postTests } : {});
  // 진료 전 처치 (예: PRP, YAG): 처치 완료 후 검사가 있으면 검사실, 없으면 진료 대기로
  // 처치 후 확인 시간이 있는 처치(설정 > 처치)는 시행 시각만 적고 '확인 대기' (확인해야 끝남)
  const preProcList = [...work.preProc].sort(order);
  // uid: 그 줄의 처치 하나만 (10-10 사용자: 처치마다 따로 완료 — 예전에는 한 줄에 묶여 한 번에 완료)
  const finishPreProcs = (p, post = null, uid = null) => {
    const pk = patientKey(p);
    const at = Date.now();
    // 화면에 보이던 진료 전 처치 중 그 줄의 것만 (시행 전인 것, 교수님 담당은 진료실에서)
    const visible = notPerformed(preProcsLeft(p, 'resident'));
    const ids = new Set(visible.filter(i => !uid || i.uid === uid).map(i => i.uid));
    const tests = post ? postIds(post.sel) : [];
    const detail = post ? pickDetail(post.detail, post.sel, allTests) : {};
    const before = { assigned: p.assigned, done: p.done, doneAt: p.doneAt, detail: p.detail, postTests: p.postTests };
    // 서버 최신 값으로: 동의서를 켠 처치는 동의서 확인 뒤에만 (10-10 사용자: 막음)
    patchPatient(mutatePatients, pk, x => (consentMissing(settings, (x.preProcs || []).filter(i => ids.has(i.uid))).length ? {} : {
      preProcs: (x.preProcs || []).map(i => (ids.has(i.uid) ? performProcItem(i, settings, at) : i)),
      ...addPostTestsPatch(x, tests, detail),
    })).then(list => {
      const next = Array.isArray(list) ? list.find(x => patientKey(x) === pk) : null;
      if (!next) return;
      if (!(next.preProcs || []).some(i => i.performedAt === at || i.doneAt === at)) { showToast(`처치 완료 안 됨 · ${p.name} 환자는 동의서 확인 전이거나 이미 처리되었습니다`); return; }
      const waiting = checkItems(next).filter(c => c.list === 'preProcs' && c.i.performedAt === at);
      const rest = notPerformed(next.preProcs);
      showToast(waiting.length ? `${p.name} ${waiting.map(c => procLabel(c.i)).join(', ')} 시행 · ${waiting.map(c => `${c.i.checkMin}분`).join(', ')} 뒤 확인${rest.length ? ` · 남은 처치 ${rest.map(procLabel).join(', ')}` : ''}`
        : rest.length ? `${p.name} 처치 완료 · 남은 처치 ${rest.map(procLabel).join(', ')}`
          : `${p.name} 진료 전 처치 완료, ${pendingRooms(next, settings).length ? '검사실로' : '진료 대기로'}`, () => patchPatient(mutatePatients, pk, x => ({
        ...unperform('preProcs', at)(x), ...undoPost(before, tests)(x),
      })));
    }, () => {});
  };

  // 처치 완료: 화면에 보이던 처치만 완료 (그사이 다른 PC가 새로 보낸 처치는 하지 않은 것이므로 그대로 남김)
  // reconsult: '검사 · 재진료' 창의 [재진료] (진료 후 처치만, 10-07) — 같은 교수님 진료 대기로, 검사도 고르면 검사 뒤 (procReconsultPatch)
  const finishResident = (p, post = null, reconsult = false, uid = null) => {
    const pk = patientKey(p);
    const at = Date.now();
    const visible = new Set(notPerformed(pendingProcedures(p, 'resident')).map(i => i.uid));
    const shown = notPerformed(pendingProcedures(p, 'resident')).filter(i => !uid || i.uid === uid);
    const ids = new Set(shown.map(i => i.uid));
    const tests = post ? postIds(post.sel) : [];
    const detail = post ? pickDetail(post.detail, post.sel, allTests) : {};
    const before = { assigned: p.assigned, done: p.done, doneAt: p.doneAt, detail: p.detail, postTests: p.postTests };
    patchPatient(mutatePatients, pk, x => (x.consultDone || (reconsult && !x.seen) || consentMissing(settings, (x.procedures || []).filter(i => ids.has(i.uid))).length ? {} : {
      procedures: (x.procedures || []).map(i => (ids.has(i.uid) ? performProcItem(i, settings, at) : i)),
      ...addPostTestsPatch(x, tests, detail),
      ...(reconsult ? procReconsultPatch(x, shown.map(procLabel).join(', '), at) : {}),
    })).then(next => {
      const rec = Array.isArray(next) ? next.find(x => patientKey(x) === pk) : null;
      if (!rec) return;
      if (!(rec.procedures || []).some(i => i.performedAt === at || i.doneAt === at)) { showToast(`처치 완료 안 됨 · ${p.name} 환자는 동의서 확인 전이거나 이미 처리되었습니다`); return; }
      const left = notPerformed(pendingProcedures(rec, 'resident'));
      const waiting = checkItems(rec).filter(c => c.list === 'procedures' && c.i.performedAt === at);
      // 재진료 되돌리기는 아직 그대로(진료 호출 전)일 때만 통째로 — 이미 불렀으면 처치 기록도 그대로
      const undo = () => patchPatient(mutatePatients, pk, x => (reconsult && !undoProcReconsultPatch(x, at).seen ? {}
        : { ...unperform('procedures', at)(x), ...undoPost(before, tests)(x), ...(reconsult ? undoProcReconsultPatch(x, at) : {}) }));
      if (reconsult) {
        if (rec.procReconsult?.at !== at) { showToast(`재진료 안 됨 · ${p.name} 환자는 그사이 다른 곳에서 처리되었습니다`); return; }
        showToast(`${p.name} ${shown.map(procLabel).join(', ')} ${waiting.length ? '시행' : '완료'}, ${tests.length ? '검사 후 ' : ''}진료 대기로 (재진료)`, undo);
        return;
      }
      // 그사이 새로 들어온 처치(화면에 없던 것)와 같은 카드의 다른 처치(아직 안 누른 것)를 나눠 안내
      const fresh = left.filter(i => !visible.has(i.uid));
      const rest = left.filter(i => visible.has(i.uid));
      const restNote = rest.length ? ` · 남은 처치 ${rest.map(procLabel).join(', ')}` : '';
      showToast(fresh.length ? `${p.name} 처치 완료 · 새로 들어온 처치가 남아 있습니다: ${fresh.map(procLabel).join(', ')}`
        : waiting.length ? `${p.name} ${waiting.map(c => procLabel(c.i)).join(', ')} 시행 · ${waiting.map(c => `${c.i.checkMin}분`).join(', ')} 뒤 확인${restNote}`
          : rest.length ? `${p.name} ${shown.map(procLabel).join(', ')} 처치 완료${restNote}`
            : `${p.name} 처치 완료, ${tests.length ? '검사실로' : rec.explainedEarly ? '진찰실에서 귀가 처리' : '설명 대기로'}`, undo);
    }, () => {});
  };

  // 최근 완료 되돌리기: 예진은 그 예진 완료 그대로일 때만, 처치는 가장 최근에 함께 완료한 처치만 (이미 귀가한 환자는 그대로 — 되돌려도 어디에도 안 보임)
  const undoRecent = ({ p, kind, at }) => {
    const pk = patientKey(p);
    if (kind === 'triage') {
      patchPatient(mutatePatients, pk, x => (x.triageAt === p.triageAt ? { triageDone: false, triageAt: null } : {}));
    } else {
      if (p.consultDone) { showToast(`${p.name} 환자는 이미 귀가 처리되었습니다 · 진료실 '방금 완료한 환자'에서 설명 완료 취소 후 다시 해 주세요`); return; }
      patchPatient(mutatePatients, pk, x => (x.consultDone ? {} : {
        procedures: (x.procedures || []).map(i => (i.performer === 'resident' && i.done && i.doneAt === at ? { ...i, done: false, doneAt: null } : i)),
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
    { id: 'treat-check', label: '결과 확인', list: checkList, due: checkList.filter(p => treatCheckDue(p, settings, now)).length },
    { id: 'treat-preproc', label: '진료 전 처치', list: preProcList, stale: preProcList.filter(staleOf).length },
    { id: 'treat-prep', label: '검사 준비', list: prepList,
      due: prepList.filter(p => prepPendingTests(p, settings).some(t => prepDue(prepOf(p, t), t, now))).length,
      stale: prepList.filter(p => !prepStarted(p) && staleOf(p)).length },
    ...(treatTests.length ? [{ id: 'treat-exams', label: '진료 전 검사', list: examList,
      due: examList.filter(p => treatTests.some(t => isTimed(t) && p.assigned?.[t.id] && prepRunning(p, t) && prepDue(prepOf(p, t), t, now))).length,
      stale: examList.filter(p => !activeVf(p) && !timedRunning(p) && staleOf(p)).length }] : []),
    { id: 'treat-request', label: '요청', list: requests, stale: requests.filter(staleOf).length },
    { id: 'treat-triage', label: '검사 지정', list: triage, stale: triage.filter(staleOf).length },
    { id: 'treat-procs', label: '처치 대기', list: procs, stale: procs.filter(staleOf).length },
  ];
  // ── 카드 할 일 줄 도우미 (10-10) ──
  // 동의서를 켠 처치가 확인 전이면 [처치 완료]·'검사 추가 후 완료'를 막음 (10-10 사용자)
  const noConsent = (items) => consentMissing(settings, items).length > 0;
  const procNames = (list) => (list || []).map(x => `${procLabel(x)}${x.note ? ` · ${x.note}` : ''}`).join(', ');
  const minsLeft = (start, min, at) => Math.max(0, Math.ceil((start + min * 60000 - at) / 60000));
  // [끝 · 확인] 방식 시간 재기(예: Schirmer) 시작 취소: 같은 시작에 결과 전일 때만
  const cancelTimed = (p, t) => {
    const pk = patientKey(p);
    const st = prepOf(p, t);
    const before = { prep: p.prep, done: p.done, doneAt: p.doneAt };
    prepSave(p, x => (sameRun(st)(prepNow(x, t)) ? prepCancelPatch(x, t) : {}), rec => !prepNow(rec, t), `${p.name} ${prepLabel(t)} 시작 취소`,
      () => patchPatient(mutatePatients, pk, x => (!prepNow(x, t) ? restoreKeys(x, before, [t.id]) : {})));
  };
  // 검사 준비 버튼 (시작 전 · 진행 중 · 시간 됨) — 검사 준비 칸과 결과 확인 칸, 진료실이 같이 씀 (common.jsx PrepButtons)
  const prepButtons = (p, t) => <PrepButtons p={p} t={t} mutatePatients={mutatePatients} onToast={showToast} />;
  // 결과 확인 칸의 줄들: 시행한 처치(확인 시간) · 시작한 시간 재기 검사 · 시작한 검사 준비 · 바로 넘어감 검사. 시간 된 것 먼저
  const checkLines = (p) => {
    const at = Date.now();
    const lines = [];
    // 표는 상태만: 시간 전 '확인 대기', 시간이 되면 '시간 됨' (버튼 글자 '확인'과 겹치지 않게 — 10-10 사용자)
    const head = (due) => (due ? { tag: '시간 됨', tone: 'violet' } : { tag: '확인 대기', tone: 'slate' });
    if (!p.consultDone) checkItems(p).forEach(c => {
      const due = procCheckDue(c.i, at);
      const mins = Math.floor((at - c.i.performedAt) / 60000);
      lines.push({ due, key: `pc-${c.i.uid}`, node: (
        <TaskLine key={`pc-${c.i.uid}`} {...head(due)} what={procLabel(c.i)}
          small={`${c.i.performer === 'prof' ? '교수님 · ' : ''}${fmtClock(c.i.performedAt)} 시행 · ${due ? `${mins}분 지남` : `${minsLeft(c.i.performedAt, Number(c.i.checkMin) || 0, at)}분 남음`}`}>
          <ProcCheckRow p={p} mutatePatients={mutatePatients} filter={x => x.list === c.list && x.i.uid === c.i.uid} onReconsult={cc => checkAndReconsult(p, cc)} onToast={showToast} />
        </TaskLine>
      ) });
    });
    if (!p.consultDone) treatTimedRunning(p, settings).forEach(t => {
      const st = prepOf(p, t);
      const due = prepDue(st, t, at);
      lines.push({ due, key: `tm-${t.id}`, node: (
        <TaskLine key={`tm-${t.id}`} {...head(due)} what={t.short || t.name} small={`${fmtClock(st.startedAt)} 시작${due ? '' : ` · ${minsLeft(st.startedAt, prepWaitMin(t), at)}분 남음`}`}>
          {due ? <button type="button" onClick={() => confirmTimed(p, t)} title="누르면 검사 완료" className="text-sm px-4 py-2 rounded-lg bg-green-600 text-white font-medium">끝 · 확인</button> : <>
            <button type="button" onClick={() => cancelTimed(p, t)} className="text-xs text-slate-400 hover:text-rose-600 underline">시작 취소</button>
            <button type="button" onClick={() => confirmTimed(p, t)} title="시간 전이지만 지금 완료로 처리" className="text-sm px-4 py-2 rounded-lg border border-green-400 bg-white text-green-700 font-medium">지금 확인</button>
          </>}
        </TaskLine>
      ) });
    });
    if (!p.consultDone) prepStartedTests(p, settings).forEach(t => {
      const st = prepOf(p, t);
      const due = prepDue(st, t, at);
      lines.push({ due, key: `pr-${t.id}`, node: (
        <TaskLine key={`pr-${t.id}`} {...head(due)} what={prepWhat(t)} small={`${fmtClock(st.startedAt)} 시작${due ? '' : ` · ${minsLeft(st.startedAt, prepWaitMin(t), at)}분 남음`}`}>{prepButtons(p, t)}</TaskLine>
      ) });
    });
    prepChecks(p, settings).forEach(t => {
      const st = prepOf(p, t);
      const due = prepDue(st, t, at);
      lines.push({ due, key: `go-${t.id}`, node: (
        <TaskLine key={`go-${t.id}`} {...head(due)} what={t.short || t.name} small={`${fmtClock(st.startedAt)} 시작${due ? '' : ` · ${minsLeft(st.startedAt, prepWaitMin(t), at)}분 남음`}`}>
          {due ? <button type="button" onClick={() => checkGo(p, t)} className="text-sm px-4 py-2 rounded-lg bg-green-600 text-white font-medium">확인</button> : <>
            <button type="button" onClick={() => cancelGo(p, t)} className="text-xs text-slate-400 hover:text-rose-600 underline">시작 취소</button>
            <button type="button" onClick={() => checkGo(p, t)} title="시간 전이지만 지금 확인" className="text-sm px-4 py-2 rounded-lg border border-green-400 bg-white text-green-700 font-medium">지금 확인</button>
          </>}
        </TaskLine>
      ) });
    });
    return [...lines.filter(l => l.due), ...lines.filter(l => !l.due)];
  };
  const summaryBar = <SummaryBar label="처치실 할 일 요약" staleMin={staleMinOf(settings)} items={summary.map(x => ({ ...x, n: x.list.length }))} />;

  return (
    <ScreenShell title={treatRoomOf(settings).name} color="indigo" onBack={onBack} lastSync={lastSync} sub={summaryBar} extra={<ChimeControl />} count={requests.length + triage.length + procs.length + preProcList.length + prepList.length + checkList.length + examList.length}>
      {checkList.length > 0 && (
        <div id="treat-check" className="mb-8 scroll-mt-36">
          <SectionTitle hint="시행(시작)한 처치·검사는 대기 칸에서 빠지고 여기서 확인합니다. 시간이 되면 띵동과 함께 [확인]이 됩니다.">결과 확인 · {checkList.length}명</SectionTitle>
          {checkList.map(p => (
            <SimpleCard key={patientKey(p)} p={p} tone="violet">
              {checkLines(p).map(l => l.node)}
            </SimpleCard>
          ))}
        </div>
      )}
      {preProcList.length > 0 && (
        <div id="treat-preproc" className="mb-8 scroll-mt-36">
          <SectionTitle hint="시력검사 없이 처치부터 하러 온 환자입니다 (예: PRP, YAG). 처치가 끝나면 검사가 있으면 검사실, 없으면 진료 대기로 갑니다.">진료 전 처치 · {preProcList.length}명</SectionTitle>
          {preProcList.map(p => {
            const after = sortedTests(settings).filter(t => p.assigned?.[t.id] && !p.done?.[t.id]);
            return (
            <SimpleCard key={patientKey(p)} p={p} tone="rose" stale={staleOf(p)}>
              {/* 처치마다 한 줄 · 각자 [처치 완료] (10-10 사용자). 산동 점안 버튼은 첫 줄에만 */}
              {notPerformed(preProcsLeft(p, 'resident')).map((i, idx) => (
                <TaskLine key={i.uid} tag="진료 전 처치" tone="rose" what={procNames([i])} small={i.fromRequest ? `${i.fromRequest} 요청` : ''}>
                  {idx === 0 && <DilationRow compact group crStatusOnly p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />}
                  <button type="button" disabled={noConsent([i])} onClick={() => setPostFor({ p, kind: 'pre', uid: i.uid })} title="처치를 완료하고 검사(예: 그 눈 WFP)를 넣습니다" className="text-xs text-slate-500 hover:text-slate-800 underline disabled:text-slate-300 disabled:no-underline">검사 추가 후 완료</button>
                  <ConsentChips p={p} list="preProcs" items={[i]} settings={settings} mutatePatients={mutatePatients} />
                  <button type="button" disabled={noConsent([i])} title={noConsent([i]) ? CONSENT_TITLE : undefined} onClick={() => finishPreProcs(p, null, i.uid)} className="text-sm px-4 py-2 rounded-lg bg-rose-600 text-white font-medium disabled:bg-slate-200 disabled:text-slate-400">처치 완료</button>
                </TaskLine>
              ))}
              {/* 교수님 처치는 동의서만 처치실에서 (같은 줄 모양, 버튼은 [동의서 전]만) → 받으면 진료실 '진료 전 처치' 칸으로 (10-10 사용자) */}
              {profConsentPending(settings, p.preProcs).map(i => (
                <TaskLine key={i.uid} tag="진료 전 처치" tone="rose" what={procNames([i])} small="교수님 · 진료실">
                  <ConsentChips p={p} list="preProcs" items={[i]} settings={settings} mutatePatients={mutatePatients} />
                </TaskLine>
              ))}
              {after.length > 0 && <RefLine><RefItem k="처치 후 검사">{after.map(t => t.short || t.name).join(', ')}</RefItem></RefLine>}
            </SimpleCard>
            );
          })}
        </div>
      )}
      {prepList.length > 0 && (
        <div id="treat-prep" className="mb-8 scroll-mt-36">
          <SectionTitle hint="처치실에서 시간을 재는 검사·준비입니다 (예: FAG skin test). 시작하면 '결과 확인'으로 옮겨 가고, 정한 시간이 되면 초록 [끝 · 확인]으로 바뀝니다.">검사 준비 · {prepList.length}명</SectionTitle>
          {prepList.map(p => (
            <SimpleCard key={patientKey(p)} p={p} tone="violet" stale={staleOf(p)}>
              {treatPrepTodo(p, settings).map(t => (prepAtConsult(t)
                // 진료실에서 하는 검사 준비(예: FAG skin test, 10-10): 처치실은 동의서만 → 확인하면 진료실 '진료 전 처치' 칸으로
                ? <TaskLine key={t.id} tag="검사 준비" tone="violet" what={prepWhat(t)} small="진료실"><TestConsentChip p={p} t={t} mutatePatients={mutatePatients} /></TaskLine>
                : <TaskLine key={t.id} tag="검사 준비" tone="violet" what={prepWhat(t)} small={`${prepWaitMin(t)}분`}>{prepButtons(p, t)}</TaskLine>
              ))}
              {/* 처치실이 전체를 조율: 여기서도 오늘 검사 바꾸기 */}
              <RefLine>
                <TestPicker p={p} tests={orderForPicking(allTests, settings)} mainIds={mainTestIds(doctorPrefs, p.doctor)} onPick={(t, on) => testEdit.pickTest(p, t, on)} onSpecial={(t) => testEdit.openSpecial(p, t)}>
                  <DilationRow togglesOnly inline p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
                </TestPicker>
              </RefLine>
            </SimpleCard>
          ))}
        </div>
      )}
      {/* 진료 전 검사 (설정에서 처치실에 둔 검사, 예: Syringing) — 검사실 화면과 같은 카드 */}
      {roomTests(settings, treatRoomOf(settings).id).length > 0 && (
        <div id="treat-exams" className="scroll-mt-36"><StationView embedded mode={treatRoomOf(settings).id} settings={settings} doctorPrefs={doctorPrefs} patients={patients}
          history={history} mutatePatients={mutatePatients} onBack={onBack} lastSync={lastSync} /></div>
      )}
      <div className="flex justify-end mb-3">
        <SegmentedToggle value={sortMode} onChange={changeSort} options={SORT_OPTIONS} />
      </div>
      {requests.length > 0 && (
        <div id="treat-request" className="mb-8 scroll-mt-36">
          <SectionTitle hint="진료실·검사실에서 확인을 요청한 환자입니다. 메모를 확인하고, 필요하면 처치(예: 만니톨)나 검사를 넣으세요.">요청 확인 (진료실 · 검사실) · {requests.length}명</SectionTitle>
          {requests.map(p => {
            // 메모가 '온 이유' → 할 일 줄에 노란 굵은 글씨 (검사실 요청은 요청에 적은 메모, 진료실 요청은 진료실 메모)
            const asked = examAsked(p);
            const note = asked ? p.treatRequest.note : p.sendNote?.text;
            return (
            <SimpleCard key={patientKey(p)} p={p} tone="amber" stale={staleOf(p)} hideNote>
              <TaskLine tag={treatRequestFrom(p)} tone="amber"
                what={note ? <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-yellow-900">{note}</span> : '확인 요청'}
                small={!asked && note ? (p.sendNote.from || '진료실') : ''} />
              <div className="w-full flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setAddFor(p)} className="text-sm px-4 py-2 rounded-lg bg-rose-600 text-white font-medium">처치 추가</button>
                {asked ? (
                  <button type="button" onClick={() => finishRequest(p)} className="text-sm px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 font-medium">확인 · 검사실로</button>
                ) : <>
                  <button type="button" onClick={() => setReqFor(p)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">검사 추가</button>
                  <button type="button" onClick={() => finishRequest(p, [], {}, { vision: true })} className="text-sm px-4 py-2 rounded-lg border border-blue-300 text-blue-700 font-medium">시력/안압 다시</button>
                  <button type="button" onClick={() => finishRequest(p, [], {}, { triage: true })} className="text-sm px-4 py-2 rounded-lg border border-sky-300 text-sky-700 font-medium">예진 추가</button>
                  <button type="button" onClick={() => finishRequest(p)} className="text-sm px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 font-medium">확인 완료 · 진료 대기로</button>
                </>}
              </div>
              <RefLine detail={<CardDetail p={p} history={history} tests={allTests} />}>
                <MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" />
                <TestsRef p={p} tests={allTests} done />
              </RefLine>
            </SimpleCard>
            );
          })}
        </div>
      )}
      <div id="treat-triage" className={`${triage.length ? 'mb-8' : 'mb-4'} scroll-mt-36`}>
        <SectionTitle muted={triage.length === 0} hint="초진은 오늘 할 검사와 예진 여부를, 2차 진료는 다음 교수님 진료 전에 추가할 검사를 지정하세요.">
          검사 지정 대기 (초진 · History · 2차 진료) · {triage.length}명
        </SectionTitle>
        {triage.map(p => (
          <SimpleCard key={patientKey(p)} p={p} tone="sky" stale={staleOf(p)}>
            <TaskLine tag={assignAtTreat(p) ? '검사 지정' : '추가 검사 확인'} tone="sky"
              what={p.primaryKey ? '2차 진료' : p.firstVisit ? '초진' : p.hxAssign ? 'History' : '추가 검사 확인'}
              small={[hxPending(p) ? 'History 미입력' : '', p.primaryKey ? `${p.primaryDoctor || '1차'} 진료 후 → ${p.doctor}` : ''].filter(Boolean).join(' · ')}>
              <HistoryDetail p={p} button />
              <button type="button" onClick={() => setTriageFor(p)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">
                {assignAtTreat(p) ? '검사 지정' : '추가 검사 확인'}
              </button>
            </TaskLine>
            <RefLine detail={<CardDetail p={p} history={history} tests={allTests} />}>
              <MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" />
              <HxRef p={p} />
              <TestsRef p={p} tests={allTests} />
              <DilationRow group crStatusOnly p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />
            </RefLine>
          </SimpleCard>
        ))}
      </div>

      <div id="treat-procs" className="scroll-mt-36">
        <SectionTitle muted={procs.length === 0} hint="검사를 마친 초진 환자의 예진과 전공의 처치를 진행합니다.">처치 대기 · {procs.length}명</SectionTitle>
        {procs.map(p => {
          const triageNow = needsTriageExam(p, settings);
          const res = inResidentProcedure(p) ? notPerformed(pendingProcedures(p, 'resident')) : [];
          // 교수님 처치 중 동의서 전인 것은 이 카드에서 동의서만 받음 (받으면 설명 대기 카드에서 [처치 완료] — 10-10 사용자)
          const profConsent = p.consultDone ? [] : profConsentPending(settings, p.procedures);
          const prof = pendingProcedures(p, 'prof').filter(i => !profConsent.includes(i));
          const dil = <DilationRow compact group crStatusOnly p={p} prefs={doctorPrefs} waitMin={waitMin} mutatePatients={mutatePatients} />;
          return (
          <SimpleCard key={patientKey(p)} p={p} tone="indigo" stale={staleOf(p)}
            badges={p.explainedEarly && inResidentProcedure(p) && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-semibold border border-emerald-600">설명 완료 · 처치 후 귀가</span>}>
            {triageNow && (
              <TaskLine tag="예진" tone="indigo" what={assignAtTreat(p) ? '초진 예진' : '예진'} small="검사 끝남">
                {!res.length && dil}
                <HistoryDetail p={p} button />
                <button type="button" onClick={() => finishTriage(p)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">예진 완료</button>
              </TaskLine>
            )}
            {/* 처치마다 한 줄 · 각자 [처치 완료] (10-10 사용자: 처치 두 개가 한 번에 완료되던 문제). 산동 점안 버튼은 첫 줄에만 */}
            {res.map((i, idx) => (
              <TaskLine key={i.uid} tag="처치" tone="indigo" what={procNames([i])} small="전공의">
                {idx === 0 && dil}
                <button type="button" disabled={noConsent([i])} onClick={() => setPostFor({ p, kind: 'resident', uid: i.uid })} title={p.seen ? '처치를 완료하고 재진료(같은 교수님 진료 대기)나 검사(예: 그 눈 WFP)를 고릅니다' : '처치를 완료하고 검사(예: 그 눈 WFP)를 넣습니다'} className="text-xs text-slate-500 hover:text-slate-800 underline disabled:text-slate-300 disabled:no-underline">{p.seen ? '검사 · 재진료' : '검사 추가 후 완료'}</button>
                <ConsentChips p={p} list="procedures" items={[i]} settings={settings} mutatePatients={mutatePatients} />
                <button type="button" disabled={noConsent([i])} title={noConsent([i]) ? CONSENT_TITLE : undefined} onClick={() => finishResident(p, null, false, i.uid)} className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium disabled:bg-slate-200 disabled:text-slate-400">처치 완료</button>
              </TaskLine>
            ))}
            {profConsent.map(i => (
              <TaskLine key={i.uid} tag="처치" tone="indigo" what={procNames([i])} small="교수님 · 진료실">
                <ConsentChips p={p} list="procedures" items={[i]} settings={settings} mutatePatients={mutatePatients} />
              </TaskLine>
            ))}
            {(triageNow || prof.length > 0 || res.length > 0) && (
              <RefLine detail={triageNow ? <CardDetail p={p} history={history} tests={allTests} /> : null}>
                {triageNow && <HxRef p={p} />}
                {triageNow && <MeasureLine label="오늘" m={p.measure} emptyText="측정값 없음" />}
                {triageNow && <TestsRef p={p} tests={allTests} />}
                {prof.length > 0 && <RefItem k="교수님 처치도 남음">{prof.map(procLabel).join(', ')}</RefItem>}
                {res.map(x => (
                  <TwoStepButton key={x.uid} onConfirm={() => cancelProcedure(mutatePatients, patientKey(p), x.uid)} className="text-xs text-rose-600 underline" armedClassName="text-xs px-2 py-0.5 rounded border border-rose-500 bg-rose-50 text-rose-700 font-medium">
                    {res.length > 1 ? `${procLabel(x)} 취소` : '처치 취소'}
                  </TwoStepButton>
                ))}
              </RefLine>
            )}
          </SimpleCard>
          );
        })}
      </div>

      <RecentDone count={recent.length}>
        {recent.map(r => (
          <RecentRow key={`${patientKey(r.p)}-${r.kind}`} p={r.p} time={fmtClock(r.at)}>
            <UndoButton label={r.kind === 'triage' ? '예진 완료 취소' : '처치 완료 취소'} onClick={() => undoRecent(r)} />
          </RecentRow>
        ))}
      </RecentDone>

      {postFor && (
        <PostTestModal p={postFor.p} tests={allTests} settings={settings} mainIds={mainTestIds(doctorPrefs, postFor.p.doctor)}
          items={(postFor.kind === 'pre' ? notPerformed(preProcsLeft(postFor.p, 'resident')) : notPerformed(pendingProcedures(postFor.p, 'resident'))).filter(i => !postFor.uid || i.uid === postFor.uid)}
          reconsultOption={postFor.kind === 'resident' && !!postFor.p.seen}
          onConfirm={(sel, detail, recon) => { const { p, kind, uid } = postFor; setPostFor(null); if (kind === 'pre') finishPreProcs(p, { sel, detail }, uid); else finishResident(p, { sel, detail }, recon, uid); }}
          onCancel={() => setPostFor(null)} />
      )}
      {addFor && (
        <ProcedureModal addMode key={`add-${patientKey(addFor)}`} patient={addFor} procedures={settings.procedures || []}
          onConfirm={(chosen) => addProcedures(chosen)} onCancel={() => setAddFor(null)} />
      )}
      {reqFor && (
        <TestCheckModal
          key={`req-${patientKey(reqFor)}`}
          mainIds={mainTestIds(doctorPrefs, reqFor.doctor)}
          title={`${reqFor.name}님 추가 검사`}
          subtitle={reqFor.sendNote?.text ? `진료실 메모: ${reqFor.sendNote.text}` : ''}
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
          subtitle={assignAtTreat(triageFor) ? '' : `${triageFor.primaryDoctor || '1차'} 진료 후${allTests.some(t => triageFor.done?.[t.id]) ? ` · 오늘 한 검사: ${allTests.filter(t => triageFor.done?.[t.id]).map(t => t.short || t.name).join(', ')}` : ''}`}
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
  const [v, setV] = useState({ id: patient.id || '', name: patient.name || '', reservation: patient.reservation || '', sex: patient.sex === 'M' || patient.sex === 'F' ? patient.sex : '', age: Number.isInteger(patient.age) ? String(patient.age) : '' });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-slate-900 mb-1">{patient.name}님 정보 수정</h3>
        <p className="text-sm text-slate-500 mb-4">이름·환자번호·성별·나이는 같은 날 이 환자의 모든 진료에 함께 바뀝니다. 이미 접수한 환자는 예약시간을 바꿔도 대기 순서는 그대로입니다.</p>
        <div className="space-y-3">
          <Field label="이름"><input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} className={INPUT} /></Field>
          <Field label="환자번호"><input value={v.id} onChange={e => setV({ ...v, id: e.target.value })} className={INPUT} /></Field>
          <Field label="예약시간 (예: 09:30)"><input value={v.reservation} onChange={e => setV({ ...v, reservation: e.target.value })} className={INPUT} /></Field>
          {/* 성별·나이 (비워도 됨) — 직원 화면 이름 옆 'M/80' */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="성별">
              <select aria-label="성별" value={v.sex} onChange={e => setV({ ...v, sex: e.target.value })} className={INPUT}>
                <option value="">비워 둠</option>
                <option value="M">남 (M)</option>
                <option value="F">여 (F)</option>
              </select>
            </Field>
            <Field label="나이 (예: 80, 11세5개월)"><input aria-label="나이" value={v.age} onChange={e => setV({ ...v, age: e.target.value })} className={INPUT} /></Field>
          </div>
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
      {stats && result.noSexAge && <div className="text-xs text-slate-500">엑셀에 '성별'·'나이' 칸이 없어 성별/나이(예: M/80)는 표시하지 않습니다.</div>}
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

// 참고 줄의 오늘 검사 (done: 한 검사만 '오늘 한 검사'). NCT를 잰 환자는 NCT도
function TestsRef({ p, tests, done = false }) {
  const list = tests.filter(t => t.id !== VISION_KEY && p.assigned?.[t.id] && (!done || p.done?.[t.id]));
  const names = [...(nctMeasured(p) ? ['NCT'] : []), ...list.map(t => `${testLabelWithOptions(t, p.detail?.[t.id])}${!done && !p.done?.[t.id] ? '(남음)' : ''}`)];
  if (!names.length) return null;
  return <RefItem k={done ? '오늘 한 검사' : '오늘 검사'}>{names.join(', ')}</RefItem>;
}
