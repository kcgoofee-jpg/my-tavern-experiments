// 柏宝绘桥（map/tavern/baibai.mjs）单测：不需要真扩展，往 globalThis 里塞个假接口就行。
// 守的是三件事：没装扩展时**必须安静降级**、错误码按 code 分支、多角色降级规则跟它文档一致。
import test from 'node:test';
import assert from 'node:assert';
import * as B from '../map/tavern/baibai.mjs';

const KEY = 'STBaiBaiImage';

function withApi(api, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, KEY);
  const old = globalThis[KEY];
  const restore = () => { if (had) globalThis[KEY] = old; else delete globalThis[KEY]; };
  if (api) globalThis[KEY] = api;
  else delete globalThis[KEY];
  let out;
  try { out = fn(); } catch (e) { restore(); throw e; }
  // 回调是 async 时必须等它跑完再撤接口，否则 await 之后桥已经看不到扩展了
  if (out && typeof out.then === 'function') {
    return out.then((v) => { restore(); return v; }, (e) => { restore(); throw e; });
  }
  restore();
  return out;
}

// 一个最小的假柏宝绘：v1 接口，后端已配好，角色库两人，generate 按脚本走
function fakeApi({ apiVersion = 1, configured = true, supportsCharacters = true, onGenerate } = {}) {
  return {
    apiVersion,
    pluginVersion: '0.2.5',
    capabilities: { globalApi: true, characterLibrary: true, generate: true, saveToGallery: true, events: true },
    getBackendStatus: () => ({ apiVersion: 1, pluginVersion: '0.2.5', backend: 'nai', configured, model: 'nai-diffusion-5-full', supportsCharacters, reason: configured ? '' : '还没填 Key' }),
    getCharacters: (o) => ({
      apiVersion: 1, pluginVersion: '0.2.5', revision: 7,
      floor: o && typeof o.floor === 'number' ? o.floor : null,
      characters: [
        { name: '阿黛尔', tag: '1girl, short silver hair, blue eyes, black coat', nl: 'a girl with short silver hair', source: 'ai', scope: 'chat', fields: { sex: '1girl', hair: 'short silver hair' } },
        { name: '缄默', tag: '1girl, long black hair, red eyes', nl: '', source: 'manual', scope: 'global' },
        { name: '无名', tag: '' },          // 只有名字：能显示、不能出图，保留
        { name: '  ', tag: '   ' },         // 全空：丢掉
      ],
    }),
    generate: onGenerate || (async () => ({ apiVersion: 1, dataUrl: 'data:image/png;base64,AAAA', format: 'png', path: '/user/images/柏宝绘_阿黛尔/bbi_1.png', seed: 12345, backend: 'nai', charactersApplied: true })),
    subscribe: (cb) => { fakeApi.lastListener = cb; return () => { fakeApi.lastUnsub = true; }; },
  };
}

test('没装扩展：全部安静降级，绝不抛', () => {
  withApi(null, () => {
    const st = B.status();
    assert.equal(st.available, false);
    assert.equal(st.callable, false);
    assert.equal(st.reason, '');
    assert.equal(B.callable(), false);
    assert.equal(B.characters().revision, 0);
    assert.deepEqual(B.characters(42).list, []);
    const off = B.onChange(() => { });
    assert.equal(typeof off, 'function');
    off();   // 不该抛
  });
});

test('装了但 apiVersion 不是 1：不 callable、也不调 generate', async () => {
  let called = false;
  const api = fakeApi({ apiVersion: 2 });
  api.generate = async () => { called = true; return {}; };
  await withApi(api, async () => {
    const st = B.status();
    assert.equal(st.available, true);
    assert.equal(st.callable, false);
    assert.equal(st.reason, 'version');
    const r = await B.generate({ prompt: '1girl' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'version');
  });
  assert.equal(called, false, '版本不匹配时绝不能把请求发出去');
});

test('后端没配好：callable 为假并给出人话原因', () => {
  withApi(fakeApi({ configured: false }), () => {
    const st = B.status();
    assert.equal(st.callable, false);
    assert.equal(st.backend, 'nai');
    assert.equal(st.reason, '还没填 Key');
    assert.equal(st.text.zh, '还没填 Key');
  });
});

test('读角色库：归一化、丢掉空条目、floor 透传', () => {
  withApi(fakeApi(), () => {
    const cur = B.characters();
    assert.equal(cur.revision, 7);
    assert.equal(cur.list.length, 3, '全空的条目丢掉；只有名字的保留（能显示但不能出图）');
    assert.equal(cur.list[0].name, '阿黛尔');
    assert.equal(cur.list[0].fields.hair, 'short silver hair');
    assert.equal(cur.list[1].scope, 'global');

    const at42 = B.characters(42);
    assert.equal(at42.floor, 42, 'floor 要透传给它的历史快照接口');
  });
});

test('getCharacters 抛错时返空，不把异常带给调用方', () => {
  const api = fakeApi();
  api.getCharacters = () => { throw new Error('boom'); };
  withApi(api, () => {
    assert.deepEqual(B.characters().list, []);
  });
});

test('出图：成功时透传 seed / path / charactersApplied', async () => {
  await withApi(fakeApi(), async () => {
    const r = await B.generate({ prompt: '1girl, cafe', size: 'landscape' });
    assert.equal(r.ok, true);
    assert.equal(r.seed, 12345);
    assert.equal(r.path, '/user/images/柏宝绘_阿黛尔/bbi_1.png');
    assert.equal(r.charactersApplied, true);
  });
});

test('出图：save 默认 true，显式 false 才改', async () => {
  const seen = [];
  const api = fakeApi({ onGenerate: async (payload) => { seen.push(payload); return { dataUrl: 'data:image/png;base64,AA', seed: 1 }; } });
  await withApi(api, async () => {
    await B.generate({ prompt: 'a' });
    await B.generate({ prompt: 'b', save: false });
    assert.equal(seen[0].save, true);
    assert.equal(seen[1].save, false);
  });
});

test('出图：空提示词在本地就拦下，不打扰后端', async () => {
  let called = false;
  const api = fakeApi({ onGenerate: async () => { called = true; return {}; } });
  await withApi(api, async () => {
    const r = await B.generate({ prompt: '   ' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_args');
  });
  assert.equal(called, false);
});

test('出图：按 error.code 分支给出对应人话', async () => {
  const cases = [
    ['aborted', '已取消'],
    ['not_configured', '柏宝绘还没配好出图渠道（在它的「渠道」页配 ComfyUI 或 NovelAI）'],
    ['invalid_args', '请求不合法（提示词为空？）'],
    ['rate_limited', '被限流了，稍等一下再试'],
    ['backend_error', '出图后端报错（检查渠道配置或网络）'],
  ];
  for (const [code, zh] of cases) {
    const api = fakeApi({ onGenerate: async () => { const e = new Error('x'); e.code = code; throw e; } });
    await withApi(api, async () => {
      const r = await B.generate({ prompt: '1girl' });
      assert.equal(r.ok, false);
      assert.equal(r.code, code);
      assert.equal(r.text.zh, zh, code + ' 应该有人话');
    });
  }
  // 不认识的 code 归到 backend_error，而不是原样漏出去
  const api = fakeApi({ onGenerate: async () => { const e = new Error('x'); e.code = '同人不同厂'; throw e; } });
  await withApi(api, async () => {
    const r = await B.generate({ prompt: '1girl' });
    assert.equal(r.code, 'backend_error');
  });
});

test('出图：进度回调抛错不影响结果', async () => {
  await withApi(fakeApi(), async () => {
    const r = await B.generate({ prompt: '1girl' }, { onProgress: () => { throw new Error('前端自己错了'); } });
    assert.equal(r.ok, true);
  });
});

test('拼提示词：画师串在最前、去重不分大小写、空段剔除', () => {
  const got = B.composePrompt({
    style: '0.7::artist:meme50::, artist:ishikei',
    scene: 'cafe, afternoon light',
    characterTags: ['1girl, black coat', 'CAFE'],
    extra: '  ',
  });
  assert.equal(got, '0.7::artist:meme50::, artist:ishikei, cafe, afternoon light, 1girl, black coat');
  assert.ok(got.indexOf('artist:meme50') < got.indexOf('cafe'), '画师串必须排在最前');
});

test('多角色：后端支持走 characters 字段，不支持退回单角色', () => {
  const list = [
    { name: '阿黛尔', tag: 'tag-A', nl: 'nl-A' },
    { name: '缄默', tag: 'tag-B', nl: '' },
  ];
  const ok = B.splitCharacters(list, ['阿黛尔', '缄默'], true);
  assert.equal(ok.characters.length, 2);
  assert.equal(ok.characters[0].name, '阿黛尔');
  assert.equal(ok.promptTags.length, 0, '支持多角色时不要再把 tag 拼进 prompt（它刻意不降级）');
  assert.equal(ok.characters[1].nl, undefined, '空的 nl 不带');

  const limited = B.splitCharacters(list, ['阿黛尔', '缄默'], false);
  assert.equal(limited.characters.length, 0);
  assert.deepEqual(limited.promptTags, ['tag-A'], '不支持多角色时只拼第一个人的 tag');
});

test('订阅：退回 DOM 事件也不炸（Node 里没有 window）', () => {
  const api = fakeApi();
  withApi(api, () => {
    let got = null;
    const off = B.onChange((n) => { got = n; });
    assert.equal(typeof off, 'function');
    fakeApi.lastListener?.({ type: 'changed', revision: 8 });
    assert.equal(got.revision, 8);
    off();
    assert.equal(fakeApi.lastUnsub, true);
  });
});

test('resultNote：带上 seed 与提示词，便于复现', async () => {
  const note = B.resultNote({ ok: true, seed: 42, backend: 'nai' }, '1girl, cafe');
  assert.ok(note.includes('seed 42'));
  assert.ok(note.includes('1girl, cafe'));
  assert.equal(B.resultNote({ ok: false }), '');
});

test('iframe 里也能找到接口：本体窗口没有就问父窗口', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const old = globalThis.window;
  try {
    const fake = fakeApi();
    // 造一个「自己窗口上没有、父窗口上有」的场景（地图/庄园页就是嵌在酒馆页里的 iframe）
    const self = { parent: { STBaiBaiImage: fake } };
    self.parent.parent = self.parent;
    globalThis.window = self;
    assert.equal(B.available(), true, '父窗口上的柏宝绘应该能被看到');
    assert.equal(B.status().backend, 'nai');
    assert.equal(B.callable(), true);
  } finally {
    if (had) globalThis.window = old; else delete globalThis.window;
  }
});

test('dataUrlToBlob：能还原 base64 与类型', () => {
  if (typeof Blob === 'undefined') return;   // 老 Node 跳过
  const blob = B.dataUrlToBlob('data:image/png;base64,QUJD');   // "ABC"
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 3);
  assert.equal(B.dataUrlToBlob('not a data url'), null);
});
