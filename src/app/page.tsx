'use client';

// 員工入口網站
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { STORE_CODES, STORE_NAMES, useStaffSession } from '@/lib/staffSession';
import { EmployeeSelect, useStoreEmployees } from '@/components/staff/StaffShell';
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
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400">載入中...</div>;
  }

  // ===== 登入畫面 =====
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <form
            onSubmit={handleLogin}
            className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200/80 text-center"
          >
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl">
              🐔
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-1">18度雞 員工入口</h1>
            <p className="text-sm text-slate-500 mb-6">請輸入分店通行碼</p>
            <input
              type="password"
              inputMode="numeric"
              placeholder="分店通行碼"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full p-4 rounded-2xl bg-slate-50 text-slate-800 mb-4 outline-none border border-slate-200 focus:border-indigo-500 focus:bg-white text-center text-lg tracking-widest font-mono"
            />
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-md transition"
            >
              進入
            </button>
          </form>
          <Link
            href="/admin"
            className="block text-center text-sm font-bold text-slate-400 hover:text-indigo-600 py-2"
          >
            🔐 管理後台登入
          </Link>
        </div>
      </div>
    );
  }

  // ===== 入口首頁 =====
  const statusOf = (t: ChecklistType) => today.filter((s) => s.list_type === t);

  const cards: { href: string; icon: string; title: string; desc: string; type?: ChecklistType }[] = [
    { href: '/schedule', icon: '📅', title: '班表與劃休', desc: '查看班表、登記劃休' },
    { href: '/checklist/opening', icon: CHECKLISTS.opening.icon, title: CHECKLISTS.opening.title, desc: CHECKLISTS.opening.desc, type: 'opening' },
    { href: '/butter', icon: '🧈', title: '奶酥醬製作清單', desc: '登記製作時間、口味、重量' },
    { href: '/checklist/daily', icon: CHECKLISTS.daily.icon, title: CHECKLISTS.daily.title, desc: CHECKLISTS.daily.desc, type: 'daily' },
    { href: '/checklist/closing', icon: CHECKLISTS.closing.icon, title: CHECKLISTS.closing.title, desc: CHECKLISTS.closing.desc, type: 'closing' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        {/* 標題 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-2xl">🐔</div>
            <div>
              <h1 className="text-xl font-black text-slate-900">18度雞 員工入口</h1>
              <p className="text-xs text-slate-400 font-medium">
                {STORE_NAMES[session.store]} ・ 營業日 {fmtBusinessDate(bizDate)}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (confirm('確定要登出這台裝置嗎？')) logout();
            }}
            className="text-xs font-bold text-slate-400 hover:text-rose-500 px-2 py-1"
          >
            登出
          </button>
        </div>

        <EmployeeSelect session={session} update={update} employees={employees} />

        {/* 功能卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((c) => {
            const done = c.type ? statusOf(c.type) : [];
            return (
              <Link
                key={c.href}
                href={c.href}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md active:scale-[0.99] transition block"
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl leading-none">{c.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-slate-900">{c.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{c.desc}</div>
                    {c.type && (
                      <div className="mt-2">
                        {done.length > 0 ? (
                          <span className="inline-block text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-lg">
                            ✓ 今日已填 {fmtTime(done[0].submitted_at)}・{done[0].employee_name}（{done[0].done_count}/{done[0].total_count}）
                          </span>
                        ) : (
                          <span className="inline-block text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-lg">
                            今日尚未填寫
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <Link
          href="/admin"
          className="block bg-slate-800 hover:bg-slate-900 text-white rounded-2xl p-4 text-center font-bold transition"
        >
          🔐 管理後台
        </Link>
      </div>
    </div>
  );
}
