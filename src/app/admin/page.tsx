'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Employee {
  id: string;
  name: string;
  is_active: boolean;
  store: string;
}

interface Shift {
  id?: string;
  employee_id: string;
  date: string;
  shift_type: 'normal' | 'open' | 'half' | 'night' | 'off';
  store: string;
}

interface Unavailability {
  employee_id: string;
  date: string;
  store: string;
}

type MainShiftType = 'normal' | 'open' | 'half' | 'off' | 'clear';

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  
  // 當前選擇的分店 (預設一號店)
  const [currentStore, setCurrentStore] = useState<'store_1' | 'store_2'>('store_1');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [unavailList, setUnavailList] = useState<Unavailability[]>([]);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  
  const [selectedMonth, setSelectedMonth] = useState('2026-08');

  // 當前選中的「班別工具刷」
  const [selectedBrush, setSelectedBrush] = useState<MainShiftType>('normal');

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin888') {
      setIsAdmin(true);
      fetchAdminData();
    } else {
      alert('管理者密碼錯誤！');
    }
  };

  const fetchAdminData = async () => {
    const { data: empData } = await supabase.from('employees').select('*').eq('store', currentStore).order('created_at');
    const { data: shiftData } = await supabase.from('shifts').select('*').eq('store', currentStore);
    const { data: unavailData } = await supabase.from('unavailability').select('*').eq('store', currentStore);
    const { data: settingData } = await supabase.from('system_settings').select('*').eq('store', currentStore).single();

    if (empData) setEmployees(empData);
    if (shiftData) setShifts(shiftData);
    if (unavailData) setUnavailList(unavailData);
    if (settingData) setIsSubmissionOpen(settingData.is_submission_open);
    else setIsSubmissionOpen(false);
  };

  useEffect(() => {
    if (isAdmin) fetchAdminData();
  }, [selectedMonth, currentStore, isAdmin]);

  // 新增員工
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim()) return;
    
    const { data, error } = await supabase.from('employees').insert([{ name: newEmployeeName, store: currentStore }]).select();
    if (error) {
      alert(`新增失敗：${error.message}`);
      return;
    }
    if (data) {
      setEmployees([...employees, data[0]]);
      setNewEmployeeName('');
    }
  };

  // 刪除員工
  const handleDeleteEmployee = async (empId: string, empName: string) => {
    const isConfirmed = confirm(`確定要刪除員工「${empName}」嗎？\n刪除後該員工的預排班表與劃休紀錄也會一併移除！`);
    if (!isConfirmed) return;

    const { error } = await supabase.from('employees').delete().eq('id', empId);

    if (error) {
      alert(`刪除失敗：${error.message}`);
    } else {
      setEmployees(employees.filter(e => e.id !== empId));
      setShifts(shifts.filter(s => s.employee_id !== empId));
      setUnavailList(unavailList.filter(u => u.employee_id !== empId));
      alert(`已成功刪除員工「${empName}」！`);
    }
  };

  const toggleSubmission = async () => {
    const nextState = !isSubmissionOpen;
    const { error } = await supabase.from('system_settings').upsert({ id: currentStore === 'store_1' ? 1 : 2, store: currentStore, is_submission_open: nextState });
    if (!error) setIsSubmissionOpen(nextState);
  };

  // 使用選中的「工具刷」直接蓋印班別
  const applyShiftBrush = async (empId: string, dateStr: string) => {
    const empDayShifts = shifts.filter(s => s.employee_id === empId && s.date === dateStr);
    const mainShift = empDayShifts.find(s => s.shift_type !== 'night');

    if (selectedBrush === 'clear') {
      if (mainShift) {
        await supabase.from('shifts').delete().eq('id', mainShift.id);
        setShifts(shifts.filter(s => s.id !== mainShift.id));
      }
      return;
    }

    if (mainShift && mainShift.shift_type === selectedBrush) {
      await supabase.from('shifts').delete().eq('id', mainShift.id);
      setShifts(shifts.filter(s => s.id !== mainShift.id));
      return;
    }

    if (mainShift) {
      await supabase.from('shifts').update({ shift_type: selectedBrush }).eq('id', mainShift.id);
      setShifts(shifts.map(s => s.id === mainShift.id ? { ...s, shift_type: selectedBrush } : s));
    } else {
      const { data } = await supabase.from('shifts').insert([{ employee_id: empId, date: dateStr, shift_type: selectedBrush, store: currentStore }]).select();
      if (data) setShifts([...shifts, data[0]]);
    }
  };

  // 切換宵夜班
  const toggleNightShift = async (empId: string, dateStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nightShift = shifts.find(s => s.employee_id === empId && s.date === dateStr && s.shift_type === 'night');

    if (nightShift) {
      await supabase.from('shifts').delete().eq('id', nightShift.id);
      setShifts(shifts.filter(s => s.id !== nightShift.id));
    } else {
      const { data } = await supabase.from('shifts').insert([{ employee_id: empId, date: dateStr, shift_type: 'night', store: currentStore }]).select();
      if (data) setShifts([...shifts, data[0]]);
    }
  };

  // 薪資計算
  const calculateSalary = (employeeId: string) => {
    const empShifts = shifts.filter(s => s.employee_id === employeeId && s.date.startsWith(selectedMonth));
    let normalCount = 0, openCount = 0, halfCount = 0, nightCount = 0, offCount = 0;

    empShifts.forEach(s => {
      if (s.shift_type === 'normal') normalCount++;
      if (s.shift_type === 'open') openCount++;
      if (s.shift_type === 'half') halfCount++;
      if (s.shift_type === 'night') nightCount++;
      if (s.shift_type === 'off') offCount++;
    });

    const totalHours = ((normalCount + openCount) * 6) + (halfCount * 3.5) + (nightCount * 3);
    const totalSalary = ((normalCount + openCount) * 6 * 210) + (halfCount * 3.5 * 210);

    return { normalCount, openCount, halfCount, nightCount, offCount, totalHours, totalSalary };
  };

  // 計算星期的輔助函式
  const getWeekDayName = (year: number, month: number, day: number) => {
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    const date = new Date(year, month - 1, day);
    return weekNames[date.getDay()];
  };

  // 📊 計算當日各班別實際上班人數與目標檢查
  const getDayStaffStats = (dateStr: string, isWeekend: boolean) => {
    const dayShifts = shifts.filter(s => s.date === dateStr);
    
    // 正常班 + 開店班總人數
    const fullShiftCount = dayShifts.filter(s => s.shift_type === 'normal' || s.shift_type === 'open').length;
    // 半天班人數
    const halfShiftCount = dayShifts.filter(s => s.shift_type === 'half').length;

    // 目標值判斷
    const targetFull = isWeekend ? 4 : 3;
    const targetHalf = isWeekend ? 0 : 1;

    const isFullMatched = fullShiftCount === targetFull;
    const isHalfMatched = halfShiftCount === targetHalf;

    return { fullShiftCount, halfShiftCount, targetFull, targetHalf, isFullMatched, isHalfMatched };
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-6 text-slate-800">管理者後台登入</h1>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">管理員密碼</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-xl text-black text-center text-lg focus:outline-none focus:ring-2 focus:ring-slate-700"
                placeholder="預設 admin888"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 rounded-xl transition"
            >
              進入管理後台
            </button>
          </form>
        </div>
      </div>
    );
  }

  const [yearStr, monthStr] = selectedMonth.split('-');
  const yearNum = parseInt(yearStr);
  const monthNum = parseInt(monthStr);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-800">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Header 與分店切換 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">排班與薪資管理後台</h1>
            <p className="text-xs text-slate-500 mt-1">管理月份：{selectedMonth}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 pl-2">切換分店：</span>
              <button
                onClick={() => setCurrentStore('store_1')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  currentStore === 'store_1' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                一號店 (88652358)
              </button>
              <button
                onClick={() => setCurrentStore('store_2')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  currentStore === 'store_2' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                二號店 (00084258)
              </button>
            </div>

            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-slate-300 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white"
            />
            <button
              onClick={toggleSubmission}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                isSubmissionOpen ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              }`}
            >
              劃班開關：{isSubmissionOpen ? '開放中' : '已鎖定'}
            </button>
            <button
              onClick={() => setIsAdmin(false)}
              className="bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-300"
            >
              退出
            </button>
          </div>
        </div>

        {/* 員工管理 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-base font-bold text-slate-800 mb-3">
            {currentStore === 'store_1' ? '一號店' : '二號店'} 員工管理
          </h2>
          <form onSubmit={handleAddEmployee} className="flex gap-2 max-w-sm mb-4">
            <input
              type="text"
              placeholder={`新增${currentStore === 'store_1' ? '一號店' : '二號店'}員工姓名...`}
              value={newEmployeeName}
              onChange={(e) => setNewEmployeeName(e.target.value)}
              className="px-3 py-2 border rounded-xl text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button type="submit" className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-indigo-700 shrink-0">
              新增員工
            </button>
          </form>
          
          <div className="flex flex-wrap gap-2">
            {employees.map(emp => (
              <span key={emp.id} className="bg-slate-100 text-slate-700 pl-3 pr-1.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 flex items-center gap-1.5">
                {emp.name}
                <button
                  onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                  className="w-4 h-4 rounded-full bg-slate-200 hover:bg-rose-500 hover:text-white text-slate-500 flex items-center justify-center text-[10px] font-bold transition"
                  title={`刪除 ${emp.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* 排班工具刷 */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-700 mr-2">🖌️ 排班畫筆：</span>
          
          <button
            onClick={() => setSelectedBrush('normal')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              selectedBrush === 'normal' ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300' : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}
          >
            正常班 (18:30~00:30)
          </button>

          <button
            onClick={() => setSelectedBrush('open')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              selectedBrush === 'open' ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            開店班 (18:30~00:30)
          </button>

          <button
            onClick={() => setSelectedBrush('half')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              selectedBrush === 'half' ? 'bg-amber-600 text-white border-amber-700 ring-2 ring-amber-300' : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            半天班 (21:00~00:30)
          </button>

          <button
            onClick={() => setSelectedBrush('off')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              selectedBrush === 'off' ? 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-300' : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            排休 (無薪)
          </button>

          <button
            onClick={() => setSelectedBrush('clear')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              selectedBrush === 'clear' ? 'bg-slate-700 text-white border-slate-800 ring-2 ring-slate-300' : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            🧹 橡皮擦 (清除)
          </button>
        </div>

        {/* 月曆視覺排班畫板 (含每天人數即時統計標籤) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
          <div className="mb-4 flex flex-wrap justify-between items-end gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {currentStore === 'store_1' ? '一號店' : '二號店'} 排班畫板 ({selectedMonth})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                💡 頂部會自動檢測人力目標：平日【正+開共3人 / 半1人】、六日【正+開共4人】。綠色代表達標，紅色代表缺人/多排！
              </p>
            </div>
          </div>

          <table className="w-full border-collapse text-xs border border-slate-200">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-2 border border-slate-200 sticky left-0 bg-slate-100 z-10 min-w-[80px]">員工</th>
                {Array.from({ length: 31 }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
                  const weekDay = getWeekDayName(yearNum, monthNum, day);
                  const isWeekend = weekDay === '日' || weekDay === '六';

                  // 📊 計算當天人力情況
                  const stats = getDayStaffStats(dateStr, isWeekend);

                  return (
                    <th key={day} className={`p-1 border border-slate-200 text-center min-w-[50px] ${isWeekend ? 'bg-rose-50/70 text-rose-600' : ''}`}>
                      <div className="font-bold">{day}</div>
                      <div className="text-[10px] font-normal opacity-75 mb-1">{weekDay}</div>

                      {/* 🟢/🔴 即時人數統計標籤 */}
                      <div className="space-y-0.5">
                        {/* 1. 正班+開店班標籤 */}
                        <div className={`text-[9px] px-1 py-0.5 rounded font-bold border ${
                          stats.isFullMatched 
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                            : 'bg-rose-100 text-rose-700 border-rose-300 animate-pulse'
                        }`} title={`正+開目標: ${stats.targetFull}人，目前: ${stats.fullShiftCount}人`}>
                          正:{stats.fullShiftCount}/{stats.targetFull}
                        </div>

                        {/* 2. 半天班標籤 (僅平日顯示) */}
                        {!isWeekend && (
                          <div className={`text-[9px] px-1 py-0.5 rounded font-bold border ${
                            stats.isHalfMatched 
                              ? 'bg-amber-100 text-amber-800 border-amber-300' 
                              : 'bg-rose-100 text-rose-700 border-rose-300'
                          }`} title={`半天班目標: ${stats.targetHalf}人，目前: ${stats.halfShiftCount}人`}>
                            半:{stats.halfShiftCount}/{stats.targetHalf}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50/50">
                  <td className="p-2 border border-slate-200 font-bold bg-white sticky left-0 shadow-sm">{emp.name}</td>
                  {Array.from({ length: 31 }, (_, i) => {
                    const day = i + 1;
                    const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
                    const empDayShifts = shifts.filter(s => s.employee_id === emp.id && s.date === dateStr);
                    
                    const mainShift = empDayShifts.find(s => s.shift_type !== 'night');
                    const nightShift = empDayShifts.find(s => s.shift_type === 'night');
                    const isUnavail = unavailList.some(u => u.employee_id === emp.id && u.date === dateStr);

                    return (
                      <td
                        key={day}
                        onClick={() => applyShiftBrush(emp.id, dateStr)}
                        className={`p-1 border border-slate-200 text-center cursor-pointer select-none transition relative hover:ring-2 hover:ring-indigo-300 ${
                          isUnavail && !mainShift && !nightShift ? 'bg-rose-100 text-rose-600 font-bold' : ''
                        }`}
                      >
                        <div className="flex flex-col gap-1 items-center justify-center min-h-[36px]">
                          {mainShift ? (
                            <span className={`px-1 py-0.5 rounded text-[10px] font-bold text-white w-full ${
                              mainShift.shift_type === 'normal' ? 'bg-blue-500' :
                              mainShift.shift_type === 'open' ? 'bg-emerald-500' :
                              mainShift.shift_type === 'half' ? 'bg-amber-500' : 'bg-rose-500'
                            }`}>
                              {
                                mainShift.shift_type === 'normal' ? '正' :
                                mainShift.shift_type === 'open' ? '開' :
                                mainShift.shift_type === 'half' ? '半' : '休'
                              }
                            </span>
                          ) : isUnavail ? (
                            <span className="text-[10px] text-rose-500 font-bold">劃休</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}

                          <button
                            onClick={(e) => toggleNightShift(emp.id, dateStr, e)}
                            className={`text-[9px] px-1 rounded font-bold transition border ${
                              nightShift
                                ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                                : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-purple-100 hover:text-purple-600'
                            }`}
                          >
                            +宵
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 薪資統計 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-base font-bold text-slate-800 mb-4">
            {currentStore === 'store_1' ? '一號店' : '二號店'} 薪資結算 ({selectedMonth})
          </h2>

          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-600">
                <th className="p-3">姓名</th>
                <th className="p-3">正常班 (6h)</th>
                <th className="p-3">開店班 (6h)</th>
                <th className="p-3">半天班 (3.5h)</th>
                <th className="p-3">宵夜班 (0h)</th>
                <th className="p-3">排休次數</th>
                <th className="p-3">總工時</th>
                <th className="p-3 text-right">結算薪資 ($210/h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map(emp => {
                const stat = calculateSalary(emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-800">{emp.name}</td>
                    <td className="p-3">{stat.normalCount} 次</td>
                    <td className="p-3 text-emerald-600 font-bold">{stat.openCount} 次</td>
                    <td className="p-3">{stat.halfCount} 次</td>
                    <td className="p-3 text-purple-600 font-bold">{stat.nightCount} 次</td>
                    <td className="p-3 text-rose-500 font-bold">{stat.offCount} 天</td>
                    <td className="p-3 font-semibold">{stat.totalHours} 小時</td>
                    <td className="p-3 text-right font-bold text-emerald-600 text-sm">
                      ${stat.totalSalary.toLocaleString()} 元
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