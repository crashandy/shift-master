-- 18度雞 排班：員工自己登記「想當代理人」
-- 在 Supabase → SQL Editor 貼上整份執行一次即可（可重複執行）。
--
-- 跟劃休一樣是「意願」，最後由管理者在後台按「+代」決定當天代理人。

do $$
declare id_type text;
begin
  -- employee_id 跟 employees.id 用同一種型別
  select format_type(atttypid, atttypmod) into id_type
  from pg_attribute
  where attrelid = 'public.employees'::regclass and attname = 'id';

  execute format($f$
    create table if not exists deputy_requests (
      id          uuid primary key default gen_random_uuid(),
      employee_id %s not null references employees(id) on delete cascade,
      date        date not null,
      created_at  timestamptz not null default now(),
      unique (employee_id, date)
    )$f$, id_type);
end $$;

alter table deputy_requests enable row level security;

drop policy if exists "deputy_requests_all" on deputy_requests;
create policy "deputy_requests_all" on deputy_requests
  for all to anon, authenticated
  using (true) with check (true);
