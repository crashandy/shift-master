'use client';

// 後台：清潔清點與奶酥醬紀錄查詢
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SubmissionDetail from '@/components/staff/SubmissionDetail';
import {
  ButterBatch,
  CHECKLISTS,
  CHECKLIST_TYPES,
  ChecklistSubmission,
  ChecklistType,
  businessDate,
  fmtBusinessDate,
  fmtDateTime,
  fmtTime,
} from '@/lib/checklists';

type Tab = ChecklistType | 'butter';

export default function RecordsPanel({ store }: { store: 'store1' | 'store2' }) {
  const today = businessDate();
  const [tab, setTab] = useState<Tab>('closing');
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [subs, setSubs] = useState<ChecklistSubmission[]>([]);
  const [batches, setBatches] = useState<ButterBatch[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mm = String(month).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDate = `${year}-${mm}-01`;
  const endDate = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;

  useEffect(() => {
    setLoading(true);
    setOpenId(null);
    if (tab === 'butter') {
      supabase
        .from('butter_batches')
        .select('*')
        .eq('store', store)
        .gte('made_at', `${startDate}T00:00:00+08:00`)
        .lte('made_at', `${endDate}T23:59:59+08:00`)
        .order('made_at', { ascending: false })
        .then(({ data }) => {
          setBatches((data ?? []) as ButterBatch[]);
          setLoading(false);
        });
    } else {
      supabase
        .from('checklist_submissions')
        .select('*')
        .eq('store', store)
        .eq('list_type', tab)
        .gte('business_date', startDate)
        .lte('business_date', endDate)
        .order('submitted_at', { ascending: false })
        .then(({ data }) => {
          setSubs((data ?? []) as ChecklistSubmission[]);
          setLoading(false);
        });
    }
  }, [store, tab, startDate, endDate]);

  // 每天有沒有填
  const byDate = useMemo(() => {
    const m: Record<string, ChecklistSubmission[]> = {};
    for (const s of subs) (m[s.business_date] ??= []).push(s);
    return m;
  }, [subs]);

  // 奶酥口味統計
  const flavorTotals = useMemo(() => {
    const m: Record<string, { count: number; weight: number }> = {};
    for (const b of batches) {
      m[b.flavor] ??= { count: 0, weight: 0 };
      m[b.flavor].count += 1;
      m[b.flavor].weight += Number(b.weight_g);
    }
    return Object.entries(m).sort((a, b) => b[1].weight - a[1].weight);
  }, [batches]);

  const shiftMonth = (d: number) => {
    let m = month + d;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const tabs: { key: Tab; label: string }[] = [
    ...CHECKLIST_TYPES.map((t) => ({ key: t as Tab, label: `${CHECKLISTS[t].icon} ${CHECKLISTS[t].title}` })),
    { key: 'butter', label: '🧈 奶酥醬製作' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition ${
                tab === t.key ? 'bg-slate-800 text-white border-transparent' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs">
            &lt; 上個月
          </button>
          <span className="font-black text-slate-800">{year} 年 {month} 月</span>
          <button onClick={() => shiftMonth(1)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs">
            下個月 &gt;
          </button>
        </div>
      </div>

      {loading && <div className="text-center text-slate-400 py-6">載入中...</div>}

      {!loading && tab !== 'butter' && (
        <>
          {/* 每日完成狀況 */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-xs font-bold text-slate-400 mb-3">
              每日填寫狀況（綠＝全部完成、黃＝有未完成項目、紅＝沒填）
            </div>
            <div className="grid grid-cols-7 sm:grid-cols-10 lg:grid-cols-[repeat(16,minmax(0,1fr))] gap-1.5">
              {Array.from({ length: daysInMonth }, (_, i) => {
                const ymd = `${year}-${mm}-${String(i + 1).padStart(2, '0')}`;
                const list = byDate[ymd] ?? [];
                const future = ymd > today;
                const full = list.some((s) => s.done_count === s.total_count);
                const cls = future
                  ? 'bg-slate-50 text-slate-300 border-slate-100'
                  : list.length === 0
                  ? 'bg-rose-50 text-rose-600 border-rose-200'
                  : full
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200';
                return (
                  <div key={ymd} className={`border rounded-lg py-1.5 text-center text-xs font-bold ${cls}`} title={fmtBusinessDate(ymd)}>
                    {i + 1}
                    <div className="text-[10px] font-medium">{future ? '' : list.length === 0 ? '未填' : list.length > 1 ? `${list.length}筆` : '✓'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 紀錄列表 */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-xs font-bold text-slate-400 mb-3">填寫紀錄（點開看明細，紅字為未完成項目）</div>
            {subs.length === 0 ? (
              <div className="text-sm text-slate-400">這個月沒有紀錄</div>
            ) : (
              <div className="space-y-2">
                {subs.map((s) => (
                  <div key={s.id} className="border border-slate-200 rounded-xl">
                    <button
                      onClick={() => setOpenId(openId === s.id ? null : s.id)}
                      className="w-full flex flex-wrap justify-between items-center gap-2 px-3 py-2.5 text-sm"
                    >
                      <span className="font-bold text-slate-700">
                        {fmtBusinessDate(s.business_date)}・{fmtTime(s.submitted_at)} 送出・{s.employee_name}
                        {s.note && <span className="ml-1">📝</span>}
                      </span>
                      <span className={`font-bold ${s.done_count === s.total_count ? 'text-emerald-600' : 'text-amber-600'}`}>
                        完成 {s.done_count}/{s.total_count} {openId === s.id ? '▲' : '▼'}
                      </span>
                    </button>
                    {openId === s.id && <SubmissionDetail s={s} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!loading && tab === 'butter' && (
        <>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-xs font-bold text-slate-400 mb-3">本月各口味製作量</div>
            {flavorTotals.length === 0 ? (
              <div className="text-sm text-slate-400">這個月沒有紀錄</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {flavorTotals.map(([name, t]) => (
                  <div key={name} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <div className="font-black text-slate-800">{name}</div>
                    <div className="text-amber-700 font-bold">{t.weight.toLocaleString()} g</div>
                    <div className="text-xs text-slate-500">{t.count} 批</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-400">
                  <th className="py-2 font-bold">製作時間</th>
                  <th className="py-2 font-bold">口味</th>
                  <th className="py-2 font-bold text-right">重量</th>
                  <th className="py-2 font-bold pl-4">製作人</th>
                  <th className="py-2 font-bold">備註</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100">
                    <td className="py-2">{fmtDateTime(b.made_at)}</td>
                    <td className="py-2 font-bold">{b.flavor}</td>
                    <td className="py-2 text-right font-mono font-bold text-amber-700">{Number(b.weight_g).toLocaleString()} g</td>
                    <td className="py-2 pl-4">{b.employee_name}</td>
                    <td className="py-2 text-slate-500">{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
