// 管理頁「立即掃描」按鈕用：馬上掃一次並存進資料庫（不推播 LINE）
import { NextResponse } from 'next/server';
import { scanAndSave, scanMenu } from '@/lib/menuCheckRunner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const { result } = await scanAndSave({ notify: false });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 測試用：瀏覽器打開 /api/menu-check 可看到即時掃描結果（不存資料庫、不推播）
export async function GET() {
  try {
    return NextResponse.json(await scanMenu());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
