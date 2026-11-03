// 給 Supabase 排程（pg_cron）每小時呼叫的網址
import { NextRequest, NextResponse } from 'next/server';
import { isInMonitorWindow } from '@/lib/menuConfig';
import { scanAndSave } from '@/lib/menuCheckRunner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // 驗證密碼，避免外人一直呼叫
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 不在偵測時段就跳過（加 ?force=1 可強制執行，方便測試）
  const force = req.nextUrl.searchParams.get('force') === '1';
  if (!force && !isInMonitorWindow(new Date())) {
    return NextResponse.json({ skipped: true, reason: '不在偵測時段' });
  }

  try {
    const { itemIssues, tagIssues, notified } = await scanAndSave({ notify: true });
    return NextResponse.json({ ok: true, itemIssues, tagIssues, notified });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
