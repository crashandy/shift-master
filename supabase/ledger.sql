-- 18度雞 月記帳：資料表與權限
-- 在 Supabase → SQL Editor 貼上整份執行一次即可（可重複執行）。
--
-- 安全設計：記帳資料只有 ledger_owners 裡的 Email 登入後才讀寫得到。
-- 員工入口與現有後台用的是公開 anon key，對這些資料表完全沒有權限。

create table if not exists ledger_owners (
  email text primary key
);

create or replace function is_ledger_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ledger_owners where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 每月結算數字（手動輸入）
create table if not exists ledger_months (
  store_id    text not null check (store_id in ('store1','store2')),
  month       date not null,                       -- 每月 1 號
  cash        integer,
  delivery    integer,
  line        integer,
  salary      integer,
  bonus       integer,
  other_labor integer,
  rent        integer,
  recorded_expense integer,                        -- 歷史匯入：原表「實支出」
  recorded_profit  integer,                        -- 歷史匯入：原表「總收益」
  use_recorded_totals boolean not null default false, -- 明細對不上的歷史月份，支出改用原表總數
  note        text,
  primary key (store_id, month)
);

-- 每一筆支出 / 其他收入
create table if not exists ledger_entries (
  id          bigserial primary key,
  store_id    text not null check (store_id in ('store1','store2')),
  month       date not null,
  entry_date  date,
  section     text not null check (section in ('daily','big','income_other')),
  category    text not null,
  name        text,
  amount      integer not null,
  source      text not null default 'manual' check (source in ('manual','pos','history','fixed')),
  pos_key     text unique,                         -- 錢櫃匯入去重：店|時間|金額|原因
  created_at  timestamptz not null default now()
);
create index if not exists ledger_entries_month_idx on ledger_entries (store_id, month);

-- 錢櫃「原因」關鍵字規則（匯入時學到的新規則也存在這裡）
create table if not exists ledger_pos_rules (
  id        serial primary key,
  keyword   text not null unique,
  match     text not null default 'contains' check (match in ('contains','equals')),
  action    text not null default 'category' check (action in ('category','transfer','refund')),
  category  text,
  priority  integer not null default 100
);

-- 每月固定的大筆支出（貸款、勞退……），一鍵帶入
create table if not exists ledger_fixed_items (
  id         serial primary key,
  store_id   text not null check (store_id in ('store1','store2')),
  name       text not null,
  amount     integer not null,
  sort_order integer not null default 100
);

do $$
declare t text;
begin
  foreach t in array array['ledger_owners','ledger_months','ledger_entries','ledger_pos_rules','ledger_fixed_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (is_ledger_owner()) with check (is_ledger_owner())', t);
  end loop;
end $$;

insert into ledger_pos_rules (keyword, match, action, category, priority) values
  ('存','contains','transfer',null,1), ('投','equals','transfer',null,1),
  ('金庫','contains','transfer',null,1), ('保險箱','contains','transfer',null,1),
  ('退','contains','refund',null,2), ('多算','contains','refund',null,2),
  ('炸油','contains','category','雜項',5),
  ('炸','contains','category','火鍋炸物',10), ('裕軒','contains','category','裕軒',10),
  ('蛤蠣','contains','category','蛤蠣',10), ('蛤蜊','contains','category','蛤蠣',10),
  ('牛奶','contains','category','牛奶',10), ('牛20瓶','contains','category','牛奶',10)
on conflict (keyword) do nothing;

-- ★ 最後一步：把下面的 Email 換成你在 Supabase Authentication 建立的帳號，再執行這一行
-- insert into ledger_owners (email) values ('你的Email') on conflict do nothing;
