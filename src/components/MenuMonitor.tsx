'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ItemStatus, MenuCheckResult } from '@/lib/menuConfig';

// ===== 自動偵測時段（台灣時間，每小時整點偵測一次）=====
// 平日（一～五）17:00 開始、假日（六、日）14:00 開始，都偵測到隔天 03:00
const WEEKDAY_START_HOUR = 17;
const WEEKEND_START_HOUR = 14;
const END_HOUR = 3; // 隔天 03:00（含）

// 取得台灣時間的星期與小時（不受使用者電腦時區影響）
function getTaipeiTime(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return { isWeekend: weekday === 'Sat' || weekday === 'Sun', hour };
}

// 這個時間點是否在偵測時段內
// 00:00～03:00 屬於前一天晚上的營業時段，每天都會偵測
function isInMonitorWindow(date: Date) {
  const { isWeekend, hour } = getTaipeiTime(date);
  if (hour <= END_HOUR) return true;
  return hour >= (isWeekend ? WEEKEND_START_HOUR : WEEKDAY_START_HOUR);
}

// 距離下一個整點還有幾毫秒
function msUntilNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.getTime() - now.getTime() + 2000; // 多等 2 秒，確保已過整點
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  ok: '🟢 正常販售',
  soldout: '❌ 售完反黑',
  missing: '🚫 完全未上架',
};

export default function MenuMonitor() {
  const [data, setData] = useState<MenuCheckResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [inWindow, setInWindow] = useState(() => isInMonitorWindow(new Date()));

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/menu-check', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 打開頁面時：在時段內就先掃一次
    if (isInMonitorWindow(new Date())) runCheck();

    // 之後每到整點，在時段內才掃描
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timer = setTimeout(() => {
        const active = isInMonitorWindow(new Date());
        setInWindow(active);
        if (active) runCheck();
        scheduleNext();
      }, msUntilNextHour());
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, [runCheck]);

  const errorCount = (items: { status: ItemStatus }[]) =>
    items.filter((i) => i.status !== 'ok').length;

  const totalItemIssues = data
    ? data.categories.reduce((sum, c) => sum + errorCount(c.items), 0)
    : 0;
  const totalTagIssues = data ? data.tagIssues.length : 0;
  const current = data?.categories[activeTab];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* 標題列 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">🐔 雲端點餐品項監測</h2>
          <p className="text-xs text-slate-400">
            平日 17:00、假日 14:00 起至隔天 03:00，每小時整點自動掃描（此頁面需保持開啟）
            {data &&
              ` ・ 上次掃描：${new Date(data.checkedAt).toLocaleString('zh-TW', {
                timeZone: 'Asia/Taipei',
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}`}
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-xs transition disabled:opacity-50"
        >
          {loading ? '🔄 掃描中...' : '🔄 立即重新掃描'}
        </button>
      </div>

      {!inWindow && (
        <div className="bg-slate-100 border border-slate-200 text-slate-600 p-4 rounded-2xl font-bold text-sm">
          🌙 目前不在偵測時段，自動掃描暫停中；需要的話可以按「立即重新掃描」手動檢查。
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl font-bold text-sm">
          ❌ 偵測系統連線失敗：{error}
        </div>
      )}

      {data && (
        <>
          {/* 數據看板 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: '大品項異常數（未開/售完）', value: totalItemIssues },
              { label: '鍋燒客製標籤異常數', value: totalTagIssues },
            ].map((m) => (
              <div
                key={m.label}
                className={`p-5 rounded-2xl border shadow-xs ${
                  m.value > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div className="text-xs font-bold text-slate-500">{m.label}</div>
                <div className={`text-3xl font-black mt-1 ${m.value > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {m.value} 項
                </div>
              </div>
            ))}
          </div>

          {/* 鍋燒加選標籤 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-black text-slate-800 mb-3">🏷️ 鍋燒意麵－加選標籤檢查</h3>
            {data.tagIssues.length > 0 ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1.5">
                <div className="font-bold text-rose-700">🚨 注意！店員漏開或關閉了以下加選標籤：</div>
                {data.tagIssues.map((msg) => (
                  <div key={msg} className="text-sm text-rose-700">⚠️ 鍋燒配料：<b>{msg}</b></div>
                ))}
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 font-bold text-emerald-700 text-sm">
                ✅ 鍋燒意麵的加蛋、加起司、加肉、加海鮮等加選區全數正常供應！
              </div>
            )}
          </div>

          {/* 各系列品項 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-black text-slate-800 mb-3">📋 各大系列品項即時狀態</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {data.categories.map((cat, idx) => {
                const n = errorCount(cat.items);
                return (
                  <button
                    key={cat.name}
                    onClick={() => setActiveTab(idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      activeTab === idx
                        ? 'bg-slate-800 text-white border-transparent'
                        : n > 0
                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat.name} {n > 0 ? `（❌ ${n} 項）` : '（🟢 全數正常）'}
                  </button>
                );
              })}
            </div>

            {current && (
              <>
                {errorCount(current.items) > 0 ? (
                  <div className="mb-3 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    ⚠️ 此分類目前有 {errorCount(current.items)} 個品項處於售完或未上架狀態！
                  </div>
                ) : (
                  <div className="mb-3 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    🟢 此分類所有品項皆在線上正常販售中。
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                  {current.items.map((item) => (
                    <div
                      key={item.name}
                      className={`text-sm ${item.status === 'ok' ? 'text-slate-400' : 'font-bold text-rose-600'}`}
                    >
                      {STATUS_LABEL[item.status]} ｜ {item.name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
