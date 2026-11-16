'use client';

// 員工功能頁共用外框：檢查登入、上方標題列、選擇填寫人
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { STORE_NAMES, StaffSession, useStaffSession } from '@/lib/staffSession';
import Chick from '@/components/Chick';

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
    return <LoadingChick />;
  }

  return (
    <div className="min-h-screen bg-cream text-stone-800 pb-safe">
      <div className="sticky top-0 z-30 bg-cream/90 backdrop-blur-md border-b border-amber-100">
        <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              aria-label="回入口"
              className="shrink-0 w-10 h-10 rounded-full bg-white border border-amber-100 shadow-sm flex items-center justify-center text-lg text-stone-600 active:scale-95 transition"
            >
              ←
            </Link>
            <h1 className="text-lg font-black text-stone-900 truncate">
              <span className="mr-1">{icon}</span>
              {title}
            </h1>
          </div>
          <span className="shrink-0 flex items-center gap-1 text-xs font-bold bg-brand-100 text-brand-800 pl-1 pr-2.5 py-0.5 rounded-full">
            <Chick size={24} mood="happy" />
            {STORE_NAMES[session.store]}
          </span>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-3 pt-4 space-y-4">{children({ session, update, employees })}</div>
    </div>
  );
}

// 載入中畫面
export function LoadingChick({ text = '載入中...' }: { text?: string }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-2 text-stone-400 font-bold">
      <Chick size={72} mood="sleepy" bob />
      {text}
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
    <label className="block bg-white rounded-3xl border border-amber-100 shadow-sm shadow-amber-900/5 p-4">
      <span className="block text-xs font-bold text-stone-400 mb-1.5">👤 填寫人</span>
      <select
        value={session.employeeId ?? ''}
        onChange={(e) => {
          const emp = employees.find((x) => x.id === e.target.value);
          update({ ...session, employeeId: emp?.id, employeeName: emp?.name });
        }}
        className="w-full p-3.5 rounded-2xl bg-brand-50 border border-brand-200 font-bold text-base outline-none focus:border-brand-500"
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
