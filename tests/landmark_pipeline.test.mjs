// tools/landmark.py：脚手架 / 状态 / 清单划线 / 幂等 / maps.json 文本插入（不起 Blender）
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOL = join(ROOT, 'tools', 'landmark.py');
const lm = (root, ...a) => spawnSync('python3', [TOOL, ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, LM_ROOT: root, LM_WORK: join(root, 'work') } });

test('new：生成四件套 + 状态；重跑不覆盖；清单划线与状态行', () => {
  const d = mkdtempSync(join(tmpdir(), 'lm-'));
  try {
    let r = lm(d, 'new', 'test_hall', '--layer', 'tc_mid', '--name', '测试会堂');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const f of ['blender/landmarks/test_hall/build.py', 'docs/landmarks/test_hall.md', 'docs/landmarks/test_hall.checklist.md', 'map/props/test_hall/manifest.json'])
      assert.ok(existsSync(join(d, f)), f);
    const st = JSON.parse(readFileSync(join(d, 'logs/landmarks/test_hall.json'), 'utf8'));
    assert.equal(st.steps.new.done, true); assert.equal(st.layer, 'tc_mid'); assert.equal(st.marker, 'test_hall');
    const ck = readFileSync(join(d, 'docs/landmarks/test_hall.checklist.md'), 'utf8');
    assert.match(ck, /^状态：进行中.*下一步 draft/);
    assert.match(ck, /^- ~~new：.*~~ ✅$/m);
    assert.match(ck, /^- draft：/m);
    const set = readFileSync(join(d, 'docs/landmarks/test_hall.md'), 'utf8');
    assert.match(set, /^## 设定$/m); assert.equal((set.match(/^## /gm) || []).length, 2, '设定稿：一节设定 + 规模与镜头');
    assert.match(ck, /^- props_main｜测试会堂主体建筑$/m);
    const b = join(d, 'blender/landmarks/test_hall/build.py');
    writeFileSync(b, '# 手改\n');
    r = lm(d, 'new', 'test_hall', '--layer', 'tc_mid', '--name', '测试会堂');
    assert.equal(r.status, 0); assert.equal(readFileSync(b, 'utf8'), '# 手改\n');
    r = lm(d, 'gapcheck', 'test_hall', '--json', '--no-mark');
    const g = JSON.parse(r.stdout);
    assert.deepEqual(g.items.map(x => x.key), ['props_main', 'site_ground']);
    assert.equal(g.items[0].on_board, null);
    r = lm(d, 'status', 'test_hall');
    assert.match(r.stdout, /test_hall\s+✓\s+·/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('board 条目：组名｜说明；划线行照常解析；多余的第三栏被忽略', () => {
  const d = mkdtempSync(join(tmpdir(), 'lm-'));
  try {
    let r = lm(d, 'new', 'test_hall', '--layer', 'tc_mid', '--name', '测试会堂');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const f = join(d, 'docs/landmarks/test_hall.checklist.md');
    const ck = readFileSync(f, 'utf8').split('## 看板条目')[0] + '## 看板条目\n\n- roof｜屋顶\n- ~~wall｜外墙~~ ✅\n- gate｜门楼｜旧的第三栏\n';
    writeFileSync(f, ck);
    r = lm(d, 'gapcheck', 'test_hall', '--json', '--no-mark');
    const g = JSON.parse(r.stdout);
    assert.deepEqual(g.items.map(x => [x.key, x.text, x.checked]), [['roof', '屋顶', false], ['wall', '外墙', true], ['gate', '门楼', false]]);
    assert.ok(Array.isArray(g.setting) && g.setting.length > 0, '设定节的条目');
    assert.ok(!('source' in g.items[0]));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('--dry-run 不写文件；非法 id 报中文提示', () => {
  const d = mkdtempSync(join(tmpdir(), 'lm-'));
  try {
    let r = lm(d, '--dry-run', 'new', 'x_hall', '--layer', 'tc_mid', '--name', 'X');
    assert.equal(r.status, 0); assert.ok(!existsSync(join(d, 'docs')));
    r = lm(d, 'new', 'Bad-Id', '--layer', 'tc_mid', '--name', 'X');
    assert.notEqual(r.status, 0); assert.match(r.stdout, /提示：/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('maps.json 插入 link / lm_ 条目保留排版且幂等', () => {
  const src = `{"maps": {\n  "tc_mid": {"markers": {\n        "a": {"name": "甲", "alias": ["甲"]},\n        "b": {"name": "乙"}\n  }},\n    "lm_old": {"title": "旧"}\n}}`;
  const code = `import sys,json; sys.path.insert(0,'tools'); import landmark as L
t=open(sys.argv[1]).read(); t,m=L.maps_add_link(t,'tc_mid','a','lm_a'); t2,m2=L.maps_add_link(t,'tc_mid','a','lm_a')
t3,m3=L.maps_add_lm(t2,'a',{'layer':'tc_mid','name':'甲'},'x'); t4,m4=L.maps_add_lm(t3,'a',{'layer':'tc_mid','name':'甲'},'x')
print(json.dumps([m,m2,m3,m4,t4==t3,json.loads(t4)['maps']['tc_mid']['markers']['a']['link']['map'],'"b": {"name": "乙"}' in t4], ensure_ascii=False))`;
  const d = mkdtempSync(join(tmpdir(), 'lm-'));
  try {
    writeFileSync(join(d, 'm.json'), src);
    const r = spawnSync('python3', ['-c', code, join(d, 'm.json')], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), ['接好', '已接', '新增', '已有', true, 'lm_a', true]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('card-buildings 表：ship 只改「模型」「质量」两列（表里没有来源列）', () => {
  const tbl = `| 优先级 | 地图 | id | 名称 | 标记 | 模型 | 质量 | 备注 |\n|---|---|---|---|---|---|---|---|\n| P2 机构 | tc_mid | \`mage_tower\` | 法师塔 | 🆕 | — | — | 备注甲 |\n| P2 机构 | tc_mid | \`other\` | 乙 | ✅ | — | — | 备注乙 |`;
  const code = `import sys,json; sys.path.insert(0,'tools'); import landmark as L
t,hit=L.cards_row(sys.stdin.read(),'tc_mid','mage_tower','法师塔','mage_tower','r2 7 / 6'); rows=t.split('\\n')
print(json.dumps([hit, rows[2].split('|')[6:9], rows[3].split('|')[6:9]], ensure_ascii=False))`;
  const r = spawnSync('python3', ['-c', code], { cwd: ROOT, encoding: 'utf8', input: tbl });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [true, [' 法师塔 `map/props/mage_tower/` ', ' 标准（r2 7 / 6） ', ' 备注甲 '], [' — ', ' — ', ' 备注乙 ']]);
});
