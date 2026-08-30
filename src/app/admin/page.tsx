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

  // 點擊畫板進行排班
  const handleCellClick = async (employeeId: string, dateStr: string) => {
    const existingShift = shifts.find(
      (s) => s.employee_id === employeeId && s.date === dateStr
    );

    const isNight = existingShift ? existingShift.is_night : false;
    const newShiftType = activeTool;

    if (newShiftType === 'none' && !isNight) {
      if (existingShift?.id) {
        await supabase.from('shifts').delete().eq('id', existingShift.id);
      }
    } else {
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

  // 切換宵夜班
  const handleToggleNight = async (
    e: React.MouseEvent,
    employeeId: string,
    dateStr: string
  ) => {
    e.stopPropagation();

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

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

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

    const totalHours = (normalCount + openCount) * 6 + halfCount * 3.5;
    const totalPay = (normalCount + openCount) * 1260 + halfCount * 735;

    return { normalCount, openCount, halfCount, nightCount, totalHours, totalPay };
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            ⚡
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-2 text-center">管理者後台登入</h1>
          <p className="text-sm text-slate-500 text-center mb-6">請輸入管理員密碼以進入排班系統</p>
          <input
            type="password"
            placeholder="請輸入管理者密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3.5 rounded-xl bg-slate-50 text-slate-800 mb-4 outline-none border border-slate-200 focus:border-indigo-500 focus:bg-white transition"
          />
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition">
            登入系統
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      {/* 頂部管理導航列 */}
      <div className="max-w-[1500px] mx-auto mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h1 className="text-xl font-black text-slate-900">管理者排班系統</h1>
          </div>
          <select
            value={currentStore}
            onChange={(e) => setCurrentStore(e.target.value as 'store1' | 'store2')}
            className="bg-slate-100 text-slate-800 px-3 py-2 rounded-xl border border-slate-300 font-bold outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="store1">一號店 (88652358)</option>
            <option value="store2">二號店 (00084258)</option>
          </select>
        </div>

        {/* 劃休開關按鈕 */}
        <button
          onClick={toggleSubmissionOpen}
          className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-2 shadow-sm ${
            isSubmissionOpen 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100' 
              : 'bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isSubmissionOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          店員劃休功能：{isSubmissionOpen ? '開放中' : '已鎖定'}
        </button>
      </div>

      {/* 畫筆工具列 */}
      <div className="max-w-[1500px] mx-auto mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          🖌️ 請選擇排班畫筆（點擊後直接連點表格排班）：
        </div>
        <div className="flex flex-wrap gap-2.5">
          {[
            { type: 'normal', label: '🔵 正常班 (18:30~00:30)', activeClass: 'bg-blue-600 text-white shadow-md' },
            { type: 'open', label: '🟢 開店班 (18:30~00:30)', activeClass: 'bg-emerald-600 text-white shadow-md' },
            { type: 'half', label: '🟡 半天班 (21:00~00:30)', activeClass: 'bg-amber-500 text-white shadow-md' },
            { type: 'off', label: '🔴 管理者排休', activeClass: 'bg-rose-500 text-white shadow-md' },
            { type: 'none', label: '⚪ 橡皮擦 (清除班別)', activeClass: 'bg-slate-700 text-white shadow-md' },
          ].map((tool) => (
            <button
              key={tool.type}
              onClick={() => setActiveTool(tool.type as ShiftType)}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold transition border ${
                activeTool === tool.type
                  ? tool.activeClass + ' border-transparent'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      {/* 月份選擇器 */}
      <div className="max-w-[1500px] mx-auto mb-4 flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <button
          onClick={() => {
            if (month === 1) {
              setMonth(12);
              setYear(year - 1);
            } else {
              setMonth(month - 1);
            }
          }}
          className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-sm"
        >
          &lt; 上個月
        </button>
        <span className="text-lg font-black text-slate-800">
          {year} 年 {month} 月 排班矩陣
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
          className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-sm"
        >
          下個月 &gt;
        </button>
      </div>

      {/* 排班矩陣大表格 */}
      <div className="max-w-[1500px] mx-auto bg-white rounded-2xl border border-slate-200 p-2 overflow-x-auto mb-8 shadow-sm">
        <table className="w-full border-separate border-spacing-0 min-w-[1300px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-100/95 backdrop-blur border-b border-r border-slate-200 p-3 text-left min-w-[130px] font-bold text-slate-700 rounded-tl-xl">
                員工姓名
              </th>
              {daysArray.map((day) => {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateObj = new Date(year, month - 1, day);
                const dayOfWeek = dateObj.getDay();
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                const dayShifts = shifts.filter((s) => s.date === dateStr);
                const normalCount = dayShifts.filter((s) => s.shift_type === 'normal').length;
                const openCount = dayShifts.filter((s) => s.shift_type === 'open').length;
                const halfCount = dayShifts.filter((s) => s.shift_type === 'half').length;
                const nightCount = dayShifts.filter((s) => s.is_night).length;

                return (
                  <th
                    key={day}
                    className={`border-b border-r border-slate-200 p-2 text-center min-w-[76px] ${
                      isWeekend ? 'bg-indigo-50/50' : 'bg-slate-50/70'
                    }`}
                  >
                    <div className={`text-sm font-black ${isWeekend ? 'text-indigo-600' : 'text-slate-800'}`}>
                      {day}
                    </div>
                    <div className={`text-xs ${isWeekend ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>
                      週{dayNames[dayOfWeek]}
                    </div>

                    {/* 當日排班人數即時標籤 */}
                    <div className="mt-1.5 flex flex-col items-center gap-1 min-h-[42px]">
                      {(normalCount > 0 || openCount > 0) && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none">
                          正 {normalCount + openCount}
                        </span>
                      )}
                      {halfCount > 0 && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none">
                          半 {halfCount}
                        </span>
                      )}
                      {nightCount > 0 && (
                        <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none">
                          宵 {nightCount}
                        </span>
                      )}
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
                <td className="sticky left-0 z-10 bg-white/95 backdrop-blur border-b border-r border-slate-200 p-2.5 font-bold text-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{emp.name}</span>
                    <button
                      onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                      className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-1 rounded-lg transition"
                      title="刪除此員工"
                    >
                      ✕
                    </button>
                  </div>
                </td>

                {/* 每日排班格子 */}
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
                      className="border-b border-r border-slate-200 p-1 text-center cursor-pointer hover:bg-indigo-50/60 transition relative select-none h-16"
                    >
                      {/* 劃休紅色標註 */}
                      {isUnavail && (
                        <span className="absolute top-1 right-1 text-[9px] bg-rose-100 text-rose-600 font-bold px-1 rounded">
                          休
                        </span>
                      )}

                      {/* 班別膠囊 */}
                      {shift?.shift_type === 'normal' && (
                        <div className="bg-blue-600 text-white rounded-lg py-1 font-bold text-xs shadow-sm">正常</div>
                      )}
                      {shift?.shift_type === 'open' && (
                        <div className="bg-emerald-600 text-white rounded-lg py-1 font-bold text-xs shadow-sm">開店</div>
                      )}
                      {shift?.shift_type === 'half' && (
                        <div className="bg-amber-500 text-white rounded-lg py-1 font-bold text-xs shadow-sm">半天</div>
                      )}
                      {shift?.shift_type === 'off' && (
                        <div className="bg-rose-500 text-white rounded-lg py-1 font-bold text-xs shadow-sm">排休</div>
                      )}

                      {/* 宵夜班切換按鈕 */}
                      <button
                        onClick={(e) => handleToggleNight(e, emp.id, dateStr)}
                        className={`mt-1 text-[10px] px-1.5 py-0.5 rounded-md font-bold transition ${
                          shift?.is_night
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                        }`}
                      >
                        {shift?.is_night ? '宵夜✓' : '+宵'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 底部功能區：新增員工與薪資統計 */}
      <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 新增店員卡片 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-black text-slate-800 mb-1">新增店員名單</h2>
            <p className="text-xs text-slate-400 mb-4">將新員工加入目前選擇的分店</p>
            <form onSubmit={handleAddEmployee} className="flex gap-2">
              <input
                type="text"
                placeholder="輸入店員姓名"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
                className="flex-1 p-3 rounded-xl bg-slate-50 text-slate-800 outline-none border border-slate-200 focus:border-indigo-500 focus:bg-white text-sm transition"
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl text-sm transition shadow-sm">
                新增
              </button>
            </form>
          </div>
        </div>

        {/* 薪資統計卡片 */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-black text-slate-800">{month} 月份薪資自動統計表</h2>
              <p className="text-xs text-slate-400">固定時薪 $210 / 宵夜班不計薪</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-xs">
                  <th className="py-2.5 font-bold">姓名</th>
                  <th className="py-2.5 font-bold">正常/開店 (6h)</th>
                  <th className="py-2.5 font-bold">半天 (3.5h)</th>
                  <th className="py-2.5 font-bold">宵夜 (0h)</th>
                  <th className="py-2.5 font-bold">總工時</th>
                  <th className="py-2.5 font-bold text-emerald-600 text-right">預估總薪資</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const salary = calculateSalary(emp.id);
                  return (
                    <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="py-3 font-bold text-slate-800">{emp.name}</td>
                      <td className="py-3 text-slate-600">{salary.normalCount + salary.openCount} 次</td>
                      <td className="py-3 text-slate-600">{salary.halfCount} 次</td>
                      <td className="py-3 text-slate-600">{salary.nightCount} 次</td>
                      <td className="py-3 font-mono font-bold text-indigo-600">{salary.totalHours} 小時</td>
                      <td className="py-3 font-mono font-black text-emerald-600 text-right text-base">
                        ${salary.totalPay.toLocaleString()}
                      </td>
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
