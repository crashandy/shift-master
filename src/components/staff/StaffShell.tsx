'use client';

// 員工功能頁共用外框：檢查登入、上方標題列、選擇填寫人
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { STORE_NAMES, StaffSession, useStaffSession } from '@/lib/staffSession';

interface EmployeeOption {
  id: string;
  name: string;
}

export function useStoreEmployees(store: string | undefined) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  useEffect(() => {
    if (!store) return;
    supabase
      .from('employees')
      .select('id, name, is_active')
      .eq('store', store)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setEmployees((data ?? []).filter((e) => e.is_active !== false).map(({ id, name }) => ({ id, name })));
      });
  }, [store]);
  return employees;
}

interface Props {
  title: string;
  icon: string;
  children: (ctx: {
    session: StaffSession;
    update: (s: StaffSession) => void;
    employees: EmployeeOption[];
  }) => ReactNode;
}

export default function StaffShell({ title, icon, children }: Props) {
  const router = useRouter();
  const { session, ready, update } = useStaffSession();
  const employees = useStoreEmployees(session?.store);

  useEffect(() => {
    if (ready && !session) router.replace('/');
  }, [ready, session, router]);

  if (!ready || !session) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold"
            >
              ← 入口
            </Link>
            <h1 className="text-lg font-black text-slate-900 truncate">
              {icon} {title}
            </h1>
          </div>
          <span className="shrink-0 text-xs font-bold bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg">
            {STORE_NAMES[session.store]}
          </span>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">{children({ session, update, employees })}</div>
    </div>
  );
}

// 「填寫人」下拉選單，選過會記住
export function EmployeeSelect({
  session,
  update,
  employees,
}: {
  session: StaffSession;
  update: (s: StaffSession) => void;
  employees: EmployeeOption[];
}) {
  return (
    <label className="block bg-white rounded-2xl border border-slate-200 p-4">
      <span className="block text-xs font-bold text-slate-400 mb-1.5">填寫人</span>
      <select
        value={session.employeeId ?? ''}
        onChange={(e) => {
          const emp = employees.find((x) => x.id === e.target.value);
          update({ ...session, employeeId: emp?.id, employeeName: emp?.name });
        }}
        className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-base outline-none focus:border-indigo-500"
      >
        <option value="">-- 請選擇你的名字 --</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}
