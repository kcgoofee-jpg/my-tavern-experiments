// 天城 · 设置里的「变量映射」（v0.9.5，换卡兼容）：卡内脚本发来 { card, paths, map, user, detected, mode }（tavern/adapter.mjs），
// 这里列出每一项读哪个 stat_data 路径（下拉从实际的变量树里选，「自动」= 默认 / 自动找到的），旅行方式关键词，重置。改动发回卡内脚本，按角色卡存本机。
// 只在嵌在酒馆里时显示。读查看器的全局：esc、post、LANG。
const TCVarMap = (() => {
  const T = (k, zh, v = {}) => { const r = window.I18N?.t?.(k, v); if (r && r !== k) return r; return Object.entries(v).reduce((s, [a, b]) => s.split('{' + a + '}').join(b), zh); };
  let d = null, open = false;
  const F = [['location', '当前地点', 'Location'], ['time', '时刻', 'Time'], ['period', '时段', 'Period'], ['date', '日期', 'Date'], ['outfit', '主角着装', 'Outfit'],
    ['present', '在场人物表', 'Present table'], ['members', '成员表', 'Members table'], ['targets', '目标表', 'Targets table'], ['reputation', '声望', 'Reputation'], ['stageField', '阶段字段名', 'Stage field']];
  const MODES = [['air', '空中（虚线弧）', 'Air (dashed arc)'], ['rail', '轨道（实线）', 'Rail (solid)'], ['road', '地面（实线）', 'Ground (solid)'], ['underground', '地下（点线）', 'Underground (dotted)'], ['teleport', '传送（只画两端）', 'Teleport (endpoints only)']];
  const DEF_KW = { air: '私人悬浮载具、悬浮载具、悬浮车、悬浮机动装置、飞行器、飞艇', rail: '跨城高速运输管道、运输管道、悬浮轨道、地面轨道、轨道', road: '步行连廊、货运通道、步行、走路', underground: '地铁、地道、地下通道', teleport: '' };
  const en = () => (typeof LANG !== 'undefined' && LANG === 'en');
  const L = r => (en() ? r[2] : r[1]);
  const MODE_T = { mvu: ['vm.mode_mvu', 'MVU'], 'mvu-partial': ['vm.mode_partial', 'MVU（没找到地点字段）'], tags: ['vm.mode_tags', '聊天标签（没有 MVU）'] };
  function render() {
    const pop = document.getElementById('setPop'); if (!pop) return;
    let box = document.getElementById('vmBox');
    if (!d) { box?.remove(); return; }
    if (!box) { box = document.createElement('details'); box.id = 'vmBox'; const at = document.getElementById('selfCheck'); at ? pop.insertBefore(box, at) : pop.appendChild(box);
      box.addEventListener('toggle', () => { open = box.open; }); box.addEventListener('change', onChange); box.addEventListener('click', onClick); }
    box.open = open;
    const opt = (p, cur) => `<option value="${esc(p.path)}" ${p.path === cur ? 'selected' : ''}>${esc(p.path)}</option>`;
    const kw = d.user?.keywords || null;
    box.innerHTML = `<summary><h3>${esc(T('vm.title', '变量映射'))}</h3><small>${esc(T(...(MODE_T[d.mode] || MODE_T.tags)))}</small></summary>`
      + `<small>${esc(T('vm.hint', '换了别的角色卡、字段名不一样时，在这里指定地图读哪个变量。按角色卡存在本机；「自动」= 默认或自动找到的'))}</small>`
      + F.map(f => { const u = d.user?.[f[0]] || '', auto = d.detected?.[f[0]] || '';
        return `<label class="vm-row"><span>${esc(L(f))}</span><select data-f="${f[0]}"><option value="">${esc(T('vm.auto', '自动：{p}', { p: auto || T('vm.none', '无') }))}</option>${(d.paths || []).map(p => opt(p, u)).join('')}</select></label>`; }).join('')
      + `<h4>${esc(T('vm.kw', '交通方式关键词（顿号或逗号分隔）'))}</h4>`
      + MODES.map(m => `<label class="vm-row vm-kw"><span>${esc(L(m))}</span><input type="text" data-kw="${m[0]}" value="${esc((kw?.[m[0]] || (kw ? [] : null))?.join?.('、') ?? DEF_KW[m[0]])}"></label>`).join('')
      + `<label><span>${esc(T('vm.fantasy', '加上通用奇幻词（飞行法宝、御剑、遁地、传送阵、瞬移、传送）'))}</span><input type="checkbox" role="switch" id="vmFantasy" ${d.user?.fantasy ? 'checked' : ''}></label>`
      + `<button type="button" class="btn" data-vmreset="1">${esc(T('vm.reset', '全部恢复自动'))}</button>`;
  }
  function collect() {
    const box = document.getElementById('vmBox'), u = {};
    for (const s of box.querySelectorAll('select[data-f]')) if (s.value) u[s.dataset.f] = s.value;
    const kw = {}; let changed = false;
    for (const i of box.querySelectorAll('input[data-kw]')) { kw[i.dataset.kw] = i.value.split(/[、,，;；\s]+/).map(x => x.trim()).filter(Boolean); if (kw[i.dataset.kw].join('、') !== DEF_KW[i.dataset.kw]) changed = true; }
    if (changed) u.keywords = kw;
    if (box.querySelector('#vmFantasy').checked) u.fantasy = true;
    return u;
  }
  function onChange(e) { e.stopPropagation(); post({ type: 'eden-map:varmap-set', user: collect() }); }
  function onClick(e) { const b = e.target.closest('[data-vmreset]'); if (!b) return; e.stopPropagation(); post({ type: 'eden-map:varmap-set', user: {} }); }
  function set(x) { d = x; render(); }
  const css = `
  #vmBox{margin-top:var(--sp-5);padding-top:var(--sp-5);border-top:1px solid var(--line)}
  #vmBox summary{display:flex;align-items:baseline;gap:var(--sp-4);min-height:var(--hit,44px);cursor:pointer;list-style:none}
  #vmBox summary::-webkit-details-marker{display:none}
  #vmBox summary h3{margin:0}#vmBox summary small{margin:0;color:var(--muted)}
  #vmBox summary::after{content:'';margin-left:auto;width:7px;height:7px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(45deg);align-self:center}
  #vmBox[open] summary::after{transform:rotate(-135deg)}
  #vmBox h4{margin:var(--sp-5) 0 var(--sp-3);font-size:var(--fs-small);color:var(--muted);font-weight:600}
  #vmBox .vm-row{display:grid;grid-template-columns:minmax(6em,auto) 1fr;gap:var(--sp-4);align-items:center;min-height:var(--hit,44px)}
  #vmBox .vm-row span{font-size:var(--fs-small);color:var(--ink-2)}
  #vmBox select,#vmBox input[type=text]{min-width:0;width:100%;min-height:36px;box-sizing:border-box;font:inherit;font-size:var(--fs-control);color:var(--ink);background:var(--bg);border:1px solid var(--line-strong);border-radius:var(--r-m);padding:4px 8px}
  #vmBox .btn{margin-top:var(--sp-4);min-height:var(--hit,44px)}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  return { set, render, get data() { return d; } };
})();
