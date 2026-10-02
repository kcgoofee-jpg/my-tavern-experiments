// 地点卡「世界书档案」摘要（W8 / U-FIX-1）：把附加书条目的正文变成人能读的一段。
// 纯文本条目：去掉包裹标签、宏、机器块（[TOPO: …]）后压空白。
// 模板 / 脚本条目（含 <% … %>）：脚本本身不外露；只从脚本里的字符串字面量里挑一句提到这个地点的散文；挑不到就整条不显示。
// 纯函数，宿主（tavern/host-tavernhelper.mjs）调用；没有任何卡专有词。

const MACHINE = /\[[A-Z][A-Z_]{1,15}:[^\]]*\]/g;   // [TOPO: …] 这类给模型看的声明块
const squash = s => String(s || '').replace(/\s+/g, ' ').trim();
const tidy = s => squash(String(s || '').replace(MACHINE, ' ')).replace(/\s*[；;，,]\s*([。.])/g, '$1').replace(/\s+([；;，,。.])/g, '$1');
const prose = s => /[㐀-鿿]/.test(s) || /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(s);

// 脚本里的双引号字符串字面量（按 JSON 规则解码）
function literals(src) {
  const out = [];
  const re = /"((?:[^"\\\n]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src))) { try { out.push(JSON.parse(`"${m[1]}"`)); } catch (e) {} }
  return out;
}

export const isTemplate = content => /<%[\s\S]*?%>/.test(String(content || ''));

// 一条正文 → 摘要；null = 这条不该给人看
export function peekSummary(content, name = '') {
  const src = String(content || '');
  const nm = String(name || '').replace(/\s+/g, '');
  if (isTemplate(src)) {
    const hits = literals(src).map(tidy).filter(s => s.length >= 6 && prose(s) && !/[{};]\s*$|=>|\bconst\b|\bfunction\b/.test(s));
    // 触发词表里的词本身也是字面量：要比名字长、带句读的才算一句话
    const own = nm ? hits.filter(s => s.replace(/\s+/g, '').includes(nm) && s.length >= nm.length + 4 && /[。.：:，,（(；;]/.test(s)) : [];
    // 先要标题正是这个名字的那句（「某处：…」），再要不带标题的概况句（名字是层 / 区名时），再要以名字开头的，最后取第一句
    const flat = x => x.replace(/\s+/g, '');
    const title = x => (flat(x).match(/^([^：:，,。]{1,24})[：:]/) || [])[1];
    const pick = own.find(x => title(x) === nm) || own.find(x => !title(x)) || own.find(x => flat(x).startsWith(nm)) || own[0];
    return pick || null;
  }
  const text = tidy(src.replace(/\{\{[^}]*\}\}/g, ' ').replace(/<[^<>]*>/g, ' '));
  return text || null;
}

// 附加书条目 → 卡片抽屉要的 [{ name, summary }]（最多 limit 条）；按条目名 / 触发词匹配地点名
export function peekItems(entries, name, { limit = 3, noTitle = '' } = {}) {
  const nm = String(name || '').replace(/\s+/g, '');
  if (!nm) return [];
  const keyOf = e => (e?.strategy?.keys || e?.key || []).map(k => String(k || '').replace(/\s+/g, '')).filter(Boolean);
  const hit = e => (e?.name || '').replace(/\s+/g, '').includes(nm) || keyOf(e).some(k => k.includes(nm) || nm.includes(k));
  const out = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (out.length >= limit) break;
    if (!e || e.enabled === false || !hit(e)) continue;
    const summary = peekSummary(e.content, nm);
    if (summary) out.push({ name: e.name || noTitle, summary });
  }
  return out;
}
