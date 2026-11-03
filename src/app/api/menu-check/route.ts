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
    // 品項是用 JavaScript 載入的：找出載入菜單的 API 與判斷「售完」的程式片段
    const contexts = (pattern: RegExp, before: number, after: number, max: number) => {
      const out: string[] = [];
      for (const m of html.matchAll(pattern)) {
        const i = m.index ?? 0;
        out.push(html.slice(Math.max(0, i - before), i + after));
        if (out.length >= max) break;
      }
      return out;
    };

    // 所有出現過的 API 路徑（含相對路徑）
    const apiPaths = Array.from(
      new Set(html.match(/["'`](?:https?:\/\/[^"'`\s]*)?\/api\/[^"'`\s]+["'`]/g) ?? [])
    );

    return NextResponse.json({
      apiPaths,
      // 跟菜單相關的 ajax / fetch 呼叫
      menuAjax: contexts(/(url\s*:|\$\.(get|post|ajax)\(|fetch\()[^\n]{0,200}menu/gi, 300, 900, 6),
      // tmpDisabled（售完反灰）是怎麼判斷的
      disabledLogic: contexts(/tmpDisabled\s*=/g, 600, 400, 4),
      // 品項區塊是怎麼組出來的
      mealItemTemplate: contexts(/class="mealItem row/g, 2500, 1500, 1),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
