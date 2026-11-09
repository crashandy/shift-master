// 月記帳：型別、錢櫃 CSV 解析與分類、月結算、匯出
// 這個檔案不依賴 React / Supabase，方便單獨測試。

export type LedgerStore = 'store1' | 'store2';
export type Section = 'daily' | 'big' | 'income_other';
export type EntrySource = 'manual' | 'pos' | 'history' | 'fixed';

export interface LedgerEntry {
  id?: number;
  store_id: LedgerStore;
  month: string; // YYYY-MM-01
  entry_date: string | null; // YYYY-MM-DD
  section: Section;
  category: string;
  name: string | null;
  amount: number;
  source: EntrySource;
  pos_key?: string | null;
}

export interface LedgerMonth {
  store_id: LedgerStore;
  month: string;
  cash: number | null;
  delivery: number | null;
  line: number | null;
  salary: number | null;
  bonus: number | null;
  other_labor: number | null;
  rent: number | null;
  recorded_expense: number | null;
  recorded_profit: number | null;
  use_recorded_totals: boolean;
  note: string | null;
}

export interface PosRule {
  id?: number;
  keyword: string;
  match: 'contains' | 'equals';
  action: 'category' | 'transfer' | 'refund';
  category: string | null;
  priority: number;
}

export interface FixedItem {
  id?: number;
  store_id: LedgerStore;
  name: string;
  amount: number;
  sort_order: number;
}

export const SECTION_LABEL: Record<Section, string> = {
  daily: '每日支出',
  big: '大筆支出',
  income_other: '其他收入',
};

// 每日支出的固定品項（月報表左邊那幾列）
export const DAILY_CATEGORIES = ['火鍋炸物', '裕軒', '蛤蠣', '牛奶', '雜項'];

// 大筆支出常用項目（從歷史月報表整理），輸入時可直接選，也可以打新的
export const BIG_CATEGORIES = [
  '菜肉奶油', '電費', '水費', '貸款', '勞退', '健保', '勞保', '雞蛋', '吐司', '餐具',
  '港點', '會計', '運費', '設備', '意麵', '茶粉', '泡菜', '冬瓜', '叻沙', '飲料', 'COSTCO', '瓦斯',
];

// 預設的錢櫃分類規則（資料庫沒有規則時使用；資料庫的規則會蓋過這些）
export const DEFAULT_POS_RULES: PosRule[] = [
  { keyword: '存', match: 'contains', action: 'transfer', category: null, priority: 1 },
  { keyword: '投', match: 'equals', action: 'transfer', category: null, priority: 1 },
  { keyword: '金庫', match: 'contains', action: 'transfer', category: null, priority: 1 },
  { keyword: '保險箱', match: 'contains', action: 'transfer', category: null, priority: 1 },
  { keyword: '退', match: 'contains', action: 'refund', category: null, priority: 2 },
  { keyword: '多算', match: 'contains', action: 'refund', category: null, priority: 2 },
  { keyword: '炸油', match: 'contains', action: 'category', category: '雜項', priority: 5 },
  { keyword: '炸', match: 'contains', action: 'category', category: '火鍋炸物', priority: 10 },
  { keyword: '裕軒', match: 'contains', action: 'category', category: '裕軒', priority: 10 },
  { keyword: '蛤蠣', match: 'contains', action: 'category', category: '蛤蠣', priority: 10 },
  { keyword: '蛤蜊', match: 'contains', action: 'category', category: '蛤蠣', priority: 10 },
  { keyword: '牛奶', match: 'contains', action: 'category', category: '牛奶', priority: 10 },
  { keyword: '牛20瓶', match: 'contains', action: 'category', category: '牛奶', priority: 10 },
];

// ---------- 小工具 ----------

export const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-01`;

export const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

export const fmtMoney = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

// ---------- 錢櫃 CSV ----------

export interface PosRow {
  businessDate: string; // 營業日
  time: string;
  staff: string;
  type: string; // 留存金 / 取出 / 存放 / 取消
  reason: string;
  amount: number;
}

/** 解析一行 CSV（支援雙引號與逗號） */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 解析 POS 匯出的錢櫃管理 CSV */
export function parsePosCsv(text: string): PosRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx('營業日'), iTime = idx('時間'), iStaff = idx('人員'),
    iType = idx('類型'), iReason = idx('原因'), iAmt = idx('金額');
  if (iDate < 0 || iType < 0 || iAmt < 0) {
    throw new Error('看不懂這個檔案：找不到「營業日 / 類型 / 金額」欄位，請確認是錢櫃管理匯出的 CSV。');
  }
  return lines.slice(1).map((l) => {
    const c = splitCsvLine(l);
    return {
      businessDate: (c[iDate] ?? '').trim(),
      time: (c[iTime] ?? '').trim(),
      staff: (c[iStaff] ?? '').trim(),
      type: (c[iType] ?? '').trim(),
      reason: (c[iReason] ?? '').trim(),
      amount: Number(String(c[iAmt] ?? '0').replace(/,/g, '')) || 0,
    };
  });
}

export type PosDecision =
  | { action: 'category'; category: string; matched: string | null }
  | { action: 'transfer' | 'refund'; matched: string };

/** 依規則判斷一筆「取出」是什麼；沒有符合的規則就歸雜項（matched = null） */
export function classifyReason(reason: string, rules: PosRule[]): PosDecision {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    const hit = r.match === 'equals' ? reason === r.keyword : reason.includes(r.keyword);
    if (!hit) continue;
    if (r.action === 'category') return { action: 'category', category: r.category || '雜項', matched: r.keyword };
    return { action: r.action, matched: r.keyword };
  }
  return { action: 'category', category: '雜項', matched: null };
}

export const posKey = (store: LedgerStore, row: PosRow) =>
  `${store}|${row.time}|${row.amount}|${row.reason}`;

/** 只取「取出」的資料（只看支出） */
export const posWithdrawals = (rows: PosRow[]) =>
  rows.filter((r) => r.type === '取出' && r.amount !== 0);

// ---------- 月結算 ----------

export interface MonthSummary {
  income: number; // 現金 + 外送 + LINE
  expense: number; // 每日 + 大筆
  dailyExpense: number;
  bigExpense: number;
  otherIncome: number; // 不計入總收益（跟原本月報表一樣）
  rent: number;
  labor: number; // 薪資 + 獎金 + 其他人力
  profit: number;
  byCategory: { section: Section; category: string; total: number; count: number }[];
  usingRecorded: boolean;
}

export function summarize(entries: LedgerEntry[], m: LedgerMonth | null): MonthSummary {
  const sum = (xs: LedgerEntry[]) => xs.reduce((s, e) => s + e.amount, 0);
  const daily = entries.filter((e) => e.section === 'daily');
  const big = entries.filter((e) => e.section === 'big');
  const other = entries.filter((e) => e.section === 'income_other');

  const map = new Map<string, { section: Section; category: string; total: number; count: number }>();
  for (const e of entries) {
    const k = `${e.section}|${e.category}`;
    const cur = map.get(k) ?? { section: e.section, category: e.category, total: 0, count: 0 };
    cur.total += e.amount;
    cur.count += 1;
    map.set(k, cur);
  }

  const usingRecorded = !!m?.use_recorded_totals && m.recorded_expense !== null;
  const expense = usingRecorded ? (m!.recorded_expense as number) : sum(daily) + sum(big);
  const income = (m?.cash ?? 0) + (m?.delivery ?? 0) + (m?.line ?? 0);
  const rent = m?.rent ?? 0;
  const labor = (m?.salary ?? 0) + (m?.bonus ?? 0) + (m?.other_labor ?? 0);

  return {
    income,
    expense,
    dailyExpense: sum(daily),
    bigExpense: sum(big),
    otherIncome: sum(other),
    rent,
    labor,
    // 對不上的歷史月份：總收益直接用原月報表的數字
    profit: usingRecorded && m!.recorded_profit !== null ? m!.recorded_profit : income - expense - rent - labor,
    byCategory: [...map.values()].sort((a, b) => b.total - a.total),
    usingRecorded,
  };
}

// ---------- 匯出（CSV，Excel 可直接開；加 BOM 避免中文亂碼） ----------

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvJoin = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

export function exportMonthCsv(storeName: string, month: string, entries: LedgerEntry[], m: LedgerMonth | null) {
  const s = summarize(entries, m);
  const rows: unknown[][] = [
    [`${storeName} ${month.slice(0, 7)} 月記帳`],
    [],
    ['結算'],
    ['實收現金', m?.cash ?? ''],
    ['實收(外送)', m?.delivery ?? ''],
    ['實收LINE', m?.line ?? ''],
    ['收入合計', s.income],
    ['實支出', s.expense],
    ['房租', s.rent],
    ['薪資', m?.salary ?? ''],
    ['獎金', m?.bonus ?? ''],
    ['其他人力', m?.other_labor ?? ''],
    ['總收益', s.profit],
    ['其他收入(不計入總收益)', s.otherIncome],
    [],
    ['分類小計'],
    ['類別', '分類', '筆數', '金額'],
    ...s.byCategory.map((c) => [SECTION_LABEL[c.section], c.category, c.count, c.total]),
    [],
    ['明細'],
    ['類別', '日期', '分類', '名稱', '金額', '來源'],
    ...[...entries]
      .sort((a, b) => (a.section + (a.entry_date ?? '')).localeCompare(b.section + (b.entry_date ?? '')))
      .map((e) => [SECTION_LABEL[e.section], e.entry_date ?? '', e.category, e.name ?? '', e.amount, SOURCE_LABEL[e.source]]),
  ];
  return csvJoin(rows);
}

export function exportMonthsOverviewCsv(storeName: string, months: LedgerMonth[], entries: LedgerEntry[]) {
  const header = ['月份', '實收現金', '實收(外送)', '實收LINE', '收入合計', '每日支出', '大筆支出', '實支出', '房租', '人力', '總收益', '其他收入'];
  const rows: unknown[][] = [[`${storeName} 每月總覽`], header];
  for (const m of [...months].sort((a, b) => a.month.localeCompare(b.month))) {
    const s = summarize(entries.filter((e) => e.month === m.month), m);
    rows.push([m.month.slice(0, 7), m.cash ?? '', m.delivery ?? '', m.line ?? '', s.income, s.dailyExpense, s.bigExpense, s.expense, s.rent, s.labor, s.profit, s.otherIncome]);
  }
  return csvJoin(rows);
}

export const SOURCE_LABEL: Record<EntrySource, string> = {
  manual: '手動',
  pos: '錢櫃',
  history: '歷史匯入',
  fixed: '固定項目',
};

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
