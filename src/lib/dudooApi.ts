// 伺服器端專用：模擬瀏覽器向肚肚要「菜單資料」(JSON)
// 流程：先開點餐頁拿 cookie + CSRF token → 再 POST /order/getMenu

const STORE_ID = 'c5e254b96f03475e967c6a96225173e3';
const PAGE_URL = `https://store.dudooeat.com/orderv2/menu/${STORE_ID}`;
const MENU_API = 'https://store.dudooeat.com/order/getMenu';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cookieHeaderFrom(res: Response) {
  const list =
    typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
  return list
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

// 從網頁裡找出可能的用餐時段 ID
function findMealTimeIds(html: string) {
  const ids = new Set<string>();
  for (const re of [
    /id=["']mealTimeID["'][^>]*value=["']([^"']*)["']/gi,
    /value=["']([^"']*)["'][^>]*id=["']mealTimeID["']/gi,
    /meal_time_id["']?\s*[:=]\s*["']?(\d+)/gi,
    /mealTimeI[dD]\s*=\s*["']?(\d+)/g,
  ]) {
    for (const m of html.matchAll(re)) if (m[1]) ids.add(m[1]);
  }
  return Array.from(ids);
}

export interface DudooMenuFetch {
  pageStatus: number;
  menuStatus: number;
  csrfFound: boolean;
  mealTimeIdUsed: string;
  mealTimeCandidates: string[];
  orderTypeUsed: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rawStart: string;
  pageHtml: string;
}

export async function fetchDudooMenu(
  opts: { mealTimeId?: string; orderType?: string } = {}
): Promise<DudooMenuFetch> {
  // 1. 開點餐頁，取得 cookie 與 CSRF token
  const pageRes = await fetch(PAGE_URL, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9' },
    cache: 'no-store',
  });
  const pageHtml = await pageRes.text();
  const cookie = cookieHeaderFrom(pageRes);
  const csrf =
    pageHtml.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    pageHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i)?.[1] ??
    '';

  const mealTimeCandidates = findMealTimeIds(pageHtml);
  const mealTimeId = opts.mealTimeId ?? mealTimeCandidates[0] ?? '';
  const orderType = opts.orderType ?? 'takeout';

  // 2. 跟瀏覽器一樣 POST 要菜單
  const body = new URLSearchParams({
    storeID: STORE_ID,
    meal_time_id: mealTimeId,
    platform: 'web',
    menuType: 'kiosk',
    orderType,
    lang: 'zh-TW',
  });
  const menuRes = await fetch(MENU_API, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-CSRF-TOKEN': csrf,
      Origin: 'https://store.dudooeat.com',
      Referer: PAGE_URL,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
    cache: 'no-store',
  });
  const raw = await menuRes.text();
  let data: unknown = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  return {
    pageStatus: pageRes.status,
    menuStatus: menuRes.status,
    csrfFound: !!csrf,
    mealTimeIdUsed: mealTimeId,
    mealTimeCandidates,
    orderTypeUsed: orderType,
    data,
    rawStart: raw.slice(0, 800),
    pageHtml,
  };
}
