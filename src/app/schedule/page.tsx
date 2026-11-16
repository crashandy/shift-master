'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { STORE_NAMES, getSession, saveSession } from '@/lib/staffSession';
import Chick from '@/components/Chick';
import TodayCrew from '@/components/staff/TodayCrew';
import { DAY_NAMES, SHIFT_META, Shift, isWorking, ymd } from '@/lib/shifts';
import { businessDate } from '@/lib/checklists';

interface Employee {
  id: string;
  name: string;
  store: string;
}

interface Unavailability {
  id?: string;
  employee_id: string;
  date: string;
}

// 員工點格子時要登記的項目
type StaffTool = 'off' | 'deputy';
type View = 'mine' | 'all';

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
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
  const [staffTool, setStaffTool] = useState<StaffTool>('off');
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [view, setView] = useState<View>('all');

  // 劃休選擇狀態
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  const today = businessDate();
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // 已從入口網站登入的話，直接帶入分店與名字
  useEffect(() => {
    const s = getSession();
    if (s) {
      setCurrentStore(s.store);
      if (s.employeeId) {
        setSelectedEmployeeId(s.employeeId);
        setView('mine');
      }
      setIsAuthenticated(true);
    }
  }, []);

  // 選名字時順便記住（入口網站也會同步）
  const chooseEmployee = (id: string) => {
    setSelectedEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    const s = getSession() ?? { store: currentStore };
    saveSession({ ...s, store: currentStore, employeeId: emp?.id, employeeName: emp?.name });
    if (id) setView('mine');
  };

  // 登入驗證
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (storePassword === '88652358') {
      setCurrentStore('store1');
      saveSession({ store: 'store1' });
      setIsAuthenticated(true);
    } else if (storePassword === '00084258') {
      setCurrentStore('store2');
      saveSession({ store: 'store2' });
      setIsAuthenticated(true);
    } else {
      alert('通行碼錯誤，請確認後再輸入！');
    }
  };

  // 載入資料
  const fetchData = async () => {
    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .eq('store', currentStore)
      .order('sort_order', { ascending: true });
    if (empData) setEmployees(empData);

    // 2. 抓取當月班表
    const startDate = ymd(year, month, 1);
    const endDate = ymd(year, month, new Date(year, month, 0).getDate());

    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .eq('store', currentStore)
      .gte('date', startDate)
      .lte('date', endDate);
    if (shiftData) setShifts(shiftData);

    // 2-1. 今天（營業日）的班，不管現在看哪個月
    const { data: todayData } = await supabase
      .from('shifts')
      .select('*')
      .eq('store', currentStore)
      .eq('date', today);
    if (todayData) setTodayShifts(todayData);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentStore, year, month]);

  // 全店表格：自動捲到今天
  useEffect(() => {
    if (view !== 'all') return;
    const el = tableScrollRef.current?.querySelector('[data-today="1"]') as HTMLElement | null;
    if (el && tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = Math.max(0, el.offsetLeft - 120);
    }
  }, [view, shifts, year, month]);

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

    const existingOff = unavailabilities.find(
      (u) => u.employee_id === empId && u.date === dateStr
    );
    const myShift = shifts.find((s) => s.employee_id === empId && s.date === dateStr);
    const currentDeputy = shifts.find((s) => s.date === dateStr && s.is_deputy);

    // 取消自己的代理人：這格只剩代理人（沒班別、沒宵夜）就整筆刪掉
    const cancelMyDeputy = async () => {
      if (!myShift?.id) return null;
      const isEmpty = myShift.shift_type === 'none' && !myShift.is_night;
      const { error } = isEmpty
        ? await supabase.from('shifts').delete().eq('id', myShift.id)
        : await supabase.from('shifts').update({ is_deputy: false }).eq('id', myShift.id);
      return error;
    };

    let error: { message: string; code?: string } | null = null;

    if (staffTool === 'off') {
      if (existingOff?.id) {
        // 取消劃休
        ({ error } = await supabase.from('unavailability').delete().eq('id', existingOff.id));
      } else {
        // 新增劃休（同一天是代理人的話，代理人一併取消）
        if (myShift?.is_deputy) error = await cancelMyDeputy();
        if (!error) {
          ({ error } = await supabase.from('unavailability').insert({
            employee_id: empId,
            date: dateStr,
          }));
        }
      }
    } else if (myShift?.is_deputy) {
      // 取消自己的代理人
      error = await cancelMyDeputy();
    } else if (currentDeputy) {
      // 先登記先拿到：當天已經有人了
      const name = employees.find((e) => e.id === currentDeputy.employee_id)?.name ?? '其他同仁';
      alert(`這天的代理人已經是「${name}」了，請選別天！`);
      return;
    } else {
      // 登記代理人（同一天有劃休的話先取消）
      if (existingOff?.id) {
        await supabase.from('unavailability').delete().eq('id', existingOff.id);
      }
      ({ error } = myShift?.id
        ? await supabase.from('shifts').update({ is_deputy: true }).eq('id', myShift.id)
        : await supabase.from('shifts').insert({
            employee_id: empId,
            date: dateStr,
            shift_type: 'none',
            is_night: false,
            is_deputy: true,
            store: currentStore,
          }));
      // 同時有兩個人搶同一天：資料庫只會讓一個人成功
      if (error?.code === '23505') {
        alert('這天剛剛已經被別人登記為代理人了，請選別天！');
        fetchData();
        return;
      }
    }

    if (error) alert(`更新失敗：${error.message}`);
    fetchData();
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '';
  const shiftOf = (empId: string, date: string) => shifts.find((s) => s.employee_id === empId && s.date === date);
  const isUnavailOf = (empId: string, date: string) =>
    unavailabilities.some((u) => u.employee_id === empId && u.date === date);
  const deputyOf = (date: string) => shifts.find((s) => s.date === date && s.is_deputy);

  const changeMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const canEdit = isSubmissionOpen && !!selectedEmployeeId;

  // 登入介面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-200 via-brand-50 to-cream flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-[-28px] relative z-10">
            <Chick size={110} bob />
          </div>
          <form
            onSubmit={handleLogin}
            className="bg-white pt-10 pb-7 px-6 rounded-[2rem] shadow-xl shadow-amber-900/10 border border-amber-100 text-center"
          >
            <h1 className="text-2xl font-black text-stone-900">全店班表</h1>
            <p className="text-sm text-stone-500 mt-1 mb-6">輸入分店通行碼查看班表與劃休</p>
            <input
              type="password"
              inputMode="numeric"
              placeholder="分店通行碼"
              value={storePassword}
              onChange={(e) => setStorePassword(e.target.value)}
              className="w-full p-4 rounded-2xl bg-brand-50 text-stone-800 mb-4 outline-none border-2 border-brand-100 focus:border-brand-400 focus:bg-white text-center text-xl tracking-[0.3em] font-mono"
            />
            <button
              type="submit"
              className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-brand-500/30 transition"
            >
              查看班表
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 我的本月統計
  const myShifts = shifts.filter((s) => s.employee_id === selectedEmployeeId);
  const myWorkDays = myShifts.filter((s) => isWorking(s.shift_type)).length;
  const myNights = myShifts.filter((s) => s.is_night).length;
  const myDeputy = myShifts.filter((s) => s.is_deputy).length;
  const myOffs = unavailabilities.filter((u) => u.employee_id === selectedEmployeeId).length;

  return (
    <div className="min-h-screen bg-cream text-stone-800 pb-safe">
      {/* 頂部 */}
      <div className="sticky top-0 z-40 bg-cream/90 backdrop-blur-md border-b border-amber-100">
        <div className="max-w-5xl mx-auto px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              aria-label="回入口"
              className="shrink-0 w-10 h-10 rounded-full bg-white border border-amber-100 shadow-sm flex items-center justify-center text-lg text-stone-600 active:scale-95 transition"
            >
              ←
            </Link>
            <h1 className="text-lg font-black text-stone-900 truncate">📅 班表與劃休</h1>
          </div>
          <span className="shrink-0 flex items-center gap-1 text-xs font-bold bg-brand-100 text-brand-800 pl-1 pr-2.5 py-0.5 rounded-full">
            <Chick size={24} mood="happy" />
            {STORE_NAMES[currentStore]}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 pt-4 space-y-3">
        {/* 今天上班 */}
        <TodayCrew shifts={todayShifts} employees={employees} meId={selectedEmployeeId} />

        {/* 我是誰 + 劃休 / 代理人登記 */}
        <div className="bg-white rounded-3xl border border-amber-100 shadow-sm shadow-amber-900/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <select
              value={selectedEmployeeId}
              onChange={(e) => chooseEmployee(e.target.value)}
              className="flex-1 min-w-0 p-3 rounded-2xl bg-brand-50 border border-brand-200 font-bold text-base outline-none focus:border-brand-500"
            >
              <option value="">👤 選擇你的名字</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
            <span
              className={`shrink-0 px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 ${
                isSubmissionOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isSubmissionOpen ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
              {isSubmissionOpen ? '開放登記' : '已鎖定'}
            </span>
          </div>

          {canEdit && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'off', label: '🙅 劃休', active: 'bg-rose-500 text-white shadow-md shadow-rose-500/30' },
                  { key: 'deputy', label: '🧑‍✈️ 當代理人', active: 'bg-orange-500 text-white shadow-md shadow-orange-500/30' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setStaffTool(t.key as StaffTool)}
                    className={`py-3 rounded-2xl font-black text-sm transition active:scale-95 ${
                      staffTool === t.key ? t.active : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-xs font-bold text-stone-500 text-center">
                👉 點自己的日期就能{staffTool === 'off' ? '登記 / 取消劃休' : '登記 / 取消代理人（每天一位，先登記先拿到）'}
              </p>
            </>
          )}
          {!isSubmissionOpen && (
            <p className="text-xs font-bold text-stone-400 text-center">店長已鎖定登記，需要異動請找店長</p>
          )}
        </div>

        {/* 月份 + 檢視切換 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center justify-between bg-white rounded-2xl border border-amber-100 shadow-sm p-1">
            <button onClick={() => changeMonth(-1)} aria-label="上個月" className="w-10 h-10 rounded-xl text-stone-500 active:bg-stone-100 font-black">
              ‹
            </button>
            <span className="font-black text-stone-900">
              {year} 年 {month} 月
            </span>
            <button onClick={() => changeMonth(1)} aria-label="下個月" className="w-10 h-10 rounded-xl text-stone-500 active:bg-stone-100 font-black">
              ›
            </button>
          </div>
          <div className="flex bg-white rounded-2xl border border-amber-100 shadow-sm p-1 text-sm font-black">
            {[
              { key: 'mine', label: '我的' },
              { key: 'all', label: '全店' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  if (t.key === 'mine' && !selectedEmployeeId) {
                    alert('請先選擇你的名字喔！');
                    return;
                  }
                  setView(t.key as View);
                }}
                className={`px-3.5 h-10 rounded-xl transition ${
                  view === t.key ? 'bg-brand-500 text-white shadow-sm' : 'text-stone-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {view === 'mine' && selectedEmployeeId ? (
          <>
            {/* 本月統計 */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '上班', value: myWorkDays, color: 'text-sky-700' },
                { label: '宵夜', value: myNights, color: 'text-purple-700' },
                { label: '代理', value: myDeputy, color: 'text-orange-600' },
                { label: '劃休', value: myOffs, color: 'text-rose-600' },
              ].map((x) => (
                <div key={x.label} className="bg-white rounded-2xl border border-amber-100 shadow-sm py-2.5 text-center">
                  <div className={`text-xl font-black ${x.color}`}>{x.value}</div>
                  <div className="text-[11px] font-bold text-stone-400">{x.label}</div>
                </div>
              ))}
            </div>

            {/* 我的每日清單 */}
            <div className="space-y-2">
              {daysArray.map((day) => {
                const dateStr = ymd(year, month, day);
                const dow = new Date(year, month - 1, day).getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isToday = dateStr === today;
                const shift = shiftOf(selectedEmployeeId, dateStr);
                const meta = shift && shift.shift_type !== 'none' ? SHIFT_META[shift.shift_type] : null;
                const unavail = isUnavailOf(selectedEmployeeId, dateStr);
                const deputy = deputyOf(dateStr);
                const mates = shifts
                  .filter((s) => s.date === dateStr && s.employee_id !== selectedEmployeeId && (isWorking(s.shift_type) || s.is_night))
                  .map((s) => nameOf(s.employee_id))
                  .filter(Boolean);

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleToggleUnavailability(selectedEmployeeId, dateStr)}
                    className={`w-full text-left flex items-stretch gap-3 rounded-2xl border p-2.5 transition ${
                      isToday ? 'bg-brand-50 border-brand-300 ring-2 ring-brand-200' : 'bg-white border-amber-100'
                    } ${canEdit ? 'active:scale-[0.98]' : ''}`}
                  >
                    {/* 日期 */}
                    <div
                      className={`w-12 shrink-0 rounded-xl flex flex-col items-center justify-center ${
                        isToday ? 'bg-brand-500 text-white' : isWeekend ? 'bg-brand-100 text-brand-800' : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      <span className="text-lg font-black leading-none">{day}</span>
                      <span className="text-[10px] font-bold mt-0.5 opacity-80">{isToday ? '今天' : `週${DAY_NAMES[dow]}`}</span>
                    </div>

                    {/* 內容 */}
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {meta ? (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-black ${meta.pill}`}>
                            {meta.label}
                            {meta.time && <span className="font-bold opacity-80 ml-1">{meta.time}</span>}
                          </span>
                        ) : (
                          <span className="text-sm font-bold text-stone-300">沒有排班</span>
                        )}
                        {shift?.is_night && (
                          <span className="px-2 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-700">🌙 宵夜</span>
                        )}
                        {shift?.is_deputy && (
                          <span className="px-2 py-1 rounded-full text-xs font-black bg-orange-500 text-white">代理人</span>
                        )}
                        {unavail && (
                          <span className="px-2 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-600">已劃休</span>
                        )}
                      </div>
                      {(mates.length > 0 || (deputy && !shift?.is_deputy)) && (
                        <div className="text-[11px] font-bold text-stone-400 mt-1.5 truncate">
                          {mates.length > 0 && <>同班：{mates.join('、')}</>}
                          {deputy && !shift?.is_deputy && (
                            <span className="text-orange-600">
                              {mates.length > 0 ? '　' : ''}代理：{nameOf(deputy.employee_id)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* 圖例 */}
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-bold text-stone-500 px-1">
              {(['normal', 'open', 'half', 'off'] as const).map((k) => SHIFT_META[k]).map((m) => (
                <span key={m.label} className="flex items-center gap-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} />
                  {m.label}
                </span>
              ))}
              <span className="flex items-center gap-1">🌙 宵夜</span>
              <span className="flex items-center gap-1">
                <span className="text-[9px] bg-orange-500 text-white font-black px-1 rounded">代</span> 代理人
              </span>
              <span className="flex items-center gap-1">
                <span className="text-[9px] bg-rose-100 text-rose-600 font-black px-1 rounded">休</span> 劃休
              </span>
            </div>

            {/* 全店表格 */}
            <div
              ref={tableScrollRef}
              className="bg-white rounded-3xl border border-amber-100 shadow-sm shadow-amber-900/5 overflow-x-auto no-scrollbar"
            >
              <table className="border-separate border-spacing-0 text-center">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-white border-b border-r border-amber-100 px-2 py-2 text-left text-xs font-black text-stone-400 min-w-[72px]">
                      夥伴
                    </th>
                    {daysArray.map((day) => {
                      const dateStr = ymd(year, month, day);
                      const dow = new Date(year, month - 1, day).getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const isToday = dateStr === today;
                      return (
                        <th
                          key={day}
                          data-today={isToday ? '1' : undefined}
                          className={`border-b border-r border-amber-50 px-0.5 py-1.5 min-w-[46px] ${
                            isToday ? 'bg-brand-400 text-white' : isWeekend ? 'bg-brand-50 text-brand-800' : 'text-stone-600'
                          }`}
                        >
                          <div className="text-sm font-black leading-none">{day}</div>
                          <div className="text-[10px] font-bold mt-0.5 opacity-80">{DAY_NAMES[dow]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const isMe = emp.id === selectedEmployeeId;
                    return (
                      <tr key={emp.id}>
                        <td
                          className={`sticky left-0 z-10 border-b border-r border-amber-100 px-2 py-1.5 text-left text-sm font-black whitespace-nowrap max-w-[88px] truncate ${
                            isMe ? 'bg-brand-100 text-brand-900' : 'bg-white text-stone-800'
                          }`}
                        >
                          {emp.name}
                        </td>
                        {daysArray.map((day) => {
                          const dateStr = ymd(year, month, day);
                          const isToday = dateStr === today;
                          const shift = shiftOf(emp.id, dateStr);
                          const meta = shift && shift.shift_type !== 'none' ? SHIFT_META[shift.shift_type] : null;
                          const unavail = isUnavailOf(emp.id, dateStr);
                          const selectable = isMe && canEdit;
                          return (
                            <td
                              key={day}
                              onClick={() => selectable && handleToggleUnavailability(emp.id, dateStr)}
                              className={`border-b border-r border-amber-50 p-0.5 h-14 align-middle select-none relative ${
                                isToday ? 'bg-brand-50' : isMe ? 'bg-brand-50/50' : ''
                              } ${selectable ? 'cursor-pointer active:bg-brand-100' : ''}`}
                            >
                              {unavail && (
                                <span className="absolute top-0.5 right-0.5 text-[9px] leading-none bg-rose-100 text-rose-600 font-black px-0.5 py-0.5 rounded">
                                  休
                                </span>
                              )}
                              {meta && (
                                <div className={`mx-auto w-9 rounded-lg py-1 text-[11px] font-black ${meta.pill}`}>{meta.short}</div>
                              )}
                              {(shift?.is_night || shift?.is_deputy) && (
                                <div className="flex justify-center gap-0.5 mt-0.5">
                                  {shift?.is_night && <span className="text-[10px] leading-none">🌙</span>}
                                  {shift?.is_deputy && (
                                    <span className="text-[9px] leading-none bg-orange-500 text-white font-black px-1 py-0.5 rounded">代</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-center text-[11px] font-bold text-stone-400">← 左右滑動看整個月 →</p>
          </>
        )}

        <div className="flex justify-center pt-2 pb-4">
          <Chick size={48} mood="happy" />
        </div>
      </div>
    </div>
  );
}
