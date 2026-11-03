'use client';

// 後台：編輯清潔清點表項目、奶酥口味
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CHECKLISTS, CHECKLIST_TYPES, ChecklistItem, ChecklistType, ButterFlavor } from '@/lib/checklists';

type Tab = ChecklistType | 'flavors';

export default function SettingsPanel({ store }: { store: 'store1' | 'store2' }) {
  const [tab, setTab] = useState<Tab>('opening');

  const tabs: { key: Tab; label: string }[] = [
    ...CHECKLIST_TYPES.map((t) => ({ key: t as Tab, label: `${CHECKLISTS[t].icon} ${CHECKLISTS[t].title}` })),
    { key: 'flavors', label: '🧈 奶酥口味' },
  ];

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap gap-2">
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
      {tab === 'flavors' ? <FlavorEditor /> : <ItemEditor store={store} type={tab} />}
    </div>
  );
}

// ===== 清潔清點項目 =====
function ItemEditor({ store, type }: { store: 'store1' | 'store2'; type: ChecklistType }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [draft, setDraft] = useState({ section: '', title: '', input_type: 'check' as 'check' | 'number', unit: '' });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('store', store)
      .eq('list_type', type)
      .order('sort_order', { ascending: true });
    setItems((data ?? []) as ChecklistItem[]);
  }, [store, type]);

  useEffect(() => {
    load();
  }, [load]);

  const saveField = async (id: string, patch: Partial<ChecklistItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from('checklist_items').update(patch).eq('id', id);
    if (error) {
      alert(`儲存失敗：${error.message}`);
      load();
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const list = [...items];
    [list[index], list[j]] = [list[j], list[index]];
    const reordered = list.map((it, idx) => ({ ...it, sort_order: idx + 1 }));
    setItems(reordered);
    await Promise.all(
      [reordered[index], reordered[j]].map((it) =>
        supabase.from('checklist_items').update({ sort_order: it.sort_order }).eq('id', it.id)
      )
    );
  };

  const remove = async (it: ChecklistItem) => {
    if (!confirm(`確定要刪除「${it.title}」嗎？（已送出的紀錄不受影響）`)) return;
    const { error } = await supabase.from('checklist_items').delete().eq('id', it.id);
    if (error) return alert(`刪除失敗：${error.message}`);
    load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
    const { error } = await supabase.from('checklist_items').insert({
      store,
      list_type: type,
      section: draft.section.trim() || null,
      title: draft.title.trim(),
      input_type: draft.input_type,
      unit: draft.input_type === 'number' ? draft.unit.trim() || null : null,
      sort_order: maxOrder + 1,
    });
    if (error) return alert(`新增失敗：${error.message}`);
    setDraft({ ...draft, title: '', unit: '' });
    load();
  };

  const inputCls = 'p-2 rounded-lg bg-slate-50 border border-slate-200 text-sm outline-none focus:border-indigo-500 focus:bg-white';

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-black text-slate-800">{CHECKLISTS[type].title}：項目設定</h2>
        <span className="text-xs text-slate-400">修改後離開欄位即自動儲存；分區相同的項目會排在一起顯示</span>
      </div>

      <div className="space-y-2">
        <div className="hidden md:grid grid-cols-[60px_130px_1fr_110px_80px_40px] gap-2 text-xs font-bold text-slate-400 px-1">
          <span>排序</span>
          <span>分區</span>
          <span>項目名稱</span>
          <span>填寫方式</span>
          <span>單位</span>
          <span />
        </div>
        {items.map((it, idx) => (
          <div
            key={it.id}
            className="grid grid-cols-2 md:grid-cols-[60px_130px_1fr_110px_80px_40px] gap-2 items-center border border-slate-100 md:border-0 rounded-xl p-2 md:p-1"
          >
            <div className="flex gap-1">
              <button onClick={() => move(idx, -1)} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs">▲</button>
              <button onClick={() => move(idx, 1)} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs">▼</button>
            </div>
            <input
              defaultValue={it.section ?? ''}
              placeholder="分區"
              onBlur={(e) => e.target.value !== (it.section ?? '') && saveField(it.id, { section: e.target.value.trim() || null })}
              className={inputCls}
            />
            <input
              defaultValue={it.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== it.title && saveField(it.id, { title: e.target.value.trim() })}
              className={`${inputCls} col-span-2 md:col-span-1 font-bold`}
            />
            <select
              value={it.input_type}
              onChange={(e) => saveField(it.id, { input_type: e.target.value as 'check' | 'number' })}
              className={inputCls}
            >
              <option value="check">打勾</option>
              <option value="number">填數量</option>
            </select>
            <input
              defaultValue={it.unit ?? ''}
              placeholder={it.input_type === 'number' ? '單位' : '—'}
              disabled={it.input_type !== 'number'}
              onBlur={(e) => e.target.value !== (it.unit ?? '') && saveField(it.id, { unit: e.target.value.trim() || null })}
              className={`${inputCls} disabled:opacity-40`}
            />
            <button onClick={() => remove(it)} className="text-slate-300 hover:text-rose-500 text-sm" title="刪除">
              ✕
            </button>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm text-slate-400 py-2">目前沒有項目</div>}
      </div>

      <form onSubmit={add} className="mt-5 pt-4 border-t border-slate-200 grid grid-cols-2 md:grid-cols-[130px_1fr_110px_80px_auto] gap-2">
        <input value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })} placeholder="分區（選填）" className={inputCls} />
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="新項目名稱" className={`${inputCls} font-bold`} />
        <select
          value={draft.input_type}
          onChange={(e) => setDraft({ ...draft, input_type: e.target.value as 'check' | 'number' })}
          className={inputCls}
        >
          <option value="check">打勾</option>
          <option value="number">填數量</option>
        </select>
        <input
          value={draft.unit}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
          placeholder="單位"
          disabled={draft.input_type !== 'number'}
          className={`${inputCls} disabled:opacity-40`}
        />
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm">
          ＋ 新增項目
        </button>
      </form>
    </div>
  );
}

// ===== 奶酥口味 =====
function FlavorEditor() {
  const [flavors, setFlavors] = useState<ButterFlavor[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('butter_flavors').select('*').order('sort_order', { ascending: true });
    setFlavors((data ?? []) as ButterFlavor[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= flavors.length) return;
    const list = [...flavors];
    [list[index], list[j]] = [list[j], list[index]];
    const reordered = list.map((f, idx) => ({ ...f, sort_order: idx + 1 }));
    setFlavors(reordered);
    await Promise.all(
      [reordered[index], reordered[j]].map((f) => supabase.from('butter_flavors').update({ sort_order: f.sort_order }).eq('id', f.id))
    );
  };

  const rename = async (f: ButterFlavor, v: string) => {
    if (!v.trim() || v.trim() === f.name) return;
    const { error } = await supabase.from('butter_flavors').update({ name: v.trim() }).eq('id', f.id);
    if (error) alert(`儲存失敗：${error.message}`);
    load();
  };

  const remove = async (f: ButterFlavor) => {
    if (!confirm(`確定要刪除口味「${f.name}」嗎？（已登記的製作紀錄不受影響）`)) return;
    const { error } = await supabase.from('butter_flavors').delete().eq('id', f.id);
    if (error) return alert(`刪除失敗：${error.message}`);
    load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const maxOrder = flavors.reduce((m, f) => Math.max(m, f.sort_order), 0);
    const { error } = await supabase.from('butter_flavors').insert({ name: name.trim(), sort_order: maxOrder + 1 });
    if (error) return alert(error.code === '23505' ? '這個口味已經存在了！' : `新增失敗：${error.message}`);
    setName('');
    load();
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-black text-slate-800">奶酥醬口味清單（兩間店共用）</h2>
        <span className="text-xs text-slate-400">修改名稱後離開欄位即自動儲存</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {flavors.map((f, idx) => (
          <div key={f.id} className="flex items-center gap-2 border border-slate-100 rounded-xl p-2">
            <button onClick={() => move(idx, -1)} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs">▲</button>
            <button onClick={() => move(idx, 1)} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs">▼</button>
            <input
              defaultValue={f.name}
              onBlur={(e) => rename(f, e.target.value)}
              className="flex-1 p-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white"
            />
            <button onClick={() => remove(f)} className="text-slate-300 hover:text-rose-500 text-sm px-1" title="刪除">✕</button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="mt-4 pt-4 border-t border-slate-200 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新口味名稱"
          className="flex-1 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500"
        />
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm">
          ＋ 新增口味
        </button>
      </form>
    </div>
  );
}
