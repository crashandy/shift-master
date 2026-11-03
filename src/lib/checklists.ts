// 清潔清點表、奶酥醬共用的型別與工具

export type ChecklistType = 'opening' | 'daily' | 'closing';

export const CHECKLISTS: Record<ChecklistType, { title: string; icon: string; desc: string }> = {
  opening: { title: '開店清潔清點表', icon: '🧹', desc: '開店前的清潔與庫存清點' },
  daily: { title: '每日清潔確認單', icon: '✅', desc: '每天例行清潔項目' },
  closing: { title: '收店清潔確認單', icon: '🌙', desc: '收店前的清潔與關閉檢查' },
};

export const CHECKLIST_TYPES: ChecklistType[] = ['opening', 'daily', 'closing'];

export function isChecklistType(v: unknown): v is ChecklistType {
  return v === 'opening' || v === 'daily' || v === 'closing';
}

export interface ChecklistItem {
  id: string;
  store: string;
  list_type: ChecklistType;
  section: string | null;
  title: string;
  input_type: 'check' | 'number';
  unit: string | null;
  sort_order: number;
}

export interface SubmissionItem {
  item_id: string;
  section: string | null;
  title: string;
  input_type: 'check' | 'number';
  unit: string | null;
  checked: boolean;
  value: string;
}

export interface ChecklistSubmission {
  id: string;
  store: string;
  list_type: ChecklistType;
  business_date: string;
  employee_id: string | null;
  employee_name: string;
  items: SubmissionItem[];
  done_count: number;
  total_count: number;
  note: string | null;
  submitted_at: string;
}

export interface ButterFlavor {
  id: string;
  name: string;
  sort_order: number;
}

export interface ButterBatch {
  id: string;
  store: string;
  made_at: string;
  flavor: string;
  weight_g: number;
  employee_id: string | null;
  employee_name: string;
  note: string | null;
  created_at: string;
}

export const isItemDone = (i: { input_type: string; checked: boolean; value: string }) =>
  i.input_type === 'number' ? i.value.trim() !== '' : i.checked;

// ===== 時間工具（一律用台灣時間）=====
const TZ = 'Asia/Taipei';
export const BUSINESS_DAY_CUTOFF_HOUR = 4; // 凌晨 04:00 前算前一天的營業日

function taipeiParts(d: Date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
}

// 營業日 YYYY-MM-DD
export function businessDate(d: Date = new Date()) {
  const shifted = new Date(d.getTime() - BUSINESS_DAY_CUTOFF_HOUR * 3600 * 1000);
  const { y, m, d: dd } = taipeiParts(shifted);
  return `${y}-${m}-${dd}`;
}

// <input type="datetime-local"> 用的台灣時間字串
export function toTaipeiLocalInput(d: Date = new Date()) {
  const { y, m, d: dd, h, mi } = taipeiParts(d);
  return `${y}-${m}-${dd}T${h}:${mi}`;
}

// datetime-local 字串（台灣時間）→ ISO
export function taipeiLocalInputToIso(v: string) {
  return new Date(`${v}:00+08:00`).toISOString();
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: TZ,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-TW', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function fmtBusinessDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}（${wd}）`;
}
