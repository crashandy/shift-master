'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type ShiftType = 'normal' | 'open' | 'half' | 'off' | 'none';

interface Employee {
  id: string;
  name: string;
  store: string;
}

interface Shift {
  id?: string;
  employee_id: string;
  date: string;
  shift_type: ShiftType;
  is_night: boolean;
  store: string;
}

interface Unavailability {
  id?: string;
  employee_id: string;
  date: string;
}

export default function EmployeePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [storePassword, setStorePassword] = useState('');
  const [currentStore, setCurrentStore] = useState<'store1' | 'store2'>('store1');

  // 日期與月份
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // 資料狀態
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);

  // 劃休選擇狀態
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // 登入驗證
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (storePassword === '88652358') {
      setCurrentStore('store1');
      setIsAuthenticated(true);
    } else if (storePassword === '00084258') {
      setCurrentStore('store2');
      setIsAuthenticated(true);
    } else {
      alert('通行碼錯誤，請確認後再輸入！');
    }
  };

  // 載入資料
  const fetchData = async () => {
    // 1. 抓取該分店所有員工
    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .eq('store', currentStore);
    if (empData) setEmployees(empData);

    // 2. 抓取當月班表
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .eq('store', currentStore)
      .gte('date', startDate)
      .lte('date', endDate);
    if (shiftData) setShifts(shiftData);

    // 3. 抓取劃休紀錄
    const { data: unavailData } = await supabase
      .from('unavailability')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);
    if (unavailData) setUnavailabilities(unavailData);

    // 4. 抓取系統劃休開關
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('*')
      .eq('id', 'global')
      .single();
    if (settingsData) {
      setIsSubmissionOpen(settingsData.is_submission_open);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, currentStore, year, month]);

  // 店員點擊進行劃休 / 取消劃休
  const handleToggleUnavailability = async (empId: string, dateStr: string) => {
    if (!isSubmissionOpen) {
      alert('目前店長已鎖定劃休功能，如需異動請聯繫管理者！');
      return;
    }

    if (!selectedEmployeeId) {
      alert('請先在上方「選擇您的名字」才能進行劃休喔！');
      return;
    }

    if (selectedEmployeeId !== empId) {
      alert('您只能為自己勾選或取消劃休！');
      return;
    }

    const existing = unavailabilities.find(
      (u) => u.employee_id === empId && u.date === dateStr
    );

    if (existing?.id) {
      // 取消劃休
      await supabase.from('unavailability').delete().eq('id', existing.id);
    } else {
      // 新增劃休
      await supabase.from('unavailability').insert({
        employee_id: empId,
        date: dateStr,
      });
    }

    fetchData();
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 登入介面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200/80 w-full max-w-md text-center"
        >
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl shadow-sm">
            📅
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
            全店班表系統
          </h1>
          <p className="text-sm text-slate-500 mb-6 font-medium">
            請輸入分店專屬通行碼以查看班表與劃休
          </p>

          <input
            type="password"
            placeholder="請輸入分店通行碼"
            value={storePassword}
            onChange={(e) => setStorePassword(e.target.value)}
            className="w-full p-4 rounded-2xl bg-slate-50 text-slate-800 mb-5 outline-none border border-slate-200 focus:border-indigo-500 focus:bg-white text-center text-lg tracking-widest font-mono transition"
          />

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold py-4 rounded-2xl shadow-md hover:shadow-lg transition"
          >
            進入班表總覽
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-6">
      {/* 頂部 Header */}
      <div className="max-w-[1600px] mx-auto mb-6 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl shadow-xs">
            🏢
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {currentStore === 'store1' ? '一號店 (88652358)' : '二號店 (00084258)'} 班表總覽
            </h1>
            <p className="text-xs text-slate-400 font-medium">全體同仁每日出勤與班別一覽</p>
          </div>
        </div>

        {/* 劃休狀態與員工選單 */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border ${
              isSubmissionOpen
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSubmissionOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            {isSubmissionOpen ? '劃休功能開放中' : '劃休功能已鎖定'}
          </div>

          {isSubmissionOpen && (
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="bg-slate-50 text-slate-800 px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-bold outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- 我要劃休（先選名字）--</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* 班別圖例說明卡片 */}
      <div className="max-w-[1600px] mx-auto mb-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 font-medium text-slate-600">
          <span className="font-bold text-slate-400">班別說明：</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> 正常班 (18:30~00:30)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" /> 開店班 (18:30~00:30)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> 半天班 (21:00~00:30)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-purple-600 inline-block" /> 宵夜班 (+宵)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> 店長排休
          </span>
        </div>

        {selectedEmployeeId && isSubmissionOpen && (
          <div className="text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-lg">
            👉 點選您名字對應的日期格子即可「標記 / 取消」劃休
          </div>
        )}
      </div>

      {/* 月份切換 */}
      <div className="max-w-[1600px] mx-auto mb-4 flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
        <button
          onClick={() => {
            if (month === 1) {
              setMonth(12);
              setYear(year - 1);
            } else {
              setMonth(month - 1);
            }
          }}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-sm flex items-center gap-1"
        >
          <span>&lt;</span> 上個月
        </button>
        <span className="text-lg font-black text-slate-800 tracking-tight">
          {year} 年 {month} 月
        </span>
        <button
          onClick={() => {
            if (month === 12) {
              setMonth(1);
              setYear(year + 1);
            } else {
              setMonth(month + 1);
            }
          }}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-sm flex items-center gap-1"
        >
          下個月 <span>&gt;</span>
        </button>
      </div>

      {/* 全體同仁排班總表格 */}
      <div className="max-w-[1600px] mx-auto bg-white rounded-2xl border border-slate-200/80 p-2 overflow-x-auto shadow-sm">
        <table className="w-full border-separate border-spacing-0 min-w-[1300px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-100/95 backdrop-blur border-b border-r border-slate-200 p-3 text-left min-w-[130px] font-bold text-slate-700 rounded-tl-xl shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                員工姓名
              </th>
              {daysArray.map((day) => {
                const dateObj = new Date(year, month - 1, day);
                const dayOfWeek = dateObj.getDay();
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                return (
                  <th
                    key={day}
                    className={`border-b border-r border-slate-200 p-2.5 text-center min-w-[76px] ${
                      isWeekend ? 'bg-indigo-50/50' : 'bg-slate-50/70'
                    }`}
                  >
                    <div className={`text-sm font-black ${isWeekend ? 'text-indigo-600' : 'text-slate-800'}`}>
                      {day}
                    </div>
                    <div className={`text-xs font-semibold ${isWeekend ? 'text-indigo-400' : 'text-slate-400'}`}>
                      週{dayNames[dayOfWeek]}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, idx) => (
              <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                {/* 左側員工固定列 */}
                <td className="sticky left-0 z-10 bg-white/95 backdrop-blur border-b border-r border-slate-200 p-3 font-bold text-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        emp.id === selectedEmployeeId ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    />
                    <span className="truncate">{emp.name}</span>
                  </div>
                </td>

                {/* 每日班別格子 */}
                {daysArray.map((day) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isUnavail = unavailabilities.some(
                    (u) => u.employee_id === emp.id && u.date === dateStr
                  );
                  const shift = shifts.find(
                    (s) => s.employee_id === emp.id && s.date === dateStr
                  );

                  const isSelectable = selectedEmployeeId === emp.id && isSubmissionOpen;

                  return (
                    <td
                      key={day}
                      onClick={() => {
                        if (isSelectable) {
                          handleToggleUnavailability(emp.id, dateStr);
                        }
                      }}
                      className={`border-b border-r border-slate-200 p-1 text-center select-none h-16 relative transition ${
                        isSelectable
                          ? 'cursor-pointer hover:bg-indigo-50/80 active:scale-[0.98]'
                          : ''
                      }`}
                    >
                      {/* 劃休標記 */}
                      {isUnavail && (
                        <span className="absolute top-1 right-1 text-[9px] bg-rose-100 text-rose-600 font-bold px-1 py-0.2 rounded shadow-2xs">
                          休
                        </span>
                      )}

                      {/* 班別膠囊 */}
                      {shift?.shift_type === 'normal' && (
                        <div className="bg-blue-600 text-white rounded-lg py-1 font-bold text-xs shadow-xs">
                          正常
                        </div>
                      )}
                      {shift?.shift_type === 'open' && (
                        <div className="bg-emerald-600 text-white rounded-lg py-1 font-bold text-xs shadow-xs">
                          開店
                        </div>
                      )}
                      {shift?.shift_type === 'half' && (
                        <div className="bg-amber-500 text-white rounded-lg py-1 font-bold text-xs shadow-xs">
                          半天
                        </div>
                      )}
                      {shift?.shift_type === 'off' && (
                        <div className="bg-rose-500 text-white rounded-lg py-1 font-bold text-xs shadow-xs">
                          排休
                        </div>
                      )}

                      {/* 宵夜班標籤 */}
                      {shift?.is_night && (
                        <div className="mt-1 inline-block bg-purple-100 text-purple-700 text-[10px] font-black px-1.5 py-0.5 rounded-md leading-none border border-purple-200">
                          宵夜✓
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
