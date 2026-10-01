// 兼容面：原内联主脚本的顶层绑定是全局的，浏览器测试（page.evaluate）与本机调试一直按全局名读它们（cur、viewer、go…）。
// 拆成模块后在 window 上挂同名只读 getter，读到的是各模块的活绑定。只读：要改状态走各模块的 set*() 或公开接口（window.EdenMap）。
// 新代码不要依赖这些全局名；这里只加不减，名单变了要同步 docs/design/arch-v2.md §4。
import { esc, jsonCache, post, toImg } from './util.mjs';
import { M, REG, aspect, cur, curData, sleeping, viewer } from './state.mjs';
import { lean, tier } from './sharpness-tiers.mjs';
import { LANG, nm, setTheme, t } from './i18n.mjs';
import { main } from './boot.mjs';
import { fadeAway, go } from './map-switch.mjs';
import { est, estFocus, openEstate, setEstFail } from './subpage3d-host.mjs';
import { closeCard, showCard } from './markers.mjs';
import { hereRes, jumpHere } from './locate.mjs';
import { TCSettings, renderAbout, showLay, showSet } from './settings.mjs';
import { LS, chatId } from './extension-api.mjs';
const G = { toImg: () => toImg, viewer: () => viewer, aspect: () => aspect, M: () => M, REG: () => REG, cur: () => cur, tier: () => tier, sleeping: () => sleeping, esc: () => esc, post: () => post, jsonCache: () => jsonCache, LANG: () => LANG, nm: () => nm, setTheme: () => setTheme, main: () => main, fadeAway: () => fadeAway, go: () => go, est: () => est, setEstFail: () => setEstFail, openEstate: () => openEstate, estFocus: () => estFocus, closeCard: () => closeCard, hereRes: () => hereRes, jumpHere: () => jumpHere, TCSettings: () => TCSettings, showSet: () => showSet, showLay: () => showLay, chatId: () => chatId, LS: () => LS, renderAbout: () => renderAbout, curData: () => curData, lean: () => lean, t: () => t, showCard: () => showCard };
for (const [k, g] of Object.entries(G)) { try { Object.defineProperty(window, k, { get: g, configurable: true }); } catch (e) {} }
