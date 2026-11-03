// 伺服器端專用：掃描肚肚點餐頁 → 存進 Supabase → 有新異常時推播 LINE
import { createClient } from '@supabase/supabase-js';
import { MenuCheckResult, countItemIssues, parseMenuData } from '@/lib/menuConfig';
import { fetchDudooMenu } from '@/lib/dudooApi';

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function scanMenu(): Promise<MenuCheckResult> {
  const r = await fetchDudooMenu();
  if (r.menuStatus !== 200 || !r.data || !Array.isArray(r.data.item) || r.data.item.length === 0) {
    throw new Error(`取得肚肚菜單失敗（HTTP ${r.menuStatus}）`);
  }
  return { checkedAt: new Date().toISOString(), ...parseMenuData(r.data) };
}

// 把異常項目整理成一串文字，用來判斷「跟上一次比有沒有變」
function issueSignature(result: MenuCheckResult) {
  const items = result.categories.flatMap((c) =>
    c.items.filter((i) => i.status !== 'ok').map((i) => `${i.name}:${i.status}`)
  );
  return [...items, ...result.tagIssues].sort().join('|');
}

function buildLineMessage(result: MenuCheckResult) {
  const lines: string[] = ['🐔 18度雞 品項監測警示'];
  for (const c of result.categories) {
    for (const i of c.items) {
      if (i.status === 'soldout') lines.push(`❌ 售完：${i.name}`);
      if (i.status === 'missing') lines.push(`🚫 未上架：${i.name}`);
    }
  }
  for (const t of result.tagIssues) lines.push(`⚠️ 鍋燒加選：${t}`);
  return lines.join('\n').slice(0, 4900);
}

async function pushLine(text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_TO; // 使用者 ID 或群組 ID
  if (!token || !to) return false; // 沒設定就不推播

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) console.error('LINE 推播失敗：', res.status, await res.text());
  return res.ok;
}

export async function scanAndSave(options: { notify: boolean }) {
  const supabase = getServerSupabase();
  const result = await scanMenu();
  const itemIssues = countItemIssues(result);
  const tagIssues = result.tagIssues.length;

  // 上一次的結果（用來避免同樣的異常每小時重複推播）
  const { data: prev } = await supabase
    .from('menu_checks')
    .select('result')
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('menu_checks').insert({
    checked_at: result.checkedAt,
    item_issues: itemIssues,
    tag_issues: tagIssues,
    result,
  });
  if (error) throw new Error(`寫入資料庫失敗：${error.message}`);

  let notified = false;
  const hasIssues = itemIssues + tagIssues > 0;
  const changed = !prev?.result || issueSignature(prev.result) !== issueSignature(result);
  if (options.notify && hasIssues && changed) {
    notified = await pushLine(buildLineMessage(result));
  }

  return { result, itemIssues, tagIssues, notified };
}
