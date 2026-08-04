'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Employee {
  id: string;
  name: string;
  store: string;
}

interface Shift {
  id: string;
  employee_id: string;
  date: string;
  shift_type: 'normal' | 'open' | 'half' | 'night' | 'off';
  store: string;
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [currentStore, setCurrentStore] = useState<'store_1' | 'store_2'>('store_1');
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState('');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [unavailDates, setUnavailDates] = useState<string[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState('2026-08');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '88652358') {
      setCurrentStore('store_1');
      setStoreName('一號店');
      setIsAuthenticated(true);
      setError('');
    } else if (password === '00084258') {
      setCurrentStore('store_2');
      setStoreName('二號店');
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('密碼錯誤！請輸入正確的分店密碼');
    }
  };

  const fetchData = async () => {
    const { data: empData } = await supabase.from('employees').select('*').eq('store', currentStore).eq('is_active', true);
    const { data: shiftData } = await supabase.from('shifts').select('*').eq('store', currentStore);
    const { data: settingData } = await supabase.from('system_settings').select('*').eq('store', currentStore).single();
    
    if (empData) setEmployees(empData);
    if (shiftData) setShifts(shiftData);
    if (settingData) setIsSubmissionOpen(settingData.is_submission_open);
  };

  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [selectedMonth, currentStore, isAuthenticated]);

  const loadUnavailability = async (empId: string) => {
    setSelectedEmpId(empId);
    if (!empId) return;
    const { data } = await supabase.from('unavailability').select('date').eq('employee_id', empId).eq('store', currentStore);
    if (data) setUnavailDates(data.map(d => d.date));
  };

  const toggleUnavailDate = async (dateStr: string) => {
    if (!selectedEmpId || !isSubmissionOpen) return;

    if (unavailDates.includes(dateStr)) {
      await supabase.from('unavailability').delete().eq('employee_id', selectedEmpId).eq('date', dateStr).eq('store', currentStore);
      setUnavailDates(unavailDates.filter(d => d !== dateStr));
    } else {
      await supabase.from('unavailability').insert([{ employee_id: selectedEmpId, date: dateStr, store: currentStore }]);
      setUnavailDates([...unavailDates, dateStr]);
    }
  };

  const [yearStr, monthStr] = selectedMonth.split('-');
  const yearNum = parseInt(yearStr);
  const monthNum = parseInt(monthStr);

  const getDaysInMonth = (year: number, month: number) => {
    const date = new Date(year, month - 1, 1);
    const days = [];
    const firstDayIndex = date.getDay();
    const totalDays = new Date(year, month, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);
    return days;
  };

  const calendarDays = getDaysInMonth(yearNum, monthNum);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">📅 餐飲排班系統</h1>
            <p className="text-sm text-slate-500 mt-1">請輸入分店專用密碼查看班表</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">分店查詢密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-black text-center text-lg tracking-widest"
                placeholder="輸入分店密碼..."
              />
            </div>
            {error && <p className="text-red-500 text-xs text-center font-medium">{error}</p>}
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition shadow-md shadow-indigo-200"
            >
              進入班表系統
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-lg">
                {storeName}
              </span>
              <h1 className="text-xl font-bold text-slate-800">全店月曆班表</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">當前查看月份：{selectedMonth}</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <button
              onClick={() => { setIsAuthenticated(false); setPassword(''); }}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-xl font-medium transition"
            >
              退出登入
            </button>
          </div>
        </div>

        {/* 劃班功能 */}
        {isSubmissionOpen && (
          <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-2xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                  劃休功能開放中 ({storeName})
                </h2>
                <p className="text-xs text-indigo-700">選擇名字後，點擊下方月曆即可標記「不能上班」</p>
              </div>
              <select
                value={selectedEmpId}
                onChange={(e) => loadUnavailability(e.target.value)}
                className="border border-indigo-200 p-2 rounded-xl text-sm font-medium bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- 請選擇你的名字 --</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* 月曆網格 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-200 text-center font-bold text-xs text-slate-600 py-3">
            {weekDays.map((day, idx) => (
              <div key={day} className={idx === 0 || idx === 6 ? 'text-rose-500' : ''}>
                週{day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-50/30">
            {calendarDays.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="min-h-[110px] bg-slate-50/50" />;

              const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
              const dayShifts = shifts.filter(s => s.date === dateStr);
              const isUnavail = unavailDates.includes(dateStr);

              return (
                <div
                  key={day}
                  onClick={() => selectedEmpId && toggleUnavailDate(dateStr)}
                  className={`min-h-[110px] p-2 transition ${
                    selectedEmpId && isSubmissionOpen ? 'cursor-pointer hover:bg-slate-100' : ''
                  } ${isUnavail ? 'bg-rose-50/60' : 'bg-white'}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-xs font-bold ${
                      idx % 7 === 0 || idx % 7 === 6 ? 'text-rose-500' : 'text-slate-700'
                    }`}>
                      {day}
                    </span>
                    {isUnavail && (
                      <span className="text-[9px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded-full">
                        劃休
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {employees.map(emp => {
                      const empShifts = dayShifts.filter(s => s.employee_id === emp.id);
                      if (empShifts.length === 0) return null;

                      const hasNormal = empShifts.some(s => s.shift_type === 'normal');
                      const hasOpen = empShifts.some(s => s.shift_type === 'open');
                      const hasHalf = empShifts.some(s => s.shift_type === 'half');
                      const hasNight = empShifts.some(s => s.shift_type === 'night');
                      const hasOff = empShifts.some(s => s.shift_type === 'off');

                      return (
                        <div key={emp.id} className="text-[11px] p-1 rounded-md bg-slate-50 border border-slate-200 flex justify-between items-center">
                          <span className="font-bold text-slate-800 truncate">{emp.name}</span>
                          <div className="flex gap-0.5 shrink-0">
                            {hasNormal && <span className="text-[9px] px-1 bg-blue-500 text-white rounded font-bold">正</span>}
                            {hasOpen && <span className="text-[9px] px-1 bg-emerald-500 text-white rounded font-bold">開</span>}
                            {hasHalf && <span className="text-[9px] px-1 bg-amber-500 text-white rounded font-bold">半</span>}
                            {hasOff && <span className="text-[9px] px-1 bg-rose-500 text-white rounded font-bold">休</span>}
                            {hasNight && <span className="text-[9px] px-1 bg-purple-600 text-white rounded font-bold">宵</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 圖例說明 */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 bg-white p-4 rounded-xl border border-slate-200">
          <span className="font-bold text-slate-700">班別圖例：</span>
          <span className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">正</span> 正常班 (18:30~00:30)
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded">開</span> 開店班 (18:30~00:30)
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded">半</span> 半天班 (21:00~00:30)
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded">休</span> 排休
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded">宵</span> 宵夜班 (00:30~03:30)
          </span>
        </div>

      </div>
    </main>
  );
}