// 시력방·검사실 화면
import React, { useState, useEffect } from 'react';
import { Check, Search, RotateCcw } from 'lucide-react';
import { hxNeeded, nctNeeded, GAT_ID, VISION_KEY, VISION_TEST, activeVf, applyCheckin, assignAtTreat, byQueue, dropDue, fmtClock, groupPending, hasAnyValue, hasFieldValue, hasIop, machineGroups, mergeHistoryEntry, moveInQueue, normalizeMeasure, notesOf, orderForPicking, orderState, orderedTests, patchPatient, patientKey, pendingTests, pickDetail, prepBlocked, prepOf, prepPositive, previousMeasure, remainingTests, roomColor, roomTests, sortedTests, testLabelWithOptions, timeToMin, undoCheckin, updateVf, visionTasksLeft, mainTestIds, prepHolding, treatRoomOf, startStopTest, prepLabel, isTimed, prepStartPatch, prepConfirmPatch, prepCancelPatch, prepGoMode, prepDue, prepWaitMin, withoutPrep, prepRunning, staleMinutes, visionWaiting, roomWaiting, examRooms, earliestExamPatient } from '../core/flow.jsx';
import { visionNames } from '../core/storage.jsx';
import { PrevVisionBox, DilationRow, DoctorChip, DraggableList, EmptyState, FilterChip, InfoChip, KioskNoteLine, LateChip, MeasureLine, MeasureModal, PatientMemo, PatientRow, RecentDone, RecentRow, SESSION_OPTIONS, SORT_OPTIONS, ScreenShell, SegmentedToggle, TEST_TILE, TestDetailModal, TestPicker, TestToggle, UndoButton, byName, inSession, useSortMode, useUndoToast } from '../ui/common.jsx';
import { SectionTitle } from './ConsultView.jsx';
import { ChimeControl, useChime } from '../ui/chime.jsx';

/* ------------------------------------------------------------------ */
/* 검사실 화면 (시력/안압 + 설정된 검사실 공용)                           */
/* ------------------------------------------------------------------ */
// 보고 있던 검사실이 설정에서 삭제되면 안내만 보여줍니다.
// (이 확인을 화면 본체 밖에 두어야, 화면 도중에 검사실이 사라져도 React 훅 순서가 바뀌어 흰 화면으로 멈추지 않습니다)
export function StationView(props) {
  const { mode, settings, onBack, lastSync } = props;
  if (mode !== 'vision' && !settings.rooms.some(r => r.id === mode)) {
    return (
      <ScreenShell title="검사실" color="slate" onBack={onBack} lastSync={lastSync}>
        <EmptyState text="이 검사실은 설정에서 삭제되었습니다. 메인 화면을 눌러 다시 선택해주세요." />
      </ScreenShell>
    );
  }
  return <StationScreen {...props} />;
}

// 시력방: [오늘 검사 ▾]를 누르면 오늘 지정된 검사(보기만)와 시력방 검사 바꾸기가 펼쳐짐
function VisionTodayTests({ p, tests, children }) {
  const [open, setOpen] = useState(false);
  const list = tests.filter(t => t.id !== VISION_KEY && p.assigned?.[t.id]);
  return <>
    <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="text-xs text-slate-500 hover:text-slate-800 underline">오늘 검사 {list.length}{open ? ' ▴' : ' ▾'}</button>
    {open && (
      <div className="order-last w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-1.5">
        <div className="text-sm text-slate-700"><span className="text-xs text-slate-400 mr-2">오늘 검사</span>{list.length ? list.map(t => testLabelWithOptions(t, p.detail?.[t.id])).join(', ') : '없음'}</div>
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      </div>
    )}
  </>;
}

function StationScreen({ mode, settings, doctorPrefs, patients, history, mutatePatients, mutateHistoryEntry, onBack, lastSync, embedded = false }) {
  const [filter, setFilter] = useState('all');
  const [sortMode, changeSort] = useSortMode(mode === 'vision' ? 'sort-vision' : `sort-room-${mode}`);
  const nameSort = sortMode === 'name';
  const [session, setSession] = useState('all');
  const [query, setQuery] = useState('');
  const [measureFor, setMeasureFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [toastNode, showToast] = useUndoToast();
  // 시간 재는 칸(예: Schirmer)이 정한 시간이 되면 초록으로 바뀌도록 가끔 다시 그림
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(n => n + 1), 15000); return () => clearInterval(i); }, []);
  const isVision = mode === 'vision';
  const room = isVision ? null : settings.rooms.find(r => r.id === mode);

  const color = isVision ? 'blue' : roomColor(settings, room.id);
  const title = isVision ? visionNames(settings).name : room.name;
  const tests = isVision ? [VISION_TEST, ...roomTests(settings, 'vision')] : roomTests(settings, room.id);
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
      if (!on) return { orders: {} };
      // 모든 검사실의 지정된 검사를 한 번에 처방 완료로
      const ids = sortedTests(settings).filter(t => x.assigned?.[t.id]).map(t => t.id);
      return { orders: { all: { at, tests: [...new Set([...orderedTests(x), ...ids])] } } };
    });
    showToast(`${p.name} ${on ? '처방 완료' : '처방 완료 취소'}`, () => patchPatient(mutatePatients, pk, () => ({ orders: before })));
  };

  const q = query.trim();
  const notCheckedIn = isVision
    ? patients.filter(p => !p.consultDone && !p.checkin && inSession(p, session) && (!q || (p.name || '').includes(q) || String(p.id).includes(q))).sort(nameSort ? byName : byQueue)
    : [];
  const roomList = (isVision ? visionWaiting(patients) : roomWaiting(patients, settings, room.id)).sort(byQueue);
  // 검사실 묶음(시력방·처치실을 뺀 모든 검사실): 윗줄에 같은 묶음의 다른 검사실 대기도 '보기만'으로, 띵동도 묶음 전체
  const isExamRoom = !isVision && room.builtin !== 'treat' && !embedded;
  const groupRooms = isExamRoom ? examRooms(settings) : [];
  const groupLists = Object.fromEntries(groupRooms.map(r => [r.id, r.id === room.id ? roomList : roomWaiting(patients, settings, r.id)]));
  // 대기 순서가 가장 빠른 환자(지금 검사 중인 환자 제외)가 기다리는 검사 칩에 빨간 점 → 어느 검사도 소외되지 않게
  const earliest = isExamRoom ? earliestExamPatient(patients, settings) : null;
  const dotFor = (roomId, g) => !!earliest && pendingTests(earliest, settings, roomId).some(t => g.tests.some(x => x.id === t.id));
  const dotTitle = earliest ? `대기 순서가 가장 빠른 환자: ${earliest.name} (예약 ${earliest.reservation || '-'})` : '';
  // 띵동: 시력방은 새 접수, 검사실은 묶음 안 어느 검사실이든 대기 명단에 새 환자
  useChime(isVision ? roomList.map(patientKey) : groupRooms.flatMap(r => groupLists[r.id].map(p => `${r.id}:${patientKey(p)}`)),
    { ready: !!lastSync && (isVision || isExamRoom) });
  const activeGroup = groups.find(g => g.key === filter) || null;
  // 설정에서 '대기 0명이어도 보이기'를 켠 검사는 항상, 끈 검사는 기다리는 환자가 있을 때만
  const visibleGroups = (gs, list) => gs.filter(g => g.tests.some(t => t.showWhenEmpty !== false) || activeGroup?.key === g.key || list.some(p => groupPending(p, g) || g.tests.some(t => t.id === activeVf(p))));
  const groupLabel = (g, list) => `${g.key} ${list.filter(p => groupPending(p, g)).length}명${list.some(p => g.tests.some(t => t.id === activeVf(p))) ? ' · 검사 중' : ''}`;
  // 기다리는(또는 검사 중인) 환자가 없는 검사 칩은 흐리게
  const groupIdle = (g, list) => !list.some(p => groupPending(p, g) || g.tests.some(t => t.id === activeVf(p)));
  // VF 분류에서도 진행 중인 카드와 종료 버튼을 계속 보여준다.
  const shown = activeGroup ? roomList.filter(p => groupPending(p, activeGroup) || activeGroup.tests.some(t => t.id === activeVf(p))) : roomList;
  // 초진으로 바꾸면 ARK도 함께 지정 (초진은 ARK를 꼭 찍음). 재진으로 되돌리면 아직 안 한 ARK는 뺌
  const arkId = settings.tests.some(t => t.id === 'ark' && t.roomId === 'vision') ? 'ark' : null;
  const toggleFirstVisit = (pk) => patchPatient(mutatePatients, pk, x => {
    const on = !x.firstVisit;
    if (!arkId || (!on && x.done?.[arkId])) return { firstVisit: on };
    return { firstVisit: on, assigned: { ...(x.assigned || {}), [arkId]: on } };
  });
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
      ? { ...x, done: { ...x.done, [key]: val }, doneAt: { ...(x.doneAt || {}), [key]: val ? at : null }, ...(val ? {} : withoutPrep(x, key)) }
      : x)));

  const changeVf = (p, t, action) => {
    const at = Date.now();
    patchPatient(mutatePatients, patientKey(p), x => updateVf(x, t.id, action, at));
  };

  // 시력방: 할 일(측정값·History·시력방 검사·점안)을 모두 마치면 자동으로 시력/안압 완료.
  // 모든 시력방 컴퓨터에서 같은 결과를 쓰므로 여러 번 써도 괜찮고, 알림은 지금 누른 컴퓨터(포커스)에서만
  const undoVision = (pk) => patchPatient(mutatePatients, pk, x => ({
    done: { ...x.done, [VISION_KEY]: false }, doneAt: { ...(x.doneAt || {}), [VISION_KEY]: null }, measureOk: null, dilateSkip: false,
  }));
  const readyKeys = isVision ? roomList.filter(p => !p.done?.[VISION_KEY] && !activeVf(p) && visionTasksLeft(p, doctorPrefs).length === 0).map(patientKey).join(',') : '';
  useEffect(() => {
    if (!readyKeys) return;
    const keys = new Set(readyKeys.split(','));
    const at = Date.now();
    mutatePatients(prev => prev.map(x => (keys.has(patientKey(x)) && !x.done?.[VISION_KEY] && visionTasksLeft(x, doctorPrefs).length === 0
      ? { ...x, done: { ...x.done, [VISION_KEY]: true }, doneAt: { ...(x.doneAt || {}), [VISION_KEY]: at } }
      : x)));
    let focused = true;
    try { focused = document.hasFocus(); } catch { /* 확인 못 하면 알림 표시 */ }
    if (focused) {
      const ps = patients.filter(x => keys.has(patientKey(x)));
      if (ps.length === 1) {
        const p = ps[0];
        showToast(`${p.name} 시력방 완료${!hasIop(p) ? ' (안압 값 없음)' : ''}${assignAtTreat(p) ? ', 처치실로' : ''}`, () => undoVision(patientKey(p)));
      } else if (ps.length > 1) showToast(`${ps.map(x => x.name).join(', ')} 시력방 완료`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKeys]);

  const markDone = (p, key, val) => {
    if (activeVf(p)) return;
    const pk = patientKey(p);
    writeDone(pk, key, val, Date.now());
    if (val) {
      const noIop = key === VISION_KEY && !hasIop(p);
      const toTriage = key === VISION_KEY && assignAtTreat(p) ? ', 처치실로' : '';
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
        ...(val ? {} : withoutPrep(x, key)),
        detail: nextDetail,
      };
    }));

  const pickTest = (p, t, on) => {
    if (t.popupOnClick) { setDetailFor({ key: patientKey(p), testId: t.id }); return; }
    setAssigned(patientKey(p), t.id, !on);
  };
  const openSpecial = (p, t) => setDetailFor({ key: patientKey(p), testId: t.id });
  // 처치실 시간 재기 검사(예: Schirmer, MMP): 칸을 누르면 시작 시각, 시간이 되면 [끝 · 확인]
  const prepAct = (p, t, kind) => {
    const pk = patientKey(p);
    const at = Date.now();
    const before = { prep: p.prep, done: p.done, doneAt: p.doneAt };
    patchPatient(mutatePatients, pk, x => (kind === 'start' ? prepStartPatch(x, t, at) : kind === 'confirm' ? prepConfirmPatch(x, t, settings, at) : prepCancelPatch(x, t)));
    const label = prepLabel(t);
    const msg = kind === 'start' ? (prepGoMode(t) ? `${label} 시작 · 시간이 되면 처치실에 알림` : `${label} 시작`) : kind === 'confirm' ? `${t.short || t.name} 완료` : `${label} 시작 취소`;
    showToast(`${p.name} ${msg}`, () => patchPatient(mutatePatients, pk, () => before));
  };

  const checkIn = (p) => {
    const pk = patientKey(p);
    mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? applyCheckin(x) : x)));
    showToast(`${p.name} 접수${p.skipVision ? ' (시력검사 없이 바로 진료)' : ''}`, () => mutatePatients(prev => prev.map(x => (patientKey(x) === pk
      ? { ...x, checkin: '', late: !!p.late, queueKey: timeToMin(x.reservation), assigned: p.assigned, done: p.done, doneAt: p.doneAt, visionSkipped: false }
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
      // 시력방 [확인]은 측정 완료만 표시 (시력방 할 일이 다 끝나면 위의 자동 완료로 넘어감)
      if (complete && mmode === 'vision') nx = { ...nx, measureOk: at };
      else if (complete) {
        nx = { ...nx, done: { ...nx.done, [doneKey]: true }, doneAt: { ...(nx.doneAt || {}), [doneKey]: at } };
      }
      return nx;
    }));
    mutateHistoryEntry(p.id, list => mergeHistoryEntry(list, p.date, patch));
    if (complete && mmode !== 'vision') showToast(`${p.name} ${testLabel(doneKey)} 완료`, () => writeDone(pk, doneKey, false, null));
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

  const content = (
    <>
      {embedded && groups.length >= 2 && <SectionTitle hint="다른 검사실 검사를 마친 뒤 진료 전에 하는 검사입니다">진료 전 검사 · {roomList.length}명</SectionTitle>}

      {/* 장비 필터(검사실)·검사 대기 인원(시력실)과 정렬을 한 줄에 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        {isVision ? (
          <div className="self-center text-sm font-medium text-slate-500">검사 대기 · {roomList.length}명</div>
        ) : isExamRoom ? (
          <div className="flex-1 min-w-0 flex flex-col gap-2" data-testid="exam-top">
            <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-500">검사 대기</span>
            {groups.length >= 2 ? <>
              <FilterChip active={!activeGroup} onClick={() => setFilter('all')} label={`전체 ${roomList.length}`} />
              {visibleGroups(groups, roomList).map(g => (
                <FilterChip key={g.key} active={activeGroup?.key === g.key} onClick={() => setFilter(g.key)} label={groupLabel(g, roomList)} dot={dotFor(room.id, g)} title={dotTitle} muted={groupIdle(g, roomList)} />
              ))}
            </> : groups.map(g => <InfoChip key={g.key} label={groupLabel(g, roomList)} dot={dotFor(room.id, g)} title={dotTitle} muted={groupIdle(g, roomList)} />)}
            </div>
            {/* 같은 묶음의 다른 검사실: 보기만, 방마다 줄을 바꿔서 */}
            {groupRooms.filter(r => r.id !== room.id).map(r => {
              const list = groupLists[r.id];
              // 다른 검사실은 짧게: 기다리는 환자가 있는(또는 검사 중인) 검사만
              const rGroups = machineGroups(roomTests(settings, r.id)).filter(g => list.some(p => groupPending(p, g) || g.tests.some(t => t.id === activeVf(p))));
              return (
                <div key={r.id} data-room={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">{r.name}</span>
                  {rGroups.length ? rGroups.map(g => <InfoChip key={g.key} label={groupLabel(g, list)} dot={dotFor(r.id, g)} title={dotTitle} />)
                    : <span className="text-xs text-slate-400">대기 {list.length}명</span>}
                </div>
              );
            })}
          </div>
        ) : groups.length >= 2 ? (
          <div className="flex-1 min-w-0 flex flex-wrap gap-2">
            <FilterChip active={!activeGroup} onClick={() => setFilter('all')} label={`전체 ${roomList.length}`} />
            {/* 설정에서 '대기 0명이어도 보이기'를 켠 검사는 항상, 끈 검사는 기다리는 환자가 있을 때만 */}
            {groups.filter(g => g.tests.some(t => t.showWhenEmpty !== false) || activeGroup?.key === g.key || roomList.some(p => groupPending(p, g) || g.tests.some(t => t.id === activeVf(p)))).map(g => (
              <FilterChip
                key={g.key}
                active={activeGroup?.key === g.key}
                onClick={() => setFilter(g.key)}
                label={`${g.key} ${roomList.filter(p => groupPending(p, g)).length}명${roomList.some(p => g.tests.some(t => t.id === activeVf(p))) ? ' · 검사 중' : ''}`}
                muted={groupIdle(g, roomList)}
              />
            ))}
          </div>
        ) : embedded ? (
          <div className="self-center text-sm font-medium text-slate-500">진료 전 검사 · {roomList.length}명</div>
        ) : <div />}
        <SegmentedToggle value={sortMode} onChange={changeSort} options={SORT_OPTIONS} className="shrink-0" />
      </div>

      {shown.length === 0 ? (
        <EmptyState compact={isVision || embedded} text="대기 중인 환자가 없습니다" />
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
            // 처치실에서 '진행 중 호출 금지' 검사(예: Schirmer) 중이면 VF 검사 중처럼 잠금 (처치실 화면 자신은 제외)
            const held = isVision || room?.builtin === 'treat' ? null : prepHolding(p, settings);
            const locked = !!(runningVf || held);
            const topTest = showPriority && !locked ? pendingTests(p, settings, room.id)[0] : null;
            const otherRooms = isVision ? [] : settings.rooms.filter(r => r.id !== room.id && remainingTests(p, settings, r.id).length > 0);
            const prev = previousMeasure(p, history);
            const notes = notesOf(p, allTests);
            return (
              <PatientRow
                p={p}
                index={idx}
                color={color}
                handle={handle}
                onUp={nameSort ? undefined : () => moveInQueue(mutatePatients, shown, pk, idx - 1)}
                onDown={nameSort ? undefined : () => moveInQueue(mutatePatients, shown, pk, idx + 1)}
                onToggleFirst={isVision ? () => toggleFirstVisit(pk) : undefined}
                stale={room?.builtin === 'treat' && !locked && !tests.some(t => isTimed(t) && p.assigned?.[t.id] && prepRunning(p, t)) ? staleMinutes(p, settings) : 0}
              >
                {/* 값이 있는 줄만 보여줌 (값 없음 줄은 생략) */}
                {/* 시력방: 이전 시력을 맨 위에 크게 */}
                {isVision && <PrevVisionBox m={prev} />}
                {isVision && (hasAnyValue(p.measure) || p.measureOk) && (
                  <div className="w-full space-y-1">
                    {(hasAnyValue(p.measure) || p.measureOk) && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <MeasureLine label="오늘" m={p.measure} fields={['ucva', 'bcva', 'nct']} emptyText="측정값 없음" />
                        {p.measureOk && <button type="button" onClick={() => setMeasureFor({ key: pk, mode: 'vision' })} aria-label="측정값 수정" className="text-xs px-2 py-0.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50">수정</button>}
                      </div>
                    )}
                  </div>
                )}
                {roomHasGat && p.assigned?.[GAT_ID] && (hasFieldValue(prev, ['nct', 'gat']) || hasFieldValue(p.measure, ['nct', 'gat'])) && (
                  <div className="w-full space-y-1">
                    {hasFieldValue(prev, ['nct', 'gat']) && <MeasureLine label="이전" m={prev} fields={['nct', 'gat']} />}
                    {hasFieldValue(p.measure, ['nct', 'gat']) && <MeasureLine label="오늘" m={p.measure} fields={['nct', 'gat']} />}
                  </div>
                )}
                {notes.length > 0 && (
                  <div className="w-full text-xs bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg px-3 py-2 space-y-0.5">
                    {notes.map(n => (
                      <div key={n.id}><span className="font-medium">{n.short}</span> {n.note}</div>
                    ))}
                  </div>
                )}
                {!isVision && (() => {
                  const o = orderState(p, settings, room.id);
                  if (!o.needed.length) return null;
                  // [처방 전] 한 칸을 누르면 같은 자리가 '처방 완료'로 바뀐다 (취소는 옆의 ↺)
                  if (o.complete) {
                    return (
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 flex items-center gap-0.5"><Check size={12} />처방 완료</span>
                        <button type="button" onClick={() => setOrdered(p, false)} title="처방 완료 취소" aria-label="처방 완료 취소" className="p-1 rounded text-slate-300 hover:text-slate-600"><RotateCcw size={13} /></button>
                        <span className="h-6 w-px bg-slate-300 mx-0.5" aria-hidden="true" />
                      </span>
                    );
                  }
                  return (
                    <span className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setOrdered(p, true)} title="전산 처방을 넣은 뒤 누르면 처방 완료로 바뀝니다"
                        className="text-xs px-2 py-1 rounded-md border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold">
                        {o.rec ? `추가 처방 필요: ${o.missing.map(t => t.short || t.name).join(', ')}` : '처방 전'}
                      </button>
                      <span className="h-6 w-px bg-slate-300 mx-0.5" aria-hidden="true" />
                    </span>
                  );
                })()}
                {isVision && !p.measureOk && (
                  <button type="button" onClick={() => setMeasureFor({ key: pk, mode: 'vision' })} className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium">
                    {nctNeeded(p) ? '시력 + NCT 입력' : '시력 입력'}
                  </button>
                )}
                {/* NCT를 재는지 바로 보이게: GAT 환자는 NCT 안 함 */}
                {isVision && !p.measureOk && !nctNeeded(p) && (
                  <span className="text-sm px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 font-semibold">NCT 안 함 · 검사실 GAT</span>
                )}
                {/* 초진: History 설문지를 드렸는지 (입력은 처치실에서) */}
                {isVision && hxNeeded(p) && !p.hx && (p.hxSheetAt
                  ? <button type="button" onClick={() => patchPatient(mutatePatients, pk, () => ({ hxSheetAt: null }))} title="누르면 취소" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-500">History 설문지 드림 ✓</button>
                  : <button type="button" onClick={() => patchPatient(mutatePatients, pk, () => ({ hxSheetAt: Date.now() }))} className="text-sm px-3 py-1.5 rounded-lg bg-orange-500 text-white font-medium">History 설문지 드리기</button>)}
                {runningVf && !tests.some(t => t.id === runningVf) && (() => {
                  const rt = settings.tests.find(t => t.id === runningVf);
                  const rr = rt?.roomId === 'vision' ? visionNames(settings).name : settings.rooms.find(r => r.id === rt?.roomId)?.name || '';
                  return <span className="text-sm px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 font-semibold">{rr} {rt?.short || rt?.name || '검사'} 중 · 호출 금지</span>;
                })()}
                {held && <span className="text-sm px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 font-semibold">{treatRoomOf(settings).name} {held.short || held.name} 중 · 호출 금지</span>}
                {tests.filter(t => p.assigned?.[t.id] && t.id !== VISION_KEY).map(t => (
                  !p.done?.[t.id] && prepBlocked(p, t) ? (
                    // 처치실 준비(예: skin test)가 끝나야 할 수 있는 검사: 잠긴 칸으로 상태만 보여줌
                    <div key={t.id} title="처치실 준비가 끝나면 할 수 있어요" className={`${TEST_TILE} px-3 text-sm ${prepPositive(p, t) ? 'border-red-300 bg-red-50 text-red-700' : 'border-dashed border-slate-300 bg-slate-50 text-slate-500'}`}>
                      <span className="font-semibold">{testLabelWithOptions(t, p.detail?.[t.id])}</span>
                      <span className="ml-1.5 text-xs">{prepPositive(p, t) ? '검사 취소' : prepOf(p, t)?.startedAt ? `${prepLabel(t)} 중` : `${prepLabel(t)} 전`}</span>
                    </div>
                  ) : isTimed(t) && !p.done?.[t.id] ? (() => {
                    const st = prepOf(p, t);
                    const label = prepLabel(t);
                    if (!st?.startedAt) return (
                      <button key={t.id} type="button" disabled={locked} onClick={() => prepAct(p, t, 'start')} title={`누르면 시작 시각 기록 (${prepWaitMin(t)}분)`}
                        className={`${TEST_TILE} px-3 text-sm font-semibold bg-white border-slate-300 text-slate-800 hover:border-slate-400 disabled:opacity-40`}>{label}</button>
                    );
                    if (prepDue(st, t)) return (
                      <button key={t.id} type="button" onClick={() => prepAct(p, t, 'confirm')} className={`${TEST_TILE} px-3 text-sm font-semibold bg-green-600 border-green-600 text-white`}>{label} 끝 · 확인</button>
                    );
                    return (
                      <span key={t.id} className="flex items-center gap-1.5">
                        <button type="button" onClick={() => prepAct(p, t, 'cancel')} title={`${prepWaitMin(t)}분 뒤 [끝 · 확인] · 다시 누르면 시작 취소`}
                          className={`${TEST_TILE} px-3 text-sm font-semibold bg-slate-100 border-slate-300 text-slate-700`}>{label} {fmtClock(st.startedAt)}</button>
                        <button type="button" onClick={() => prepAct(p, t, 'confirm')} className="text-xs text-green-700 underline">지금 확인</button>
                      </span>
                    );
                  })() : startStopTest(t) && !p.done?.[t.id] ? (
                    runningVf === t.id ? (
                      <div key={t.id} className={`${TEST_TILE} overflow-hidden border-amber-500 bg-amber-50 text-sm`}>
                        <span className="px-3 font-semibold text-amber-900">{testLabelWithOptions(t, p.detail?.[t.id])} 검사 중</span>
                        <button type="button" onClick={() => changeVf(p, t, 'finish')} className="self-stretch px-3 bg-green-100 hover:bg-green-200 text-green-800 font-semibold border-l border-amber-300">종료</button>
                        <button type="button" onClick={() => changeVf(p, t, 'cancel')} className="self-stretch px-2.5 text-slate-500 hover:text-slate-700 border-l border-amber-300 bg-white">시작 취소</button>
                      </div>
                    ) : (
                      <div key={t.id} className={`${TEST_TILE} overflow-hidden text-sm ${topTest?.id === t.id ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'} ${locked ? 'opacity-40' : ''}`}>
                        <span className="px-3 font-semibold text-slate-800">{testLabelWithOptions(t, p.detail?.[t.id])}</span>
                        <button type="button" disabled={locked} onClick={() => changeVf(p, t, 'start')} className="self-stretch px-3 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold border-l border-amber-300 flex items-center gap-1">▶ 시작</button>
                      </div>
                    )
                  ) : <TestToggle
                    disabled={locked}
                    key={t.id}
                    label={testLabelWithOptions(t, p.detail?.[t.id])}
                    done={!!p.done?.[t.id]}
                    emphasize={topTest?.id === t.id}
                    onToggle={v => (v && t.id === GAT_ID && roomHasGat ? setMeasureFor({ key: pk, mode: 'gat' }) : markDone(p, t.id, v))}
                    onSpecial={isVision ? undefined : () => openSpecial(p, t)}
                  />
                ))}
                {(() => {
                  const picker = (
                    <TestPicker inline defaultOpen={isVision} chipsWhenClosed={false} closedLabel={isVision ? '시력방 검사' : ''} mainIds={mainTestIds(doctorPrefs, p.doctor)} p={p} tests={orderForPicking(isVision ? allTests.filter(t => t.roomId === 'vision') : allTests, settings)} onPick={(t, on) => pickTest(p, t, on)} onSpecial={(t) => openSpecial(p, t)}>
                      <DilationRow togglesOnly inline p={p} prefs={doctorPrefs} waitMin={settings.dilationWaitMin} mutatePatients={mutatePatients} />
                    </TestPicker>
                  );
                  const dilation = <DilationRow compact group large={isVision} p={p} prefs={doctorPrefs} waitMin={settings.dilationWaitMin} mutatePatients={mutatePatients} />;
                  // 시력방: 첫 줄은 할 일(측정값·History·산동), 오늘 검사는 둘째 줄에 작게 (Hx 내용 아래)
                  if (isVision) return <>
                    {dilation}
                    {dropDue(p, doctorPrefs) && (
                      <button type="button" onClick={() => patchPatient(mutatePatients, pk, () => ({ dilateSkip: true }))} title="점안은 다음 검사실·처치실에서 기록할 수 있어요"
                        className="text-xs text-slate-500 hover:text-slate-800 underline">점안 없이 넘기기</button>
                    )}
                    {/* 오늘 검사는 평소엔 접어 두고, 눌렀을 때만 (시력방은 대부분 바꿀 일이 없음) */}
                    <VisionTodayTests p={p} tests={allTests}>{picker}</VisionTodayTests>
                    <button type="button" onClick={() => mutatePatients(prev => prev.map(x => patientKey(x) === pk ? undoCheckin(x) : x))} className="ml-auto text-xs px-2 py-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center gap-1"><RotateCcw size={12} />접수 취소</button>
                  </>;
                  // 검사실: 접힌 [검사 변경]은 검사 칸 줄 끝에 (위 검사 칸과 겹치는 '오늘 검사' 칩은 숨김)
                  return <>
                    {picker}
                    {dilation}
                    {otherRooms.length > 0 && (
                      <span className="text-xs text-slate-500">
                        다른 검사실 남음: {otherRooms.map(r => `${r.name} (${remainingTests(p, settings, r.id).map(t => t.short).join(', ')})`).join(', ')}
                      </span>
                    )}
                  </>;
                })()}
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
                    {p.fuMissing && !p.consultDone && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold border border-orange-300">지난 진료 FU 미지정</span>}
                    <DoctorChip p={p} />
                    <PatientMemo p={p} />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">예약 {p.reservation || '-'}</div>
                  <KioskNoteLine p={p} />
                </div>
                <div className="flex gap-2 shrink-0 items-center">
                  {firstVisitChip(p)}
                  <LateChip p={p} />
                  <button type="button" onClick={() => checkIn(p)} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-medium">접수</button>
                </div>
              </div>
              {hasAnyValue(previousMeasure(p, history)) && (
                <div className="mt-2">
                  <MeasureLine label="이전" m={previousMeasure(p, history)} />
                </div>
              )}
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
                <UndoButton key={k} label={`${testLabel(k)} 완료 취소`} onClick={() => (k === VISION_KEY && isVision ? undoVision(pk) : writeDone(pk, k, false, null))} />
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
    </>
  );
  if (embedded) return <div className="mb-8">{content}</div>;
  return (
    <ScreenShell title={title} color={color} onBack={onBack} lastSync={lastSync} count={roomList.length} extra={isVision || isExamRoom ? <ChimeControl /> : undefined}>
      {content}
    </ScreenShell>
  );
}
