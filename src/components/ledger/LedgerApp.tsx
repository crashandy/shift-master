'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ledgerDb } from '@/lib/ledgerClient';
import {
  BIG_CATEGORIES,
  DAILY_CATEGORIES,
  FixedItem,
  LedgerEntry,
  LedgerMonth,
  LedgerStore,
  Section,
  SECTION_LABEL,
  SOURCE_LABEL,
  downloadText,
  exportMonthCsv,
  exportMonthsOverviewCsv,
  fmtMoney,
  monthKey,
  summarize,
} from '@/lib/ledger';
import { STORE_NAMES } from '@/lib/staffSession';
import PosImport from './PosImport';
import LedgerSettings from './LedgerSettings';

type View = 'month' | 'overview' | 'settings';

const emptyMonth = (store: LedgerStore, month: string): LedgerMonth => ({
  store_id: store,
  month,
  cash: null,
  delivery: null,
  line: null,
  salary: null,
  bonus: null,
  other_labor: null,
  rent: null,
  recorded_expense: null,
  recorded_profit: null,
  use_recorded_totals: false,
  note: null,
});

const inputCls =
  'w-full p-2 rounded-lg bg-slate-50 text-slate-800 outline-none border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm transition';
const btn = 'px-3 py-1.5 rounded-xl text-sm font-bold transition';

export default function LedgerApp({ onLogout }: { onLogout: () => void }) {
  const db = ledgerDb();
  const now = new Date();
  const [store, setStore] = useState<LedgerStore>('store1');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState<View>('month');

  const [monthRow, setMonthRow] = useState<LedgerMonth | null>(null);
  const [form, setForm] = useState<LedgerMonth>(emptyMonth('store1', monthKey(now.getFullYear(), now.getMonth() + 1)));
  const [dirty, setDirty] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [fixedItems, setFixedItems] = useState<FixedItem[]>([]);
  const [showImport, setShowImport] = useState(false);

  const mk = monthKey(year, month);
  const storeName = STORE_NAMES[store];

  const load = useCallback(async () => {
    const [{ data: m }, { data: e }, { data: f }] = await Promise.all([
      db.from('ledger_months').select('*').eq('store_id', store).eq('month', mk).maybeSingle(),
      db.from('ledger_entries').select('*').eq('store_id', store).eq('month', mk).order('entry_date', { ascending: true }),
      db.from('ledger_fixed_items').select('*').eq('store_id', store).order('sort_order'),
    ]);
    setEntries((e ?? []) as LedgerEntry[]);
    setFixedItems((f ?? []) as FixedItem[]);
    setMonthRow((m as LedgerMonth) ?? null);
    if (m) {
      setForm(m as LedgerMonth);
    } else {
      // 新的月份：房租沿用上一個有填的月份
      const { data: prev } = await db
        .from('ledger_months')
        .select('rent')
        .eq('store_id', store)
        .lt('month', mk)
        .not('rent', 'is', null)
        .order('month', { ascending: false })
        .limit(1);
      setForm({ ...emptyMonth(store, mk), rent: prev?.[0]?.rent ?? null });
    }
    setDirty(false);
  }, [db, store, mk]);

  useEffect(() => {
    if (view === 'month') load();
  }, [load, view]);

  const summary = useMemo(() => summarize(entries, form), [entries, form]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const setField = (k: keyof LedgerMonth, v: string) => {
    const n = v.trim() === '' ? null : Number(v.replace(/,/g, ''));
    setForm((f) => ({ ...f, [k]: Number.isFinite(n as number) || n === null ? n : f[k] }));
    setDirty(true);
  };

  const saveMonth = async () => {
    const { error } = await db.from('ledger_months').upsert({ ...form, store_id: store, month: mk });
    if (error) return alert(`儲存失敗：${error.message}`);
    setMonthRow(form);
    setDirty(false);
  };

  const addEntry = async (entry: Omit<LedgerEntry, 'store_id' | 'month'>) => {
    const { error } = await db.from('ledger_entries').insert({ ...entry, store_id: store, month: mk });
    if (error) return alert(`新增失敗：${error.message}`);
    load();
  };

  const deleteEntry = async (e: LedgerEntry) => {
    if (!confirm(`刪除「${e.name || e.category} ${fmtMoney(e.amount)}」？`)) return;
    const { error } = await db.from('ledger_entries').delete().eq('id', e.id);
    if (error) return alert(`刪除失敗：${error.message}`);
    load();
  };

  const updateCategory = async (e: LedgerEntry, category: string) => {
    const { error } = await db.from('ledger_entries').update({ category }).eq('id', e.id);
    if (error) return alert(`更新失敗：${error.message}`);
    setEntries((xs) => xs.map((x) => (x.id === e.id ? { ...x, category } : x)));
  };

  const applyFixed = async () => {
    if (!fixedItems.length) return alert('還沒設定每月固定項目，請到「設定」新增。');
    const existing = new Set(entries.filter((e) => e.source === 'fixed').map((e) => e.category));
    const toAdd = fixedItems.filter((f) => !existing.has(f.name));
    if (!toAdd.length) return alert('這個月的固定項目已經都帶入了。');
    const { error } = await db.from('ledger_entries').insert(
      toAdd.map((f) => ({
        store_id: store,
        month: mk,
        entry_date: null,
        section: 'big',
        category: f.name,
        name: f.name,
        amount: f.amount,
        source: 'fixed',
      })),
    );
    if (error) return alert(`帶入失敗：${error.message}`);
    load();
  };

  const exportMonth = () => {
    downloadText(`${storeName}_${year}年${month}月_記帳.csv`, exportMonthCsv(storeName, mk, entries, form));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-6">
      {/* 頂部 */}
      <div className="max-w-6xl mx-auto mb-5 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin" className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold">
            ← 後台
          </Link>
          <h1 className="text-xl font-black text-slate-900">💰 月記帳</h1>
          <div className="flex bg-slate-100 p-1 rounded-xl text-sm font-bold">
            {[
              { key: 'month', label: '📒 當月' },
              { key: 'overview', label: '📊 每月總覽' },
              { key: 'settings', label: '⚙️ 設定' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key as View)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  view === t.key ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select
            value={store}
            onChange={(e) => setStore(e.target.value as LedgerStore)}
            className="bg-slate-100 px-3 py-2 rounded-xl border border-slate-300 font-bold outline-none text-sm cursor-pointer"
          >
            <option value="store1">{STORE_NAMES.store1}</option>
            <option value="store2">{STORE_NAMES.store2}</option>
          </select>
        </div>
        <button onClick={onLogout} className={`${btn} bg-slate-100 hover:bg-slate-200 text-slate-600`}>
          登出
        </button>
      </div>

      {view === 'overview' && <Overview store={store} storeName={storeName} onOpen={(y, m) => { setYear(y); setMonth(m); setView('month'); }} />}
      {view === 'settings' && <LedgerSettings store={store} />}

      {view === 'month' && (
        <div className="max-w-6xl mx-auto space-y-5">
          {/* 月份切換 + 動作 */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => shiftMonth(-1)} className={`${btn} bg-slate-100 hover:bg-slate-200`}>&lt;</button>
              <span className="text-base font-black w-36 text-center">{year} 年 {month} 月</span>
              <button onClick={() => shiftMonth(1)} className={`${btn} bg-slate-100 hover:bg-slate-200`}>&gt;</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowImport(true)} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                ⬆️ 匯入錢櫃 CSV
              </button>
              <button onClick={applyFixed} className={`${btn} bg-slate-100 hover:bg-slate-200 text-slate-700`}>
                📌 帶入固定項目
              </button>
              <button onClick={exportMonth} className={`${btn} bg-slate-100 hover:bg-slate-200 text-slate-700`}>
                ⬇️ 匯出本月
              </button>
            </div>
          </div>

          {summary.usingRecorded && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-2xl p-3">
              這是歷史月份，原月報表的明細加總對不上「實支出」或「總收益」，所以這裡直接用原表的數字（實支出 {fmtMoney(form.recorded_expense)}、總收益 {fmtMoney(form.recorded_profit)}），下面的明細僅供參考。
            </div>
          )}

          {/* 結算 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: '收入合計', value: summary.income, cls: 'text-slate-800' },
              { label: '實支出', value: summary.expense, cls: 'text-rose-600' },
              { label: '房租', value: summary.rent, cls: 'text-slate-600' },
              { label: '人力', value: summary.labor, cls: 'text-slate-600' },
              { label: '總收益', value: summary.profit, cls: summary.profit >= 0 ? 'text-emerald-600' : 'text-rose-600' },
            ].map((c) => (
              <div key={c.label} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="text-xs font-bold text-slate-400">{c.label}</div>
                <div className={`text-xl font-black font-mono ${c.cls}`}>{fmtMoney(c.value)}</div>
              </div>
            ))}
          </div>
          {form.recorded_profit !== null && form.recorded_profit !== summary.profit && (
            <p className="text-xs text-slate-400 -mt-3">原月報表的總收益：{fmtMoney(form.recorded_profit)}</p>
          )}

          {/* 收入與人力 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black">收入 / 人力 / 房租</h2>
              <button
                onClick={saveMonth}
                disabled={!dirty}
                className={`${btn} ${dirty ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-100 text-slate-400'}`}
              >
                {dirty ? '儲存' : monthRow ? '已儲存' : '尚未填寫'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(
                [
                  ['cash', '實收現金'],
                  ['delivery', '實收(外送)'],
                  ['line', '實收LINE'],
                  ['rent', '房租'],
                  ['salary', '薪資'],
                  ['bonus', '獎金'],
                  ['other_labor', '其他人力'],
                ] as [keyof LedgerMonth, string][]
              ).map(([k, label]) => (
                <label key={k} className="text-xs font-bold text-slate-500">
                  {label}
                  <input
                    inputMode="numeric"
                    value={form[k] === null ? '' : String(form[k])}
                    onChange={(e) => setField(k, e.target.value)}
                    className={`${inputCls} mt-1 font-mono`}
                  />
                </label>
              ))}
              <label className="text-xs font-bold text-slate-500 col-span-2 md:col-span-1">
                備註
                <input
                  value={form.note ?? ''}
                  onChange={(e) => { setForm((f) => ({ ...f, note: e.target.value || null })); setDirty(true); }}
                  className={`${inputCls} mt-1`}
                />
              </label>
            </div>
          </div>

          {(['daily', 'big', 'income_other'] as Section[]).map((section) => (
            <EntrySection
              key={section}
              section={section}
              entries={entries.filter((e) => e.section === section)}
              defaultDate={`${year}-${String(month).padStart(2, '0')}-01`}
              onAdd={addEntry}
              onDelete={deleteEntry}
              onCategory={updateCategory}
            />
          ))}
        </div>
      )}

      {showImport && (
        <PosImport
          store={store}
          storeName={storeName}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); }}
        />
      )}
    </div>
  );
}

// ---------- 支出 / 收入區塊 ----------

function EntrySection({
  section,
  entries,
  defaultDate,
  onAdd,
  onDelete,
  onCategory,
}: {
  section: Section;
  entries: LedgerEntry[];
  defaultDate: string;
  onAdd: (e: Omit<LedgerEntry, 'store_id' | 'month'>) => void;
  onDelete: (e: LedgerEntry) => void;
  onCategory: (e: LedgerEntry, category: string) => void;
}) {
  const categories = section === 'daily' ? DAILY_CATEGORIES : section === 'big' ? BIG_CATEGORIES : ['雞老大菜肉'];
  const [date, setDate] = useState('');
  const [category, setCategory] = useState(section === 'daily' ? '雜項' : '');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    entries.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const amt = Number(amount.replace(/,/g, ''));
    if (!amt) return alert('請輸入金額');
    const cat = category.trim() || (section === 'daily' ? '雜項' : '(未命名)');
    onAdd({
      entry_date: section === 'daily' ? date || defaultDate : date || null,
      section,
      category: cat,
      name: name.trim() || null,
      amount: amt,
      source: 'manual',
    });
    setName('');
    setAmount('');
  };

  const listId = `cats-${section}`;
  const allCats = [...new Set([...categories, ...entries.map((e) => e.category)])];

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-black">
          {SECTION_LABEL[section]}
          {section === 'income_other' && <span className="text-xs font-normal text-slate-400 ml-2">不計入總收益</span>}
        </h2>
        <span className="font-mono font-black text-slate-700">{fmtMoney(total)}</span>
      </div>

      {byCat.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {byCat.map(([c, t]) => (
            <span key={c} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-bold">
              {c} <span className="font-mono">{fmtMoney(t)}</span>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputCls}
          title={section === 'daily' ? '日期（不填就算月初）' : '日期（可不填）'}
        />
        <input list={listId} placeholder="分類" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} />
        <datalist id={listId}>
          {allCats.map((c) => <option key={c} value={c} />)}
        </datalist>
        <input placeholder="名稱（可不填）" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <input inputMode="numeric" placeholder="金額" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} font-mono`} />
        <button type="submit" className="col-span-2 md:col-span-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm py-2">
          新增
        </button>
      </form>

      {entries.length > 0 && (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-xs text-slate-400 border-b border-slate-200 text-left">
                <th className="py-1.5 font-bold">日期</th>
                <th className="py-1.5 font-bold">分類</th>
                <th className="py-1.5 font-bold">名稱</th>
                <th className="py-1.5 font-bold text-right">金額</th>
                <th className="py-1.5 font-bold">來源</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-1.5 font-mono text-slate-500">{e.entry_date?.slice(5) ?? '—'}</td>
                  <td className="py-1.5">
                    <select
                      value={e.category}
                      onChange={(ev) => onCategory(e, ev.target.value)}
                      className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      {[...new Set([e.category, ...categories])].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 text-slate-600">{e.name}</td>
                  <td className="py-1.5 font-mono font-bold text-right">{fmtMoney(e.amount)}</td>
                  <td className="py-1.5 text-xs text-slate-400 pl-3">{SOURCE_LABEL[e.source]}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => onDelete(e)} className="text-slate-300 hover:text-rose-500 px-1">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- 每月總覽 ----------

function Overview({ store, storeName, onOpen }: { store: LedgerStore; storeName: string; onOpen: (y: number, m: number) => void }) {
  const db = ledgerDb();
  const [months, setMonths] = useState<LedgerMonth[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: m } = await db.from('ledger_months').select('*').eq('store_id', store).order('month', { ascending: false });
      // 分頁抓全部明細（Supabase 預設一次最多 1000 筆）
      const all: LedgerEntry[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await db
          .from('ledger_entries')
          .select('month, section, amount, category, store_id, entry_date, name, source')
          .eq('store_id', store)
          .range(from, from + 999);
        all.push(...((data ?? []) as LedgerEntry[]));
        if (!data || data.length < 1000) break;
      }
      setMonths((m ?? []) as LedgerMonth[]);
      setEntries(all);
      setLoading(false);
    })();
  }, [db, store]);

  const rows = months.map((m) => ({ m, s: summarize(entries.filter((e) => e.month === m.month), m) }));

  return (
    <div className="max-w-6xl mx-auto bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black">{storeName} 每月總覽</h2>
        <button
          onClick={() => downloadText(`${storeName}_每月總覽.csv`, exportMonthsOverviewCsv(storeName, months, entries))}
          className={`${btn} bg-slate-100 hover:bg-slate-200 text-slate-700`}
        >
          ⬇️ 匯出總覽
        </button>
      </div>
      {loading ? (
        <p className="text-slate-400 text-sm">載入中...</p>
      ) : !rows.length ? (
        <p className="text-slate-400 text-sm">還沒有任何月份的資料。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-200 text-right">
                <th className="py-2 text-left font-bold">月份</th>
                <th className="py-2 font-bold">收入</th>
                <th className="py-2 font-bold">實支出</th>
                <th className="py-2 font-bold">房租</th>
                <th className="py-2 font-bold">人力</th>
                <th className="py-2 font-bold">總收益</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, s }) => (
                <tr
                  key={m.month}
                  onClick={() => onOpen(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7)))}
                  className="border-b border-slate-100 hover:bg-emerald-50 cursor-pointer text-right font-mono"
                >
                  <td className="py-2 text-left font-bold font-sans">
                    {m.month.slice(0, 7)}
                    {s.usingRecorded && <span className="ml-1 text-[10px] text-amber-600">原表總數</span>}
                  </td>
                  <td className="py-2">{fmtMoney(s.income)}</td>
                  <td className="py-2 text-rose-600">{fmtMoney(s.expense)}</td>
                  <td className="py-2">{fmtMoney(s.rent)}</td>
                  <td className="py-2">{fmtMoney(s.labor)}</td>
                  <td className={`py-2 font-black ${s.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtMoney(s.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
