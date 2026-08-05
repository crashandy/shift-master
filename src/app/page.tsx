'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// 班別對應顏色與簡稱標籤
const SHIFT_TYPES: Record<string, { label: string; bg: string; text: string }> = {
  normal: { label: '正', bg: 'bg-blue-500', text: 'text-white' },
  open: { label: '開', bg: 'bg-emerald-500', text: 'text-white' },
  half: { label: '半', bg: 'bg-amber-400', text: 'text-slate-900' },
  off: { label: '休', bg: 'bg-rose-500', text: 'text-white' },
};

interface Employee {
  id: string;
  name: string;
  store: string;
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

export default function Home() {
  const [password, setPassword] = useState('');
  const [store, setStore] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // 年月選擇
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // 登入驗證
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '88652358') {
      setStore('store1');
      setIsAuthenticated(true);
    } else if (password === '00084258') {
      setStore('store2');
      setIsAuthenticated(true);
    } else {
      alert('密碼錯誤，請重新輸入！');
    }
  };

  // 載入資料
  useEffect(() => {
    if (isAuthenticated && store) {
      fetchData();
    }
  }, [isAuthenticated, store, currentYear, currentMonth]);

  const fetchData = async () => {
    if (!store) return;

    // 取得該分店員工
    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .eq('store', store)
      .eq('is_active', true);
    if (empData) setEmployees(empData);

    // 取得當月班表
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .eq('store', store)
      .gte('date', startDate)
      .lte('date', endDate);
    if (shiftData) setShifts(shiftData);

    // 取得劃休資料
    const { data: unavailData } = await supabase
      .from('unavailability')
      .select('*')
      .eq('store', store)
      .gte('date', startDate)
      .lte('date', endDate);
    if (unavailData) setUnavailabilities(unavailData);

    // 取得劃班功能開關狀態
    const { data: sysData } = await supabase
      .from('system_settings')
      .select('*')
      .eq('id', 'global')
      .single();
    if (sysData) setIsSubmissionOpen(sysData.is_submission_open);
  };

  // 切換劃休標記
  const toggleUnavailability = async (dateStr: string) => {
    if (!isSubmissionOpen) {
      alert('目前管理者未開放填寫劃休！');
      return;
    }
    if (!selectedEmployeeId) {
      alert('請先在上方選擇您的名字！');
      return;
    }

    const existing = unavailabilities.find(
      (u) => u.employee_id === selectedEmployeeId && u.date === dateStr
    );

    if (existing) {
      // 取消劃休
      await supabase
        .from('unavailability')
        .delete()
        .eq('employee_id', selectedEmployeeId)
        .eq('date', dateStr)
        .eq('store', store);
      setUnavailabilities(unavailabilities.filter((u) => !(u.employee_id === selectedEmployeeId && u.date === dateStr)));
    } else {
      // 新增劃休
      await supabase
        .from('unavailability')
        .insert({ employee_id: selectedEmployeeId, date: dateStr, store });
      setUnavailabilities([...unavailabilities, { employee_id: selectedEmployeeId, date: dateStr, store: store! }]);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4">
        <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-6 text-indigo-400">店員班表查詢系統</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">請輸入店員通行密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入 8 位數密碼"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg transition"
            >
              進入班表總覽
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 產生當月天數陣列
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-6">
      {/* 頂部導覽 */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-indigo-400">
            {store === 'store1' ? '一號店' : '二號店'} - 當月全店總班表
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            圖例：
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-full ml-2 mr-1"></span>正常班(18:30~00:30)
            <span className="inline-block w-3 h-3 bg-emerald-500 rounded-full ml-2 mr-1"></span>開店班(18:30~00:30)
            <span className="inline-block w-3 h-3 bg-amber-400 rounded-full ml-2 mr-1"></span>半天班(21:00~00:30)
            <span className="inline-block w-3 h-3 bg-rose-500 rounded-full ml-2 mr-1"></span>排休
            <span className="inline-block w-2 h-2 bg-purple-500 rounded-full ml-2 mr-1"></span>+宵夜班
          </p>
        </div>

        {/* 年月切換 */}
        <div className="flex items-center gap-3 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
          <button
            onClick={() => {
              if (currentMonth === 1) {
                setCurrentYear(currentYear - 1);
                setCurrentMonth(12);
              } else {
                setCurrentMonth(currentMonth - 1);
              }
            }}
            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm font-bold"
          >
            &lt; 上個月
          </button>
          <span className="font-bold text-lg text-indigo-300">
            {currentYear} 年 {currentMonth} 月
          </span>
          <button
            onClick={() => {
              if (currentMonth === 12) {
                setCurrentYear(currentYear + 1);
                setCurrentMonth(1);
              } else {
                setCurrentMonth(currentMonth + 1);
              }
            }}
            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm font-bold"
          >
            下個月 &gt;
          </button>
        </div>
      </header>

      {/* 劃休專區 (若開放劃休) */}
      <div className="max-w-7xl mx-auto mb-6 bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">🙋 填寫劃休專區：</span>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white rounded px-3 py-1.5 text-sm"
            >
              <option value="">-- 請選擇您的名字 --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs">
            狀態：
            {isSubmissionOpen ? (
              <span className="text-emerald-400 font-bold bg-emerald-950 px-2.5 py-1 rounded-full border border-emerald-800">
                🟢 劃班開放中 (請選名字後點擊下方表格劃休)
              </span>
            ) : (
              <span className="text-rose-400 font-bold bg-rose-950 px-2.5 py-1 rounded-full border border-rose-800">
                🔴 目前未開放填寫劃休
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 全店班表大圖表 (矩陣格式) */}
      <div className="max-w-7xl mx-auto overflow-x-auto bg-slate-800 rounded-xl shadow-xl border border-slate-700">
        <table className="w-full text-center border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-slate-950 text-slate-300 text-xs">
              <th className="p-3 border-b border-r border-slate-700 sticky left-0 bg-slate-950 z-10 w-28">
                員工姓名
              </th>
              {daysArray.map((day) => {
                const dateObj = new Date(currentYear, currentMonth - 1, day);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
                return (
                  <th
                    key={day}
                    className={`p-2 border-b border-r border-slate-700 font-normal ${
                      isWeekend ? 'bg-amber-950/30 text-amber-300 font-bold' : ''
                    }`}
                  >
                    <div>{day}</div>
                    <div className="text-[10px] opacity-75">({weekDays[dateObj.getDay()]})</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 1} className="p-8 text-slate-500">
                  尚無員工資料
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-750/50 border-b border-slate-700/50">
                  {/* 左側名字欄位 */}
                  <td className="p-3 font-semibold text-sm border-r border-slate-700 sticky left-0 bg-slate-800 z-10 text-indigo-200">
                    {emp.name}
                  </td>

                  {/* 每日班別欄位 */}
                  {daysArray.map((day) => {
                    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    
                    // 尋找當天班別
                    const shift = shifts.find((s) => s.employee_id === emp.id && s.date === dateStr);
                    // 尋找當天劃休標記
                    const isUnavail = unavailabilities.some((u) => u.employee_id === emp.id && u.date === dateStr);

                    const isSelectedUser = emp.id === selectedEmployeeId;

                    return (
                      <td
                        key={day}
                        onClick={() => isSelectedUser && toggleUnavailability(dateStr)}
                        className={`p-1 border-r border-slate-700/50 text-xs relative transition ${
                          isSelectedUser && isSubmissionOpen ? 'cursor-pointer hover:bg-slate-700' : ''
                        }`}
                      >
                        <div className="min-h-[40px] flex flex-col items-center justify-center gap-1">
                          {/* 主班別標籤 */}
                          {shift && shift.shift_type && SHIFT_TYPES[shift.shift_type] ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-bold shadow ${SHIFT_TYPES[shift.shift_type].bg} ${SHIFT_TYPES[shift.shift_type].text}`}
                            >
                              {SHIFT_TYPES[shift.shift_type].label}
                            </span>
                          ) : isUnavail ? (
                            <span className="px-1 py-0.5 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800">
                              劃休
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}

                          {/* 宵夜班標籤 */}
                          {shift && shift.is_night && (
                            <span className="px-1 py-0.2 text-[9px] bg-purple-600 text-white rounded-full font-bold">
                              +宵
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
