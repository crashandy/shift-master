'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// 班別定義與樣式
const SHIFT_TYPES: Record<string, { label: string; bg: string; text: string; hours: number; salary: number }> = {
  normal: { label: '正', bg: 'bg-blue-500', text: 'text-white', hours: 6, salary: 1260 },
  open: { label: '開', bg: 'bg-emerald-500', text: 'text-white', hours: 6, salary: 1260 },
  half: { label: '半', bg: 'bg-amber-400', text: 'text-slate-900', hours: 3.5, salary: 735 },
  off: { label: '休', bg: 'bg-rose-500', text: 'text-white', hours: 0, salary: 0 },
};

interface Employee {
  id: string;
  name: string;
  store: string;
  is_active: boolean;
}

interface Shift {
  id: string;
  employee_id: string;
  date: string;
  shift_type: string;
  is_night: boolean;
  store: string;
}

interface Unavailability {
  employee_id: string;
  date: string;
  store: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // 1. 預設分店設為 store1
  const [selectedStore, setSelectedStore] = useState('store1');
  
  // 年月選擇
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);

  // 新增員工表單
  const [newEmployeeName, setNewEmployeeName] = useState('');

  // 當前選擇的排班工具刷 (normal | open | half | off | clear)
  const [selectedTool, setSelectedTool] = useState<string>('normal');

  // 登入驗證
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin888') {
      setIsAuthenticated(true);
    } else {
      alert('管理者密碼錯誤！');
    }
  };

  // 當選擇的分店或年月變更時重新獲取資料
  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, selectedStore, currentYear, currentMonth]);

  const fetchData = async () => {
    // 2. 獲取當前分店的所有員工 (移除 is_active 限制)
    const { data: empData, error: empErr } = await supabase
      .from('employees')
      .select('*')
      .eq('store', selectedStore)
      .order('created_at', { ascending: true });
    
    if (empErr) console.error('抓取員工失敗:', empErr);
    else setEmployees(empData || []);

    // 獲取當月班表
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .eq('store', selectedStore)
      .gte('date', startDate)
      .lte('date', endDate);
    setShifts(shiftData || []);

    // 獲取劃休資料
    const { data: unavailData } = await supabase
      .from('unavailability')
      .select('*')
      .eq('store', selectedStore)
      .gte('date', startDate)
      .lte('date', endDate);
    setUnavailabilities(unavailData || []);

    // 獲取劃班功能開放狀態
    const { data: sysData } = await supabase
      .from('system_settings')
      .select('*')
      .eq('id', 'global')
      .single();
    if (sysData) setIsSubmissionOpen(sysData.is_submission_open);
  };

  // 新增員工
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim()) return;

    const { data, error } = await supabase
      .from('employees')
      .insert({ name: newEmployeeName.trim(), store: selectedStore, is_active: true })
      .select()
      .single();

    if (error) {
      alert(`新增失敗: ${error.message}`);
    } else if (data) {
      setEmployees([...employees, data]);
      setNewEmployeeName('');
    }
  };

  // 刪除員工
  const handleDeleteEmployee = async (id: string, name: string) => {
    if (!confirm(`確定要刪除員工「${name}」嗎？刪除後相關班表也會一併移除。`)) return;

    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) {
      alert(`刪除失敗: ${error.message}`);
    } else {
      setEmployees(employees.filter((e) => e.id !== id));
      setShifts(shifts.filter((s) => s.employee_id !== id));
    }
  };

  // 切換劃休開放狀態
  const toggleSubmissionOpen = async () => {
    const nextState = !isSubmissionOpen;
    const { error } = await supabase
      .from('system_settings')
      .upsert({ id: 'global', is_submission_open: nextState });

    if (!error) setIsSubmissionOpen(nextState);
  };

  // 使用畫筆工具進行排班
  const handleCellClick = async (employeeId: string, dateStr: string) => {
    const existingShift = shifts.find((s) => s.employee_id === employeeId && s.date === dateStr);

    if (selectedTool === 'clear') {
      // 橡皮擦：清除班別 (若有宵夜班保留，無則完全刪除)
      if (existingShift) {
        if (existingShift.is_night) {
          await supabase
            .from('shifts')
            .update({ shift_type: '' })
            .eq('id', existingShift.id);
          fetchData();
        } else {
          await supabase.from('shifts').delete().eq('id', existingShift.id);
          setShifts(shifts.filter((s) => s.id !== existingShift.id));
        }
      }
    } else {
      // 蓋上選擇的班別
      if (existingShift) {
        await supabase
          .from('shifts')
          .update({ shift_type: selectedTool })
          .eq('id', existingShift.id);
      } else {
        await supabase.from('shifts').insert({
          employee_id: employeeId,
          date: dateStr,
          shift_type: selectedTool,
          is_night: false,
          store: selectedStore,
        });
      }
      fetchData();
    }
  };

  // 切換宵夜班 (+宵)
  const toggleNightShift = async (employeeId: string, dateStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const existingShift = shifts.find((s) => s.employee_id === employeeId && s.date === dateStr);

    if (existingShift) {
      await supabase
        .from('shifts')
        .update({ is_night: !existingShift.is_night })
        .eq('id', existingShift.id);
    } else {
      await supabase.from('shifts').insert({
        employee_id: employeeId,
        date: dateStr,
        shift_type: '',
        is_night: true,
        store: selectedStore,
      });
    }
    fetchData();
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4">
        <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-6 text-indigo-400">管理者後台登入</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">請輸入管理員密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="預設密碼 admin888"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg transition"
            >
              進入排班系統
            </button>
          </form>
        </div>
      </div>
    );
  }

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-6">
      {/* 頂部管理選單 */}
      <header className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-indigo-400">管理者排班控制台</h1>
          {/* 分店切換選單 */}
          <select
            value={selected
