'use client';

// 記帳專用的 Supabase 連線：用老闆的帳號登入（Supabase Auth），
// 登入狀態只存在這個瀏覽器分頁（關掉分頁就要重新輸入密碼）。
// 跟員工入口 / 後台用的 supabase 連線分開，互不影響。
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function ledgerDb(): SupabaseClient {
  if (client) return client;
  client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      storageKey: '18c_ledger_auth',
      storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}
