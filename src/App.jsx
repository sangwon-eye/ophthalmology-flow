// 최상위 App (저장소 동기화와 화면 전환)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { REDO_SHORT, dropsPending, redoActive, COLOR_MAP, DEFAULT_SETTINGS, INPUT, PERFORMER_LABEL, activeVf, allDone, awaitingExplain, byQueue, consultWaiting, fmtClock, getStage, inConsult, inProfProcedure, inResidentProcedure, inTreatRoom, needsTriageAssign, needsTriageExam, pastVision, patientKey, pendingProcedures, pendingRooms, pendingTests, preProcPending, prepOf, prepPendingTests, prepPositiveNames, procedureStatus, realTodayISO, roomColor, setForcedToday, setNoDilateTests, setVisionTestIds, testLabelWithOptions, todayISO, treatRoomOf, visionComplete, fixTreatPreps } from './core/flow.jsx';
import { hxFieldsOf, loadDaily, loadDoctorPrefs, loadDoctors, loadFu, loadHistory, loadKeySubset, loadSettings, loadTodayOverride, shiftISO, useArchivedPatients, useSharedStore, visionNames } from './core/storage.jsx';
import { DoctorChip, EmptyState, HxContext, PatientMemo, PatientMemoContext, ScreenShell, noDilateTest, useApplyTextSize } from './ui/common.jsx';
import { KioskView, PasswordModal, RoleSelect, lockApi } from './views/RoleSelect.jsx';
import { StationView } from './views/StationView.jsx';
import { ConsultView } from './views/ConsultView.jsx';
import { ProcedureRoomView } from './views/TreatView.jsx';
import { AdminView } from './views/AdminView.jsx';
import { BoardSelect, BoardView, NOTICE_PRESETS, NoticeContext, loadNotices } from './views/BoardView.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { ErrorBoundary, rememberRole, rememberedRole, setCurrentRole } from './ui/safety.jsx';

/* ------------------------------------------------------------------ */
/* 최상위 App                                                          */
/* ------------------------------------------------------------------ */
// 각 업무 화면과 같은 조건으로 조회하여 여러 명단에 속한 경우도 함께 표시한다.
export function patientQueueLabels(p, settings, prefs) {
  if (p.consultDone) return [p.referred ? '진료 완료 · 회송' : '진료 완료'];
  const labels = [];
  if (!p.checkin) labels.push('접수 전');
  if (p.checkin && !visionComplete(p)) labels.push(`${visionNames(settings).name} · 검사 대기`);
  if (needsTriageAssign(p)) labels.push(`${treatRoomOf(settings).name} · 초진 검사 지정 대기`);
  if (pastVision(p) && preProcPending(p)) labels.push(`${treatRoomOf(settings).name} · 진료 전 처치 (${(p.preProcs || []).filter(x => !x.done).map(x => x.name).join(', ')})`);
  prepPendingTests(p, settings).filter(() => pastVision(p)).forEach(t => labels.push(`${treatRoomOf(settings).name} · ${t.short || t.name} ${t.prepName || '준비'}${prepOf(p, t)?.startedAt ? ` 중 (${fmtClock(prepOf(p, t).startedAt)} 시작)` : ' 대기'}`));
  if (prepPositiveNames(p).length) labels.push(`${prepPositiveNames(p).join(', ')} 검사 취소`);
  pendingRooms(p, settings).forEach(r => {
    const tests = pendingTests(p, settings, r.id).map(t => testLabelWithOptions(t, p.detail?.[t.id])).join(', ');
    labels.push(`${r.name} · ${tests}${activeVf(p) ? ' (VF 진행 중 · 다른 장비 호출 금지)' : ' 대기'}`);
  });
  if (needsTriageExam(p, settings)) labels.push(`${treatRoomOf(settings).name} · 예진 대기`);
  if (inProfProcedure(p)) labels.push('진료실 · 교수님 처치 대기');
  if (inResidentProcedure(p)) labels.push(`${treatRoomOf(settings).name} · 전공의 처치 대기`);
  if (awaitingExplain(p)) labels.push(p.explainedEarly ? (procedureStatus(p) === 'doing' ? '설명 완료 · 처치 후 귀가' : '진료실 · 처치 완료 · 귀가 대기') : `진료실 · 설명 대기${procedureStatus(p) === 'doing' ? ' (처치 중)' : ''}`);
  if (inConsult(p)) labels.push(`${p.calledRoom} · 진료 중`);
  if (dropsPending(p, prefs, settings.dilationWaitMin)) labels.push(`진료실 · ${redoActive(p) ? REDO_SHORT[p.redo.kind] : 'CR'} 점안 중`);
  if (consultWaiting(p, settings, prefs)) labels.push('진료실 · 진료 대기');
  if (p.consultHold && !p.seen && !allDone(p, settings)) labels.push('진료실 · 추가 검사 중 (진료 보류)');
  return labels.length ? labels : [getStage(p, settings).label];
}

// 상태 칩 색: 그 방 색깔 (시력방 파랑, 검사실은 방마다 색, 처치실 남색, 진료실 주황). 시야검사 진행 중은 주황으로 강조
export function queueLabelColor(label, p, settings) {
  if (label.includes('VF 진행 중')) return 'amber';
  const place = label.split(' · ')[0];
  if (place === visionNames(settings).name) return 'blue';
  if (place === treatRoomOf(settings).name) return 'indigo';
  const room = settings.rooms.find(r => r.name === place && r.builtin !== 'treat');
  if (room) return roomColor(settings, room.id);
  if (place === '진료실' || place === '설명 완료' || (p.calledRoom && place === p.calledRoom)) return 'amber';
  return 'slate';
}

export const DIRECTORY_STATUSES = [
  ['all', '전체 (완료 포함)'],
  ['reception', '접수 전'],
  ['vision', '시력방'],
  ['exam', '검사실'],
  ['consult', '진료'],
  ['treatment', '처치'],
  ['done', '진료 완료'],
];

export function matchesDirectoryStatus(p, settings, status, prefs) {
  if (status === 'all') return true;
  if (status === 'done') return !!p.consultDone;
  if (p.consultDone) return false;
  switch (status) {
    case 'reception': return !p.checkin && !p.linkWaiting;
    case 'vision': return !!p.checkin && !visionComplete(p);
    case 'exam': return pendingRooms(p, settings).length > 0 || !!activeVf(p);
    case 'consult': return consultWaiting(p, settings, prefs) || dropsPending(p, prefs, settings.dilationWaitMin) || inConsult(p) || awaitingExplain(p);
    case 'treatment': return inTreatRoom(p, settings) || inProfProcedure(p);
    default: return false;
  }
}

export function filterDirectory(patients, settings, date, query, doctor, status, prefs) {
  const q = query.trim().toLocaleLowerCase();
  return patients.filter(p => (!date || p.date === date)
    && (!doctor || p.doctor === doctor)
    && matchesDirectoryStatus(p, settings, status, prefs)
    && (!q || [p.name, p.id, p.doctor, ...patientQueueLabels(p, settings, prefs)].some(v => String(v || '').toLocaleLowerCase().includes(q))))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || byQueue(a, b) || String(a.id).localeCompare(String(b.id)));
}

export function PatientDirectory({ patients, settings, doctorPrefs, lastSync, onBack }) {
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(todayISO());
  const [doctor, setDoctor] = useState('');
  const [status, setStatus] = useState('all');
  const archived = useArchivedPatients(date, patients);
  const source = archived.isArchived ? archived.list : patients;
  const list = filterDirectory(source, settings, date, query, doctor, status, doctorPrefs);
  const doctors = [...new Set(source.map(p => p.doctor).filter(Boolean))];
  return (
    <ScreenShell title="전체 환자 명단" color="slate" onBack={onBack} lastSync={lastSync}>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 mb-3">
        <label className="flex-1 min-w-[14rem] text-xs text-slate-500">환자 검색
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 · 환자번호 · 교수 · 대기 명단" className={INPUT} />
        </label>
        <label className="text-xs text-slate-500">진료 날짜 (비우면 모든 날짜)
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />
        </label>
        <label className="text-xs text-slate-500">담당 교수
          <select value={doctor} onChange={e => setDoctor(e.target.value)} className={INPUT}><option value="">전체 교수</option>{doctors.map(d => <option key={d} value={d}>{d}</option>)}</select>
        </label>
        <label className="text-xs text-slate-500">진행 상태
          <select value={status} onChange={e => setStatus(e.target.value)} className={INPUT}>{DIRECTORY_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 mb-2"><span>조회 결과 {list.length}명 · {date || '모든 날짜'}</span><button type="button" onClick={() => { setQuery(''); setDoctor(''); setStatus('all'); setDate(todayISO()); }} className="underline">오늘 전체로 초기화</button></div>
      {archived.isArchived && <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 mb-2 text-sm text-slate-600">{archived.loading ? '지난 명단을 불러오는 중입니다…' : archived.error ? '지난 명단을 불러오지 못했습니다. 서버 연결을 확인해주세요.' : '지난 날짜의 보관된 명단입니다.'}</div>}
      {!list.length ? <EmptyState text={archived.loading ? '불러오는 중…' : '조건에 맞는 환자가 없습니다. 검색어나 날짜를 확인해주세요.'} /> : (
        <div className="space-y-1.5">
          {list.map(p => (
            <div key={patientKey(p)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-2 flex-wrap min-w-[15rem]">
                <span className="t-name text-slate-900">{p.name}</span>
                <span className="text-xs text-slate-400">{p.id}</span>
                <DoctorChip p={p} />
                {p.firstVisit && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">초진</span>}
                <PatientMemo p={p} readOnly />
              </span>
              <span className="text-xs text-slate-500 whitespace-nowrap">{date ? '' : `${p.date} · `}예약 {p.reservation || '-'} · 접수 {p.checkin || '-'}</span>
              <span className="ml-auto flex flex-wrap justify-end gap-1.5">
                {patientQueueLabels(p, settings, doctorPrefs).map(label => {
                  const c = COLOR_MAP[queueLabelColor(label, p, settings)] || COLOR_MAP.slate;
                  return <span key={label} className={`rounded-md border px-2 py-0.5 text-sm ${p.consultDone ? 'border-slate-200 bg-slate-50 text-slate-500' : `${c.border} ${c.bg} ${c.text}`}`}>{label}</span>;
                })}
                {pendingProcedures(p).length > 0 && <span className="rounded-md border border-slate-200 px-2 py-0.5 text-sm text-slate-600">남은 처치: {pendingProcedures(p).map(x => `${x.name} (${PERFORMER_LABEL[x.performer] || x.performer})`).join(', ')}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </ScreenShell>
  );
}

export default function App() {
  // 이 PC가 마지막으로 연 화면에서 시작 (환자용 화면 PC를 다시 켜거나 새로고침해도 그 화면으로)
  const [role, setRole] = useState(rememberedRole);
  useEffect(() => { setCurrentRole(role); rememberRole(role); }, [role]);
  useApplyTextSize();
  const [askPassword, setAskPassword] = useState(false);
  const [lockError, setLockError] = useState('');
  const selectRole = async (key) => {
    if (key === 'settings') {
      // 설정은 비밀번호를 정해 두었으면 들어갈 때마다 묻습니다.
      try {
        const r = await lockApi('');
        setLockError('');
        if (r.enabled) { setAskPassword(true); return; }
      } catch { setLockError('서버에 연결되지 않아 설정에 들어갈 수 없습니다'); return; }
    }
    setRole(key);
  };
  const [patients, mutatePatients, syncPatients, markPatients] = useSharedStore('daily-patients', loadDaily, []);
  // FU 지정: 평소에는 명단에 있는 환자 것만 받고, 고칠 때도 그 환자 칸만 저장 (관리자 'FU 지정 관리' 탭은 연 동안만 전체)
  const [fuMap, , syncFu, markFu, mutateFuEntry] = useSharedStore('fu-designations', loadFu, {});
  // mapFn: FU 묶음({ [id]: 기록 })을 받아 새 묶음을 돌려주는 함수 (saveFollowup 등). 그 환자 칸만 서버에 저장
  const updateFu = useCallback((id, mapFn) => mutateFuEntry(id, rec => mapFn(rec ? { [id]: rec } : {})[id] ?? null), [mutateFuEntry]);
  const [doctors, mutateDoctors, syncDoctors, markDoctors] = useSharedStore('doctors', loadDoctors, []);
  const [settings, mutateSettings, syncSettings, markSettings] = useSharedStore('settings', loadSettings, DEFAULT_SETTINGS);
  const [history, , syncHistory, markHistory, mutateHistoryEntry] = useSharedStore('measure-history', loadHistory, {});
  const [doctorPrefs, mutateDoctorPrefs, syncDoctorPrefs, markDoctorPrefs] = useSharedStore('doctor-prefs', loadDoctorPrefs, {});
  const [todayOverride, mutateTodayOverride, syncTodayOverride, markTodayOverride] = useSharedStore('today-override', loadTodayOverride, null);
  const [boardNotices, mutateBoardNotices, syncBoardNotices, markBoardNotices] = useSharedStore('board-notices', loadNotices, { notices: {}, presets: NOTICE_PRESETS });
  const [lastSync, setLastSync] = useState(null);
  setVisionTestIds(settings.tests.filter(t => t.roomId === 'vision').map(t => t.id));
  setNoDilateTests(settings.tests.filter(noDilateTest).map(t => ({ id: t.id, short: t.short || t.name })));
  // 직접 정한 날짜는 정한 날(컴퓨터 날짜 기준)에만 적용되고, 다음 날에는 저절로 풀립니다.
  // 어제보다 앞 날짜(보관 파일로 옮겨진 명단)는 업무 날짜로 쓰지 않음 — 예전에 정해 둔 값도 무시
  setForcedToday(todayOverride?.date && todayOverride.setOn === realTodayISO() && todayOverride.date >= shiftISO(realTodayISO(), -1) ? todayOverride.date : null);
  const setToday = (date) => mutateTodayOverride(() => (date && date !== realTodayISO() ? { date, setOn: realTodayISO() } : null));

  const refresh = useCallback(async () => {
    const marks = [markPatients(), markFu(), markDoctors(), markSettings(), markHistory(), markDoctorPrefs(), markTodayOverride(), markBoardNotices()];
    // 항목마다 따로 받습니다: 서버의 한 파일이 손상돼 그 항목만 못 받아도 나머지는 계속 맞춰짐 (못 받은 항목은 지금 화면 그대로)
    const got = (pr) => pr.then(v => ({ ok: true, v }), () => ({ ok: false }));
    const [p, d, s, dp, to, bn] = await Promise.all([loadDaily(), loadDoctors(), loadSettings(), loadDoctorPrefs(), loadTodayOverride(), loadNotices()].map(got));
    // 이전 시력·FU는 명단에 있는 환자(다음 주 차트리뷰 환자 포함) 것만
    const ids = p.ok ? [...new Set((Array.isArray(p.v) ? p.v : []).map(x => x.id).filter(Boolean))].sort() : null;
    const [h, f] = ids ? await Promise.all([loadKeySubset('measure-history', ids), loadKeySubset('fu-designations', ids)].map(got)) : [{ ok: false }, { ok: false }];
    if (p.ok) syncPatients(p.v, marks[0]);
    if (f.ok) syncFu(f.v, marks[1]);
    if (d.ok) syncDoctors(d.v, marks[2]);
    if (s.ok) syncSettings(s.v, marks[3]);
    if (h.ok) syncHistory(h.v, marks[4]);
    if (dp.ok) syncDoctorPrefs(dp.v, marks[5]);
    if (to.ok) syncTodayOverride(to.v, marks[6]);
    if (bn.ok) syncBoardNotices(bn.v, marks[7]);
    // 서버 연결이 끊기면 지금 화면을 그대로 두고 다음에 다시 시도합니다. 명단·설정을 받아야 '받음'으로 표시
    if (p.ok && s.ok) setLastSync(new Date());
  }, [markPatients, markFu, markDoctors, markSettings, markHistory, markDoctorPrefs, markTodayOverride, markBoardNotices, syncPatients, syncFu, syncDoctors, syncSettings, syncHistory, syncDoctorPrefs, syncTodayOverride, syncBoardNotices]);

  // 새로 받기는 한 번에 하나씩 (늦게 도착한 옛 내용이 새 내용을 덮지 않도록). 받는 중에 또 요청되면 끝난 뒤 한 번 더
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);
  const runRefresh = useCallback(async () => {
    if (refreshing.current) { refreshAgain.current = true; return; }
    refreshing.current = true;
    try {
      do { refreshAgain.current = false; await refresh(); } while (refreshAgain.current);
    } finally {
      refreshing.current = false;
    }
  }, [refresh]);

  // 저장에 실패하면 바로 새로 받아 화면을 서버에 저장된 내용으로 되돌림 (위쪽 빨간 띠로 안내 — ui/safety.jsx)
  useEffect(() => {
    const onFail = () => { runRefresh(); };
    window.addEventListener('oph-save-failed', onFail);
    return () => window.removeEventListener('oph-save-failed', onFail);
  }, [runRefresh]);

  // 4초마다 스스로 확인 (서버 알림이 막혀도 이것으로 맞춰짐)
  useEffect(() => {
    runRefresh();
    const t = setInterval(runRefresh, 4000);
    return () => clearInterval(t);
  }, [runRefresh]);

  // 서버가 "바뀌었다"고 알려주면 바로 새로 받기 (다른 컴퓨터에서 누른 버튼이 거의 즉시 보임)
  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    let es = null;
    const open = () => {
      if (es || document.hidden) return;
      es = new EventSource('/api/events');
      es.addEventListener('change', () => { runRefresh(); });
      es.onopen = () => { runRefresh(); }; // 다시 연결되면 그사이 놓친 변경을 확인
    };
    const close = () => { if (es) { es.close(); es = null; } };
    // 숨겨진 탭은 알림 연결을 닫아 둡니다 (브라우저가 한 서버에 동시에 여는 연결 수가 정해져 있어서).
    // 숨겨진 동안에도 4초 확인은 계속되고, 다시 보이면 연결합니다.
    const onVisible = () => { if (document.hidden) close(); else open(); };
    open();
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); close(); };
  }, [runRefresh]);

  // 처치실 시간 재기 검사: 확인만 되고 완료가 안 된 예전 기록을 완료로 (Schirmer가 진료 전 검사에 남던 문제)
  useEffect(() => {
    if (role === 'board' || role === 'kiosk') return;
    if (patients.some(p => fixTreatPreps(p, settings) !== p)) mutatePatients(prev => prev.map(p => fixTreatPreps(p, settings)));
  }, [patients, settings, role, mutatePatients]);


  const renderView = () => {
  const today = todayISO();
  // 1차 진료 설명 완료를 기다리는 2차 진료는 관리자·전체 명단에서만 보입니다.
  const patientsToday = patients.filter(p => p.date === today && !p.linkWaiting);
  const main = <RoleSelect settings={settings} onSelect={selectRole} onSetToday={setToday} patients={patientsToday} doctors={doctors} doctorPrefs={doctorPrefs} />;
  if (!role) return main;
  // 기억해 둔 화면으로 다시 열 때: 서버에서 처음 받을 때까지 기다림 (설정이 오기 전에는 검사실 이름 등을 모름)
  if (!lastSync) {
    return <div className={`min-h-screen flex items-center justify-center text-sm ${role.startsWith('board:') ? 'bg-slate-900 text-slate-500' : 'bg-slate-50 text-slate-400'}`}>불러오는 중…</div>;
  }

  const onBack = () => setRole(null);

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
        mutateHistoryEntry={mutateHistoryEntry}
        onBack={onBack}
        lastSync={lastSync}
      />
    );
  }
  if (role === 'kiosk') {
    return <KioskView patients={patientsToday} settings={settings} mutatePatients={mutatePatients} onExit={onBack} />;
  }
  if (role === 'procedure') {
    return (
      <ProcedureRoomView
        patients={patientsToday}
        settings={settings}
        doctorPrefs={doctorPrefs}
        history={history}
        mutatePatients={mutatePatients}
        mutateHistoryEntry={mutateHistoryEntry}
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
        updateFu={updateFu}
        onBack={onBack}
        lastSync={lastSync}
        allPatients={patients.filter(p => p.date === today)}
      />
    );
  }
  if (role === 'directory') {
    return <PatientDirectory patients={patients} settings={settings} doctorPrefs={doctorPrefs} lastSync={lastSync} onBack={onBack} />;
  }
  if (role === 'admin') {
    return (
      <AdminView
        patients={patients}
        history={history}
        doctors={doctors}
        doctorPrefs={doctorPrefs}
        settings={settings}
        fuMap={fuMap}
        mutatePatients={mutatePatients}
        updateFu={updateFu}
        mutateDoctors={mutateDoctors}
        mutateDoctorPrefs={mutateDoctorPrefs}
        boardNotices={boardNotices}
        mutateBoardNotices={mutateBoardNotices}
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
    return <BoardSelect doctors={doctors} settings={settings} onSelect={k => setRole(`board:${k}`)} onBack={onBack} />;
  }
  if (role.startsWith('board:')) {
    return (
      <BoardView
        kind={role.slice('board:'.length)}
        patients={patientsToday.filter(p => p.checkin)}
        settings={settings}
        doctors={doctors}
        doctorPrefs={doctorPrefs}
        ready={!!lastSync}
        onBack={() => setRole('board')}
      />
    );
  }
  return main;
  };
  return <PatientMemoContext.Provider value={mutatePatients}>
    <NoticeContext.Provider value={boardNotices || { notices: {} }}>
      <HxContext.Provider value={{ fuMap, measure: history, fields: hxFieldsOf(settings) }}>
        {/* 화면 오류: 흰 화면 대신 안내 (화면을 바꾸면 새로 시작) */}
        <ErrorBoundary key={role || 'main'} where="화면" onHome={role ? () => setRole(null) : undefined}>
          {renderView()}
        </ErrorBoundary>
      </HxContext.Provider>
    </NoticeContext.Provider>
    {askPassword && <PasswordModal onOk={() => { setAskPassword(false); setRole('settings'); }} onCancel={() => setAskPassword(false)} />}
    {lockError && !role && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm rounded-xl px-4 py-2 z-50">{lockError}</div>}
  </PatientMemoContext.Provider>;
}
