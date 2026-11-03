// 管理頁「立即掃描」按鈕用：馬上掃一次並存進資料庫（不推播 LINE）
import { NextRequest, NextResponse } from 'next/server';
import { scanAndSave } from '@/lib/menuCheckRunner';
import { fetchDudooMenu } from '@/lib/dudooApi';
import { REQUIRED_SUB_TAGS, findObjectsWithName, parseMenuData } from '@/lib/menuConfig';

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

// 診斷用：瀏覽器打開 /api/menu-check 看肚肚菜單資料的實際內容
// 可加參數測試：/api/menu-check?orderType=onsite&mealTimeId=123
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const r = await fetchDudooMenu({
      mealTimeId: sp.get('mealTimeId') ?? undefined,
      orderType: sp.get('orderType') ?? undefined,
    });
    const d: any = r.data;
    const items: any[] = Array.isArray(d?.item) ? d.item : [];

    // 網頁裡 mealTimeId 是怎麼決定的
    const html = r.pageHtml;
    const mealTimeContexts: string[] = [];
    for (const m of html.matchAll(/mealTimeI[dD]\s*=|id=["']mealTimeID["']/g)) {
      const i = m.index ?? 0;
      mealTimeContexts.push(html.slice(Math.max(0, i - 200), i + 300));
      if (mealTimeContexts.length >= 4) break;
    }

    const primitiveConfig: Record<string, unknown> = {};
    if (d?.config && typeof d.config === 'object') {
      for (const [k, v] of Object.entries(d.config)) {
        if (v === null || typeof v !== 'object') primitiveConfig[k] = v;
      }
    }

    const tagNodes = findObjectsWithName(d, REQUIRED_SUB_TAGS).slice(0, 10);

    return NextResponse.json({
      pageStatus: r.pageStatus,
      menuStatus: r.menuStatus,
      csrfFound: r.csrfFound,
      mealTimeIdUsed: r.mealTimeIdUsed,
      mealTimeCandidates: r.mealTimeCandidates,
      orderTypeUsed: r.orderTypeUsed,
      isJson: d !== null,
      rawStart: d === null ? r.rawStart : undefined,
      topLevelKeys: d && typeof d === 'object' ? Object.keys(d) : [],
      config: primitiveConfig,
      itemCount: items.length,
      itemNames: items.slice(0, 120).map((v) =>
        `${v.item_name}${v.disabled ? ' [disabled]' : ''}${v.stock_disabled ? ' [stock_disabled]' : ''}${v.deleted == '1' ? ' [deleted]' : ''}${v.pos_only == '1' ? ' [pos_only]' : ''}`
      ),
      firstItem: items[0] ?? null,
      tagNodes: tagNodes.map((n) => ({ path: n.path, obj: n.obj })),
      parsedPreview: d ? parseMenuData(d) : null,
      mealTimeContexts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
