// 환자용 화면·QR 접수
import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Megaphone, QrCode } from 'lucide-react';
import { inProgressText, boardReservation, isReconsult, WAIT_TEXT, shownWait, activeVf, allDone, byQueue, consultQueue, consultFrontCount, consultWaiting, dropsPending, inConsult, pastVision, patientKey, pendingRooms, pendingTests, preProcPending, roomPending, prepOf, prepPendingTests, roomColor, treatRoomOf, visionComplete, prepHolding } from '../core/flow.jsx';
import { loadKey, visionNames } from '../core/storage.jsx';
import { ScreenShell, TextSizeControl, textScale, useTextSize } from '../ui/common.jsx';
import { ChimeControl, useChime, useSoundBlocked } from '../ui/chime.jsx';
import { BellOff } from 'lucide-react';

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
// 어두운 바탕 위 방 색깔 글씨 (큰 TV 검사실 명단)
const DARK_TEXT = { blue: 'text-blue-300', amber: 'text-amber-300', teal: 'text-teal-300', violet: 'text-violet-300', rose: 'text-rose-300', sky: 'text-sky-300', emerald: 'text-emerald-300', indigo: 'text-indigo-300', slate: 'text-slate-300' };
const darkText = (color) => DARK_TEXT[color] || DARK_TEXT.sky;
// 직원용 버튼(자동 스크롤·글씨·종·메인 화면): 환자·보호자에게는 안 보이게 평소엔 숨기고,
// 마우스를 움직이거나 화면을 누르면 잠깐(5초) 나타남. '글씨' 크기와 상관없이 늘 같은 작은 크기
const STAFF_HIDE_MS = 5000;
// keyWake=false: QR 리더기가 보내는 키 입력으로는 나타나지 않게 (진료실 대기 명단 + QR 접수)
function useStaffControls(keyWake = true) {
  const [show, setShow] = useState(false);
  const hold = useRef(false); // 버튼 위에 마우스가 있거나 고르는 중이면 숨기지 않음
  useEffect(() => {
    let timer = null;
    const hideLater = () => {
      clearTimeout(timer);
      timer = setTimeout(function check() {
        if (hold.current) { timer = setTimeout(check, 1000); return; }
        setShow(false);
      }, STAFF_HIDE_MS);
    };
    const wake = () => { setShow(true); hideLater(); };
    const evs = ['mousemove', 'pointerdown', ...(keyWake ? ['keydown'] : []), 'touchstart'];
    evs.forEach(e => window.addEventListener(e, wake, true));
    return () => { clearTimeout(timer); evs.forEach(e => window.removeEventListener(e, wake, true)); };
  }, [keyWake]);
  return [show, hold];
}

// footer: 명단 아래 고정 줄 (QR 접수 안내), keyWake: 키 입력으로 직원 버튼을 띄울지
export function BoardShell({ title, badge, onBack, extra, big, chime = false, footer = null, keyWake = true, children }) {
  const [now, setNow] = useState(new Date());
  const [staffShow, staffHold] = useStaffControls(keyWake);
  const [textSize] = useTextSize();
  const soundBlocked = useSoundBlocked();
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
    <div className="relative h-dvh min-h-0 flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      <div className="shrink-0 bg-slate-950 border-b border-slate-800">
        <div className={`${BOARD_WIDTH} py-4 flex items-center gap-6`}>
          {/* 제목은 낱말 단위로만 줄을 바꿈 (글자 중간에서 끊기지 않게). 진료실 번호는 옆에 배지로 */}
          <h1 className={`min-w-0 flex-1 flex flex-wrap items-center ${big ? 'gap-x-5 gap-y-3 text-5xl leading-snug' : 'gap-x-4 gap-y-1 text-3xl'} font-bold text-white break-keep`}>
            <span>{title}</span>
            {badge && <span className={`whitespace-nowrap bg-amber-400 font-bold text-slate-950 ${big ? 'rounded-2xl px-5 py-1.5 text-4xl leading-snug' : 'rounded-xl px-3 py-0.5 text-2xl'}`}>{badge}</span>}
          </h1>
          <span className={`shrink-0 whitespace-nowrap ${big ? 'text-2xl' : 'text-3xl'} text-slate-300 tabular-nums`}>{now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      <div ref={scrollRef} tabIndex={0} aria-label="환자 대기 명단" className="board-scroll min-h-0 flex-1 overflow-y-auto" onWheel={() => setAutoScroll(false)} onTouchStart={() => setAutoScroll(false)}>
        <div className={`${BOARD_WIDTH} py-4`}>{children}</div>
      </div>
      {footer}
      {/* 직원용 버튼: 오른쪽 아래 구석, 평소엔 숨김 (마우스를 움직이면 나타남). zoom 으로 '글씨' 크기와 상관없이 같은 크기 */}
      <div
        data-staff-controls
        onMouseEnter={() => { staffHold.current = true; }}
        onMouseLeave={() => { staffHold.current = false; }}
        onFocus={() => { staffHold.current = true; }}
        onBlur={() => { staffHold.current = false; }}
        style={{ zoom: 1 / textScale(textSize) }}
        className={`absolute bottom-3 right-4 z-20 flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-700/80 bg-slate-950/90 px-3 py-2 text-slate-500 shadow-lg transition-opacity duration-300 ${staffShow ? 'opacity-100' : 'opacity-0'}`}
      >
        {chime && <ChimeControl dark />}
        {extra}
        <button type="button" aria-pressed={autoScroll} onClick={() => setAutoScroll(v => !v)} className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-400">{autoScroll ? '자동 스크롤 켜짐' : '자동 스크롤 꺼짐'}</button>
        <TextSizeControl className="text-slate-500" selectClassName="border-slate-700 bg-slate-800 text-slate-400" />
        <button type="button" onClick={onBack} className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-400">메인 화면</button>
      </div>
      {/* 숨겨 둔 동안 띵동 소리가 막혀 있으면 아주 작은 표시만 (직원이 화면을 한 번 누르면 풀림) */}
      {!staffShow && soundBlocked && chime && (
        <div aria-hidden="true" title="소리를 켜려면 화면을 한 번 눌러 주세요" style={{ zoom: 1 / textScale(textSize) }} className="absolute bottom-3 right-4 z-10 text-amber-400/70">
          <BellOff size={16} />
        </div>
      )}
    </div>
  );
}

export function BoardEmpty({ text = '대기 중인 환자가 없습니다' }) {
  return <div className="text-center py-10 text-slate-500">{text}</div>;
}

// 환자용 화면·QR 안내의 이름: 전체 이름 + 번호 뒷 4자리 (10-08 사용자: 가운데 * 가리기를 없앰 — 동명이인은 번호로 구분)
export function patientBoardName(p) {
  const suffix = String(p.id ?? '').trim().slice(-4);
  return `${String(p.name ?? '').trim()}${suffix ? ` (${suffix})` : ''}`;
}

// 순번 칸 (시력방·진료실). 1번은 연한 색 바탕 + 모서리에 '다음 순서' 배지 (칸 높이는 다른 칸과 같게)
// p: 환자 (이름은 크게, 번호 뒷 4자리는 작고 연하게 — 10-08, 진료실 명단과 같게). 없으면 name 글자 그대로
export function BoardNumberRow({ n, name, p = null, color, compact, note }) {
  const c = DARK[color] || DARK.blue;
  return (
    <div className={`relative flex items-center gap-3 border ${note ? c.next : 'bg-slate-800 border-slate-700'} rounded-lg px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      <div className={`${compact ? 'w-7 h-7 text-base' : 'w-9 h-9 text-xl'} rounded-full ${c.num} flex items-center justify-center font-bold shrink-0`}>{n}</div>
      {p ? <NameTail p={p} box="min-w-0 leading-snug" nameCls={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-white`} tailCls={`${compact ? 'text-sm' : 'text-lg'} font-semibold text-slate-400`} />
        : <div className={`${compact ? 'text-lg' : 'text-2xl'} min-w-0 font-bold text-white`}>{name}</div>}
      {note && <span className={`absolute ${compact ? '-top-2.5 text-xs' : '-top-3 text-sm'} right-3 whitespace-nowrap rounded-full ${c.badge} px-2.5 py-0.5 font-bold`}>{note}</span>}
    </div>
  );
}
// 진료실 명단 한 줄 (10-07 사용자): 순번 · 예약시간 · 이름 · 번호 뒷 4자리 · 재진료
// 예약시간은 칸 너비를 같게 해서 줄마다 세로로 맞춤(굵은 밝은 노랑 + 작은 '예약'), 번호는 이름보다 작고 연하게,
// '재진료'는 오른쪽 끝 하늘색 배지 (순번의 노랑과 구분). 지각·예약 없음은 시간 칸만 비움
export function boardNameParts(p) {
  const tail = String(p?.id ?? '').trim().slice(-4);
  return { name: String(p?.name ?? '').trim(), tail };
}
// 10-08 사용자: 줄마다 붙던 작은 '예약' 글자는 뺌 (명단 아래 한 줄 '이름 앞 시각은 예약 시간입니다'로 한 번만 안내)
function ResvTime({ p, cls, style }) {
  const t = boardReservation(p);
  return <span data-resv style={style} className={`${cls} shrink-0 whitespace-nowrap text-right font-extrabold tabular-nums text-amber-200 leading-snug`}>{t || null}</span>;
}
// 이름 + 번호 뒷 4자리: 이름·번호는 각각 줄이 바뀌지 않고, 칸이 모자라면 둘 사이에서만 다음 줄로.
// flex-1 basis-0 + 최소 폭(이름 길이): 이름은 예약시간 옆 같은 줄에 남고 번호 뒷 4자리만 이름 아래로 (10-08 — 이름이 예약시간 아래로 떨어지던 것)
// box: 바깥 칸 클래스 (진료실 명단 줄 안에서는 flex-1 basis-0, 다른 명단에서는 글자 줄 그대로)
function NameTail({ p, nameCls, tailCls, nameStyle, box = 'flex-1 basis-0 leading-snug' }) {
  const { name, tail } = boardNameParts(p);
  return (
    <span className={box}>
      <span className={`${nameCls} whitespace-nowrap`} style={nameStyle}>{name}</span>
      {tail && <> <span className={`${tailCls} whitespace-nowrap tabular-nums`}>({tail})</span></>}
    </span>
  );
}
// 칸 위 테두리 오른쪽 모서리 표: '재진료'(하늘색) · '다음 순서'(노랑) (10-08 사용자: 전체 이름이 길어 '재진료'가 아래 줄로 내려가던 것 —
// 줄 안의 자리를 차지하지 않아 칸 높이가 늘 같음, 복도 끝 '다음 순서' 모서리 표와 같은 방식). 칸 사이 간격은 표가 위 칸에 닿지 않게 넉넉히
function CornerTags({ p, note, noteCls, cls, pos }) {
  const re = !!p && isReconsult(p);
  if (!re && !note) return null;
  return (
    <span className={`absolute ${pos} flex items-center gap-1.5 leading-snug`}>
      {re && <span data-reconsult className={`${cls} whitespace-nowrap rounded-full bg-sky-300 text-slate-950 font-extrabold shadow`}>재진료</span>}
      {note && <span className={`${cls} whitespace-nowrap rounded-full ${noteCls} font-bold shadow`}>{note}</span>}
    </span>
  );
}
export function ConsultRow({ p, n, compact, note }) {
  const c = DARK.amber;
  return (
    <div data-consult-row className={`relative flex items-center gap-3 border ${note ? c.next : 'bg-slate-800 border-slate-700'} rounded-lg px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      <div className={`${compact ? 'w-7 h-7 text-base' : 'w-9 h-9 text-xl'} rounded-full ${c.num} flex items-center justify-center font-bold shrink-0`}>{n}</div>
      {/* 예약시간 칸은 폭을 같게 해 줄마다 세로로 맞춤 ('10:00'이 들어가는 폭), 이름은 늘 그 옆 */}
      {/* 예약시간·이름·번호 뒷 4자리는 같은 글자 바닥선(baseline)에 — 글씨 크기가 달라도 높이가 맞게 (10-08 사용자) */}
      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <ResvTime p={p} cls={compact ? 'min-w-[3.4rem] text-lg' : 'min-w-[4.5rem] text-2xl'} />
        <NameTail p={p} nameCls={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-white`} tailCls={`${compact ? 'text-sm' : 'text-lg'} font-semibold text-slate-400`} />
      </div>
      <CornerTags p={p} note={note} noteCls={c.badge} cls={compact ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-0.5'} pos={compact ? '-top-2 right-3' : '-top-3 right-3'} />
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
// inline: 제목 줄 옆에 (위아래 여백을 줄이고 글씨는 크고 굵게 — 시력방 + 검사실 큰 TV)
export function BoardNotice({ text, label, compact, inline }) {
  if (!text) return null;
  return (
    <div role="status" className={`flex items-start gap-2 bg-yellow-300 rounded-xl ${inline ? 'px-3 py-1 text-2xl leading-snug font-extrabold' : compact ? 'px-3 py-2 text-base font-bold mb-3' : 'px-4 py-3 text-xl font-bold mb-3'} text-slate-950 break-keep`}>
      <Megaphone aria-hidden="true" className={`${compact ? 'w-5 h-5' : inline ? 'w-7 h-7' : 'w-6 h-6'} shrink-0 mt-0.5`} />
      <span>{label ? <span className="font-extrabold">{label}: </span> : null}{text}</span>
    </div>
  );
}

// 대기 시간 안내 (관리자 > 대기 화면 안내에서 반자동/자동)
export function WaitNotice({ patients, kind, compact, inline }) {
  const waits = useContext(NoticeContext)?.waits;
  // 명단이 그대로여도 기다린 시간은 늘어나므로 가끔 다시 계산
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(i); }, []);
  const n = shownWait(waits, patients, kind);
  return n ? <BoardNotice text={WAIT_TEXT[kind].replace('{n}', n)} compact={compact} inline={inline} /> : null;
}

// 앞 순서 큰 칸 (진료실 앞 모니터·시력방 TV)
// 글자 위아래 여백: 맑은 고딕은 글자가 아래로 처져 보여서 줄 높이를 넉넉히(leading-snug) 주고 위아래 여백을 같게
// who: 이름만 쓰는 칸(시력방·진료 중)의 환자 — 번호 뒷 4자리를 작고 연하게 (10-08, 진료실 명단과 같게)
function BigRow({ label, name, size, tone = 'amber', n, muted = false, p = null, who = null }) {
  const c = DARK[tone] || DARK.amber;
  const S = {
    // corner: 모서리 '재진료' 표 크기·자리 (진료실 명단 큰 칸 — 다음 순서 xxl, 2·3번 md)
    xxl: { fit: { name: 'min(4.5rem, 11vw)', time: 'min(3rem, 7.5vw)' }, time: 'text-5xl', tail: 'text-4xl', corner: { cls: 'text-xl px-4 py-0.5', pos: '-top-4 right-6' }, box: 'px-6 py-4 gap-5', name: 'text-7xl', tag: 'text-2xl px-4 py-1.5', num: 'w-16 h-16 text-4xl' },
    xl: { time: 'text-5xl', tail: 'text-3xl', box: 'px-6 py-4 gap-5', name: 'text-6xl', tag: 'text-2xl px-4 py-1.5', num: 'w-16 h-16 text-4xl' },
    lg: { time: 'text-4xl', tail: 'text-3xl', box: 'px-5 py-3 gap-4', name: 'text-5xl', tag: 'text-xl px-3 py-1', num: 'w-14 h-14 text-3xl' },
    md: { time: 'text-3xl', tail: 'text-2xl', corner: { cls: 'text-base px-3 py-0.5', pos: '-top-3.5 right-5' }, box: 'px-4 py-2.5 gap-3', name: 'text-4xl', tag: 'text-lg px-3 py-1', num: 'w-12 h-12 text-2xl' },
    sm: { time: 'text-2xl', tail: 'text-xl', box: 'px-3 py-2 gap-3', name: 'text-3xl', tag: 'text-base px-2.5 py-0.5', num: 'w-10 h-10 text-xl' },
  }[size];
  // muted: 진료 중 (이미 진료실 안에 있어 덜 눈에 띄게, 회색 칸)
  const box = muted ? 'bg-slate-800/60 border-slate-700' : label ? c.next : 'bg-slate-800 border-slate-600';
  const tag = muted ? 'bg-slate-600 text-slate-100' : c.badge;
  return (
    <div className={`relative flex items-center ${S.box} rounded-2xl border-2 ${box}`}>
      {label ? <span className={`shrink-0 whitespace-nowrap rounded-full ${tag} ${S.tag} leading-snug font-bold`}>{label}</span>
        : <span className={`${S.num} shrink-0 rounded-full ${c.num} flex items-center justify-center font-bold`}>{n}</span>}
      {/* p가 있으면 진료실 명단: 예약시간 · 이름 · (번호 뒷 4자리), '재진료'는 칸 위 모서리 표.
          작은 화면에서 글씨를 키워도 겹치거나 잘리지 않게, 넘치면 번호 뒷 4자리부터 다음 줄로 */}
      {p ? (
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {/* 예약시간·이름·번호 뒷 4자리는 같은 글자 바닥선에 (글씨 크기가 달라도 높이가 맞게, 10-08 사용자) */}
          {/* fit: 가장 큰 칸(다음 순서)은 아주 좁은 화면에서 글씨를 키워도 화면 폭을 넘지 않게 상한 (보통 화면에서는 그대로) */}
          <ResvTime p={p} cls={S.time} style={S.fit ? { fontSize: S.fit.time } : undefined} />
          <NameTail p={p} nameCls={`${S.name} font-bold text-white`} tailCls={`${S.tail} font-semibold text-slate-400`} nameStyle={S.fit ? { fontSize: S.fit.name } : undefined} />
        </div>
      ) : (
        who ? <NameTail p={who} box="min-w-0 leading-snug" nameCls={`${S.name} ${size === 'sm' ? 'font-extrabold' : 'font-bold'} ${muted ? 'text-slate-200' : 'text-white'}`} tailCls={`${S.tail} font-semibold ${muted ? 'text-slate-500' : 'text-slate-400'}`} />
          : <span className={`${S.name} leading-snug min-w-0 ${size === 'sm' ? 'font-extrabold' : 'font-bold'} ${muted ? 'text-slate-200' : 'text-white'} whitespace-nowrap`}>{name}</span>
      )}
      {p && S.corner && <CornerTags p={p} cls={S.corner.cls} pos={S.corner.pos} />}
    </div>
  );
}
function SmallRest({ list, start, color, withTime = false }) {
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <div className="text-lg text-slate-400 mb-2">그다음 순서</div>
      <div className={`grid ${withTime ? 'gap-x-2 gap-y-3' : 'gap-2'}`} style={boardGrid(withTime ? 17 : 15)}>
        {list.map((p, i) => (withTime ? <ConsultRow key={patientKey(p)} p={p} n={start + i} compact />
          : <BoardNumberRow key={patientKey(p)} n={start + i} name={patientBoardName(p)} p={p} color={color} compact />))}
      </div>
    </div>
  );
}

export function VisionNotices({ patients, compact, inline }) {
  const notice = useNotice('vision');
  return <><WaitNotice patients={patients} kind="vision" compact={compact} inline={inline} /><BoardNotice text={notice} compact={compact} inline={inline} /></>;
}
// five: 시력방 + 검사실 큰 TV (5명씩 불러 검사 → 앞 5명 같은 크기, 6번부터 작게, 안내는 제목 줄에)
export function VisionBoardList({ patients, compact, big, five }) {
  const list = patients.filter(p => !p.consultDone && p.checkin && !visionComplete(p)).sort(byQueue);
  return (
    <div>
      {!five && <VisionNotices patients={patients} compact={compact} />}
      {!list.length ? <BoardEmpty /> : five ? (
        <div>
          <div className="grid gap-2.5" style={boardGrid(17)}>
            {list.slice(0, 5).map((p, i) => <BigRow key={patientKey(p)} n={i + 1} name={patientBoardName(p)} who={p} size="sm" tone="blue" />)}
          </div>
          <SmallRest list={list.slice(5)} start={6} color="blue" />
        </div>
      ) : big ? (
        <div>
          <BigRow label="다음 순서" name={patientBoardName(list[0])} who={list[0]} size="xl" tone="blue" />
          {list.length > 1 && (
            <div className="grid gap-3 mt-3" style={boardGrid(24)}>
              {list.slice(1, 5).map((p, i) => <BigRow key={patientKey(p)} n={i + 2} name={patientBoardName(p)} who={p} size="lg" tone="blue" />)}
            </div>
          )}
          <SmallRest list={list.slice(5)} start={6} color="blue" />
        </div>
      ) : (
        <div className="grid gap-2.5" style={boardGrid(compact ? 13 : 17)}>
          {list.map((p, i) => (
            <BoardNumberRow key={patientKey(p)} n={i + 1} name={patientBoardName(p)} p={p} color="blue" compact={compact} note={i === 0 ? '다음 순서' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}
export function RoomNotices({ settings, compact, inline }) {
  const notices = useContext(NoticeContext)?.notices || {};
  return settings.rooms
    .filter(r => String(notices[`room:${r.id}`] || '').trim())
    .map(r => <BoardNotice key={r.id} label={r.patientName || r.name} text={String(notices[`room:${r.id}`]).trim()} compact={compact} inline={inline} />);
}

export function ExamNotices({ patients, settings, compact, inline }) {
  const examsNotice = useNotice('exams');
  return <><WaitNotice patients={patients} kind="exams" compact={compact} inline={inline} /><BoardNotice text={examsNotice} compact={compact} inline={inline} /><RoomNotices settings={settings} compact={compact} inline={inline} /></>;
}
function testInProgressLabel(t) {
  return inProgressText(t?.name || t?.short);
}
// 검사실 명단 칸 하나 (10-04 '시력방 + 검사실' 큰 TV 모양 — 10-08 사용자: 검사실 대기 명단·검사실별 화면도 같게):
// 이름(굵게) 윗줄, 아랫줄마다 '검사실 이름(방 색깔·굵게) 할 검사(흰 굵은 글씨)', 검사 중은 노란 글씨 한 줄
function ExamLineCard({ p, lines }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 break-keep">
      <div className="text-3xl leading-snug"><NameTail p={p} box="" nameCls="font-extrabold text-white" tailCls="text-xl font-semibold text-slate-400" /></div>
      {lines.map(l => (
        <div key={l.k} className="text-xl leading-snug mt-0.5">
          {l.room && <span className={`font-extrabold ${darkText(l.tone)}`}>{l.room} </span>}
          <span className={l.room || l.plain ? 'font-semibold text-white' : `font-bold ${darkText(l.tone)}`}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}
export function ExamBoardList({ patients, settings, compact, wide }) {
  // 처치실에서 먼저 할 일(진료 전 처치, 검사 준비)도 함께 안내
  const treat = treatRoomOf(settings);
  const treatTodo = (p) => !pastVision(p) ? [] : preProcPending(p)
    ? (p.preProcs || []).filter(x => !x.done).map(x => x.name)
    : prepPendingTests(p, settings).filter(t => !prepOf(p, t)?.startedAt).map(t => `${t.name || t.short} 검사 준비`);
  const list = patients
    .filter(p => !p.consultDone && (pendingRooms(p, settings).length > 0 || treatTodo(p).length > 0))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  return (
    <div>
      {!wide && <ExamNotices patients={patients} settings={settings} compact={compact} />}
      {list.length === 0 ? <BoardEmpty /> : !compact ? (
        // 큰 TV('시력방 + 검사실')·검사실 대기 명단: 칩 대신 줄로 — 검사실 이름(방 색깔, 굵게) + 할 검사(흰 글씨), 멀리서도 읽히게
        <div className="grid gap-2.5" style={boardGrid(24)}>
          {list.map(p => {
            const lines = [];
            if (activeVf(p)) lines.push({ k: 'vf', tone: 'amber', room: '', text: testInProgressLabel(settings.tests.find(t => t.id === activeVf(p))) });
            else if (prepHolding(p, settings)) lines.push({ k: 'hold', tone: 'amber', room: '', text: testInProgressLabel(prepHolding(p, settings)) });
            else {
              if (treatTodo(p).length) lines.push({ k: 'treat', tone: 'rose', room: treat.patientName || treat.name, text: treatTodo(p).join(', ') });
              pendingRooms(p, settings).forEach(r => lines.push({ k: r.id, tone: roomColor(settings, r.id), room: r.patientName || r.name, text: pendingTests(p, settings, r.id).map(t => t.name || t.short).join(', ') }));
            }
            return <ExamLineCard key={patientKey(p)} p={p} lines={lines} />;
          })}
        </div>
      ) : (
        <div className="grid gap-2.5" style={boardGrid(15)}>
          {list.map(p => (
            <div key={patientKey(p)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 break-keep">
              <div className="text-lg leading-snug"><NameTail p={p} box="" nameCls="font-bold text-white" tailCls="text-sm font-semibold text-slate-400" /></div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {!activeVf(p) && prepHolding(p, settings) && <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${darkChip('amber')}`}>{testInProgressLabel(prepHolding(p, settings))}</span>}
                {activeVf(p) && <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${darkChip('amber')}`}>{testInProgressLabel(settings.tests.find(t => t.id === activeVf(p)))}</span>}
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
        // 검사실 이름은 제목에 있으므로 할 검사만 (흰 굵은 글씨), 검사 중이면 노란 글씨 한 줄만
        <div className="grid gap-2.5" style={boardGrid(24)}>
          {list.map(p => {
            const vfTest = activeVf(p) && settings.tests.find(t => t.id === activeVf(p));
            // 검사 중이면 그 줄만 (검사실 대기 명단·시력방 + 검사실과 같은 규칙)
            const lines = vfTest
              ? [{ k: 'vf', tone: 'amber', room: '', text: testInProgressLabel(vfTest) }]
              : [{ k: 'tests', tone: '', room: '', text: pendingTests(p, settings, room.id).map(t => t.name || t.short).join(', '), plain: true }];
            return <ExamLineCard key={patientKey(p)} p={p} lines={lines} />;
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

// front: 복도 끝 모니터(진료실 전체)에서 앞에서부터 이 인원은 노란 상자 '진료실 앞으로 이동해 주세요', 나머지는 '큰 복도에서 기다려 주세요'
export function ConsultBoardSection({ doctor, patients, settings, prefs, compact, plain, roomLabel = '', front = 0 }) {
  const mine = patients.filter(p => p.doctor === doctor && !p.consultDone);
  const inRoom = mine.find(inConsult);
  // CR·산동 점안 중인 환자는 시간이 지나면 진료 대기로 (가끔 다시 계산)
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(i); }, []);
  const waiting = consultQueue(patients, doctor, settings, prefs);
  const testing = mine.filter(p => !p.seen && (!allDone(p, settings) || dropsPending(p, prefs, settings.dilationWaitMin))).length;
  const testingLabel = mine.some(p => !p.seen && dropsPending(p, prefs, settings.dilationWaitMin)) ? '검사·점안 진행 중' : '검사 진행 중';
  const notice = useNotice(`doctor:${doctor}`);
  // 명단 아래 한 줄: 검사 진행 중 인원 · 시각 안내 (10-08 사용자: 줄마다 '예약' 글자 대신 한 번만)
  const foot = [testing > 0 ? `${testingLabel} ${testing}명` : '', waiting.some(p => boardReservation(p)) ? '이름 앞 시각은 예약 시간입니다' : ''].filter(Boolean).join(' · ');
  // 진료실 앞 모니터(교수님 한 분): 진료 중·다음 순서는 가장 크게, 2·3번은 크게, 그다음은 작게
  // (칸 사이는 모서리 '재진료' 표가 위 칸에 닿지 않게 넉넉히)
  if (plain) {
    return (
      <div>
        <BoardNotice text={notice} />
        <div className="space-y-5">
          {inRoom && <BigRow label="진료 중" name={patientBoardName(inRoom)} who={inRoom} size="md" muted />}
          {waiting[0] && <BigRow label="다음 순서" p={waiting[0]} size="xxl" />}
          {waiting.length > 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-5">
              {waiting.slice(1, 3).map((p, i) => <BigRow key={patientKey(p)} n={i + 2} p={p} size="md" />)}
            </div>
          )}
        </div>
        {!waiting.length && <div className="text-2xl text-slate-500 py-4">진료 대기 환자가 없습니다</div>}
        <SmallRest list={waiting.slice(3)} start={4} color="amber" withTime />
        {foot && <div data-board-foot className="text-lg text-slate-400 mt-4">{foot}</div>}
      </div>
    );
  }
  return (
    <div className={plain ? '' : 'bg-slate-800/50 border border-slate-700 rounded-2xl p-4'}>
      {!plain && (
        // 교수님 이름을 크게 (10-08 — 환자가 자기 교수님 칸을 먼저 찾게, 진료실 앞 모니터 제목과 같은 'OOO 교수님')
        <div className={`${compact ? 'text-xl' : 'text-3xl'} leading-snug font-extrabold text-white mb-3 flex items-center justify-between gap-x-3 gap-y-1 flex-wrap break-keep`}>
          <span>{doctor} 교수님</span>
          {roomLabel && <span className={`${compact ? 'text-base' : 'text-xl'} whitespace-nowrap rounded-lg bg-amber-400 px-2.5 py-0.5 font-bold text-slate-950`}>{roomLabel}</span>}
        </div>
      )}
      <BoardNotice text={notice} compact={compact} />
      {inRoom && (
        // 진료 중(이미 진료실 안)은 회색으로 덜 눈에 띄게 — 진료실 앞 모니터와 같은 규칙 (10-08, 노란 '다음 순서'와 헷갈리지 않게)
        <div data-in-room className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 mb-3">
          <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-600 px-3 py-0.5 text-sm font-bold text-slate-100">진료 중</span>
          <NameTail p={inRoom} box="min-w-0 leading-snug" nameCls={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-slate-200`} tailCls={`${compact ? 'text-sm' : 'text-lg'} font-semibold text-slate-500`} />
        </div>
      )}
      {waiting.length === 0 ? (
        <div className="text-sm text-slate-500 py-3">진료 대기 환자가 없습니다</div>
      ) : front > 0 ? (
        <>
          <div data-front className="rounded-2xl border-4 border-yellow-300 bg-yellow-300/10 p-3">
            <div className="text-2xl font-extrabold text-yellow-200 mb-3.5 break-keep">진료실 앞으로 이동해 주세요</div>
            <div className="grid gap-x-2.5 gap-y-4" style={boardGrid(20)}>
              {waiting.slice(0, front).map((p, i) => (
                <ConsultRow key={patientKey(p)} p={p} n={i + 1} note={i === 0 ? '다음 순서' : ''} />
              ))}
            </div>
          </div>
          {waiting.length > front && (
            <div data-rest className="mt-4">
              <div className="text-lg font-bold text-slate-300 mb-2 break-keep">큰 복도에서 기다려 주세요</div>
              <div className="grid gap-x-2 gap-y-3" style={boardGrid(16)}>
                {waiting.slice(front).map((p, i) => <ConsultRow key={patientKey(p)} p={p} n={front + i + 1} compact />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={`grid gap-x-2.5 ${compact ? 'gap-y-3' : 'gap-y-4'}`} style={boardGrid(compact ? 16 : 20)}>
          {waiting.map((p, i) => (
            <ConsultRow key={patientKey(p)} p={p} n={i + 1} compact={compact} note={i === 0 ? '다음 순서' : ''} />
          ))}
        </div>
      )}
      {foot && <div data-board-foot className="text-sm text-slate-400 mt-3">{foot}</div>}
    </div>
  );
}

// aside: 제목 옆에 붙는 안내(노란 띠) — 줄을 하나 아껴 명단 자리를 넓게
export function BoardColumn({ title, aside, children }) {
  return (
    <div data-board-column={title}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 pb-2 border-b-2 border-slate-700">
        <div className={`${aside !== undefined ? 'text-3xl font-extrabold text-white' : 'text-xl font-bold text-slate-100'} shrink-0 break-keep`}>{title}</div>
        {aside && <div className="flex-1 min-w-0 flex flex-col gap-2 empty:hidden">{aside}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// 명단 아래 QR 안내 줄 (어두운 화면에서 눈에 띄게 흰 바탕)
function QrBand() {
  return (
    <div data-qr-band className="shrink-0 bg-white text-slate-900">
      <div className={`${BOARD_WIDTH} py-3 flex items-center justify-center gap-4 break-keep`}>
        <QrCode size={44} className="shrink-0" />
        <span className="text-3xl font-bold leading-snug">진료카드 QR 코드를 찍으면 바로 접수됩니다</span>
      </div>
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
    { key: 'consult-all-qr', label: '진료실 대기 명단 (전체) + QR 접수', sub: 'QR 리더기를 연결한 모니터용 · 찍으면 접수 결과가 잠깐 크게 뜸' },
    ...doctors.map(d => ({ key: `consult:${d}`, label: `${d} 진료실`, sub: '진료실 앞 모니터용' })),
    { key: 'combined', label: '통합 화면', sub: '세 명단을 한 화면에' },
  ];
  return (
    <ScreenShell title="환자용 화면 선택" color="slate" onBack={onBack}>
      <p className="text-sm text-slate-500 mb-4">이 모니터에 띄울 명단을 고르세요. 이름은 전체 이름과 환자번호 뒷 4자리로 표시됩니다.</p>
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

// 환자 찾기 (진료실 화면 [환자 찾기] → 환자 기록 boardCall): 복도 끝 모니터(진료실 대기 명단 전체)에
// '○○○님 3번 진료실 앞으로 오세요'를 크게 띄우고 띵동, 10초 뒤 사라짐.
// 화면을 연 순간 이미 있던 요청은 다시 띄우지 않음, 여러 명이면 차례로, 그사이 진료 호출·귀가한 환자는 건너뜀
export const FIND_SHOW_MS = 10000;
export function FindCallPopup({ patients, settings, prefs }) {
  const seen = useRef(null);
  const [queue, setQueue] = useState([]);
  const calls = patients.filter(p => p.boardCall?.at).map(p => `${patientKey(p)}@${p.boardCall.at}`);
  const sig = calls.join('|');
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(calls); return; }
    const fresh = calls.filter(k => !seen.current.has(k));
    if (!fresh.length) return;
    fresh.forEach(k => seen.current.add(k));
    setQueue(q => [...q, ...fresh]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const head = queue[0] || '';
  const p = head ? patients.find(x => patientKey(x) === head.slice(0, head.lastIndexOf('@'))) : null;
  const skip = !!head && (!p || !consultWaiting(p, settings, prefs));
  useEffect(() => {
    if (!head) return undefined;
    const t = setTimeout(() => setQueue(q => q.slice(1)), skip ? 0 : FIND_SHOW_MS);
    return () => clearTimeout(t);
  }, [head, skip]);
  useChime(head && !skip ? [head] : []);
  if (!head || skip) return null;
  const room = consultRoomLabel(prefs, p.doctor) || '진료실';
  return (
    <div role="alert" data-find-popup className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-8">
      <div className="w-full max-w-7xl rounded-[2rem] border-8 border-black bg-yellow-300 px-10 py-12 text-center text-black break-keep">
        <div className="font-extrabold leading-tight" style={{ fontSize: 'clamp(3rem, 8vw, 8rem)' }}>{patientBoardName(p)}님</div>
        <div className="mt-6 font-extrabold leading-snug" style={{ fontSize: 'clamp(2.25rem, 5vw, 5rem)' }}>{room} 앞으로 오세요</div>
      </div>
    </div>
  );
}
// 진료실 대기 명단(전체) 화면에 보일 진료실 고르기 (PC마다 기억). 특수검사·처치처럼 진료가 아닌 명단 칸을 빼서 화면을 넓게 씀
const HIDDEN_DOCTORS_KEY = 'oph-board-hidden-doctors';
function readHiddenDoctors() {
  try { const v = JSON.parse(window.localStorage.getItem(HIDDEN_DOCTORS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function ConsultPicker({ doctors, hidden, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-400">진료실 고르기</button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 whitespace-normal rounded-xl border border-slate-700 bg-slate-950 p-3 text-left shadow-xl">
          <div className="text-xs text-slate-400 mb-2">이 화면에 보일 진료실 (체크한 곳 중 오늘 환자가 있는 곳만 칸이 생깁니다)</div>
          {doctors.map(d => (
            <label key={d} className="flex items-center gap-2 py-1 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" aria-label={`${d} 보이기`} checked={!hidden.includes(d)} onChange={e => onChange(e.target.checked ? hidden.filter(x => x !== d) : [...hidden, d])} className="w-4 h-4" />
              {d}
            </label>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="mt-2 text-xs underline text-slate-400">닫기</button>
        </div>
      )}
    </span>
  );
}

// qr: 진료실 대기 명단 (전체) + QR 접수 화면 (맨 아래 QR 안내 줄, 리더기 키 입력으로 직원 버튼이 뜨지 않게 — 접수 처리는 RoleSelect QrConsultBoard)
export function BoardView({ kind, patients, settings, doctors, doctorPrefs, ready = true, onBack, qr = false }) {
  const [layout, setLayout] = useState('horizontal');
  const allDoctors = Array.from(new Set([...doctors, ...patients.map(p => p.doctor).filter(Boolean)]));
  const activeDoctors = allDoctors.filter(d => patients.some(p => p.doctor === d && !p.consultDone));
  const [hiddenDoctors, setHiddenDoctors] = useState(readHiddenDoctors);
  const saveHiddenDoctors = (next) => {
    setHiddenDoctors(next);
    try { window.localStorage.setItem(HIDDEN_DOCTORS_KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 이번엔 적용 */ }
  };
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
        {/* 왼쪽 검사실 3 : 오른쪽 시력방 2 (검사실 명단이 보통 더 김, 화면 앞에서 볼 때 왼쪽이 검사실 쪽 — 10-04 사용자). 안내는 제목 옆 */}
        <div className="grid gap-6" style={{ gridTemplateColumns: layout === 'horizontal' ? 'minmax(0, 3fr) minmax(0, 2fr)' : 'minmax(0, 1fr)' }}>
          <BoardColumn title="검사실" aside={<ExamNotices patients={patients} settings={settings} inline />}><ExamBoardList patients={patients} settings={settings} wide /></BoardColumn>
          <BoardColumn title={visionNames(settings).patientName} aside={<VisionNotices patients={patients} inline />}><VisionBoardList patients={patients} five /></BoardColumn>
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
    // 복도 끝 모니터: 고른 진료실만 칸을 나눠 보여 줌, [환자 찾기] 팝업·띵동
    const shown = activeDoctors.filter(d => !hiddenDoctors.includes(d));
    return (
      <>
        <BoardShell title="진료 대기 순서" onBack={onBack} chime keyWake={!qr} footer={qr ? <QrBand /> : null} extra={<ConsultPicker doctors={allDoctors} hidden={hiddenDoctors} onChange={saveHiddenDoctors} />}>
          {shown.length === 0 ? <BoardEmpty /> : (
            <div className={`grid gap-4 ${shown.length === 1 ? 'grid-cols-1' : shown.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
              {shown.map(d => <ConsultBoardSection key={d} doctor={d} patients={patients} settings={settings} prefs={doctorPrefs} roomLabel={consultRoomLabel(doctorPrefs, d)} front={consultFrontCount(settings)} />)}
            </div>
          )}
        </BoardShell>
        <FindCallPopup patients={patients} settings={settings} prefs={doctorPrefs} />
      </>
    );
  }
  if (kind.startsWith('consult:')) {
    const d = kind.slice('consult:'.length);
    return (
      <BoardShell title={`${d} 교수님`} big badge={consultRoomLabel(doctorPrefs, d)} onBack={onBack} chime>
        <ConsultBoardSection doctor={d} patients={patients} settings={settings} prefs={doctorPrefs} plain roomLabel={consultRoomLabel(doctorPrefs, d)} />
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
            <ConsultBoardSection key={d} doctor={d} patients={patients} settings={settings} prefs={doctorPrefs} compact roomLabel={consultRoomLabel(doctorPrefs, d)} />
          ))}
        </BoardColumn>
      </div>
    </BoardShell>
  );
}
