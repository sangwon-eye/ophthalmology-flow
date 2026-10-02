// 환자용 화면·QR 접수
import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Megaphone } from 'lucide-react';
import { WAIT_TEXT, shownWait, activeVf, allDone, byQueue, consultWaiting, inConsult, maskName, pastVision, patientKey, pendingRooms, pendingTests, preProcPending, roomPending, prepOf, prepPendingTests, roomColor, treatRoomOf, visionComplete, prepHolding } from '../core/flow.jsx';
import { loadKey, visionNames } from '../core/storage.jsx';
import { ScreenShell, TextSizeControl } from '../ui/common.jsx';
import { ChimeControl, useChime } from '../ui/chime.jsx';

/* ------------------------------------------------------------------ */
/* 환자용 화면                                                          */
/* ------------------------------------------------------------------ */
// 환자용 화면 폭: 넓은 모니터(TV)에서도 화면을 꽉 채워 명단이 한눈에 보이도록
const BOARD_WIDTH = 'mx-auto w-full max-w-[120rem] px-8';
// 환자용 화면은 어두운 바탕 + 밝은 글씨 (멀리서도 잘 보이게). 방 색깔은 밝은 톤으로
const DARK = {
  blue: { num: 'bg-blue-500 text-white', next: 'bg-blue-500/15 border-blue-400/70', badge: 'bg-blue-500 text-white', chip: 'bg-blue-400/15 text-blue-100 border-blue-400/50' },
  amber: { num: 'bg-amber-400 text-slate-950', next: 'bg-amber-400/15 border-amber-300/70', badge: 'bg-amber-400 text-slate-950', chip: 'bg-amber-400/15 text-amber-100 border-amber-400/50' },
  teal: { chip: 'bg-teal-400/15 text-teal-100 border-teal-400/50' },
  violet: { chip: 'bg-violet-400/15 text-violet-100 border-violet-400/50' },
  rose: { chip: 'bg-rose-400/15 text-rose-100 border-rose-400/50' },
  sky: { chip: 'bg-sky-400/15 text-sky-100 border-sky-400/50' },
  emerald: { chip: 'bg-emerald-400/15 text-emerald-100 border-emerald-400/50' },
  indigo: { chip: 'bg-indigo-400/15 text-indigo-100 border-indigo-400/50' },
  slate: { chip: 'bg-slate-400/15 text-slate-100 border-slate-400/50' },
};
const darkChip = (color) => (DARK[color] || DARK.slate).chip;
export function BoardShell({ title, badge, onBack, extra, big, children }) {
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
  return (
    <div className="h-dvh min-h-0 flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      <div className="shrink-0 bg-slate-950 border-b border-slate-800">
        <div className={`${BOARD_WIDTH} py-4 flex items-center gap-6`}>
          {/* 제목은 낱말 단위로만 줄을 바꿈 (글자 중간에서 끊기지 않게). 진료실 번호는 옆에 배지로 */}
          <h1 className={`min-w-0 flex-1 flex flex-wrap items-center gap-x-4 gap-y-1 ${big ? 'text-5xl' : 'text-3xl'} font-bold text-white break-keep`}>
            <span>{title}</span>
            {badge && <span className={`whitespace-nowrap rounded-xl bg-amber-400 px-3 py-0.5 ${big ? 'text-4xl' : 'text-2xl'} font-bold text-slate-950`}>{badge}</span>}
          </h1>
          <span className="shrink-0 whitespace-nowrap text-3xl text-slate-300 tabular-nums">{now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      <div ref={scrollRef} tabIndex={0} aria-label="환자 대기 명단" className="board-scroll min-h-0 flex-1 overflow-y-auto" onWheel={() => setAutoScroll(false)} onTouchStart={() => setAutoScroll(false)}>
        <div className={`${BOARD_WIDTH} py-4`}>{children}</div>
      </div>
      {/* 직원용 버튼: 환자에게 덜 보이도록 오른쪽 아래에 작게 (QR 접수 화면의 '관리'처럼) */}
      <div className="shrink-0">
        <div className={`${BOARD_WIDTH} py-1.5 flex items-center justify-end gap-3 whitespace-nowrap text-slate-500`}>
          {extra}
          <button type="button" aria-pressed={autoScroll} onClick={() => setAutoScroll(v => !v)} className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-400">{autoScroll ? '자동 스크롤 켜짐' : '자동 스크롤 꺼짐'}</button>
          <TextSizeControl className="text-slate-500" selectClassName="border-slate-700 bg-slate-800 text-slate-400" />
          <button type="button" onClick={onBack} className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-400">메인 화면</button>
        </div>
      </div>
    </div>
  );
}

export function BoardEmpty({ text = '대기 중인 환자가 없습니다' }) {
  return <div className="text-center py-10 text-slate-500">{text}</div>;
}

export function patientBoardName(p) {
  const suffix = String(p.id ?? '').trim().slice(-4);
  return `${maskName(p.name)}${suffix ? ` (${suffix})` : ''}`;
}

// 순번 칸 (시력방·진료실). 1번은 연한 색 바탕 + 모서리에 '다음 순서' 배지 (칸 높이는 다른 칸과 같게)
export function BoardNumberRow({ n, name, color, compact, note }) {
  const c = DARK[color] || DARK.blue;
  return (
    <div className={`relative flex items-center gap-3 border ${note ? c.next : 'bg-slate-800 border-slate-700'} rounded-lg px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      <div className={`${compact ? 'w-7 h-7 text-base' : 'w-9 h-9 text-xl'} rounded-full ${c.num} flex items-center justify-center font-bold shrink-0`}>{n}</div>
      <div className={`${compact ? 'text-lg' : 'text-2xl'} min-w-0 font-bold text-white`}>{name}</div>
      {note && <span className={`absolute ${compact ? '-top-2.5 text-xs' : '-top-3 text-sm'} right-3 whitespace-nowrap rounded-full ${c.badge} px-2.5 py-0.5 font-bold`}>{note}</span>}
    </div>
  );
}
// 명단 칸 배치: 칸 너비를 일정하게 (환자가 적어도 칸이 옆으로 늘어나지 않게)
export const boardGrid = (minRem) => ({ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minRem}rem), 1fr))` });

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
    <div role="status" className={`flex items-start gap-2 bg-yellow-300 rounded-xl ${compact ? 'px-3 py-2 text-base' : 'px-4 py-3 text-xl'} font-bold text-slate-950 mb-3 break-keep`}>
      <Megaphone aria-hidden="true" className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} shrink-0 mt-0.5`} />
      <span>{label ? <span className="font-extrabold">{label}: </span> : null}{text}</span>
    </div>
  );
}

// 대기 시간 안내 (관리자 > 대기 화면 안내에서 반자동/자동)
export function WaitNotice({ patients, kind, compact }) {
  const waits = useContext(NoticeContext)?.waits;
  // 명단이 그대로여도 기다린 시간은 늘어나므로 가끔 다시 계산
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(i); }, []);
  const n = shownWait(waits, patients, kind);
  return n ? <BoardNotice text={WAIT_TEXT[kind].replace('{n}', n)} compact={compact} /> : null;
}

// 앞 순서 큰 칸 (진료실 앞 모니터·시력방 TV)
function BigRow({ label, name, size, tone = 'amber', n }) {
  const c = DARK[tone] || DARK.amber;
  const S = {
    xl: { box: 'px-6 py-4 gap-5', name: 'text-6xl', tag: 'text-2xl px-4 py-1', num: 'w-16 h-16 text-4xl' },
    lg: { box: 'px-5 py-3 gap-4', name: 'text-5xl', tag: 'text-xl px-3 py-1', num: 'w-14 h-14 text-3xl' },
    md: { box: 'px-4 py-2.5 gap-3', name: 'text-4xl', tag: 'text-lg px-3 py-0.5', num: 'w-12 h-12 text-2xl' },
  }[size];
  return (
    <div className={`flex items-center ${S.box} rounded-2xl border-2 ${label ? c.next : 'bg-slate-800 border-slate-600'}`}>
      {label ? <span className={`shrink-0 whitespace-nowrap rounded-full ${c.badge} ${S.tag} font-bold`}>{label}</span>
        : <span className={`${S.num} shrink-0 rounded-full ${c.num} flex items-center justify-center font-bold`}>{n}</span>}
      <span className={`${S.name} min-w-0 font-bold text-white whitespace-nowrap`}>{name}</span>
    </div>
  );
}
function SmallRest({ list, start, color }) {
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <div className="text-lg text-slate-400 mb-2">그다음 순서</div>
      <div className="grid gap-2" style={boardGrid(15)}>
        {list.map((p, i) => <BoardNumberRow key={patientKey(p)} n={start + i} name={patientBoardName(p)} color={color} compact />)}
      </div>
    </div>
  );
}

export function VisionBoardList({ patients, compact, big }) {
  const notice = useNotice('vision');
  const list = patients.filter(p => !p.consultDone && p.checkin && !visionComplete(p)).sort(byQueue);
  return (
    <div>
      <WaitNotice patients={patients} kind="vision" compact={compact} />
      <BoardNotice text={notice} compact={compact} />
      {!list.length ? <BoardEmpty /> : big ? (
        <div>
          <BigRow label="다음 순서" name={patientBoardName(list[0])} size="xl" tone="blue" />
          {list.length > 1 && (
            <div className="grid gap-3 mt-3" style={boardGrid(24)}>
              {list.slice(1, 5).map((p, i) => <BigRow key={patientKey(p)} n={i + 2} name={patientBoardName(p)} size="lg" tone="blue" />)}
            </div>
          )}
          <SmallRest list={list.slice(5)} start={6} color="blue" />
        </div>
      ) : (
        <div className="grid gap-2.5" style={boardGrid(compact ? 13 : 17)}>
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
      <WaitNotice patients={patients} kind="exams" compact={compact} />
      <BoardNotice text={examsNotice} compact={compact} />
      <RoomNotices settings={settings} compact={compact} />
      {list.length === 0 ? <BoardEmpty /> : (
        <div className="grid gap-2.5" style={boardGrid(compact ? 15 : 20)}>
          {list.map(p => (
            <div key={patientKey(p)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 break-keep">
              <div className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-white`}>{patientBoardName(p)}</div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {!activeVf(p) && prepHolding(p, settings) && <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${darkChip('amber')}`}>{prepHolding(p, settings).name || prepHolding(p, settings).short} 중</span>}
                {activeVf(p) && <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${darkChip('amber')}`}>{settings.tests.find(t => t.id === activeVf(p))?.name || '시야검사'} 검사 중</span>}
                {!activeVf(p) && treatTodo(p).length > 0 && (
                  <span className={`${compact ? 'text-xs' : 'text-sm'} px-3 py-1 rounded-xl border font-medium ${darkChip('rose')}`}>
                    {treat.patientName || treat.name}: {treatTodo(p).join(', ')}
                  </span>
                )}
                {(activeVf(p) || prepHolding(p, settings) ? [] : pendingRooms(p, settings)).map(r => {
                  return (
                    <span key={r.id} className={`${compact ? 'text-xs' : 'text-sm'} px-3 py-1 rounded-xl border font-medium ${darkChip(roomColor(settings, r.id))}`}>
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

// 검사실 한 곳 대기 명단 (검사실 문 앞 모니터용): 그 검사실에서 할 검사만
export function RoomBoardList({ room, patients, settings }) {
  const notice = useNotice(`room:${room.id}`);
  const list = patients
    .filter(p => !p.consultDone && roomPending(p, settings, room.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  return (
    <div>
      <BoardNotice text={notice} />
      {list.length === 0 ? <BoardEmpty /> : (
        <div className="grid gap-2.5" style={boardGrid(20)}>
          {list.map(p => {
            const vf = activeVf(p);
            const vfTest = vf && settings.tests.find(t => t.id === vf);
            return (
              <div key={patientKey(p)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 break-keep">
                <div className="text-2xl font-bold text-white">{patientBoardName(p)}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {vfTest && <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${darkChip('amber')}`}>{vfTest.name || '시야검사'} 검사 중</span>}
                  <span className={`text-sm px-3 py-1 rounded-xl border font-medium ${darkChip(roomColor(settings, room.id))}`}>
                    {pendingTests(p, settings, room.id).map(t => t.name || t.short).join(', ')}
                  </span>
                </div>
              </div>
            );
          })}
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
  // 진료실 앞 모니터(교수님 한 분): 진료 중·다음 순서는 가장 크게, 2·3번은 크게, 그다음은 작게
  if (plain) {
    return (
      <div>
        <BoardNotice text={notice} />
        <div className="space-y-3">
          {inRoom && <BigRow label="진료 중" name={patientBoardName(inRoom)} size="xl" />}
          {waiting[0] && <BigRow label="다음 순서" name={patientBoardName(waiting[0])} size="xl" />}
          {waiting.length > 1 && (
            <div className="grid gap-3" style={boardGrid(22)}>
              {waiting.slice(1, 3).map((p, i) => <BigRow key={patientKey(p)} n={i + 2} name={patientBoardName(p)} size="md" />)}
            </div>
          )}
        </div>
        {!waiting.length && <div className="text-2xl text-slate-500 py-4">진료 대기 환자가 없습니다</div>}
        <SmallRest list={waiting.slice(3)} start={4} color="amber" />
        {testing > 0 && <div className="text-lg text-slate-400 mt-4">검사 진행 중 {testing}명</div>}
      </div>
    );
  }
  return (
    <div className={plain ? '' : 'bg-slate-800/50 border border-slate-700 rounded-2xl p-4'}>
      {!plain && (
        <div className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-white mb-3 flex items-center justify-between gap-2 flex-wrap break-keep`}>
          {doctor}
          {roomLabel && <span className={`${compact ? 'text-base' : 'text-lg'} whitespace-nowrap rounded-lg bg-amber-400 px-2.5 py-0.5 font-bold text-slate-950`}>{roomLabel}</span>}
        </div>
      )}
      <BoardNotice text={notice} compact={compact} />
      {inRoom && (
        <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/50 rounded-xl px-4 py-2.5 mb-3">
          <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-400 px-3 py-0.5 text-sm font-bold text-slate-950">진료 중</span>
          <span className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-white`}>{patientBoardName(inRoom)}</span>
        </div>
      )}
      {waiting.length === 0 ? (
        <div className="text-sm text-slate-500 py-3">진료 대기 환자가 없습니다</div>
      ) : (
        <div className="grid gap-2.5" style={boardGrid(compact ? 13 : 17)}>
          {waiting.map((p, i) => (
            <BoardNumberRow key={patientKey(p)} n={i + 1} name={patientBoardName(p)} color="amber" compact={compact} note={i === 0 ? '다음 순서' : ''} />
          ))}
        </div>
      )}
      {testing > 0 && <div className="text-sm text-slate-400 mt-3">검사 진행 중 {testing}명</div>}
    </div>
  );
}

export function BoardColumn({ title, children }) {
  return (
    <div>
      <div className="text-xl font-bold text-slate-100 mb-3 pb-2 border-b-2 border-slate-700">{title}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function BoardSelect({ doctors, settings, onSelect, onBack }) {
  const vName = visionNames(settings).patientName;
  const options = [
    { key: 'vision', label: `${vName} 대기 명단`, sub: '순번 표시' },
    { key: 'exam', label: '검사실 대기 명단', sub: '순번 없이 검사실·검사 안내' },
    ...settings.rooms.filter(r => !r.builtin).map(r => ({ key: `room:${r.id}`, label: `${r.patientName || r.name} 대기 명단`, sub: `${r.name} 검사실 앞 모니터용 (이 검사실 검사만)` })),
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

export function BoardView({ kind, patients, settings, doctors, doctorPrefs, ready = true, onBack }) {
  const [layout, setLayout] = useState('horizontal');
  const activeDoctors = Array.from(new Set([...doctors, ...patients.map(p => p.doctor).filter(Boolean)]))
    .filter(d => patients.some(p => p.doctor === d && !p.consultDone));
  // 진료실 앞 모니터: 직원 진료실 화면처럼 그 교수님 진료 호출이 생기면 띵동 (오른쪽 아래 종 버튼으로 이 컴퓨터만 끄기)
  const chimeDoctor = kind.startsWith('consult:') ? kind.slice('consult:'.length) : '';
  useChime(chimeDoctor ? patients.filter(p => p.doctor === chimeDoctor && inConsult(p)).map(patientKey) : [], { ready: ready && !!chimeDoctor, context: chimeDoctor });

  if (kind === 'vision') {
    return <BoardShell title={`${visionNames(settings).patientName} 대기 순서`} onBack={onBack}><VisionBoardList patients={patients} big /></BoardShell>;
  }
  if (kind === 'exam') {
    return <BoardShell title="검사실 대기 명단" onBack={onBack}><ExamBoardList patients={patients} settings={settings} /></BoardShell>;
  }
  if (kind === 'vision-exam') {
    return (
      <BoardShell title="검사 대기 현황" onBack={onBack} extra={<label className="text-xs text-slate-500">배치 <select aria-label="대기 명단 배치" value={layout} onChange={e => setLayout(e.target.value)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-400"><option value="horizontal">좌우 배치</option><option value="vertical">위아래 배치</option></select></label>}>
        <div className="grid gap-6" style={{ gridTemplateColumns: layout === 'horizontal' ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
          <BoardColumn title={visionNames(settings).patientName}><VisionBoardList patients={patients} big /></BoardColumn>
          <BoardColumn title="검사실"><ExamBoardList patients={patients} settings={settings} /></BoardColumn>
        </div>
      </BoardShell>
    );
  }
  if (kind.startsWith('room:')) {
    const room = settings.rooms.find(r => r.id === kind.slice('room:'.length));
    if (!room) return <BoardShell title="검사실 대기 명단" onBack={onBack}><BoardEmpty text="설정에서 이 검사실을 찾을 수 없습니다" /></BoardShell>;
    const label = room.patientName || room.name;
    return (
      <BoardShell title={`${label} 대기 명단`} badge={room.patientName && room.patientName !== room.name ? room.name : ''} onBack={onBack}>
        <RoomBoardList room={room} patients={patients} settings={settings} />
      </BoardShell>
    );
  }
  if (kind === 'consult-all') {
    return (
      <BoardShell title="진료 대기 순서" onBack={onBack}>
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
      <BoardShell title={`${d} 교수님 진료`} big badge={consultRoomLabel(doctorPrefs, d)} onBack={onBack} extra={<ChimeControl dark />}>
        <ConsultBoardSection doctor={d} patients={patients} settings={settings} plain roomLabel={consultRoomLabel(doctorPrefs, d)} />
      </BoardShell>
    );
  }
  return (
    <BoardShell title="오늘의 대기 현황" onBack={onBack}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
