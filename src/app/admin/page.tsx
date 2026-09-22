'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toPng } from 'html-to-image';

type ShiftType = 'normal' | 'open' | 'half' | 'off' | 'none';

interface Employee {
  id: string;
  name: string;
  store: string;
  sort_order?: number;
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

  // 拖曳排序狀態
  const [draggedEmployeeIndex, setDraggedEmployeeIndex] = useState<number | null>(null);

  // 排班畫筆工具
  const [activeTool, setActiveTool] = useState<ShiftType>('normal');
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // 班表截圖參照
  const scheduleTableRef = useRef<HTMLDivElement>(null);

  // 登入驗證
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin888') {
      setIsAuthenticated(true);
    } else {
      alert('密碼錯誤！');
    }
  };

  // 載入資料（照 sort_order 排序）
  const fetchData = async () => {
    // 1. 抓取員工（依 sort_order 升冪排列）
    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .eq('store', currentStore)
      .order('sort_order', { ascending: true });

    if (empData) {
      setEmployees(empData);
    }

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

    // 4. 抓取劃休開關
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

  // 拖曳開始
  const handleDragStart = (index: number) => {
    setDraggedEmployeeIndex(index);
  };

  // 拖曳移動經過
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  // 放置完成並儲存新順序
  const handleDrop = async (dropIndex: number) => {
    if (draggedEmployeeIndex === null || draggedEmployeeIndex === dropIndex) return;

    const updatedList = [...employees];
    const [movedEmp] = updatedList.splice(draggedEmployeeIndex, 1);
    updatedList.splice(dropIndex, 0, movedEmp);

    // 更新本地順序顯示
    setEmployees(updatedList);
    setDraggedEmployeeIndex(null);

    // 批次寫入 Supabase 保存順序
    try {
      const updates = updatedList.map((emp, idx) => ({
        id: emp.id,
        name: emp.name,
        store: emp.store,
        sort_order: idx + 1,
      }));

      await supabase.from('employees').upsert(updates);
    } catch (err) {
      console.error('更新員工順序失敗:', err);
    }
  };

  // 截圖匯出圖檔
  const handleExportImage = async () => {
    if (!scheduleTableRef.current) return;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(scheduleTableRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });

      const storeName = currentStore === 'store1' ? '一號店' : '二號店';
      const link = document.createElement('a');
      link.download = `${storeName}_${year}年${month}月_排班表.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      alert('產生圖檔失敗，請再試一次！');
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

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

    const nextOrder = employees.length + 1;
    const { error } = await supabase.from('employees').insert({
      name: newEmployeeName.trim(),
      store: currentStore,
      is_active: true,
      sort_order: nextOrder,
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

  // 切換宵夜班狀態
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

  // 薪資計算
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
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-6">
      {/* 頂部導航列 */}
      <div className="max-w-[1600px] mx-auto mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h1 className="text-xl font-black text-slate-900">管理者排班系統</h1>
          </div>
          <select
            value={currentStore}
            onChange={(e) => setCurrentStore(e.target.value as 'store1' | 'store2')}
            className="bg-slate-100 text-slate-800 px-3 py-2 rounded-xl border border-slate-300 font-bold outline-none focus:border-indigo-500 cursor-pointer text-sm"
          >
            <option value="store1">一號店 (88652358)</option>
            <option value="store2">二號店 (00084258)</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportImage}
            disabled={isExporting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold transition flex items-center gap-2 shadow-xs text-sm cursor-pointer disabled:opacity-50"
          >
            <span>📷</span>
            {isExporting ? '產生圖檔中...' : '下載班表圖檔'}
          </button>

          <button
            onClick={toggleSubmissionOpen}
            className={`px-4 py-2 rounded-xl font-bold transition text-sm flex items-center gap-2 shadow-xs ${
              isSubmissionOpen 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100' 
                : 'bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isSubmissionOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            店員劃休：{isSubmissionOpen ? '開放中' : '已鎖定'}
          </button>
        </div>
      </div>

      {/* 畫筆工具列 */}
      <div className="max-w-[1600px] mx-auto mb-5 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
          <span>🖌️ 排班畫筆（點選後直接點擊格子填入）：</span>
          <span className="text-indigo-600 font-normal">💡 小技巧：按住左側「⋮⋮」圖示可上下拖曳調整員工排序</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { type: 'normal', label: '🔵 正常班 (18:30~00:30)', activeClass: 'bg-blue-600 text-white' },
            { type: 'open', label: '🟢 開店班 (18:30~00:30)', activeClass: 'bg-emerald-600 text-white' },
            { type: 'half', label: '🟡 半天班 (21:00~00:30)', activeClass: 'bg-amber-500 text-white' },
            { type: 'off', label: '🔴 管理者排休', activeClass: 'bg-rose-500 text-white' },
            { type: 'none', label: '⚪ 橡皮擦 (清除)', activeClass: 'bg-slate-700 text-white' },
          ].map((tool) => (
            <button
              key={tool.type}
              onClick={() => setActiveTool(tool.type as ShiftType)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                activeTool === tool.type
                  ? tool.activeClass + ' border-transparent shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      {/* 月份切換 */}
      <div className="max-w-[1600px] mx-auto mb-4 flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <button
          onClick={() => {
            if (month === 1) {
              setMonth(12);
              setYear(year - 1);
            } else {
              setMonth(month - 1);
            }
          }}
          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-xs"
        >
          &lt; 上個月
        </button>
        <span className="text-base font-black text-slate-800">
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
          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-xs"
        >
          下個月 &gt;
        </button>
      </div>

      {/* 排班大矩陣：支援橫向滾動且左側員工欄絕對凍結 (Sticky) */}
      <div className="max-w-[1600px] mx-auto overflow-x-auto mb-8 border border-slate-200/90 rounded-2xl shadow-sm bg-white">
        <div ref={scheduleTableRef} className="inline-block min-w-full align-middle">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50">
                {/* 凍結欄：左側員工姓名（Sticky Left-0） */}
                <th className="sticky left-0 z-30 bg-slate-100/95 backdrop-blur-sm border-b border-r border-slate-200 p-3 text-left w-[160px] min-w-[160px] font-bold text-slate-700 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)]">
                  員工排序 / 姓名
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
                      className={`border-b border-r border-slate-200 p-2 text-center min-w-[70px] ${
                        isWeekend ? 'bg-indigo-50/50' : 'bg-slate-50'
                      }`}
                    >
                      <div className={`text-sm font-black ${isWeekend ? 'text-indigo-600' : 'text-slate-800'}`}>
                        {day}
                      </div>
                      <div className={`text-[11px] font-semibold ${isWeekend ? 'text-indigo-400' : 'text-slate-400'}`}>
                        週{dayNames[dayOfWeek]}
                      </div>

                      {/* 當日排班人數即時標籤 */}
                      <div className="mt-1 flex flex-col items-center gap-0.5 min-h-[40px]">
                        {(normalCount > 0 || openCount > 0) && (
                          <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none">
                            正 {normalCount + openCount}
                          </span>
                        )}
                        {halfCount > 0 && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none">
                            半 {halfCount}
                          </span>
                        )}
                        {nightCount > 0 && (
                          <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none">
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
              {employees.map((emp, index) => (
                <tr
                  key={emp.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  className={`group hover:bg-slate-50/80 transition ${
                    draggedEmployeeIndex === index ? 'opacity-40 bg-indigo-50' : ''
                  }`}
                >
                  {/* 核心優化：左側凍結欄（Sticky Left-0 永遠留在最左側） */}
                  <td className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 p-2.5 font-bold text-slate-800 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)] select-none">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {/* 拖曳手柄圖示 */}
                        <span 
                          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-600 px-0.5 text-sm font-mono"
                          title="拖曳調整順序"
                        >
                          ⋮⋮
                        </span>
                        <span className="truncate text-sm font-bold text-slate-800">{emp.name}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                        className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 px-1 py-0.5 rounded transition text-xs"
                        title="刪除"
                      >
                        ✕
                      </button>
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

                    return (
                      <td
                        key={day}
                        onClick={() => handleCellClick(emp.id, dateStr)}
                        className="border-b border-r border-slate-200 p-1 text-center cursor-pointer hover:bg-indigo-50/70 transition relative select-none h-15"
                      >
                        {/* 劃休標籤 */}
                        {isUnavail && (
                          <span className="absolute top-1 right-1 text-[9px] bg-rose-100 text-rose-600 font-bold px-1 rounded">
                            休
                          </span>
                        )}

                        {/* 主班別膠囊 */}
                        {shift?.shift_type === 'normal' && (
                          <div className="bg-blue-600 text-white rounded-md py-1 font-bold text-xs shadow-2xs">正常</div>
                        )}
                        {shift?.shift_type === 'open' && (
                          <div className="bg-emerald-600 text-white rounded-md py-1 font-bold text-xs shadow-2xs">開店</div>
                        )}
                        {shift?.shift_type === 'half' && (
                          <div className="bg-amber-500 text-white rounded-md py-1 font-bold text-xs shadow-2xs">半天</div>
                        )}
                        {shift?.shift_type === 'off' && (
                          <div className="bg-rose-500 text-white rounded-md py-1 font-bold text-xs shadow-2xs">排休</div>
                        )}

                        {/* 宵夜班按鈕 */}
                        <button
                          onClick={(e) => handleToggleNight(e, emp.id, dateStr)}
                          className={`mt-1 text-[10px] px-1 py-0.2 rounded font-bold transition ${
                            shift?.is_night
                              ? 'bg-purple-600 text-white shadow-2xs'
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
      </div>

      {/* 底部功能區：新增員工與薪資統計 */}
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 新增店員 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-black text-slate-800 mb-1">新增店員名單</h2>
            <p className="text-xs text-slate-400 mb-3">新加入的員工預設會排在最下方</p>
            <form onSubmit={handleAddEmployee} className="flex gap-2">
              <input
                type="text"
                placeholder="輸入店員姓名"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
                className="flex-1 p-2.5 rounded-xl bg-slate-50 text-slate-800 outline-none border border-slate-200 focus:border-indigo-500 focus:bg-white text-sm transition"
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-xs">
                新增
              </button>
            </form>
          </div>
        </div>

        {/* 薪資統計卡片 */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-black text-slate-800">{month} 月份薪資自動統計</h2>
              <p className="text-xs text-slate-400">時薪 $210 / 宵夜班不計薪</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-xs">
                  <th className="py-2 font-bold">姓名</th>
                  <th className="py-2 font-bold">正常/開店 (6h)</th>
                  <th className="py-2 font-bold">半天 (3.5h)</th>
                  <th className="py-2 font-bold">宵夜 (0h)</th>
                  <th className="py-2 font-bold">總工時</th>
                  <th className="py-2 font-bold text-emerald-600 text-right">預估總薪資</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const salary = calculateSalary(emp.id);
                  return (
                    <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="py-2.5 font-bold text-slate-800">{emp.name}</td>
                      <td className="py-2.5 text-slate-600">{salary.normalCount + salary.openCount} 次</td>
                      <td className="py-2.5 text-slate-600">{salary.halfCount} 次</td>
                      <td className="py-2.5 text-slate-600">{salary.nightCount} 次</td>
                      <td className="py-2.5 font-mono font-bold text-indigo-600">{salary.totalHours} 小時</td>
                      <td className="py-2.5 font-mono font-black text-emerald-600 text-right text-base">
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
