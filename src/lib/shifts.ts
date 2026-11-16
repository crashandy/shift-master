// 班別共用設定（員工班表、入口首頁、後台共用）
export type ShiftType = 'normal' | 'open' | 'half' | 'off' | 'none';

export interface Shift {
  id?: string;
  employee_id: string;
  date: string;
  shift_type: ShiftType;
  is_night: boolean;
  is_deputy?: boolean;
  store: string;
}

export const SHIFT_META: Record<
  Exclude<ShiftType, 'none'>,
  { label: string; short: string; time: string; pill: string; soft: string; dot: string }
> = {
  normal: { label: '正常班', short: '正常', time: '18:30–00:30', pill: 'bg-sky-600 text-white', soft: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-600' },
  open: { label: '開店班', short: '開店', time: '18:30–00:30', pill: 'bg-emerald-600 text-white', soft: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-600' },
  half: { label: '半天班', short: '半天', time: '21:00–00:30', pill: 'bg-amber-500 text-white', soft: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  off: { label: '排休', short: '排休', time: '', pill: 'bg-rose-500 text-white', soft: 'bg-rose-50 text-rose-600 border-rose-200', dot: 'bg-rose-500' },
};

export const isWorking = (t?: ShiftType) => t === 'normal' || t === 'open' || t === 'half';

/** 'YYYY-MM-DD' */
export const ymd = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
