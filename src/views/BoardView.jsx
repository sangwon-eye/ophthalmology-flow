// 환자용 화면·QR 접수
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import {
  Eye, Camera, Stethoscope, Monitor, Settings, ClipboardList, Check, Plus,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Upload, Trash2, Search, GripVertical, RotateCcw, Syringe, StickyNote, ScanBarcode,
} from 'lucide-react';
import { COLOR_MAP, activeVf, allDone, byQueue, consultWaiting, inConsult, maskName, pastVision, patientKey, pendingRooms, pendingTests, preProcPending, prepOf, prepPendingTests, roomColor, treatRoomOf, visionComplete, prepHolding } from '../core/flow.jsx';
import { loadKey, visionNames } from '../core/storage.jsx';
import { ScreenShell, TextSizeControl } from '../ui/common.jsx';

/* ------------------------------------------------------------------ */
/* 환자용 화면                                                          */
/* ------------------------------------------------------------------ */
export function BoardShell({ title, onBack, wide, extra, children }) {
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
            <button type="button" onClick={onBack} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-400">메인 화면</button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} tabIndex={0} aria-label="환자 대기 명단" className="min-h-0 flex-1 overflow-y-auto" onWheel={() => setAutoScroll(false)} onTouchStart={() => setAutoScroll(false)}>
        <div className={`${width} mx-auto px-6 py-3`}>{children}</div>
      </div>
    </div>
  );
}

export function BoardEmpty({ text = '대기 중인 환자가 없습니다' }) {
  return <div className="text-center py-10 text-slate-400">{text}</div>;
}

export function patientBoardName(p) {
  const suffix = String(p.id ?? '').trim().slice(-4);
  return `${maskName(p.name)}${suffix ? ` (${suffix})` : ''}`;
}

export function BoardNumberRow({ n, name, color, compact, note }) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  return (
    <div className={`flex flex-wrap items-center gap-2 bg-white border ${c.border} rounded-lg px-3 py-1.5`}>
      <div className={`${compact ? 'w-7 h-7 text-base' : 'w-9 h-9 text-xl'} rounded-full ${c.solid} text-white flex items-center justify-center font-semibold shrink-0`}>{n}</div>
      <div className={`${compact ? 'text-lg' : 'text-2xl'} font-medium text-slate-900`}>{name}</div>
      {note && <div className={`text-sm ${c.text}`}>{note}</div>}
    </div>
  );
}

// 대기 화면 안내 문구 (관리자 > 대기 화면 안내에서 입력, 모든 환자용 화면 공유)
export const NOTICE_PRESETS = ['예약시간이 빠른 환자부터 먼저 검사합니다', '현재 약 30분 정도 지연되고 있습니다', '잠시 후 순서대로 불러드리겠습니다'];
export const loadNotices = (meta) => loadKey('board-notices', { notices: {}, presets: NOTICE_PRESETS }, meta);
export const NoticeContext = createContext({ notices: {} });
export function useNotice(key) {
  return String(useContext(NoticeContext)?.notices?.[key] || '').trim();
}
export function BoardNotice({ text, label, compact }) {
  if (!text) return null;
  return (
    <div role="status" className={`bg-yellow-100 border-2 border-yellow-400 rounded-xl ${compact ? 'px-3 py-2 text-base' : 'px-4 py-3 text-xl'} font-semibold text-yellow-900 mb-3`}>
      📢 {label ? <span className="font-bold">{label}: </span> : null}{text}
    </div>
  );
}

export function VisionBoardList({ patients, compact }) {
  const notice = useNotice('vision');
  const list = patients.filter(p => !p.consultDone && p.checkin && !visionComplete(p)).sort(byQueue);
  return (
    <div>
      <BoardNotice text={notice} compact={compact} />
      {!list.length ? <BoardEmpty /> : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' }}>
          {list.map((p, i) => (
            <BoardNumberRow key={patientKey(p)} n={i + 1} name={patientBoardName(p)} color="blue" compact={compact} note={i === 0 ? '다음 순서' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}
export function RoomNotices({ settings, compact }) {
  const notices = useContext(NoticeContext)?.notices || {};
  return settings.rooms
    .filter(r => String(notices[`room:${r.id}`] || '').trim())
    .map(r => <BoardNotice key={r.id} label={r.patientName || r.name} text={String(notices[`room:${r.id}`]).trim()} compact={compact} />);
}

export function ExamBoardList({ patients, settings, compact }) {
  // 처치실에서 먼저 할 일(진료 전 처치, 검사 준비)도 함께 안내
  const treat = treatRoomOf(settings);
  const examsNotice = useNotice('exams');
  const treatTodo = (p) => !pastVision(p) ? [] : preProcPending(p)
    ? (p.preProcs || []).filter(x => !x.done).map(x => x.name)
    : prepPendingTests(p, settings).filter(t => !prepOf(p, t)?.startedAt).map(t => `${t.name || t.short} 검사 준비`);
  const list = patients
    .filter(p => !p.consultDone && (pendingRooms(p, settings).length > 0 || treatTodo(p).length > 0))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  return (
    <div>
      <BoardNotice text={examsNotice} compact={compact} />
      <RoomNotices settings={settings} compact={compact} />
      {list.length === 0 ? <BoardEmpty /> : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' }}>
          {list.map(p => (
            <div key={patientKey(p)} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap">
              <span className={`${compact ? 'text-lg' : 'text-2xl'} font-medium text-slate-900`}>{patientBoardName(p)}</span>
              <div className="flex flex-wrap gap-2 justify-end">
                {!activeVf(p) && prepHolding(p, settings) && <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900">{prepHolding(p, settings).name || prepHolding(p, settings).short} 중</span>}
                {activeVf(p) && <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900">{settings.tests.find(t => t.id === activeVf(p))?.name || '시야검사'} 검사 중</span>}
                {!activeVf(p) && treatTodo(p).length > 0 && (
                  <span className={`${compact ? 'text-xs' : 'text-sm'} px-3 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200`}>
                    {treat.patientName || treat.name}: {treatTodo(p).join(', ')}
                  </span>
                )}
                {(activeVf(p) || prepHolding(p, settings) ? [] : pendingRooms(p, settings)).map(r => {
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
export function consultRoomLabel(prefs, doctor) {
  const v = String(prefs?.[doctor]?.roomNo ?? '').trim();
  if (!v) return '';
  return /^\d+$/.test(v) ? `${v}번 진료실` : v;
}

// 설정 > 교수 관리: 진찰실 번호 (칸을 벗어나거나 Enter 를 누르면 저장)
export function DoctorRoomInput({ name, value, onSave }) {
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

export function ConsultBoardSection({ doctor, patients, settings, compact, plain, roomLabel = '' }) {
  const mine = patients.filter(p => p.doctor === doctor && !p.consultDone);
  const inRoom = mine.find(inConsult);
  const waiting = mine.filter(p => consultWaiting(p, settings)).sort(byQueue);
  const testing = mine.filter(p => !p.seen && !allDone(p, settings)).length;
  const notice = useNotice(`doctor:${doctor}`);
  return (
    <div className={plain ? '' : 'bg-white border border-amber-200 rounded-2xl p-4'}>
      {!plain && (
        <div className={`${compact ? 'text-lg' : 'text-xl'} font-semibold text-slate-900 mb-3 flex items-baseline justify-between gap-2 flex-wrap`}>
          {doctor}
          {roomLabel && <span className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-amber-700`}>{roomLabel}</span>}
        </div>
      )}
      <BoardNotice text={notice} compact={compact} />
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

export function BoardColumn({ title, children }) {
  return (
    <div>
      <div className="text-xl font-semibold text-slate-800 mb-3 pb-2 border-b-2 border-slate-200">{title}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function BoardSelect({ doctors, settings, onSelect, onBack }) {
  const vName = visionNames(settings).patientName;
  const options = [
    { key: 'vision', label: `${vName} 대기 명단`, sub: '순번 표시' },
    { key: 'exam', label: '검사실 대기 명단', sub: '순번 없이 검사실·검사 안내' },
    { key: 'vision-exam', label: `${vName} + 검사실`, sub: '두 명단을 한 화면에' },
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

export function BoardView({ kind, patients, settings, doctors, doctorPrefs, onBack }) {
  const [layout, setLayout] = useState('horizontal');
  const activeDoctors = Array.from(new Set([...doctors, ...patients.map(p => p.doctor).filter(Boolean)]))
    .filter(d => patients.some(p => p.doctor === d && !p.consultDone));

  if (kind === 'vision') {
    return <BoardShell title={`${visionNames(settings).patientName} 대기 순서`} onBack={onBack}><VisionBoardList patients={patients} /></BoardShell>;
  }
  if (kind === 'exam') {
    return <BoardShell title="검사실 대기 명단" onBack={onBack}><ExamBoardList patients={patients} settings={settings} /></BoardShell>;
  }
  if (kind === 'vision-exam') {
    return (
      <BoardShell title="검사 대기 현황" onBack={onBack} wide extra={<label className="text-xs text-slate-500">배치 <select aria-label="대기 명단 배치" value={layout} onChange={e => setLayout(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1"><option value="horizontal">좌우 배치</option><option value="vertical">위아래 배치</option></select></label>}>
        <div className="grid gap-4" style={{ gridTemplateColumns: layout === 'horizontal' ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
          <BoardColumn title={visionNames(settings).patientName}><VisionBoardList patients={patients} /></BoardColumn>
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
        <BoardColumn title={visionNames(settings).patientName}><VisionBoardList patients={patients} compact /></BoardColumn>
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
