// Two sections of Settings -> 版权声明 that the map used to carry elsewhere or not at all (HEADER-1):
//   * the open map's own source line (what the (i) button on the map used to show; the button is gone, one place says it);
//   * 「相关项目」: the owner's tavern-wordcloud (public site and public repository only), links open in a new tab with rel=noopener. Engine-level text, not pack data.
// Appended by renderLicense (settings.mjs) before the disclaimer; DOM only, no storage.
import { mapRegistry, currentMapId } from './state.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { localName } from './i18n.mjs';

export const WORDCLOUD = { site: 'https://wordcloud.davidzhao.top', repo: 'https://github.com/kcgoofee-jpg/tavern-wordcloud' };
const label = t => { const b = document.createElement('b'); b.className = 'lic-h'; b.textContent = t; return b; };
const link = (k, zh, href) => { const r = document.createElement('div'), a = document.createElement('a'); r.className = 'row'; a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = href.replace(/^https:\/\//, '');
  r.append(Object.assign(document.createElement('span'), { textContent: uiTextOr(k, zh) }), a); return r; };
const CSS = '#licBox .lic-h{display:block;margin:var(--sp-4) 0 var(--sp-2)}#licBox .lic-p{display:block;margin:0 0 var(--sp-3);line-height:1.5;color:var(--ink-2)}#licBox a{color:var(--accent)}';
export function creditSections() {
  if (!document.getElementById('licExtraCss')) { const st = document.createElement('style'); st.id = 'licExtraCss'; st.textContent = CSS; document.head.append(st); }
  const out = [], m = currentMapId && mapRegistry?.maps[currentMapId], credit = m ? localName(m, 'credit') : '';
  if (credit) { out.push(label(uiTextOr('s.lic_this_map', '当前地图的素材来源'))); const p = document.createElement('small'); p.className = 'lic-p'; p.textContent = credit; out.push(p); }
  out.push(label(uiTextOr('s.lic_related', '相关项目')));
  const d = document.createElement('small'); d.className = 'lic-p'; d.textContent = uiTextOr('s.lic_wc', 'tavern-wordcloud：把聊天记录做成词云，在浏览器里本地完成，不上传聊天。'); out.push(d);
  out.push(link('s.lic_wc_site', '网页版', WORDCLOUD.site), link('s.lic_wc_repo', '源码仓库', WORDCLOUD.repo));
  return out;
}
