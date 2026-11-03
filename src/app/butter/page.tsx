'use client';

// 奶酥醬製作清單：登記製作時間、口味、重量
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import StaffShell, { EmployeeSelect } from '@/components/staff/StaffShell';
import { StaffSession } from '@/lib/staffSession';
import {
  ButterBatch,
  ButterFlavor,
  fmtDateTime,
  taipeiLocalInputToIso,
  toTaipeiLocalInput,
} from '@/lib/checklists';

export default function ButterPage() {
  return (
    <StaffShell title="奶酥醬製作清單" icon="🧈">
      {(ctx) => <ButterForm {...ctx} />}
    </StaffShell>
  );
}

function ButterForm({
  session,
  update,
  employees,
}: {
  session: StaffSession;
  update: (s: StaffSession) => void;
  employees: { id: string; name: string }[];
}) {
  const [flavors, setFlavors] = useState<ButterFlavor[]>([]);
  const [flavor, setFlavor] = useState('');
  const [weight, setWeight] = useState('');
  const [madeAt, setMadeAt] = useState(() => toTaipeiLocalInput());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<ButterBatch[]>([]);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from('butter_batches')
      .select('*')
      .eq('store', session.store)
      .order('made_at', { ascending: false })
      .limit(30);
    setRecent((data ?? []) as ButterBatch[]);
  }, [session.store]);

  useEffect(() => {
    supabase
      .from('butter_flavors')
      .select('*')
      .order('sort_order', { ascending: true })
      .then(({ data }) => setFlavors((data ?? []) as ButterFlavor[]));
    loadRecent();
  }, [loadRecent]);

  const handleSubmit = async () => {
    if (!session.employeeId || !session.employeeName) return alert('請先選擇填寫人！');
    if (!flavor) return alert('請選擇製作口味！');
    const w = Number(weight);
    if (!weight || isNaN(w) || w <= 0) return alert('請輸入正確的製作重量（公克）！');
    if (!madeAt) return alert('請輸入製作時間！');

    setSaving(true);
    const { error } = await supabase.from('butter_batches').insert({
      store: session.store,
      made_at: taipeiLocalInputToIso(madeAt),
      flavor,
      weight_g: w,
      employee_id: session.employeeId,
      employee_name: session.employeeName,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) return alert(`送出失敗：${error.message}`);

    alert(`✅ 已登記：${flavor} ${w.toLocaleString()} g`);
    setFlavor('');
    setWeight('');
    setNote('');
    setMadeAt(toTaipeiLocalInput());
    loadRecent();
  };

  const handleDelete = async (b: ButterBatch) => {
    if (!confirm(`確定要刪除「${fmtDateTime(b.made_at)} ${b.flavor} ${b.weight_g} g」這筆紀錄嗎？`)) return;
    const { error } = await supabase.from('butter_batches').delete().eq('id', b.id);
    if (error) return alert(`刪除失敗：${error.message}`);
    loadRecent();
  };

  return (
    <>
      <EmployeeSelect session={session} update={update} employees={employees} />

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <div>
          <div className="text-xs font-bold text-slate-400 mb-2">製作口味</div>
          {flavors.length === 0 ? (
            <div className="text-sm text-slate-400">尚未設定口味，請店長到後台「表單設定」新增。</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {flavors.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFlavor(f.name)}
                  className={`py-3 px-2 rounded-xl text-sm font-bold border transition ${
                    flavor === f.name
                      ? 'bg-amber-500 text-white border-amber-500 shadow'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-amber-50'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block">
          <span className="block text-xs font-bold text-slate-400 mb-1.5">製作重量</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="例如 1500"
              className="flex-1 p-3 rounded-xl bg-slate-50 border border-slate-200 text-lg font-bold outline-none focus:border-indigo-500"
            />
            <span className="font-bold text-slate-500">公克 (g)</span>
          </div>
        </label>

        <label className="block">
          <span className="block text-xs font-bold text-slate-400 mb-1.5">製作時間</span>
          <input
            type="datetime-local"
            value={madeAt}
            onChange={(e) => setMadeAt(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-base font-bold outline-none focus:border-indigo-500"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-bold text-slate-400 mb-1.5">備註（選填）</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：批號、放置位置"
            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-base outline-none focus:border-indigo-500"
          />
        </label>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black py-4 rounded-2xl shadow-lg transition text-lg"
        >
          {saving ? '送出中...' : '登記製作'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="text-xs font-bold text-slate-400 mb-2">最近製作紀錄</div>
        {recent.length === 0 ? (
          <div className="text-sm text-slate-400">還沒有紀錄</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((b) => (
              <div key={b.id} className="py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800">
                    {b.flavor} <span className="text-amber-600">{Number(b.weight_g).toLocaleString()} g</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {fmtDateTime(b.made_at)}・{b.employee_name}
                    {b.note ? `・${b.note}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(b)}
                  className="text-slate-300 hover:text-rose-500 px-2 py-1 text-xs"
                  title="刪除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
