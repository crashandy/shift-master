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
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="bg-indigo-950 border border-indigo-700 text-indigo-200 font-bold px-3 py-1.5 rounded-lg"
          >
            <option value="store1">一號店</option>
            <option value="store2">二號店</option>
          </select>
        </div>

        {/* 年月切換與劃班開關 */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={toggleSubmissionOpen}
            className={`px-4 py-2 rounded-lg font-bold text-sm shadow transition ${
              isSubmissionOpen
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            店員劃休功能：{isSubmissionOpen ? '🟢 開放中 (點擊關閉)' : '🔴 已鎖定 (點擊開放)'}
          </button>

          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <button
              onClick={() => {
                if (currentMonth === 1) {
                  setCurrentYear(currentYear - 1);
                  setCurrentMonth(12);
                } else {
                  setCurrentMonth(currentMonth - 1);
                }
              }}
              className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"
            >
              &lt;
            </button>
            <span className="font-bold text-sm text-indigo-300">
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
              className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"
            >
              &gt;
            </button>
          </div>
        </div>
      </header>

      {/* 排班畫筆選擇區 */}
      <div className="max-w-7xl mx-auto mb-6 bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-300 mr-2">🖌️ 請選擇排班畫筆：</span>
          <button
            onClick={() => setSelectedTool('normal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              selectedTool === 'normal' ? 'ring-2 ring-white scale-105 bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> 正常班 (18:30~00:30)
          </button>
          <button
            onClick={() => setSelectedTool('open')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              selectedTool === 'open' ? 'ring-2 ring-white scale-105 bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> 開店班 (18:30~00:30)
          </button>
          <button
            onClick={() => setSelectedTool('half')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              selectedTool === 'half' ? 'ring-2 ring-white scale-105 bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> 半天班 (21:00~00:30)
          </button>
          <button
            onClick={() => setSelectedTool('off')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              selectedTool === 'off' ? 'ring-2 ring-white scale-105 bg-rose-500 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> 管理者排休
          </button>
          <button
            onClick={() => setSelectedTool('clear')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              selectedTool === 'clear' ? 'ring-2 ring-white scale-105 bg-slate-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            🧹 橡皮擦 (清除班別)
          </button>
        </div>

        {/* 新增員工表單 */}
        <form onSubmit={handleAddEmployee} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="新增員工姓名..."
            value={newEmployeeName}
            onChange={(e) => setNewEmployeeName(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none"
          />
          <button type="submit" className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-lg shadow">
            + 新增員工
          </button>
        </form>
      </div>

      {/* 排班表大矩陣 */}
      <div className="max-w-7xl mx-auto overflow-x-auto bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-8">
        <table className="w-full text-center border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-950 text-slate-300 text-xs">
              <th className="p-3 border-b border-r border-slate-700 sticky left-0 bg-slate-950 z-10 w-32">
                員工姓名
              </th>
              {daysArray.map((day) => {
                const dateObj = new Date(currentYear, currentMonth - 1, day);
                const dayOfWeek = dateObj.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

                // 算當天人數 (正+開, 半)
                const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayShifts = shifts.filter((s) => s.date === dateStr);
                const fullCount = dayShifts.filter((s) => s.shift_type === 'normal' || s.shift_type === 'open').length;
                const halfCount = dayShifts.filter((s) => s.shift_type === 'half').length;

                const targetFull = isWeekend ? 4 : 3;
                const targetHalf = isWeekend ? 0 : 1;
                const isFullOk = fullCount === targetFull;
                const isHalfOk = isWeekend ? true : halfCount === targetHalf;

                return (
                  <th
                    key={day}
                    className={`p-1.5 border-b border-r border-slate-700 font-normal ${
                      isWeekend ? 'bg-amber-950/30 text-amber-300' : ''
                    }`}
                  >
                    <div className="font-bold">{day}</div>
                    <div className="text-[10px] opacity-75">({weekDays[dayOfWeek]})</div>
                    
                    {/* 人數統計指標 */}
                    <div className="mt-1 flex flex-col gap-0.5 text-[9px]">
                      <span className={`px-1 rounded ${isFullOk ? 'bg-emerald-900/80 text-emerald-300' : 'bg-rose-900/80 text-rose-300 font-bold'}`}>
                        正:{fullCount}/{targetFull}
                      </span>
                      {!isWeekend && (
                        <span className={`px-1 rounded ${isHalfOk ? 'bg-emerald-900/80 text-emerald-300' : 'bg-rose-900/80 text-rose-300 font-bold'}`}>
                          半:{halfCount}/{targetHalf}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 1} className="p-8 text-slate-500">
                  目前分店尚無員工，請在右上方新增員工。
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-750/50 border-b border-slate-700/50">
                  {/* 左側名字欄 */}
                  <td className="p-3 font-semibold text-sm border-r border-slate-700 sticky left-0 bg-slate-800 z-10 text-indigo-200">
                    <div className="flex items-center justify-between">
                      <span>{emp.name}</span>
                      <button
                        onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                        className="text-slate-500 hover:text-rose-400 font-normal text-xs px-1"
                        title="刪除員工"
                      >
                        ✕
                      </button>
                    </div>
                  </td>

                  {/* 每日班別欄 */}
                  {daysArray.map((day) => {
                    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const shift = shifts.find((s) => s.employee_id === emp.id && s.date === dateStr);
                    const isUnavail = unavailabilities.some((u) => u.employee_id === emp.id && u.date === dateStr);

                    return (
                      <td
                        key={day}
                        onClick={() => handleCellClick(emp.id, dateStr)}
                        className="p-1 border-r border-slate-700/50 text-xs cursor-pointer hover:bg-slate-700/60 transition relative"
                      >
                        <div className="min-h-[42px] flex flex-col items-center justify-center gap-1">
                          {shift && shift.shift_type && SHIFT_TYPES[shift.shift_type] ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold shadow ${SHIFT_TYPES[shift.shift_type].bg} ${SHIFT_TYPES[shift.shift_type].text}`}
                            >
                              {SHIFT_TYPES[shift.shift_type].label}
                            </span>
                          ) : isUnavail ? (
                            <span className="px-1 py-0.5 rounded text-[9px] bg-rose-950 text-rose-400 border border-rose-800">
                              劃休
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}

                          {/* +宵 按鈕 */}
                          <button
                            onClick={(e) => toggleNightShift(emp.id, dateStr, e)}
                            className={`px-1 py-0.2 text-[8px] rounded font-bold transition ${
                              shift && shift.is_night
                                ? 'bg-purple-600 text-white shadow'
                                : 'bg-slate-700 text-slate-400 hover:bg-purple-900 hover:text-purple-200'
                            }`}
                          >
                            +宵
                          </button>
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

      {/* 當月薪資統計表 */}
      <div className="max-w-7xl mx-auto bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
        <h2 className="text-lg font-bold text-indigo-300 mb-4">
          💰 {currentYear} 年 {currentMonth} 月份薪資預估統計 (時薪 $210)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="p-2">員工姓名</th>
                <th className="p-2">正常班 (6h)</th>
                <th className="p-2">開店班 (6h)</th>
                <th className="p-2">半天班 (3.5h)</th>
                <th className="p-2">宵夜班 (不計薪)</th>
                <th className="p-2">總計工時</th>
                <th className="p-2 text-emerald-400 font-bold">估算總薪資</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const empShifts = shifts.filter((s) => s.employee_id === emp.id);
                const normalCount = empShifts.filter((s) => s.shift_type === 'normal').length;
                const openCount = empShifts.filter((s) => s.shift_type === 'open').length;
                const halfCount = empShifts.filter((s) => s.shift_type === 'half').length;
                const nightCount = empShifts.filter((s) => s.is_night).length;

                const totalHours = (normalCount + openCount) * 6 + halfCount * 3.5;
                const totalSalary = totalHours * 210;

                return (
                  <tr key={emp.id} className="border-b border-slate-750/50 hover:bg-slate-750">
                    <td className="p-2 font-semibold text-indigo-200">{emp.name}</td>
                    <td className="p-2">{normalCount} 次</td>
                    <td className="p-2">{openCount} 次</td>
                    <td className="p-2">{halfCount} 次</td>
                    <td className="p-2 text-purple-400">{nightCount} 次</td>
                    <td className="p-2 font-bold">{totalHours} 小時</td>
                    <td className="p-2 text-emerald-400 font-bold text-base">
                      ${totalSalary.toLocaleString()} 元
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
