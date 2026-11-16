-- 18度雞 排班：每日代理人
-- 在 Supabase → SQL Editor 貼上整份執行一次即可（可重複執行）。
--
-- 代理人記在當天的班別上（shifts.is_deputy），
-- 同一間分店、同一天只能有一位代理人（由下方唯一索引保證）。

alter table shifts add column if not exists is_deputy boolean not null default false;

create unique index if not exists shifts_one_deputy_per_day
  on shifts (store, date)
  where is_deputy;
