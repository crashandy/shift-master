// 18度雞 品項監測：要檢查的品項與鍋燒加選標籤
// 菜單有增減時，改這個檔案就好

export const DUDOO_MENU_URL =
  'https://store.dudooeat.com/orderv2/menu/c5e254b96f03475e967c6a96225173e3';

export const MENU_DATABASE: Record<string, string[]> = {
  '🍜 鍋燒意麵系列': [
    '原味鍋燒', '古早味沙茶', '手作韓式泡菜', '手作黃金泡菜',
    '人氣奶香牛奶', '經典辣味奶香', '必點重慶辣椒',
    '泰式酸辣冬蔭功', '馬來西亞叻沙', '南洋檸檬香茅鍋',
  ],
  '🍞 厚奶酥厚片系列': [
    '復刻原味厚奶酥', '可可布朗尼厚奶酥', '宇治抹茶厚奶酥',
    '流沙花生厚奶酥', '草莓厚奶酥', '芋泥厚奶酥',
    '蒜香厚奶酥', '鹹蛋黃厚奶酥', '榛果厚奶酥', '咖啡厚奶酥',
    '伯爵茶厚奶酥', '鐵觀音厚奶酥', '開心果厚奶酥', '烏龍厚奶酥', '芝麻厚奶酥',
  ],
  '🥤 飲品系列': [
    '玄米綠茶(無糖)', '麥香紅茶(微糖)', '冬瓜茶', '鮮奶紅茶',
    '鮮奶冬瓜', '可爾必思', '罐裝烏龍', '可樂', '雪碧', '罐裝綠茶',
  ],
  '🍟 宵點炸物系列': [
    '炸物拼盤A', '炸物拼盤B', '炸物拼盤C',
    '薯餅', '小熱狗', '洋蔥圈', '薯條', '炸銀絲卷',
    '原味雞米花', '麥克雞塊', '起司豬排', '卡啦雞腿排',
  ],
  '🥟 私房點心系列': [
    '港式叉燒包(2入)', '香蒸流沙包(2入)', '蟹黃燒賣(3入)',
    '鮮蝦燒賣(3入)', '糯米珍珠丸(3入)', '香酥腐衣蝦捲(2條)',
    '酥炸鮮奶馬蹄條(3條)', '酥炸韭菜小春捲(2條)',
  ],
  '🍲 韓式豆腐煲系列': ['韓式海陸豆腐粉絲煲', '韓式味噌豆腐粉絲煲'],
};

export const REQUIRED_SUB_TAGS = [
  '加蛋', '加起司', '加一份肉4片', '加一份蛤蠣4顆',
  '加一份魚片2片', '加一份蝦3隻', '升級海陸鍋',
];

export type ItemStatus = 'ok' | 'soldout' | 'missing';

export interface MenuCheckResult {
  checkedAt: string;
  categories: { name: string; items: { name: string; status: ItemStatus }[] }[];
  tagIssues: string[];
}

// 與原本 Python 版相同的判斷邏輯
export function parseMenuHtml(html: string): Omit<MenuCheckResult, 'checkedAt'> {
  const categories = Object.entries(MENU_DATABASE).map(([name, items]) => ({
    name,
    items: items.map((item) => {
      const pos = html.indexOf(item);
      if (pos === -1) return { name: item, status: 'missing' as ItemStatus };

      // 往回看 400 字，找包住它的 <div class="mealItem ...">
      const prefix = html.slice(Math.max(0, pos - 400), pos);
      const boxStart = prefix.lastIndexOf('class="mealItem');
      let soldOut: boolean;
      if (boxStart !== -1) {
        soldOut = prefix.slice(boxStart, boxStart + 120).includes('item-disabled');
      } else {
        soldOut = html.slice(Math.max(0, pos - 200), pos + 200).includes('order_menu_sold_out');
      }
      return { name: item, status: (soldOut ? 'soldout' : 'ok') as ItemStatus };
    }),
  }));

  const tagIssues: string[] = [];
  for (const tag of REQUIRED_SUB_TAGS) {
    const pos = html.indexOf(tag);
    if (pos === -1) {
      tagIssues.push(`${tag}（後台未勾選/遺失）`);
    } else {
      const around = html.slice(Math.max(0, pos - 150), pos + 150).toLowerCase();
      if (around.includes('sold') || around.includes('disabled')) {
        tagIssues.push(`${tag}（顯示售完）`);
      }
    }
  }

  return { categories, tagIssues };
}

// ===== 自動偵測時段（台灣時間）=====
// 平日（一～五）17:00 起、假日（六、日）14:00 起，都偵測到隔天 03:00
export const WEEKDAY_START_HOUR = 17;
export const WEEKEND_START_HOUR = 14;
export const END_HOUR = 3; // 隔天 03:00（含）

function getTaipeiTime(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return { isWeekend: weekday === 'Sat' || weekday === 'Sun', hour };
}

// 00:00～03:00 屬於前一天晚上的營業時段，每天都會偵測
export function isInMonitorWindow(date: Date) {
  const { isWeekend, hour } = getTaipeiTime(date);
  if (hour <= END_HOUR) return true;
  return hour >= (isWeekend ? WEEKEND_START_HOUR : WEEKDAY_START_HOUR);
}

export function countItemIssues(result: Pick<MenuCheckResult, 'categories'>) {
  return result.categories.reduce(
    (sum, c) => sum + c.items.filter((i) => i.status !== 'ok').length,
    0
  );
}

// ===== 用肚肚的菜單資料 (JSON) 判斷，邏輯比照肚肚網頁本身 =====
/* eslint-disable @typescript-eslint/no-explicit-any */
const isTrue = (v: any) => v === true || v === 1 || v === '1' || v === 'true';

export function parseMenuData(data: any): Omit<MenuCheckResult, 'checkedAt'> {
  const items: any[] = Array.isArray(data?.item) ? data.item : [];
  const kioskOff = String(data?.config?.kiosk_enabled) === '0';

  const findItem = (name: string) =>
    items.find((v) => !isTrue(v.deleted) && !isTrue(v.pos_only) && String(v.item_name ?? '').trim() === name) ??
    items.find((v) => !isTrue(v.deleted) && !isTrue(v.pos_only) && String(v.item_name ?? '').includes(name));

  const categories = Object.entries(MENU_DATABASE).map(([name, list]) => ({
    name,
    items: list.map((itemName) => {
      const v = findItem(itemName);
      if (!v) return { name: itemName, status: 'missing' as ItemStatus };
      const soldOut = kioskOff || isTrue(v.disabled) || isTrue(v.stock_disabled);
      return { name: itemName, status: (soldOut ? 'soldout' : 'ok') as ItemStatus };
    }),
  }));

  // 加選標籤：在整份資料裡找名稱相符的物件
  const tagIssues: string[] = [];
  const nodes = findObjectsWithName(data, REQUIRED_SUB_TAGS);
  for (const tag of REQUIRED_SUB_TAGS) {
    const found = nodes.filter((n) => n.name === tag && !isTrue(n.obj.deleted));
    if (found.length === 0) {
      tagIssues.push(`${tag}（後台未勾選/遺失）`);
    } else if (found.every((n) => isTrue(n.obj.disabled) || isTrue(n.obj.stock_disabled) || isTrue(n.obj.sold_out))) {
      tagIssues.push(`${tag}（顯示售完）`);
    }
  }

  return { categories, tagIssues };
}

// 遞迴找出「某個字串欄位等於指定名稱」的物件
export function findObjectsWithName(root: any, names: string[]) {
  const out: { name: string; path: string; obj: any }[] = [];
  const walk = (node: any, path: string, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 8 || out.length > 200) return;
    if (!Array.isArray(node)) {
      for (const val of Object.values(node)) {
        if (typeof val === 'string' && names.includes(val.trim())) {
          out.push({ name: val.trim(), path, obj: node });
          break;
        }
      }
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, depth + 1);
  };
  walk(root, 'data', 0);
  return out;
}
