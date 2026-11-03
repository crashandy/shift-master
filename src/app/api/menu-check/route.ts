// 管理頁「立即掃描」按鈕用：馬上掃一次並存進資料庫（不推播 LINE）
import { NextResponse } from 'next/server';
import { scanAndSave } from '@/lib/menuCheckRunner';
import { DUDOO_MENU_URL } from '@/lib/menuConfig';

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

// 診斷用：瀏覽器打開 /api/menu-check 就能看到 Vercel 實際抓到什麼
export async function GET() {
  try {
    const res = await fetch(DUDOO_MENU_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9',
      },
      cache: 'no-store',
    });
    const html = await res.text();
    const scripts = Array.from(html.matchAll(/<script[^>]*src="([^"]+)"/g)).map((m) => m[1]);
    const apiHints = Array.from(
      new Set(html.match(/https?:\/\/[^"'\s<>]*(api|graphql)[^"'\s<>]*/gi) ?? [])
    ).slice(0, 20);

    return NextResponse.json({
      status: res.status,
      finalUrl: res.url,
      contentType: res.headers.get('content-type'),
      server: res.headers.get('server'),
      htmlLength: html.length,
      has原味鍋燒: html.includes('原味鍋燒'),
      hasMealItem: html.includes('mealItem'),
      looksLikeCloudflare: /cloudflare|cf-chl|just a moment/i.test(html),
      scripts: scripts.slice(0, 15),
      apiHints,
      htmlStart: html.slice(0, 1500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
