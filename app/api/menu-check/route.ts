import { NextResponse } from 'next/server';
import { DUDOO_MENU_URL, parseMenuHtml } from '@/lib/menuConfig';

// 每次都即時抓取，不要被快取
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const res = await fetch(DUDOO_MENU_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `點餐頁回應異常（HTTP ${res.status}）` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const result = parseMenuHtml(html);

    return NextResponse.json({ checkedAt: new Date().toISOString(), ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `連線失敗：${message}` }, { status: 500 });
  }
}
