// 调试面（S5-3，取代原兼容面 legacy-globals.mjs）：浏览器探针（page.evaluate）与本机调试只读 window.ViewerDebug.<名>，
// 不再散挂 33 个 window 全局（cur、viewer、go…）。读到的是各模块的活绑定；只读：要改状态走各模块的 set*() 或公开接口（window.EdenMap）。
// 名字用 docs/naming.md 表 D 的新名（osdViewer、mapRegistry、currentMapId…）。产品代码不读这里（grep 可证）；只加不减，名单变了要同步
// tests/app_modules.test.mjs。
import { esc } from './dom-helpers.mjs';
import { jsonCache } from './json-cache.mjs';
import { post } from './protocol-stamp.mjs';
import { toImg } from './coordinates.mjs';
import { worldData, mapRegistry, aspect, currentMapId, currentMapData, sleeping, osdViewer } from './state.mjs';
import { lean, tier } from './sharpness-tiers.mjs';
import { LANG, localName, setTheme, uiText } from './i18n.mjs';
import { main } from './boot.mjs';
import { fadeAway, go } from './map-switch.mjs';
import { subpageSession, estFocus, openEstate, setEstFail } from './subpage3d-host.mjs';
import { closeCard, showCard } from './markers.mjs';
import { hereRes, jumpHere } from './locate.mjs';
import { renderAbout, showLay, showSet } from './settings.mjs';
import { packStorage, chatId } from './extension-api.mjs';
import { describeTabs } from './tabs.mjs';
import { raf } from './raf-probe.mjs';
const G = {
  toImg: () => toImg, osdViewer: () => osdViewer, aspect: () => aspect, worldData: () => worldData, mapRegistry: () => mapRegistry, currentMapId: () => currentMapId,
  currentMapData: () => currentMapData, tier: () => tier, sleeping: () => sleeping, esc: () => esc, post: () => post, jsonCache: () => jsonCache,
  LANG: () => LANG, localName: () => localName, uiText: () => uiText, setTheme: () => setTheme, main: () => main, fadeAway: () => fadeAway, go: () => go,
  subpageSession: () => subpageSession, setEstFail: () => setEstFail, openEstate: () => openEstate, estFocus: () => estFocus, closeCard: () => closeCard,
  showCard: () => showCard, hereRes: () => hereRes, jumpHere: () => jumpHere, showSet: () => showSet, showLay: () => showLay,
  chatId: () => chatId, packStorage: () => packStorage, renderAbout: () => renderAbout, lean: () => lean, tabs: () => describeTabs, raf: () => raf,
};
const debug = {};
for (const [k, g] of Object.entries(G)) Object.defineProperty(debug, k, { get: g, enumerable: true });
try { Object.defineProperty(window, 'ViewerDebug', { value: Object.freeze(debug), configurable: true }); } catch (e) {}
