// 「名称与用途」对话框的 HTML 构件（列表页 / 选择页 / 结果列表 / 编辑表单）：纯函数，状态由 custom.mjs 逐次传入，不读不写任何闭包状态（S5-1 自 custom.mjs 原样搬出；行为不变）。
import { esc } from './app/util.mjs';
export function createDialogView({ T }) {
  const KIND = { room: ['cu.room', '房间'], area: ['cu.area', '区域'], landmark: ['cu.landmark', '地标'], character: ['cu.character', '人物'], layer: ['cu.layer', '层 / 大区'], world: ['cu.world', '世界地名'] };
  const ic = d => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
  const IC = { x: 'M4 4l8 8M12 4l-8 8', back: 'M10 3L5 8l5 5', pin: 'M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 9.8 8 14 8 14zM8 8.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z', edit: 'M3 13h3l7-7-3-3-7 7v3z', plus: 'M8 3v10M3 8h10', undo: 'M4 6h6a3 3 0 0 1 0 6H6M4 6l3-3M4 6l3 3' };
  const excerpt = (s, n = 42) => { const a = [...String(s || '')]; return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
  function listHtml({ data, flyMsg, listQ, resetArm }) {
    const items = Object.entries(data.items || {});
    const add = `<button type="button" class="btn pri cu-add" data-pick="1">${ic(IC.plus)}<span>${esc(T('cu.add2', '添加：选房间、地标或人物'))}</span></button>`;
    const msg = flyMsg ? `<p class="cu-msg" role="status">${esc(flyMsg)}</p>` : '';
    if (!items.length) return add + msg + `<div class="cu-emptybox"><p>${esc(T('cu.empty2', '还没有自定义。可以给地点起个自己的叫法，或写一句用途；模型会把它当作背景。例如：'))}</p><ul>`
      + [[T('cu.ex1a', '书房'), T('cu.ex1b', '星图室'), T('cu.ex1', '整理旧地图')], [T('cu.ex2a', '7 号井黑市'), T('cu.ex2b', '老井'), T('cu.ex2', '周五下午去补货')], [T('cu.ex3a', '温室'), '', T('cu.ex3', '冬天在这里喝茶')]]
        .map(([a, b, c]) => `<li><b>${esc(a)}</b>${b ? ` → <b>${esc(b)}</b>` : ''}<small>${esc(T('cu.note', '用途'))}：${esc(c)}</small></li>`).join('') + `</ul></div>`;
    const lq = listQ.trim().toLowerCase(), shown = lq ? items.filter(([k, e]) => [k, e.名, e.用途, ...(e.别名 || [])].some(s => s && s.toLowerCase().includes(lq))) : items;
    const filt = items.length > 5 ? `<input type="search" id="cuLQ" class="cu-lq" autocomplete="off" aria-label="${esc(T('cu.list_search', '在已有的自定义里找'))}" placeholder="${esc(T('cu.list_search', '在已有的自定义里找'))}" value="${esc(listQ)}">` : '';
    return add + msg + filt + `<ul class="cu-cards">` + shown.map(([k, e]) => {
      const src = e.源 === '标签' ? ['tag', T('cu.src_tag', '剧情标签')] : ['man', T('cu.src_manual', '手动')], arm = resetArm === k;
      return `<li class="cu-card"><button type="button" class="cu-main" data-fly="${esc(k)}" aria-label="${esc(T('cu.fly_aria', '在地图上看 {n}', { n: e.名 || k }))}">`
        + `<span class="cu-names">${e.名 ? `<s>${esc(k)}</s><i aria-hidden="true">→</i><b>${esc(e.名)}</b>` : `<b>${esc(k)}</b>`}</span>`
        + (e.用途 ? `<span class="cu-ex">${esc(excerpt(e.用途))}</span>` : '')
        + `<span class="cu-tags"><em>${esc(T(...(KIND[e.类] || KIND.landmark)))}</em><em class="src-${src[0]}">${esc(src[1])}</em></span></button>`
        + ((e.别名 || []).length ? `<span class="cu-al"><small>${esc(T('cu.aliases', '也叫'))}</small>${e.别名.map(a => `<button type="button" class="chip" data-unalias="${esc(k)}" data-a="${esc(a)}" aria-label="${esc(T('cu.unalias', '去掉叫法 {a}', { a }))}">${esc(a)} ×</button>`).join('')}</span>` : '')   // v0.9.6：叫法（含「未上图」指派的）可单独去掉
        + `<span class="cu-acts"><button type="button" class="btn" data-edit="${esc(k)}">${ic(IC.edit)}<span>${esc(T('cu.edit', '编辑'))}</span></button>`
        + `<button type="button" class="btn${arm ? ' warn' : ''}" data-reset="${esc(k)}">${ic(IC.undo)}<span>${esc(arm ? T('cu.reset_sure', '确认重置') : T('cu.reset', '重置'))}</span></button>`
        + `<button type="button" class="btn" data-fly="${esc(k)}">${ic(IC.pin)}<span>${esc(T('cu.fly', '在地图上看'))}</span></button></span></li>`;
    }).join('') + `</ul>`;
  }
  function pickHtml({ gs, query }) {
    return `<div class="cu-search"><input type="search" id="cuQ" autocomplete="off" enterkeyhint="search" aria-controls="cuRes" aria-label="${esc(T('cu.search', '搜索名称、叫法或用途'))}" placeholder="${esc(T('cu.search', '搜索名称、叫法或用途'))}" value="${esc(query)}"></div>`
      + `<div class="cu-chips" role="group" aria-label="${esc(T('cu.groups', '分组'))}">${gs.map(g => `<button type="button" class="chip" data-jump="${esc(g.id)}">${esc(g.short || g.label)}</button>`).join('')}</div>`
      + `<div id="cuRes" class="cu-res"></div>`;
  }
  function resultsHtml(gs, entry) {
    return gs.map(g => `<section data-g="${esc(g.id)}"><h4>${esc(g.label)} <small>${g.items.length}</small></h4><ul>` + g.items.map(it => {
      const e = entry(it.key);
      return `<li><button type="button" class="cu-row" data-pickkey="${esc(it.key)}"><b>${esc(e?.名 || it.key)}</b>${e?.名 ? `<small>${esc(it.key)}</small>` : ''}${it.sub && !e?.用途 ? `<span>${esc(it.sub)}</span>` : ''}${e?.用途 ? `<span class="cu-u">${esc(T('cu.note', '用途'))}：${esc(excerpt(e.用途, 30))}</span>` : ''}</button>`
        + `<button type="button" class="cu-ic" data-fly="${esc(it.key)}" aria-label="${esc(T('cu.fly_aria', '在地图上看 {n}', { n: e?.名 || it.key }))}" title="${esc(T('cu.fly', '在地图上看'))}">${ic(IC.pin)}</button></li>`;
    }).join('') + `</ul></section>`).join('');
  }
  function editHtml({ editing, e, it, kd, MV }) {
    const nu = [...(e.用途 || '')].length;
    return `<form class="cu-form" novalidate><p class="cu-target"><b>${esc(editing)}</b><em>${esc(T(...(KIND[kd] || KIND.landmark)))}</em>${it ? `<small>${esc(it.group)}</small>` : ''}`
      + `<button type="button" class="btn" data-fly="${esc(editing)}">${ic(IC.pin)}<span>${esc(T('cu.fly', '在地图上看'))}</span></button></p>`
      + `<label class="col" for="cuName"><span>${esc(T('cu.name', '显示名'))} <small>${esc(T('cu.name_hint', '留空 = 用标准名'))}</small></span></label>`
      + `<input type="text" id="cuName" name="name" maxlength="${MV?.MAX_NAME || 40}" value="${esc(e.名 || '')}" placeholder="${esc(editing)}" aria-describedby="cuNameErr"><small class="cu-err" id="cuNameErr" aria-live="polite"></small>`
      + `<label class="col" for="cuNote"><span>${esc(T('cu.note', '用途'))} <small>${esc(T('cu.note_hint', '一句话，模型会当作背景'))}</small></span></label>`
      + `<textarea id="cuNote" name="note" rows="3" maxlength="${MV?.MAX_NOTE || 200}" aria-describedby="cuNoteCnt cuNoteErr">${esc(e.用途 || '')}</textarea>`
      + `<div class="cu-cnt"><small class="cu-err" id="cuNoteErr" aria-live="polite"></small><small id="cuNoteCnt">${nu} / ${MV?.MAX_NOTE || 200}</small></div>`
      + `<span class="cu-acts"><button type="submit" class="btn pri">${esc(T('cu.save', '保存'))}</button><button type="button" class="btn" data-back="1">${esc(T('cu.cancel', '取消'))}</button></span></form>`;
  }
  return { ic, IC, excerpt, listHtml, pickHtml, resultsHtml, editHtml };
}
