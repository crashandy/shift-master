'use client';

// 員工入口網站
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { STORE_CODES, STORE_NAMES, useStaffSession } from '@/lib/staffSession';
import { EmployeeSelect, LoadingChick, useStoreEmployees } from '@/components/staff/StaffShell';
import Chick from '@/components/Chick';
import TodayCrew from '@/components/staff/TodayCrew';
import { Shift } from '@/lib/shifts';
import {
  CHECKLISTS,
  CHECKLIST_TYPES,
  ChecklistType,
  businessDate,
  fmtBusinessDate,
  fmtTime,
} from '@/lib/checklists';

interface TodayStatus {
  list_type: ChecklistType;
  employee_name: string;
  submitted_at: string;
  done_count: number;
  total_count: number;
}

export default function PortalPage() {
  const { session, ready, update, logout } = useStaffSession();
  const employees = useStoreEmployees(session?.store);
  const [code, setCode] = useState('');
  const [today, setToday] = useState<TodayStatus[]>([]);
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const bizDate = businessDate();

  useEffect(() => {
    if (!session) return;
    supabase
      .from('checklist_submissions')
      .select('list_type, employee_name, submitted_at, done_count, total_count')
      .eq('store', session.store)
      .eq('business_date', bizDate)
      .order('submitted_at', { ascending: false })
      .then(({ data }) => setToday((data ?? []) as TodayStatus[]));
    supabase
      .from('shifts')
      .select('*')
      .eq('store', session.store)
      .eq('date', bizDate)
      .then(({ data }) => setTodayShifts((data ?? []) as Shift[]));
  }, [session, bizDate]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const store = STORE_CODES[code.trim()];
    if (!store) {
      alert('通行碼錯誤，請確認後再輸入！');
      return;
    }
    update({ store });
    setCode('');
  };

  if (!ready) {
    return <LoadingChick />;
  }

  // ===== 登入畫面 =====
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-200 via-brand-50 to-cream flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-[-28px] relative z-10">
            <Chick size={120} hat bob />
          </div>
          <form
            onSubmit={handleLogin}
            className="bg-white pt-10 pb-7 px-6 rounded-[2rem] shadow-xl shadow-amber-900/10 border border-amber-100 text-center"
          >
            <h1 className="text-2xl font-black text-stone-900">18度雞 員工小站</h1>
            <p className="text-sm text-stone-500 mt-1 mb-6">輸入分店通行碼就可以開始囉！</p>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="分店通行碼"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full p-4 rounded-2xl bg-brand-50 text-stone-800 mb-4 outline-none border-2 border-brand-100 focus:border-brand-400 focus:bg-white text-center text-xl tracking-[0.3em] font-mono"
            />
            <button
              type="submit"
              className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-brand-500/30 transition"
            >
              進入 🐣
            </button>
          </form>
          <Link
            href="/admin"
            className="block text-center text-sm font-bold text-stone-400 hover:text-brand-700 py-4"
          >
            🔐 管理後台登入
          </Link>
        </div>
      </div>
    );
  }

  // ===== 入口首頁 =====
  const statusOf = (t: ChecklistType) => today.filter((s) => s.list_type === t);

  const cards: { href: string; icon: string; title: string; desc: string; tint: string; type?: ChecklistType }[] = [
    { href: '/schedule', icon: '📅', title: '班表與劃休', desc: '看班表・劃休・當代理', tint: 'from-sky-50' },
    { href: '/checklist/opening', icon: CHECKLISTS.opening.icon, title: '開店清點', desc: CHECKLISTS.opening.desc, tint: 'from-emerald-50', type: 'opening' },
    { href: '/butter', icon: '🧈', title: '奶酥醬', desc: '登記製作時間與重量', tint: 'from-brand-50' },
    { href: '/checklist/daily', icon: CHECKLISTS.daily.icon, title: '每日清潔', desc: CHECKLISTS.daily.desc, tint: 'from-lime-50', type: 'daily' },
    { href: '/checklist/closing', icon: CHECKLISTS.closing.icon, title: '收店清潔', desc: CHECKLISTS.closing.desc, tint: 'from-violet-50', type: 'closing' },
  ];

  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? '早安' : hour >= 12 && hour < 18 ? '午安' : '晚安';

  return (
    <div className="min-h-screen bg-cream text-stone-800 pb-safe">
      {/* 頂部問候 */}
      <div className="bg-gradient-to-b from-brand-300 to-brand-100 rounded-b-[2rem] px-4 pt-6 pb-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-brand-900/70">
              {STORE_NAMES[session.store]} ・ 營業日 {fmtBusinessDate(bizDate)}
            </div>
            <h1 className="text-2xl font-black text-stone-900 mt-0.5 truncate">
              {greeting}，{session.employeeName ?? '夥伴'}！
            </h1>
            <p className="text-sm font-bold text-brand-900/70 mt-0.5">今天也一起加油 💪</p>
          </div>
          <Chick size={84} mood="happy" bob className="shrink-0" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 -mt-6 space-y-4">
        <EmployeeSelect session={session} update={update} employees={employees} />

        <TodayCrew shifts={todayShifts} employees={employees} meId={session.employeeId} />

        {/* 功能卡片 */}
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c, i) => {
            const done = c.type ? statusOf(c.type) : [];
            return (
              <Link
                key={c.href}
                href={c.href}
                className={`bg-gradient-to-br ${c.tint} to-white rounded-3xl border border-amber-100 shadow-sm shadow-amber-900/5 p-4 active:scale-[0.97] transition flex flex-col ${
                  i === 0 ? 'col-span-2' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-2xl bg-white shadow-sm flex items-center justify-center text-2xl">
                    {c.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-stone-900 leading-tight">{c.title}</div>
                    <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">{c.desc}</div>
                  </div>
                </div>
                {c.type && (
                  <div className="mt-3">
                    {done.length > 0 ? (
                      <span className="inline-block text-[11px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                        ✓ {done[0].employee_name} {fmtTime(done[0].submitted_at)}（{done[0].done_count}/{done[0].total_count}）
                      </span>
                    ) : (
                      <span className="inline-block text-[11px] font-bold bg-rose-100 text-rose-600 px-2 py-1 rounded-full">
                        今日尚未填寫
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 pb-4">
          <Link
            href="/admin"
            className="flex-1 bg-stone-800 hover:bg-stone-900 text-white rounded-2xl py-3.5 text-center font-bold transition"
          >
            🔐 管理後台
          </Link>
          <button
            onClick={() => {
              if (confirm('確定要登出這台裝置嗎？')) logout();
            }}
            className="px-5 py-3.5 rounded-2xl bg-white border border-stone-200 text-sm font-bold text-stone-500 active:scale-95"
          >
            登出
          </button>
        </div>
      </div>
    </div>
  );
}
