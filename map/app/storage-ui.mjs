// 设置「数据与映射」页（从 viewer.html 内联脚本拆出，arch-v2 §6 第 6 步 settings-ui 第一块）：本机存储占用（EdenMap.storage()）、
// 当前数据来源（EdenMap.sources()，数据源注册表 tavern/sources.mjs），只读；「清理旧聊天」只留最近 5 个聊天的地图数据。
// 读查看器经典脚本的全局：$、esc、tx、post。查看器经 window.renderStorage 调用（模块在 main 之前执行）。
export function renderStorage(d) {
  const box = $('#storBox'); if (!box) return;
  const kb = n => (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB', s = d?.storage, src = d?.sources;
  if (!d) { box.innerHTML = `<h3>${esc(tx('s.stor', '存储与数据来源'))}</h3><small>${esc(tx('s.stor_local', '单独打开时没有聊天数据；嵌在酒馆里才显示'))}</small>`; return; }
  const loc = { mvu: tx('s.src_mvu', 'MVU 变量'), db: tx('s.src_db', '数据库插件表'), none: tx('s.src_none', '聊天标签 / 未读到') }[src?.location] || '—';
  const ch = src?.characters ? Object.entries(src.characters).map(([k, v]) => `${k} ${v}`).join(' · ') : '—';
  box.innerHTML = `<h3>${esc(tx('s.stor', '存储与数据来源'))}</h3>`
    + `<div class="hrow"><span>${esc(tx('s.stor_used', '地图占用本机存储'))}</span><b>${s ? esc(kb(s.ours)) : '—'}</b></div>`
    + (s ? `<small>${esc(tx('s.stor_detail', '全站共 {t}；头像 {a}；{n} 个聊天', { t: kb(s.total), a: kb(s.avatars), n: s.chats }))}</small>` : '')
    + `<div class="hrow"><span>${esc(tx('s.src_loc', '当前地点来自'))}</span><span>${esc(loc)}</span></div>`
    + `<div class="hrow"><span>${esc(tx('s.src_mode', '变量读取方式'))}</span><span>${esc(src?.mvu?.mode || '—')}</span></div>`
    + `<div class="hrow"><span>${esc(tx('s.src_chars', '人物来源'))}</span><span>${esc(ch)}</span></div>`
    + (Array.isArray(src?.list) ? `<div class="hrow"><span>${esc(tx('s.src_list', '在读的来源'))}</span><span>${esc(src.list.filter(x => x.active).map(x => tx('s.src_' + x.id, x.id)).join(' · ') || '—')}</span></div>` : '')
    + `<div class="hrow"><span>${esc(tx('s.stor_clean', '清理旧聊天的地图数据'))}</span><button type="button" class="btn" id="storClean">${esc(tx('s.stor_clean_btn', '清理'))}</button></div>`
    + (d.cleaned ? `<small role="status">${esc(d.cleaned.limited ? tx('s.stor_limited', '刚清理过，请 {s} 秒后再试', { s: d.cleaned.wait || 10 }) : d.cleaned.error ? tx('s.stor_fail', '清理失败') : tx('s.stor_cleaned', '已清理 {n} 个聊天，释放 {b}', { n: d.cleaned.n, b: kb(d.cleaned.bytes) }))}</small>` : '');
  // 清理不可撤销：第一次点只变成「再点一次确认（删除 N 个旧聊天）」，5 秒内再点才发（架构评审 P1）
  const cb = $('#storClean'), old = typeof d.cleanable === 'number' ? d.cleanable : Math.max(0, (s?.chats || 0) - 5); let armed = 0;
  if (!old) { cb.disabled = true; cb.title = tx('s.stor_none', '没有可清理的旧聊天'); }
  cb.onclick = () => { if (Date.now() - armed < 5000) { armed = 0; cb.disabled = true; post({ type: 'eden-map:storage-clean' }); return; }
    armed = Date.now(); cb.textContent = tx('s.stor_confirm', `再点一次确认：删除 ${old} 个旧聊天的地图数据（不能撤销）`, { n: old });
    setTimeout(() => { if (armed && Date.now() - armed >= 5000 && cb.isConnected) { armed = 0; cb.textContent = tx('s.stor_clean_btn', '清理'); } }, 5100); };
}
if (typeof window !== 'undefined') window.renderStorage = renderStorage;
