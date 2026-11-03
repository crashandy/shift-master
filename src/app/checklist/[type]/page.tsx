'use client';

// 開店清潔清點表 / 每日清潔確認單 / 收店清潔確認單（共用同一個頁面）
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import StaffShell, { EmployeeSelect } from '@/components/staff/StaffShell';
import SubmissionDetail from '@/components/staff/SubmissionDetail';
import { StaffSession } from '@/lib/staffSession';
import {
  CHECKLISTS,
  ChecklistItem,
  ChecklistSubmission,
  ChecklistType,
  SubmissionItem,
  businessDate,
  fmtBusinessDate,
  fmtTime,
  isChecklistType,
  isItemDone,
} from '@/lib/checklists';

export default function ChecklistPage() {
  const params = useParams<{ type: string }>();
  const type = params?.type;

  if (!isChecklistType(type)) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">找不到這張表單</div>;
  }

  const meta = CHECKLISTS[type];
  return (
    <StaffShell title={meta.title} icon={meta.icon}>
      {(ctx) => <ChecklistForm type={type} {...ctx} />}
    </StaffShell>
  );
}

function ChecklistForm({
  type,
  session,
  update,
  employees,
}: {
  type: ChecklistType;
  session: StaffSession;
  update: (s: StaffSession) => void;
  employees: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [values, setValues] = useState<Record<string, { checked: boolean; value: string }>>({});
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [todayList, setTodayList] = useState<ChecklistSubmission[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const bizDate = businessDate();

  const loadToday = useCallback(async () => {
    const { data } = await supabase
      .from('checklist_submissions')
      .select('*')
      .eq('store', session.store)
      .eq('list_type', type)
      .eq('business_date', bizDate)
      .order('submitted_at', { ascending: false });
    setTodayList((data ?? []) as ChecklistSubmission[]);
  }, [session.store, type, bizDate]);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('checklist_items')
      .select('*')
      .eq('store', session.store)
      .eq('list_type', type)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setItems((data ?? []) as ChecklistItem[]);
        setLoading(false);
      });
    loadToday();
  }, [session.store, type, loadToday]);

  // 依分區分組
  const groups = useMemo(() => {
    const out: { section: string; items: ChecklistItem[] }[] = [];
    for (const it of items) {
      const sec = it.section?.trim() || '';
      const last = out[out.length - 1];
      if (last && last.section === sec) last.items.push(it);
      else out.push({ section: sec, items: [it] });
    }
    return out;
  }, [items]);

  const valOf = (id: string) => values[id] ?? { checked: false, value: '' };
  const setVal = (id: string, patch: Partial<{ checked: boolean; value: string }>) =>
    setValues((prev) => ({ ...prev, [id]: { ...valOf(id), ...patch } }));

  const doneCount = items.filter((it) => isItemDone({ input_type: it.input_type, ...valOf(it.id) })).length;

  const handleSubmit = async () => {
    if (!session.employeeId || !session.employeeName) {
      alert('請先選擇填寫人！');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (items.length === 0) return;
    const missing = items.length - doneCount;
    if (missing > 0 && !confirm(`還有 ${missing} 項沒有完成，確定要送出嗎？`)) return;

    const snapshot: SubmissionItem[] = items.map((it) => ({
      item_id: it.id,
      section: it.section,
      title: it.title,
      input_type: it.input_type,
      unit: it.unit,
      checked: valOf(it.id).checked,
      value: valOf(it.id).value.trim(),
    }));

    setSaving(true);
    const { error } = await supabase.from('checklist_submissions').insert({
      store: session.store,
      list_type: type,
      business_date: bizDate,
      employee_id: session.employeeId,
      employee_name: session.employeeName,
      items: snapshot,
      done_count: doneCount,
      total_count: items.length,
      note: note.trim() || null,
    });
    setSaving(false);

    if (error) {
      alert(`送出失敗：${error.message}`);
      return;
    }
    alert('✅ 已送出，辛苦了！');
    setValues({});
    setNote('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadToday();
  };

  return (
    <>
      <EmployeeSelect session={session} update={update} employees={employees} />

      {/* 今日已填紀錄 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="text-xs font-bold text-slate-400 mb-2">營業日 {fmtBusinessDate(bizDate)} 已送出</div>
        {todayList.length === 0 ? (
          <div className="text-sm font-bold text-rose-500">今天還沒有人填寫</div>
        ) : (
          <div className="space-y-2">
            {todayList.map((s) => (
              <div key={s.id} className="border border-slate-200 rounded-xl">
                <button
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  className="w-full flex justify-between items-center px-3 py-2 text-sm"
                >
                  <span className="font-bold text-slate-700">
                    {fmtTime(s.submitted_at)}・{s.employee_name}
                  </span>
                  <span className={`font-bold ${s.done_count === s.total_count ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {s.done_count}/{s.total_count} {openId === s.id ? '▲' : '▼'}
                  </span>
                </button>
                {openId === s.id && <SubmissionDetail s={s} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 填寫表單 */}
      {loading ? (
        <div className="text-center text-slate-400 py-8">載入項目中...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400">
          這張表還沒有設定項目，請店長到後台「表單設定」新增。
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.section || '_'} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {g.section && (
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm font-black text-slate-600">
                  {g.section}
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {g.items.map((it) => {
                  const v = valOf(it.id);
                  const done = isItemDone({ input_type: it.input_type, ...v });
                  return it.input_type === 'number' ? (
                    <label key={it.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={`flex-1 font-bold ${done ? 'text-slate-400' : 'text-slate-800'}`}>{it.title}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={v.value}
                        onChange={(e) => setVal(it.id, { value: e.target.value })}
                        className="w-24 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-right font-bold text-base outline-none focus:border-indigo-500"
                        placeholder="0"
                      />
                      <span className="w-8 text-sm text-slate-500">{it.unit}</span>
                    </label>
                  ) : (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setVal(it.id, { checked: !v.checked })}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50"
                    >
                      <span
                        className={`w-7 h-7 shrink-0 rounded-lg border-2 flex items-center justify-center text-sm font-black transition ${
                          v.checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className={`font-bold ${v.checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {it.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <label className="block bg-white rounded-2xl border border-slate-200 p-4">
            <span className="block text-xs font-bold text-slate-400 mb-1.5">備註（選填）</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="有異常或需要店長注意的事項可以寫在這裡"
              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-base outline-none focus:border-indigo-500"
            />
          </label>

          <div className="sticky bottom-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black py-4 rounded-2xl shadow-lg transition text-lg"
            >
              {saving ? '送出中...' : `送出（已完成 ${doneCount}/${items.length}）`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
