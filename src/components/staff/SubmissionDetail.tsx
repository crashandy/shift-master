'use client';

// 顯示一筆清潔清點紀錄的明細（員工頁、後台共用）
import { ChecklistSubmission, isItemDone } from '@/lib/checklists';

export default function SubmissionDetail({ s }: { s: ChecklistSubmission }) {
  return (
    <div className="px-3 pb-3 text-sm space-y-1">
      {s.items.map((i) => {
        const done = isItemDone(i);
        return (
          <div key={i.item_id} className={`flex justify-between gap-2 ${done ? 'text-slate-500' : 'text-rose-600 font-bold'}`}>
            <span>
              {i.section ? <span className="text-slate-400">[{i.section}] </span> : null}
              {i.title}
            </span>
            <span className="shrink-0">
              {i.input_type === 'number' ? (i.value ? `${i.value} ${i.unit ?? ''}` : '未填') : i.checked ? '✓' : '✗ 未完成'}
            </span>
          </div>
        );
      })}
      {s.note && <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">📝 {s.note}</div>}
    </div>
  );
}
