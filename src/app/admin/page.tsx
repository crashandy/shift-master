'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toPng } from 'html-to-image';
import Link from 'next/link';
import MenuMonitor from '@/components/MenuMonitor';
import RecordsPanel from '@/components/admin/RecordsPanel';
import SettingsPanel from '@/components/admin/SettingsPanel';
import Chick from '@/components/Chick';

type AdminView = 'schedule' | 'records' | 'settings' | 'monitor';

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
  is_deputy?: boolean;
  store: string;
}

interface Unavailability {
  employee_id: string;
  date: string;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<AdminView>('schedule');
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

  // 同一個瀏覽器分頁重新整理時不用重新登入
  useEffect(() => {
    try {
      if (sessionStorage.getItem('18c_admin') === '1') setIsAuthenticated(true);
    } catch {}
  }, []);

  // 登入驗證
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin888') {
      try {
        sessionStorage.setItem('18c_admin', '1');
      } catch {}
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
    await handleDropFrom(draggedEmployeeIndex, dropIndex);
  };

  const handleDropFrom = async (fromIndex: number, dropIndex: number) => {
    const updatedList = [...employees];
    const [movedEmp] = updatedList.splice(fromIndex, 1);
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

  // 手機上用上下箭頭調整順序（觸控不能拖曳）
  const moveEmployee = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= employees.length) return;
    setDraggedEmployeeIndex(index);
    await handleDropFrom(index, target);
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
    // 代理人與班別各自獨立，改班別不影響代理人
    const isDeputy = !!existingShift?.is_deputy;

    if (newShiftType === 'none' && !isNight && !isDeputy) {
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
        is_deputy: isDeputy,
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
    const isDeputy = !!existingShift?.is_deputy;

    if (shiftType === 'none' && !newIsNight && !isDeputy) {
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

  // 設定 / 取消當日代理人（每天只會有一位）
  const handleToggleDeputy = async (
    e: React.MouseEvent,
    employeeId: string,
    dateStr: string
  ) => {
    e.stopPropagation();

    const existingShift = shifts.find(
      (s) => s.employee_id === employeeId && s.date === dateStr
    );

    if (existingShift?.id && existingShift.is_deputy) {
      // 取消代理人；如果這格只剩代理人（沒班別、沒宵夜）就整筆刪掉
      const isEmpty = existingShift.shift_type === 'none' && !existingShift.is_night;
      const { error } = isEmpty
        ? await supabase.from('shifts').delete().eq('id', existingShift.id)
        : await supabase.from('shifts').update({ is_deputy: false }).eq('id', existingShift.id);
      if (error) alert(`更新失敗：${error.message}`);
    } else {
      // 先取消當天原本的代理人（只剩代理人的空格直接刪除），再設定新的
      const { error: delError } = await supabase
        .from('shifts')
        .delete()
        .eq('store', currentStore)
        .eq('date', dateStr)
        .eq('is_deputy', true)
        .eq('shift_type', 'none')
        .eq('is_night', false);
      const { error: clearError } = delError
        ? { error: delError }
        : await supabase
            .from('shifts')
            .update({ is_deputy: false })
            .eq('store', currentStore)
            .eq('date', dateStr)
            .eq('is_deputy', true);

      let error = clearError;
      if (!error) {
        ({ error } = existingShift?.id
          ? await supabase.from('shifts').update({ is_deputy: true }).eq('id', existingShift.id)
          : await supabase.from('shifts').insert({
              employee_id: employeeId,
              date: dateStr,
              shift_type: 'none',
              is_night: false,
              is_deputy: true,
              store: currentStore,
            }));
      }
      if (error) alert(`設定代理人失敗：${error.message}`);
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
    let deputyCount = 0;

    empShifts.forEach((s) => {
      if (s.shift_type === 'normal') normalCount++;
      if (s.shift_type === 'open') openCount++;
      if (s.shift_type === 'half') halfCount++;
      if (s.is_night) nightCount++;
      if (s.is_deputy) deputyCount++;
    });

    const totalHours = (normalCount + openCount) * 6 + halfCount * 3.5;
    const totalPay = (normalCount + openCount) * 1260 + halfCount * 735;

    return { normalCount, openCount, halfCount, nightCount, deputyCount, totalHours, totalPay };
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-700 via-stone-600 to-cream flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-[-28px] relative z-10">
            <Chick size={110} hat bob />
          </div>
          <form
            onSubmit={handleLogin}
            className="bg-white pt-10 pb-7 px-6 rounded-[2rem] shadow-xl shadow-stone-900/20 text-center"
          >
            <h1 className="text-2xl font-black text-stone-900">管理後台</h1>
            <p className="text-sm text-stone-500 mt-1 mb-6">店長專用，請輸入管理密碼</p>
            <input
              type="password"
              placeholder="管理者密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 rounded-2xl bg-stone-50 text-stone-800 mb-4 outline-none border-2 border-stone-200 focus:border-brand-400 focus:bg-white text-center text-lg"
            />
            <button
              type="submit"
              className="w-full bg-stone-800 hover:bg-stone-900 active:scale-[0.98] text-white font-black text-lg py-4 rounded-2xl shadow-lg transition"
            >
              登入
            </button>
          </form>
          <Link href="/" className="block text-center text-sm font-bold text-stone-500 py-4">
            ← 回員工入口
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-stone-800 pb-28 sm:pb-8">
      {/* 頂部導航列 */}
      <div className="sticky top-0 z-40 bg-cream/90 backdrop-blur-md border-b border-amber-100 mb-4">
        <div className="max-w-[1600px] mx-auto px-3 md:px-6 pt-2.5 pb-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/"
                aria-label="回入口"
                className="shrink-0 w-10 h-10 rounded-full bg-white border border-amber-100 shadow-sm flex items-center justify-center text-lg text-stone-600 active:scale-95 transition"
              >
                ←
              </Link>
              <Chick size={34} hat className="shrink-0" />
              <h1 className="text-lg font-black text-stone-900 truncate">管理後台</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {view !== 'monitor' && (
                <select
                  value={currentStore}
                  onChange={(e) => setCurrentStore(e.target.value as 'store1' | 'store2')}
                  className="bg-brand-100 text-brand-900 px-3 py-2 rounded-full font-black outline-none cursor-pointer text-sm border-0"
                >
                  <option value="store1">一號店</option>
                  <option value="store2">二號店</option>
                </select>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 md:mx-0 md:px-0">
            {[
              { key: 'schedule', label: '📅 排班' },
              { key: 'records', label: '📋 表單紀錄' },
              { key: 'settings', label: '⚙️ 表單設定' },
              { key: 'monitor', label: '🐔 品項監測' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key as AdminView)}
                className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-black transition ${
                  view === t.key ? 'bg-stone-800 text-white shadow-sm' : 'bg-white text-stone-500 border border-amber-100'
                }`}
              >
                {t.label}
              </button>
            ))}
            <Link
              href="/ledger"
              className="shrink-0 px-3.5 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-black border border-emerald-200"
            >
              💰 月記帳 🔒
            </Link>
          </div>
        </div>
      </div>

      <div className="px-3 md:px-6">
      {view === 'monitor' ? (
        <MenuMonitor />
      ) : view === 'records' ? (
        <RecordsPanel store={currentStore} />
      ) : view === 'settings' ? (
        <SettingsPanel store={currentStore} />
      ) : (
      <>

      {/* 排班操作 */}
      <div className="max-w-[1600px] mx-auto mb-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button
          onClick={toggleSubmissionOpen}
          className={`px-4 py-3 sm:py-2 rounded-2xl font-black transition text-sm flex items-center justify-center gap-2 border ${
            isSubmissionOpen
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
              : 'bg-rose-50 text-rose-700 border-rose-300'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isSubmissionOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          員工登記：{isSubmissionOpen ? '開放中' : '已鎖定'}
        </button>
        <button
          onClick={handleExportImage}
          disabled={isExporting}
          className="px-4 py-3 sm:py-2 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white rounded-2xl font-black transition flex items-center justify-center gap-2 shadow-sm text-sm disabled:opacity-50"
        >
          📷 {isExporting ? '產生中...' : '下載班表圖'}
        </button>
      </div>

      {/* 畫筆工具列：手機固定在畫面底部，電腦放在上方 */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-amber-100 px-3 pt-2 pb-safe shadow-[0_-4px_16px_rgba(120,80,20,0.08)] sm:static sm:z-auto sm:max-w-[1600px] sm:mx-auto sm:mb-4 sm:rounded-3xl sm:border sm:shadow-sm sm:p-3">
        <div className="text-[11px] font-bold text-stone-400 mb-1.5 flex items-center justify-between gap-2">
          <span>🖌️ 選畫筆，再點格子</span>
          <span className="hidden sm:inline text-brand-700">💡 「⋮⋮」拖曳排序；格子內「+代」設定代理人（每天一位）</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { type: 'normal', label: '正常', time: '18:30', activeClass: 'bg-sky-600 text-white' },
            { type: 'open', label: '開店', time: '18:30', activeClass: 'bg-emerald-600 text-white' },
            { type: 'half', label: '半天', time: '21:00', activeClass: 'bg-amber-500 text-white' },
            { type: 'off', label: '排休', time: '', activeClass: 'bg-rose-500 text-white' },
            { type: 'none', label: '🧽 清除', time: '', activeClass: 'bg-stone-700 text-white' },
          ].map((tool) => (
            <button
              key={tool.type}
              onClick={() => setActiveTool(tool.type as ShiftType)}
              className={`shrink-0 min-w-[64px] px-3 py-2 rounded-2xl text-sm font-black transition border active:scale-95 ${
                activeTool === tool.type
                  ? tool.activeClass + ' border-transparent shadow-md'
                  : 'bg-stone-50 text-stone-600 border-stone-200'
              }`}
            >
              {tool.label}
              {tool.time && <span className="block text-[10px] font-bold opacity-75 leading-none mt-0.5">{tool.time}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 月份切換 */}
      <div className="max-w-[1600px] mx-auto mb-3 flex items-center justify-between bg-white rounded-2xl border border-amber-100 shadow-sm p-1">
        <button
          onClick={() => {
            if (month === 1) {
              setMonth(12);
              setYear(year - 1);
            } else {
              setMonth(month - 1);
            }
          }}
          aria-label="上個月"
          className="w-11 h-10 rounded-xl text-stone-500 active:bg-stone-100 font-black text-lg"
        >
          ‹
        </button>
        <span className="font-black text-stone-900">
          {year} 年 {month} 月 排班
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
          aria-label="下個月"
          className="w-11 h-10 rounded-xl text-stone-500 active:bg-stone-100 font-black text-lg"
        >
          ›
        </button>
      </div>

      {/* 排班大矩陣：支援橫向滾動且左側員工欄絕對凍結 (Sticky) */}
      <div className="max-w-[1600px] mx-auto overflow-x-auto no-scrollbar mb-6 border border-amber-100 rounded-3xl shadow-sm bg-white">
        <div ref={scheduleTableRef} className="inline-block min-w-full align-middle">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-stone-50">
                {/* 凍結欄：左側員工姓名（Sticky Left-0） */}
                <th className="sticky left-0 z-30 bg-stone-100/95 backdrop-blur-sm border-b border-r border-stone-200 p-2 sm:p-3 text-left w-[96px] min-w-[96px] sm:w-[160px] sm:min-w-[160px] text-xs sm:text-sm font-bold text-stone-700 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)]">
                  夥伴
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
                  const deputyShift = dayShifts.find((s) => s.is_deputy);
                  const deputyName = deputyShift
                    ? employees.find((e) => e.id === deputyShift.employee_id)?.name
                    : undefined;

                  return (
                    <th
                      key={day}
                      className={`border-b border-r border-stone-200 p-2 text-center min-w-[58px] sm:min-w-[70px] ${
                        isWeekend ? 'bg-brand-50/50' : 'bg-stone-50'
                      }`}
                    >
                      <div className={`text-sm font-black ${isWeekend ? 'text-brand-700' : 'text-stone-800'}`}>
                        {day}
                      </div>
                      <div className={`text-[11px] font-semibold ${isWeekend ? 'text-brand-600' : 'text-stone-400'}`}>
                        週{dayNames[dayOfWeek]}
                      </div>

                      {/* 當日排班人數即時標籤 */}
                      <div className="mt-1 flex flex-col items-center gap-0.5 min-h-[40px]">
                        {(normalCount > 0 || openCount > 0) && (
                          <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none">
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
                        {deputyName && (
                          <span
                            className="bg-orange-100 text-orange-800 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none max-w-[64px] truncate"
                            title={`代理人：${deputyName}`}
                          >
                            代 {deputyName}
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
                  className={`group hover:bg-stone-50/80 transition ${
                    draggedEmployeeIndex === index ? 'opacity-40 bg-brand-50' : ''
                  }`}
                >
                  {/* 核心優化：左側凍結欄（Sticky Left-0 永遠留在最左側） */}
                  <td className="sticky left-0 z-20 bg-white group-hover:bg-stone-50 border-b border-r border-stone-200 p-1.5 sm:p-2.5 font-bold text-stone-800 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)] select-none">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {/* 拖曳手柄圖示 */}
                        <span
                          className="hidden sm:inline cursor-grab active:cursor-grabbing text-stone-400 hover:text-brand-700 px-0.5 text-sm font-mono"
                          title="拖曳調整順序"
                        >
                          ⋮⋮
                        </span>
                        {/* 手機：上下移動 */}
                        <span className="sm:hidden flex flex-col -my-1">
                          <button
                            onClick={() => moveEmployee(index, -1)}
                            className="text-[10px] leading-none text-stone-400 px-0.5 py-0.5 active:text-brand-700"
                            aria-label="往上移"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveEmployee(index, 1)}
                            className="text-[10px] leading-none text-stone-400 px-0.5 py-0.5 active:text-brand-700"
                            aria-label="往下移"
                          >
                            ▼
                          </button>
                        </span>
                        <span className="truncate text-[13px] sm:text-sm font-bold text-stone-800">{emp.name}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                        className="text-stone-300 hover:text-rose-500 hover:bg-rose-50 px-1 py-0.5 rounded transition text-xs"
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
                        className="border-b border-r border-stone-200 p-1 text-center cursor-pointer hover:bg-brand-50/70 transition relative select-none h-15"
                      >
                        {/* 劃休標籤 */}
                        {isUnavail && (
                          <span className="absolute top-1 right-1 text-[9px] bg-rose-100 text-rose-600 font-bold px-1 rounded">
                            休
                          </span>
                        )}

                        {/* 主班別膠囊 */}
                        {shift?.shift_type === 'normal' && (
                          <div className="bg-sky-600 text-white rounded-lg py-1 font-bold text-xs shadow-2xs">正常</div>
                        )}
                        {shift?.shift_type === 'open' && (
                          <div className="bg-emerald-600 text-white rounded-lg py-1 font-bold text-xs shadow-2xs">開店</div>
                        )}
                        {shift?.shift_type === 'half' && (
                          <div className="bg-amber-500 text-white rounded-lg py-1 font-bold text-xs shadow-2xs">半天</div>
                        )}
                        {shift?.shift_type === 'off' && (
                          <div className="bg-rose-500 text-white rounded-lg py-1 font-bold text-xs shadow-2xs">排休</div>
                        )}

                        <div className="mt-1 flex items-center justify-center gap-0.5">
                          {/* 宵夜班按鈕 */}
                          <button
                            onClick={(e) => handleToggleNight(e, emp.id, dateStr)}
                            className={`text-[10px] px-1 py-0.2 rounded font-bold transition ${
                              shift?.is_night
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600'
                            }`}
                          >
                            {shift?.is_night ? '宵✓' : '+宵'}
                          </button>

                          {/* 代理人按鈕（每一格都可設定） */}
                          <button
                              onClick={(e) => handleToggleDeputy(e, emp.id, dateStr)}
                              title={shift?.is_deputy ? '取消代理人' : '設為當日代理人'}
                              className={`text-[10px] px-1 py-0.2 rounded font-bold transition ${
                                shift?.is_deputy
                                  ? 'bg-orange-500 text-white shadow-2xs'
                                  : 'bg-stone-100 text-stone-400 hover:bg-orange-100 hover:text-orange-600'
                              }`}
                            >
                              {shift?.is_deputy ? '代✓' : '+代'}
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
      </div>

      {/* 底部功能區：新增員工與薪資統計 */}
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 新增店員 */}
        <div className="bg-white p-5 rounded-3xl border border-amber-100 shadow-sm shadow-amber-900/5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-black text-stone-800 mb-1">新增店員名單</h2>
            <p className="text-xs text-stone-400 mb-3">新加入的員工預設會排在最下方</p>
            <form onSubmit={handleAddEmployee} className="flex gap-2">
              <input
                type="text"
                placeholder="輸入店員姓名"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
                className="flex-1 p-2.5 rounded-xl bg-stone-50 text-stone-800 outline-none border border-stone-200 focus:border-brand-500 focus:bg-white text-sm transition"
              />
              <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-xs">
                新增
              </button>
            </form>
          </div>
        </div>

        {/* 薪資統計卡片 */}
        <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-amber-100 shadow-sm shadow-amber-900/5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-black text-stone-800">{month} 月份薪資自動統計</h2>
              <p className="text-xs text-stone-400">時薪 $210 / 宵夜班不計薪</p>
            </div>
          </div>
          {/* 手機：卡片 */}
          <div className="sm:hidden space-y-2">
            {employees.map((emp) => {
              const salary = calculateSalary(emp.id);
              return (
                <div key={emp.id} className="rounded-2xl bg-stone-50 border border-stone-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-stone-900">{emp.name}</span>
                    <span className="font-mono font-black text-emerald-600 text-lg">${salary.totalPay.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px] font-bold">
                    <span className="bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">正常/開店 {salary.normalCount + salary.openCount}</span>
                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">半天 {salary.halfCount}</span>
                    <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">宵夜 {salary.nightCount}</span>
                    <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">代理 {salary.deputyCount}</span>
                    <span className="bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full">{salary.totalHours} 小時</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* 電腦：表格 */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 text-xs">
                  <th className="py-2 font-bold">姓名</th>
                  <th className="py-2 font-bold">正常/開店 (6h)</th>
                  <th className="py-2 font-bold">半天 (3.5h)</th>
                  <th className="py-2 font-bold">宵夜 (0h)</th>
                  <th className="py-2 font-bold">代理人</th>
                  <th className="py-2 font-bold">總工時</th>
                  <th className="py-2 font-bold text-emerald-600 text-right">預估總薪資</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const salary = calculateSalary(emp.id);
                  return (
                    <tr key={emp.id} className="border-b border-stone-100 hover:bg-stone-50 transition">
                      <td className="py-2.5 font-bold text-stone-800">{emp.name}</td>
                      <td className="py-2.5 text-stone-600">{salary.normalCount + salary.openCount} 次</td>
                      <td className="py-2.5 text-stone-600">{salary.halfCount} 次</td>
                      <td className="py-2.5 text-stone-600">{salary.nightCount} 次</td>
                      <td className="py-2.5 text-stone-600">{salary.deputyCount} 次</td>
                      <td className="py-2.5 font-mono font-bold text-brand-700">{salary.totalHours} 小時</td>
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
      </>
      )}
      </div>
    </div>
  );
}