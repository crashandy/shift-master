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
    // 找出所有 mealItem 區塊，看品項名稱實際長什麼樣子
    const mealPositions: number[] = [];
    let idx = html.indexOf('class="mealItem');
    while (idx !== -1 && mealPositions.length < 500) {
      mealPositions.push(idx);
      idx = html.indexOf('class="mealItem', idx + 1);
    }
    const stripTags = (t: string) => t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const toEntity = (t: string) => Array.from(t).map((c) => `&#${c.codePointAt(0)};`).join('');
    const toUnicode = (t: string) =>
      Array.from(t).map((c) => '\\u' + c.codePointAt(0)!.toString(16).padStart(4, '0')).join('');
    const probe = (word: string) => ({
      raw: html.includes(word),
      htmlEntity: html.includes(toEntity(word)),
      unicodeEscape: html.toLowerCase().includes(toUnicode(word).toLowerCase()),
    });

    return NextResponse.json({
      status: res.status,
      htmlLength: html.length,
      mealItemCount: mealPositions.length,
      words: {
        鍋燒: probe('鍋燒'),
        厚奶酥: probe('厚奶酥'),
        可樂: probe('可樂'),
        薯條: probe('薯條'),
      },
      firstMealItemsText: mealPositions.slice(0, 8).map((p) => stripTags(html.slice(p, p + 800)).slice(0, 150)),
      firstMealItemRaw: mealPositions.length ? html.slice(mealPositions[0] - 50, mealPositions[0] + 1200) : '',
      bodyTextSample: stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')).slice(0, 1500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
