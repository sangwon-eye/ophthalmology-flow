// 설정 > 검사실 · 검사 > [자세히] 안의 'OCS 처방 입력법' 칸 (OCS 처방 도우미가 씀, 규칙은 core/ocs.js)
import React from 'react';
import { parseOptions, renameTestOptions } from '../core/flow.jsx';
import { OCS_SIDES, ocsRecipeCount, ocsUnitKeys, ocsUnitName } from '../core/ocs.js';

export function OcsRecipeEditor({ test, onChange }) {
  // 세부 종류를 고치는 중이면 고친 값 기준으로 (OCT가 M,D OCT·OCTA로 나뉘는지)
  const live = renameTestOptions(test, parseOptions(test.optionsText ?? (test.options || []).join(',')));
  const units = ocsUnitKeys(live);
  const ocs = test.ocs || {};
  const filled = ocsRecipeCount({ ...live, ocs });
  const set = (unit, side, patch) => onChange({ ...ocs, [unit]: { ...ocs[unit], [side]: { ...ocs[unit]?.[side], ...patch } } });
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-600 mb-2">
        OCS 처방 입력법 <span className={filled ? 'text-emerald-700' : 'text-slate-400'}>· {filled ? `${filled}칸 등록` : '미등록'}</span>
        <span className="block text-slate-400">OCS 오더 입력창에 칠 검색어와 후보 목록에서 ↓를 누를 횟수. 비워 두면 도우미가 넣지 않고 '직접 입력'으로 알려 줘요.{units.length > 1 && ' M,D OCT와 OCTA는 처방이 따로예요.'}</span>
      </div>
      <div className="space-y-1.5">
        {units.map(u => OCS_SIDES.map(s => {
          const r = ocs[u]?.[s.key] || {};
          const name = `${ocsUnitName(live, u)} ${s.label}`;
          return (
            <div key={`${u}-${s.key}`} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-slate-600">{units.length > 1 ? name : s.label}</span>
              <input aria-label={`${name} 검색어`} value={r.text ?? ''} placeholder={s.key === 'both' ? '예: Visual field test' : '편측 처방 검색어'}
                onChange={e => set(u, s.key, { text: e.target.value })} className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white" />
              <span className="text-xs text-slate-500 shrink-0">↓</span>
              <input aria-label={`${name} 아래 화살표 횟수`} type="number" min="0" max="30" value={r.down ?? 0}
                onChange={e => set(u, s.key, { down: Math.min(30, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                className="w-14 border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white" />
              <span className="text-xs text-slate-500 shrink-0">번</span>
            </div>
          );
        }))}
      </div>
    </div>
  );
}
