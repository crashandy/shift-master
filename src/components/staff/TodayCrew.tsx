'use client';

// 「今天誰上班」卡片：入口首頁與班表頁共用
import { SHIFT_META, Shift, isWorking } from '@/lib/shifts';
import Chick from '@/components/Chick';

interface Props {
  title?: string;
  shifts: Shift[];
  employees: { id: string; name: string }[];
  meId?: string;
}

export default function TodayCrew({ title = '今天上班的夥伴', shifts, employees, meId }: Props) {
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '';
  const order = (id: string) => employees.findIndex((e) => e.id === id);

  const working = shifts
    .filter((s) => isWorking(s.shift_type) || s.is_night)
    .sort((a, b) => order(a.employee_id) - order(b.employee_id));
  const deputy = shifts.find((s) => s.is_deputy);

  return (
    <div className="bg-white rounded-3xl border border-amber-100 shadow-sm shadow-amber-900/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-stone-900">👋 {title}</h2>
        {deputy && (
          <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full">
            代理人：{nameOf(deputy.employee_id)}
          </span>
        )}
      </div>

      {working.length === 0 ? (
        <div className="flex items-center gap-3 text-sm font-bold text-stone-400 py-2">
          <Chick size={44} mood="sleepy" />
          今天還沒有排班
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {working.map((s) => {
            const meta = isWorking(s.shift_type) ? SHIFT_META[s.shift_type as 'normal'] : null;
            const isMe = s.employee_id === meId;
            return (
              <div
                key={s.employee_id}
                className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-2xl border text-sm font-bold ${
                  isMe ? 'bg-brand-100 border-brand-300 text-brand-900' : 'bg-stone-50 border-stone-200 text-stone-700'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] text-white ${meta ? meta.dot : 'bg-purple-600'}`}>
                  {meta ? meta.short[0] : '宵'}
                </span>
                {nameOf(s.employee_id)}
                {isMe && <span className="text-[10px] text-brand-700">（我）</span>}
                {s.is_night && meta && <span className="text-[10px] text-purple-600">+宵</span>}
                {s.is_deputy && <span className="text-[10px] text-orange-600">代</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
