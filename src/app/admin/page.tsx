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
  employee_id: string;
  date: string;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [currentStore, setCurrentStore] = useState<'store1' | 'store2'>('store1');

  // 日期與月份
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // 資料狀態
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(true);

  // 排班畫筆工具
  const [activeTool, setActiveTool] = useState<ShiftType>('normal');
  const [newEmployeeName, setNewEmployeeName] = useState('');

  // 登入驗證
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin888') {
      setIsAuthenticated(true);
    } else {
      alert('密碼錯誤！');
    }
  };

  // 載入資料
  const fetchData = async () => {
    // 1. 抓取該分店員工
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

  // 切換劃休開關
  const toggleSubmissionOpen = async () => {
    const nextState = !isSubmissionOpen;
    const { error } = await supabase
      .from('system_settings')
      .upsert({ id: 'global', is_submission_open: nextState });

    if (error) {
      alert(`更新失敗：${error.message}`);
    } else {
      setIsSubmissionOpen(nextState);
    }
  };

  // 新增員工
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim()) return;

    const { error } = await supabase.from('employees').insert({
      name: newEmployeeName.trim(),
      store: currentStore,
      is_active: true,
    });

    if (error) {
      alert(`新增員工失敗：${error.message}`);
    } else {
      setNewEmployeeName('');
      fetchData();
    }
  };

  // 刪除員工
  const handleDeleteEmployee = async (id: string, name: string) => {
    if (confirm(`確定要刪除員工「${name}」嗎？這將會一併刪除該員工的所有排班與劃休紀錄！`)) {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) {
        alert(`刪除失敗：${error.message}`);
      } else {
        fetchData();
      }
    }
  };

  // 點擊畫板進行排班（切換主班別）
  const handleCellClick = async (employeeId: string, dateStr: string) => {
    const existingShift = shifts.find(
      (s) => s.employee_id === employeeId && s.date === dateStr
    );

    const isNight = existingShift ? existingShift.is_night : false;
    const newShiftType = activeTool;

    if (newShiftType === 'none' && !isNight) {
      // 班別與宵夜班皆無時刪除紀錄
      if (existingShift?.id) {
        await supabase.from('shifts').delete().eq('id', existingShift.id);
      }
    } else {
      // 寫入/更新班別
      await supabase.from('shifts').upsert({
        ...(existingShift?.id ? { id: existingShift.id } : {}),
        employee_id: employeeId,
        date: dateStr,
        shift_type: newShiftType,
        is_night: isNight,
        store: currentStore,
      });
    }

    fetchData();
  };

  // 切換宵夜班狀態
  const handleToggleNight = async (
    e: React.MouseEvent,
    employeeId: string,
    dateStr: string
  ) => {
    e.stopPropagation(); // 避免觸發主班別點擊

    const existingShift = shifts.find(
      (s) => s.employee_id === employeeId && s.date === dateStr
    );

    const newIsNight = existingShift ? !existingShift.is_night : true;
    const shiftType = existingShift ? existingShift.shift_type : 'none';

    if (shiftType === 'none' && !newIsNight) {
      if (existingShift?.id) {
        await supabase.from('shifts').delete().eq('id', existingShift.id);
      }
    } else {
      await supabase.from('shifts').upsert({
        ...(existingShift?.id ? { id: existingShift.id } : {}),
        employee_id: employeeId,
        date: dateStr,
        shift_type: shiftType,
        is_night: newIsNight,
        store: currentStore,
      });
    }

    fetchData();
  };

  // 計算當月日曆天數
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 薪資計算邏輯
  const calculateSalary = (empId: string) => {
    const empShifts = shifts.filter((s) => s.employee_id === empId);
    let normalCount = 0;
    let openCount = 0;
    let halfCount = 0;
    let nightCount = 0;

    empShifts.forEach((s) => {
      if (s.shift_type === 'normal') normalCount++;
      if (s.shift_type === 'open') openCount++;
      if (s.shift_type === 'half') halfCount++;
      if (s.is_night) nightCount++;
    });

    const totalHours = (normalCount + openCount) * 6 + halfCount * 3.5; // 宵夜班不計工時
    const totalPay = (normalCount + openCount) * 1260 + halfCount * 735; // 宵夜班 $0

    return { normalCount, openCount, halfCount, nightCount, totalHours, totalPay };
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-xl shadow-xl w-full max-w-md">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">管理者後台登入</h1>
          <input
            type="password"
            placeholder="請輸入管理者密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 rounded-lg bg-slate-700 text-white mb-4 outline-none border border-slate-600 focus:border-indigo-500"
          />
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition">
            登入系統
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      {/* 頂部管理選單 */}
      <div className="max-w-7xl mx-auto mb-6 bg-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-indigo-400">管理者排班系統</h1>
          <select
            value={currentStore}
            onChange={(e) => setCurrentStore(e.target.value as 'store1' | 'store2')}
            className="bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-600 font-bold"
          >
            <option value="store1">一號店 (88652358)</option>
            <option value="store2">二號店 (00084258)</option>
          </select>
        </div>

        {/* 劃休開關按鈕 */}
        <button
          onClick={toggleSubmissionOpen}
          className={`px-4 py-2 rounded-lg font-bold transition ${
            isSubmissionOpen ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-rose-600 hover:bg-rose-500 text-white'
          }`}
        >
          店員劃休功能：{isSubmissionOpen ? '🟢 開放中' : '🔴 已鎖定'}
        </button>
      </div>

      {/* 畫筆工具列 */}
      <div className="max-w-7xl mx-auto mb-6 bg-slate-800 p-4 rounded-xl">
        <h2 className="text-sm font-bold text-slate-400 mb-3">🖌️ 請選擇排班畫筆（點擊後直接連點日期格子排班）：</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { type: 'normal', label: '🔵 正常班 (18:30~00:30)', bg: 'bg-blue-600' },
            { type: 'open', label: '🟢 開店班 (18:30~00:30)', bg: 'bg-emerald-600' },
            { type: 'half', label: '🟡 半天班 (21:00~00:30)', bg: 'bg-amber-600' },
            { type: 'off', label: '🔴 管理者排休', bg: 'bg-rose-600' },
            { type: 'none', label: '⚪ 橡皮擦 (清除班別)', bg: 'bg-slate-600' },
          ].map((tool) => (
            <button
              key={tool.type}
              onClick={() => setActiveTool(tool.type as ShiftType)}
              className={`px-4 py-2 rounded-lg font-bold transition border-2 ${tool.bg} ${
                activeTool === tool.type ? 'border-white scale-105 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      {/* 月份選擇器 */}
      <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between bg-slate-800 p-4 rounded-xl">
        <button
          onClick={() => {
            if (month === 1) {
              setMonth(12);
              setYear(year - 1);
            } else {
              setMonth(month - 1);
            }
          }}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold"
        >
          &lt; 上個月
        </button>
        <span className="text-xl font-bold text-indigo-300">
          {year} 年 {month} 月 排班畫板
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
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold"
        >
          下個月 &gt;
        </button>
      </div>

      {/* 排班矩陣畫板 */}
      <div className="max-w-7xl mx-auto bg-slate-800 rounded-xl p-4 overflow-x-auto mb-8 shadow-xl">
        <table className="w-full border-collapse min-w-[1200px]">
          <thead>
            <tr>
              <th className="border border-slate-700 p-2 bg-slate-700/50 text-left min-w-[140px] sticky left-0 z-10 bg-slate-800">
                員工姓名
              </th>
              {daysArray.map((day) => {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateObj = new Date(year, month - 1, day);
                const dayOfWeek = dateObj.getDay();
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

                // 統計當天各班別的實際排班人數
                const dayShifts = shifts.filter((s) => s.date === dateStr);
                const normalCount = dayShifts.filter((s) => s.shift_type === 'normal').length;
                const openCount = dayShifts.filter((s) => s.shift_type === 'open').length;
                const halfCount = dayShifts.filter((s) => s.shift_type === 'half').length;
                const nightCount = dayShifts.filter((s) => s.is_night).length;

                return (
                  <th
                    key={day}
                    className={`border border-slate-700 p-2 text-center min-w-[80px] ${
                      dayOfWeek === 0 || dayOfWeek === 6 ? 'bg-indigo-950/40' : ''
                    }`}
                  >
                    <div className="text-sm font-bold">{day} 日</div>
                    <div className="text-xs text-slate-400">({dayNames[dayOfWeek]})</div>

                    {/* 當日排班人數即時統計（按需求顯示：正常 X / 半天 Y / 宵夜 Z） */}
                    <div className="mt-1 flex flex-col items-center gap-0.5 text-[10px]">
                      {(normalCount > 0 || openCount > 0) && (
                        <span className="bg-blue-900/80 text-blue-200 px-1 py-0.2 rounded font-mono">
                          正常 {normalCount + openCount}
                        </span>
                      )}
                      {halfCount > 0 && (
                        <span className="bg-amber-900/80 text-amber-200 px-1 py-0.2 rounded font-mono">
                          半天 {halfCount}
                        </span>
                      )}
                      {nightCount > 0 && (
                        <span className="bg-purple-900/80 text-purple-200 px-1 py-0.2 rounded font-mono">
                          宵夜 {nightCount}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-750">
                <td className="border border-slate-700 p-2 font-bold sticky left-0 bg-slate-800 z-10 flex items-center justify-between">
                  <span>{emp.name}</span>
                  <button
                    onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                    className="text-slate-500 hover:text-rose-400 font-bold px-1 rounded transition"
                    title="刪除員工"
                  >
                    ✕
                  </button>
                </td>
                {daysArray.map((day) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isUnavail = unavailabilities.some(
                    (u) => u.employee_id === emp.id && u.date === dateStr
                  );
                  const shift = shifts.find(
                    (s) => s.employee_id === emp.id && s.date === dateStr
                  );

                  return (
                    <td
                      key={day}
                      onClick={() => handleCellClick(emp.id, dateStr)}
                      className="border border-slate-700 p-1 text-center cursor-pointer hover:bg-slate-700/50 transition relative select-none h-16"
                    >
                      {/* 劃休標記 */}
                      {isUnavail && (
                        <span className="absolute top-0.5 right-0.5 text-[9px] bg-rose-900 text-rose-300 px-1 rounded">
                          不可
                        </span>
                      )}

                      {/* 主班別標籤 */}
                      {shift?.shift_type === 'normal' && (
                        <div className="bg-blue-600 text-white rounded py-1 font-bold text-xs shadow">正常</div>
                      )}
                      {shift?.shift_type === 'open' && (
                        <div className="bg-emerald-600 text-white rounded py-1 font-bold text-xs shadow">開店</div>
                      )}
                      {shift?.shift_type === 'half' && (
                        <div className="bg-amber-600 text-white rounded py-1 font-bold text-xs shadow">半天</div>
                      )}
                      {shift?.shift_type === 'off' && (
                        <div className="bg-rose-600 text-white rounded py-1 font-bold text-xs shadow">排休</div>
                      )}

                      {/* 宵夜班切換按鈕 */}
                      <button
                        onClick={(e) => handleToggleNight(e, emp.id, dateStr)}
                        className={`mt-1 text-[10px] px-1.5 py-0.5 rounded transition ${
                          shift?.is_night
                            ? 'bg-purple-600 text-white font-bold'
                            : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600'
                        }`}
                      >
                        {shift?.is_night ? '宵夜 ✓' : '+宵'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 員工管理與當月薪資統計 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 新增員工 */}
        <div className="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 className="text-lg font-bold text-indigo-300 mb-4">新增店員 (當前分店)</h2>
          <form onSubmit={handleAddEmployee} className="flex gap-2">
            <input
              type="text"
              placeholder="輸入店員姓名"
              value={newEmployeeName}
              onChange={(e) => setNewEmployeeName(e.target.value)}
              className="flex-1 p-2.5 rounded-lg bg-slate-700 text-white outline-none border border-slate-600 focus:border-indigo-500"
            />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-lg transition">
              新增
            </button>
          </form>
        </div>

        {/* 薪資統計表 */}
        <div className="lg:col-span-2 bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 className="text-lg font-bold text-indigo-300 mb-4">{month} 月份薪資自動統計表 (時薪 $210)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-sm">
                  <th className="py-2">姓名</th>
                  <th className="py-2">正常/開店班 (6h)</th>
                  <th className="py-2">半天班 (3.5h)</th>
                  <th className="py-2">宵夜班 (0h)</th>
                  <th className="py-2">總工時</th>
                  <th className="py-2 text-emerald-400">預估總薪資</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const salary = calculateSalary(emp.id);
                  return (
                    <tr key={emp.id} className="border-b border-slate-700/50">
                      <td className="py-3 font-bold">{emp.name}</td>
                      <td className="py-3">{salary.normalCount + salary.openCount} 次</td>
                      <td className="py-3">{salary.halfCount} 次</td>
                      <td className="py-3">{salary.nightCount} 次</td>
                      <td className="py-3 font-mono text-indigo-300">{salary.totalHours} 小時</td>
                      <td className="py-3 font-bold text-emerald-400 font-mono">${salary.totalPay.toLocaleString()} 元</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
