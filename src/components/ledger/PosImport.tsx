'use client';

// 匯入錢櫃管理 CSV：只取「取出」，轉存 / 退款不算支出，其餘依規則分類
import { useEffect, useMemo, useState } from 'react';
import { ledgerDb } from '@/lib/ledgerClient';
import {
  DAILY_CATEGORIES,
  DEFAULT_POS_RULES,
  LedgerStore,
  PosRow,
  PosRule,
  classifyReason,
  fmtMoney,
  monthOf,
  parsePosCsv,
  posKey,
  posWithdrawals,
} from '@/lib/ledger';

const SKIP_TRANSFER = '__transfer';
const SKIP_REFUND = '__refund';

interface Line {
  row: PosRow;
  choice: string; // 分類名稱，或 SKIP_TRANSFER / SKIP_REFUND
  matched: string | null;
  remember: boolean;
}

export default function PosImport({
  store,
  storeName,
  onClose,
  onDone,
}: {
  store: LedgerStore;
  storeName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const db = ledgerDb();
  const [rules, setRules] = useState<PosRule[]>(DEFAULT_POS_RULES);
  const [lines, setLines] = useState<Line[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'expense' | 'skip' | 'unmatched'>('all');

  useEffect(() => {
    db.from('ledger_pos_rules')
      .select('*')
      .then(({ data }) => {
        if (data && data.length) setRules(data as PosRule[]);
      });
  }, [db]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const rows = posWithdrawals(parsePosCsv(await file.text()));
      setLines(
        rows.map((row) => {
          const d = classifyReason(row.reason, rules);
          return {
            row,
            choice: d.action === 'category' ? d.category : d.action === 'transfer' ? SKIP_TRANSFER : SKIP_REFUND,
            matched: d.matched,
            remember: false,
          };
        }),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : '讀取檔案失敗');
    }
  };

  const isSkip = (c: string) => c === SKIP_TRANSFER || c === SKIP_REFUND;

  const totals = useMemo(() => {
    const t = { expense: 0, transfer: 0, refund: 0, byCat: new Map<string, number>() };
    for (const l of lines) {
      const amt = -l.row.amount;
      if (l.choice === SKIP_TRANSFER) t.transfer += amt;
      else if (l.choice === SKIP_REFUND) t.refund += amt;
      else {
        t.expense += amt;
        t.byCat.set(l.choice, (t.byCat.get(l.choice) ?? 0) + amt);
      }
    }
    return t;
  }, [lines]);

  const months = useMemo(() => [...new Set(lines.map((l) => l.row.businessDate.slice(0, 7)))].sort(), [lines]);

  const shown = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) =>
      filter === 'all' ? true : filter === 'expense' ? !isSkip(l.choice) : filter === 'skip' ? isSkip(l.choice) : !l.matched && !!l.row.reason,
    );

  const update = (i: number, patch: Partial<Line>) =>
    setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const handleImport = async () => {
    const rowsToSave = lines.filter((l) => !isSkip(l.choice));
    if (!rowsToSave.length) return alert('沒有要匯入的支出');
    setBusy(true);

    // 1. 記住新的關鍵字規則
    const newRules = lines
      .filter((l) => l.remember && l.row.reason)
      .map((l) => ({
        keyword: l.row.reason,
        match: 'equals' as const,
        action: l.choice === SKIP_TRANSFER ? 'transfer' : l.choice === SKIP_REFUND ? 'refund' : 'category',
        category: isSkip(l.choice) ? null : l.choice,
        priority: 0,
      }));
    if (newRules.length) {
      const { error } = await db.from('ledger_pos_rules').upsert(newRules, { onConflict: 'keyword' });
      if (error) console.error('儲存規則失敗', error);
    }

    // 2. 寫入支出（同一筆錢櫃紀錄重複上傳不會重複記帳）
    const payload = rowsToSave.map((l) => ({
      store_id: store,
      month: monthOf(l.row.businessDate),
      entry_date: l.row.businessDate,
      section: 'daily',
      category: l.choice,
      name: l.row.reason || null,
      amount: -l.row.amount,
      source: 'pos',
      pos_key: posKey(store, l.row),
    }));
    const { data, error } = await db
      .from('ledger_entries')
      .upsert(payload, { onConflict: 'pos_key', ignoreDuplicates: true })
      .select('id');
    setBusy(false);
    if (error) return alert(`匯入失敗：${error.message}`);
    const added = data?.length ?? 0;
    alert(`匯入完成：新增 ${added} 筆${payload.length - added ? `，${payload.length - added} 筆之前已匯入過，略過` : ''}。`);
    onDone();
  };

  const categoryOptions = [...new Set([...DAILY_CATEGORIES, ...lines.filter((l) => !isSkip(l.choice)).map((l) => l.choice)])];

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">匯入錢櫃 CSV → {storeName}</h2>
            <p className="text-xs text-slate-400">只取「取出」；轉存和退款不算支出。資料會依營業日放進對應的月份。</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl px-2">✕</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <label className="block border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-emerald-400 mb-4">
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <span className="text-sm font-bold text-slate-600">{fileName || '點這裡選擇錢櫃管理匯出的 CSV'}</span>
          </label>

          {lines.length > 0 && (
            <>
              {months.length > 1 && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mb-3">
                  這個檔案包含多個月份（{months.join('、')}），會分別放進各自的月份。
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-emerald-50 rounded-xl p-3">
                  <div className="text-xs font-bold text-emerald-700">要匯入的支出</div>
                  <div className="text-lg font-black font-mono text-emerald-700">{fmtMoney(totals.expense)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs font-bold text-slate-500">轉存（不算）</div>
                  <div className="text-lg font-black font-mono text-slate-500">{fmtMoney(totals.transfer)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs font-bold text-slate-500">客人退款（不算）</div>
                  <div className="text-lg font-black font-mono text-slate-500">{fmtMoney(totals.refund)}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {[...totals.byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, t]) => (
                  <span key={c} className="text-xs bg-slate-100 px-2 py-1 rounded-lg font-bold">{c} <span className="font-mono">{fmtMoney(t)}</span></span>
                ))}
              </div>

              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold mb-2 w-fit">
                {[
                  ['all', '全部'],
                  ['expense', '支出'],
                  ['skip', '不算的'],
                  ['unmatched', '沒對到規則'],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k as typeof filter)}
                    className={`px-3 py-1 rounded-lg ${filter === k ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-200 text-left">
                    <th className="py-1.5 font-bold">營業日</th>
                    <th className="py-1.5 font-bold">原因</th>
                    <th className="py-1.5 font-bold text-right">金額</th>
                    <th className="py-1.5 font-bold pl-3">歸類</th>
                    <th className="py-1.5 font-bold">記住</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ l, i }) => (
                    <tr
                      key={i}
                      className={`border-b border-slate-100 ${isSkip(l.choice) ? 'text-slate-400' : ''} ${!l.matched && l.row.reason ? 'bg-amber-50/60' : ''}`}
                    >
                      <td className="py-1.5 font-mono">{l.row.businessDate.slice(5)}</td>
                      <td className="py-1.5">{l.row.reason || <span className="text-slate-300">（無）</span>}</td>
                      <td className="py-1.5 font-mono font-bold text-right">{fmtMoney(-l.row.amount)}</td>
                      <td className="py-1.5 pl-3">
                        <select
                          value={l.choice}
                          onChange={(e) => update(i, { choice: e.target.value })}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold outline-none"
                        >
                          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                          <option value={SKIP_TRANSFER}>轉存（不算）</option>
                          <option value={SKIP_REFUND}>退款（不算）</option>
                        </select>
                      </td>
                      <td className="py-1.5">
                        {l.row.reason && (
                          <input
                            type="checkbox"
                            checked={l.remember}
                            onChange={(e) => update(i, { remember: e.target.checked })}
                            title={`以後原因是「${l.row.reason}」就自動這樣歸類`}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-sm">取消</button>
          <button
            onClick={handleImport}
            disabled={busy || !lines.length}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50"
          >
            {busy ? '匯入中...' : `匯入 ${lines.filter((l) => !isSkip(l.choice)).length} 筆`}
          </button>
        </div>
      </div>
    </div>
  );
}
