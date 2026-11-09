'use client';

// 記帳設定：每月固定項目、錢櫃分類規則
import { useCallback, useEffect, useState } from 'react';
import { ledgerDb } from '@/lib/ledgerClient';
import { BIG_CATEGORIES, FixedItem, LedgerStore, PosRule, fmtMoney } from '@/lib/ledger';
import { STORE_NAMES } from '@/lib/staffSession';

const inputCls =
  'p-2 rounded-lg bg-slate-50 text-slate-800 outline-none border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm';

const ACTION_LABEL: Record<PosRule['action'], string> = {
  category: '歸類',
  transfer: '轉存（不算）',
  refund: '退款（不算）',
};

export default function LedgerSettings({ store }: { store: LedgerStore }) {
  const db = ledgerDb();
  const [items, setItems] = useState<FixedItem[]>([]);
  const [rules, setRules] = useState<PosRule[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [rule, setRule] = useState<PosRule>({ keyword: '', match: 'contains', action: 'category', category: '雜項', priority: 50 });

  const load = useCallback(async () => {
    const [{ data: f }, { data: r }] = await Promise.all([
      db.from('ledger_fixed_items').select('*').eq('store_id', store).order('sort_order'),
      db.from('ledger_pos_rules').select('*').order('priority').order('keyword'),
    ]);
    setItems((f ?? []) as FixedItem[]);
    setRules((r ?? []) as PosRule[]);
  }, [db, store]);

  useEffect(() => {
    load();
  }, [load]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount.replace(/,/g, ''));
    if (!name.trim() || !amt) return alert('請輸入項目和金額');
    const { error } = await db
      .from('ledger_fixed_items')
      .insert({ store_id: store, name: name.trim(), amount: amt, sort_order: items.length + 1 });
    if (error) return alert(`新增失敗：${error.message}`);
    setName('');
    setAmount('');
    load();
  };

  const updateItemAmount = async (it: FixedItem, v: string) => {
    const amt = Number(v.replace(/,/g, ''));
    if (!amt || amt === it.amount) return;
    const { error } = await db.from('ledger_fixed_items').update({ amount: amt }).eq('id', it.id);
    if (error) return alert(`更新失敗：${error.message}`);
    load();
  };

  const removeItem = async (it: FixedItem) => {
    if (!confirm(`刪除固定項目「${it.name}」？（已帶入的月份不受影響）`)) return;
    await db.from('ledger_fixed_items').delete().eq('id', it.id);
    load();
  };

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rule.keyword.trim()) return;
    const { error } = await db.from('ledger_pos_rules').upsert(
      { ...rule, keyword: rule.keyword.trim(), category: rule.action === 'category' ? rule.category || '雜項' : null },
      { onConflict: 'keyword' },
    );
    if (error) return alert(`儲存失敗：${error.message}`);
    setRule({ ...rule, keyword: '' });
    load();
  };

  const removeRule = async (r: PosRule) => {
    if (!confirm(`刪除規則「${r.keyword}」？`)) return;
    await db.from('ledger_pos_rules').delete().eq('id', r.id);
    load();
  };

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="font-black mb-1">每月固定項目（{STORE_NAMES[store]}）</h2>
        <p className="text-xs text-slate-400 mb-3">在當月頁面按「帶入固定項目」就會加進大筆支出，例如貸款、勞退。</p>
        <form onSubmit={addItem} className="flex gap-2 mb-3">
          <input list="fixed-cats" placeholder="項目" value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} flex-1`} />
          <datalist id="fixed-cats">{BIG_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          <input inputMode="numeric" placeholder="金額" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} w-28 font-mono`} />
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 rounded-lg text-sm">新增</button>
        </form>
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
            <span className="font-bold">{it.name}</span>
            <div className="flex items-center gap-2">
              <input
                defaultValue={it.amount}
                onBlur={(e) => updateItemAmount(it, e.target.value)}
                className={`${inputCls} w-28 text-right font-mono py-1`}
                title={fmtMoney(it.amount)}
              />
              <button onClick={() => removeItem(it)} className="text-slate-300 hover:text-rose-500 px-1">✕</button>
            </div>
          </div>
        ))}
        {!items.length && <p className="text-sm text-slate-400">還沒有固定項目。</p>}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="font-black mb-1">錢櫃分類規則（兩店共用）</h2>
        <p className="text-xs text-slate-400 mb-3">匯入錢櫃時依「原因」比對，數字小的優先。沒對到的一律歸雜項。</p>
        <form onSubmit={addRule} className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          <input placeholder="關鍵字" value={rule.keyword} onChange={(e) => setRule({ ...rule, keyword: e.target.value })} className={inputCls} />
          <select value={rule.match} onChange={(e) => setRule({ ...rule, match: e.target.value as PosRule['match'] })} className={inputCls}>
            <option value="contains">包含</option>
            <option value="equals">完全相同</option>
          </select>
          <select value={rule.action} onChange={(e) => setRule({ ...rule, action: e.target.value as PosRule['action'] })} className={inputCls}>
            <option value="category">歸類到</option>
            <option value="transfer">轉存（不算）</option>
            <option value="refund">退款（不算）</option>
          </select>
          <input
            placeholder="分類"
            disabled={rule.action !== 'category'}
            value={rule.category ?? ''}
            onChange={(e) => setRule({ ...rule, category: e.target.value })}
            className={`${inputCls} disabled:opacity-40`}
          />
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm py-2">儲存</button>
        </form>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-1.5 font-mono text-xs text-slate-400 w-8">{r.priority}</td>
                  <td className="py-1.5 font-bold">「{r.keyword}」</td>
                  <td className="py-1.5 text-slate-500 text-xs">{r.match === 'equals' ? '完全相同' : '包含'}</td>
                  <td className="py-1.5">{r.action === 'category' ? r.category : ACTION_LABEL[r.action]}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => removeRule(r)} className="text-slate-300 hover:text-rose-500 px-1">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
