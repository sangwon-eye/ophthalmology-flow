// 직원 화면 '띵동' 알림: 새 일이 생기면 짧은 두 음 차임 (소리 파일 없이 브라우저에서 만듦)
import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';

const OFF_KEY = 'oph-chime-off'; // PC마다 기억하는 소리 끄기
const LOCAL_QUIET_MS = 2000;     // 이 PC에서 방금(2초 안) 누른 변화는 소리 생략 (앞에 있는 사람은 이미 앎)
const MIN_GAP_MS = 1500;         // 한꺼번에 여러 건이면 한 번만

let audio = null;
let lastLocal = 0;
let lastChime = 0;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

function getAudio() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
    audio.onstatechange = notify; // 소리가 풀리거나 다시 막히면 위쪽 안내를 다시 그림
    // iPad: 무음 모드(옆 버튼·제어 센터)여도 띵동이 들리도록 (지원하는 iPad만, 나머지는 무시)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* 지원 안 함 */ }
  }
  return audio;
}
// 브라우저는 화면을 한 번이라도 누르기 전에는 소리를 막습니다. 누를 때 소리 장치를 준비해 둡니다.
// 태블릿(터치 화면)은 '누르는 순간'이 아니라 '손을 뗄 때'에만 소리를 허락하므로 그때도 준비합니다.
function unlockAudio() {
  try {
    const a = getAudio();
    if (!a || a.state === 'running') return;
    a.resume().then(notify, () => {});
    // iPad·아이폰: 손을 뗄 때 아주 짧은 무음을 한 번 틀어야 소리가 풀립니다
    const src = a.createBufferSource();
    src.buffer = a.createBuffer(1, 1, 22050);
    src.connect(a.destination);
    src.start(0);
  } catch { /* 소리를 못 내도 화면은 그대로 */ }
}
function onUserInput() {
  lastLocal = Date.now();
  unlockAudio();
  notify();
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', onUserInput, true);
  window.addEventListener('keydown', onUserInput, true);
  ['pointerup', 'touchend', 'click'].forEach(name => window.addEventListener(name, unlockAudio, true));
  window.__ophAudioState = () => (audio ? audio.state : 'none'); // 자동 테스트 확인용
}

export function chimeOff() {
  try { return window.localStorage.getItem(OFF_KEY) === '1'; } catch { return false; }
}
function setChimeOff(off) {
  try { window.localStorage.setItem(OFF_KEY, off ? '1' : '0'); } catch { /* 저장 못 해도 이번엔 적용 */ }
  notify();
}
// 소리 장치가 실제로 켜져 있는지로 판단 (태블릿은 화면을 눌렀어도 소리가 막혀 있을 수 있음)
function soundBlocked() {
  if (audio) return audio.state !== 'running';
  if (typeof navigator !== 'undefined' && navigator.userActivation) return !navigator.userActivation.hasBeenActive;
  return true;
}

// 띵(높은 음) → 동(낮은 음)
export function playChime() {
  const now = Date.now();
  if (chimeOff() || now - lastChime < MIN_GAP_MS) return;
  lastChime = now;
  window.__ophChimes = (window.__ophChimes || 0) + 1; // 자동 테스트 확인용
  try {
    if (!getAudio()) return;
    if (audio.state !== 'running') audio.resume().catch(() => {});
    const start = audio.currentTime + 0.03;
    [[659.25, 0], [523.25, 0.34]].forEach(([freq, delay]) => {
      [[freq, 0.32], [freq * 2, 0.06]].forEach(([f, peak]) => { // 기본음 + 약한 배음 (종소리 느낌)
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const t = start + delay;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(peak, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(t);
        osc.stop(t + 0.85);
      });
    });
  } catch { /* 소리를 못 내도 화면은 그대로 */ }
}

// keys: 지금 '할 일' 목록(문자열). 새 항목이 생기면 띵동.
// 화면을 처음 열 때, 서버에서 처음 받기 전(ready=false), context(예: 교수님)가 바뀔 때는 기준만 잡고 소리 없음.
export function useChime(keys, { ready = true, context = '' } = {}) {
  const prev = useRef(null);
  const prevContext = useRef(context);
  const sig = [...new Set(keys)].sort().join('\n');
  useEffect(() => {
    if (!ready) { prev.current = null; return; }
    const cur = new Set(sig ? sig.split('\n') : []);
    if (prev.current && prevContext.current === context) {
      const fresh = [...cur].some(k => !prev.current.has(k));
      if (fresh && Date.now() - lastLocal > LOCAL_QUIET_MS) playChime();
    }
    prev.current = cur;
    prevContext.current = context;
  }, [sig, ready, context]);
}

// 화면 위쪽: 소리 켜기/끄기 버튼 + 소리가 막혀 있으면 안내
export function ChimeControl() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  const off = chimeOff();
  const blocked = !off && soundBlocked();
  return (
    <span className="flex items-center gap-2">
      {blocked && (
        <span className="text-xs px-2 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
          <Bell size={12} /> 소리를 켜려면 화면을 한 번 눌러 주세요
        </span>
      )}
      <button type="button" onClick={() => setChimeOff(!off)} aria-label={off ? '띵동 소리 켜기' : '띵동 소리 끄기'} aria-pressed={!off}
        title={off ? '띵동 소리 꺼짐 · 누르면 켜기 (이 컴퓨터만)' : '새 일이 생기면 띵동 · 누르면 끄기 (이 컴퓨터만)'}
        className={`px-2 py-2 rounded-lg border bg-white ${off ? 'border-slate-300 text-slate-400' : 'border-slate-300 text-slate-600'}`}>
        {off ? <BellOff size={16} /> : <Bell size={16} />}
      </button>
    </span>
  );
}
