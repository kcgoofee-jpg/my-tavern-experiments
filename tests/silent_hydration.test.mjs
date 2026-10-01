// 任务二（世界书静默水合与全局绑定代理）+ 任务四（宿主上下文穿透）。
// 两个模块的**判定**部分都是纯函数，喂桩即可覆盖：wb_jit.bindPlan（挂哪儿 / 不动已挂的）
// 与 mvu-bridge.cardInfo（三级降级 + 「读不到 ≠ 未接入」的安全占位）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPlan } from '../map/tavern/worldbook-jit.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';

const API = { chat: true, char: true, global: true };

test('静默绑定：已经挂着的（任何一处）一律不动 —— 绝不改用户的选择', () => {
  assert.equal(bindPlan({ global: true }, { api: API }), 'none');
  assert.equal(bindPlan({ global: false, char: true, chat: false }, { api: API }), 'none');
  assert.equal(bindPlan({ global: false, char: false, chat: true }, { api: API }), 'none');
});

test('静默绑定：一处都没挂 → 按 聊天 > 角色附加书 > 全局 挑第一档可用接口', () => {
  const none = { global: false, char: false, chat: false };
  assert.equal(bindPlan(none, { api: API }), 'chat');
  assert.equal(bindPlan(none, { api: { chat: false, char: true, global: true } }), 'char');
  assert.equal(bindPlan(none, { api: { chat: false, char: false, global: true } }), 'global');
  assert.equal(bindPlan(none, { api: { chat: false, char: false, global: false } }), 'none');   // 没接口：只在日志留 trace
  assert.equal(bindPlan(null, { api: API }), 'chat');                                          // 查不了绑定（老版本接口缺）= 当没挂
  assert.equal(bindPlan({}, {}), 'chat');                                                      // 没给 api：按「都能用」算
});

function withGlobals(fn) {
  const hadWin = 'window' in globalThis, hadParent = 'parent' in globalThis;
  globalThis.window = globalThis;
  return (async () => { try { return await fn(); }
    finally {
      for (const k of ['getCharData', 'SillyTavern', 'parent']) { try { delete globalThis[k]; } catch (e) {} }
      if (hadParent) globalThis.parent = undefined;
      if (!hadWin) delete globalThis.window;
    } })();
}
const bridge = () => new MVUBridge({ life: { dead: false }, wins: () => [] });

test('cardInfo：酒馆助手 getCharData 优先（标签 / 作者注一并归一），上下文其次', async () => {
  await withGlobals(async () => {
    const B = bridge();
    assert.equal(await B.cardInfo(), null);   // 什么接口都没有：返回 null，由面板显示安全占位
    globalThis.getCharData = () => ({ name: '母畜庄园', avatar: 'a.png', data: { name: '母畜庄园', creator: 'Yehehua', character_version: '1.2', tags: ['都市', '养成'], creator_notes: '<b>注</b>有 <i>HTML</i>' } });
    const r = await B.cardInfo();
    assert.equal(r.src, 'getCharData');
    assert.equal(r.name, '母畜庄园'); assert.equal(r.creator, 'Yehehua'); assert.equal(r.version, '1.2');
    assert.deepEqual(r.tags, ['都市', '养成']);
    assert.equal(r.notes, '注 有 HTML');      // 标签剥掉、空白压平
    delete globalThis.getCharData;
    globalThis.SillyTavern = { getContext: () => ({ characterId: 0, characters: [{ avatar: 'a.png', data: { name: '卡', creator: '作者' } }] }) };
    const c = await B.cardInfo();
    assert.equal(c.src, 'context'); assert.equal(c.creator, '作者');
  });
});

test('cardInfo：本窗口读不到时探父级窗口（独立窗口 / 上下文被隔离的兜底），不是报「未接入」', async () => {
  await withGlobals(async () => {
    const B = bridge();
    globalThis.parent = { SillyTavern: { getContext: () => ({ characterId: 0, characters: [{ avatar: 'a.png', data: { name: '卡', creator: '父级作者' } }] }) } };
    const r = await B.cardInfo();
    assert.equal(r.src, 'parent-st'); assert.equal(r.creator, '父级作者');
    delete globalThis.parent;
    globalThis.parent = { TavernHelper: { getCharData: async () => ({ name: '只有名字' }) } };
    const n = await B.cardInfo();
    assert.equal(n.src, 'parent-th'); assert.equal(n.name, '只有名字');
  });
});
