#!/usr/bin/env python3
"""架构看门狗门控自测（2026-09-30 接入 tools/smoke.sh）：证明第 5 道防线不是空转。

背景：用户 2026-09-30 采纳参考卡「no academic citations embedded in project」口径——源码只写机制，
论文名 / 期刊缩写 / arXiv / DOI 只许存 docs/plans/llm-campaign.md §10。本自测喂三类样本：
  1. 引用形态（论文名 / 预印本号 / DOI / et al.）必须被拦下，且报错行号指向那一行；
  2. 机制术语（「滑动窗口关键帧压缩」这类）必须放行；
  3. 仓库现状必须零命中，而且扫描面不能是空的（文件数太少 = glob 写坏了在静默空转，直接判失败）。

S0-B 起追加「只减不增」账本与引擎级检查（行数 / z-index / 卡词 / 内联样式）的门控自测：
  4. 新引擎文件带卡词必拦；账本内文件计数变大必拦、变小放行并报「可下调」；范围外路径忽略；
  5. `zIndex: 5` 对象字面量、401 行的新文件、core 进账本、--update-baseline 抬数字，都必须被拒；
  6. 内联样式：赋值 / cssText / style="…" 计数，几何属性 / 自定义属性 / <style> 块不计。

用法：python3 tools/test_architecture_gate.py    # 0 全过；1 有失败
"""
import argparse
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
from contextlib import redirect_stdout

ROOT = pathlib.Path(__file__).resolve().parent.parent
failures = []


def load_gate():
    spec = importlib.util.spec_from_file_location('arch_gate', ROOT / 'tools' / 'check_architecture.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)   # 脚本本体只定义函数（main 受 __main__ 守卫），import 无副作用
    return mod


def case(name, fn):
    try:
        fn()
    except AssertionError as e:
        failures.append(f'{name}：{e}')
        print(f'  ✗ {name}：{e}')
    else:
        print(f'  ✓ {name}')


def main():
    gate = load_gate()
    tmp = tempfile.TemporaryDirectory(prefix='arch-gate-')

    def write(fname, text):
        p = pathlib.Path(tmp.name) / fname
        p.write_text(text, encoding='utf-8')
        return p

    def expect_hit(name, text, needle):
        def run():
            p = write(f'bad_{name}.mjs', text)
            bad, n = gate.check_citations([p])
            assert n == 1, f'扫描面应为 1 个文件，实际 {n}'
            assert bad, f'「{needle}」没被拦下'
            assert needle in bad[0], f'报错里没写清命中词：{bad[0]}'
            assert ':1:' in bad[0], f'行号不对（应指向第 1 行）：{bad[0]}'
        case(f'拦截：{name}', run)

    expect_hit('论文名', '// W3 keyframe compression (SokoBench)\nconst a = 1;\n', 'SokoBench')
    expect_hit('脚本化世界模型名', '// restricted op DSL, WorldCoder style\nconst a = 1;\n', 'WorldCoder')
    expect_hit('预印本号', '// see arXiv:2601.20856 for the ladder\nconst a = 1;\n', 'arXiv')
    expect_hit('DOI 链接', '// https://doi.org/10.1109/TASLPRO.2025.3604650\nconst a = 1;\n', 'doi.org')
    expect_hit('会议缩写', '// NeurIPS 2024 world-model agent\nconst a = 1;\n', 'NeurIPS')
    expect_hit('引用习惯写法', '// Monti et al. report a degradation\nconst a = 1;\n', 'et al.')

    def mechanisms_pass():
        p = write('ok.mjs', '// 滑动窗口关键帧压缩 + 领域槽位解耦追踪 + 环境反馈自省环\n'
                            '// long-horizon keyframes, domain-slot disentangled tracking, scripted world model\n'
                            'export const a = 1;\n')
        bad, n = gate.check_citations([p])
        assert n == 1 and not bad, f'机制术语被误拦：{bad}'
    case('放行：机制术语（中英）', mechanisms_pass)

    def repo_clean():
        bad, n = gate.check_citations()
        assert not bad, f'仓库源码里有引用残留：{bad[:3]}'
        assert n > 100, f'扫描面太小（{n} 个文件）= glob 写坏了在静默空转'
        lines_bad, info = gate.check_line_count()
        assert not lines_bad, f'行数防线有违规：{lines_bad}'
        assert any(r.startswith('map/core/') for r in info['sizes']), 'core 一个模块都没扫到'
        assert info['scanned'] > 100, f'引擎扫描面太小（{info["scanned"]} 个文件）'
    case('仓库现状：引用零命中 + 扫描面非空 + 行数防线仍在跑', repo_clean)

    def repo_ratchet_clean():
        base = gate.load_baseline()
        assert base is not None, 'tools/arch_baseline.json 不存在'
        assert not gate.check_baseline_shape(base), f'账本不合法：{gate.check_baseline_shape(base)}'
        for name, fn in (('z-index', gate.check_zindex), ('卡词', gate.check_terms),
                         ('内联样式', gate.check_inline_style), ('体量', gate.check_line_count),
                         ('注释卡词', gate.check_comment_terms)):
            bad, info = fn(baseline=base)
            assert not bad, f'{name} 防线对仓库现状有违规：{bad[:3]}'
            assert info['scanned'] > 100, f'{name} 扫描面太小（{info["scanned"]}）= glob 写坏了在静默空转'
        assert not gate.check_layering(), '分层防线有违规'
    case('仓库现状：账本合法 + 四类账本检查全过 + 扫描面非空', repo_ratchet_clean)

    # ---------------- S0-B：账本与引擎级检查 ----------------
    def fake_root(files):
        """在临时目录里搭一棵假仓库：files = {相对路径: 文本}；返回 (根, 相对路径→绝对路径)。"""
        d = pathlib.Path(tempfile.mkdtemp(prefix='arch-root-', dir=tmp.name))
        for rel, text in files.items():
            f = d / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(text, encoding='utf-8')
        return d

    # ---------------- S6-2：纯流水线可以引 core，不许引别的父级，也不许碰宿主全局 ----------------
    def pipeline_layering():
        ok = fake_root({'map/tavern/stash-store.mjs': "import { itemId } from '../core/pickup.mjs';\nexport const x = itemId;\n"})
        assert not gate.check_layering(root=ok), f'流水线引 ../core 不该被拦：{gate.check_layering(root=ok)}'
        up = fake_root({'map/tavern/stash-recompute.mjs': "import { x } from '../app/dom.mjs';\nexport const y = x;\n"})
        bad = gate.check_layering(root=up)
        assert bad and 'stash-recompute.mjs:1:' in bad[0], f'流水线引 ../app 没被拦：{bad}'
        host = fake_root({'map/tavern/stash-store.mjs': "export const t = () => window.parent;\n"})
        bad = gate.check_layering(root=host)
        assert bad and 'window' in bad[0], f'流水线碰 window 没被拦：{bad}'
        assert 'map/tavern/stash-store.mjs' in gate.PIPELINE and 'map/tavern/stash-recompute.mjs' in gate.PIPELINE
    case('分层：流水线引 ../core 放行，引别的父级 / 碰宿主全局拦下', pipeline_layering)

    def new_file_with_term():
        root = fake_root({'map/app/newmod.mjs': "export const label = '欢迎来到庄园';\n"})
        bad, info = gate.check_terms(baseline={}, root=root)
        assert bad and '庄园' in bad[0] and 'map/app/newmod.mjs:1:' in bad[0], f'新文件里的卡词没被拦：{bad}'
    case('拦截：新引擎文件带卡词', new_file_with_term)

    def new_file_with_english_term():   # S4-4：英文卡词（区分大小写）同样拦；EdenMap / eden-map / edenMap 是全局名 / 消息类型 / 存储键，不在此列
        for text, who in (("export const label = 'Welcome to Tiancheng';\n", 'Tiancheng'), ("const t = `Eden Map v${v}`;\n", 'Eden Map'), ("const t = 'Eden map';\n", 'Eden map'),
                          ("const t = 'Manor rooms';\n", 'Manor rooms'), ("const t = 'Estate members';\n", 'Estate members'), ("const t = 'Eden Manor';\n", 'Eden Manor')):
            root = fake_root({'map/app/newmod.mjs': text})
            bad, info = gate.check_terms(baseline={}, root=root)
            assert bad and who in bad[0] and 'map/app/newmod.mjs:1:' in bad[0], f'新文件里的英文卡词「{who}」没被拦：{bad}'
        root = fake_root({'map/app/ok.mjs': "window.EdenMap = {}; post({ type: 'eden-map:chars' }); const k = 'edenMapLang';\n"})
        bad, info = gate.check_terms(baseline={}, root=root)
        assert not bad, f'EdenMap / eden-map / edenMap 不该被拦：{bad}'
        root = fake_root({'map/i18n/en.json': json.dumps({'page_title': 'Tiancheng Map', 'a': 'fine', 'hint': "Eden map add-on"}), 'map/i18n/zh.json': json.dumps({'a': '好'})})
        bad, info = gate.check_terms(baseline={}, root=root)
        assert bad and 'map/i18n/en.json:' in bad[0] and info['counts'] == {'map/i18n/en.json': 2}, f'词典里的英文卡词没被拦：{bad} {info["counts"]}'
    case('拦截：英文卡词（引擎文件与词典值；不含 EdenMap / eden-map / edenMap）', new_file_with_english_term)

    def baselined_grows():
        root = fake_root({'map/app/old.mjs': "const a = '庄园'; const b = '庄园'; const c = '庄园';\n"})
        bad, info = gate.check_terms(baseline={'terms': {'map/app/old.mjs': 2}}, root=root)
        assert bad and '3 > 账本 2' in bad[0], f'账本文件计数变大没被拦：{bad}'
    case('拦截：账本内文件计数变大', baselined_grows)

    def baselined_shrinks():
        root = fake_root({'map/app/old.mjs': "const a = '庄园';\n"})
        bad, info = gate.check_terms(baseline={'terms': {'map/app/old.mjs': 2}}, root=root)
        assert not bad, f'计数变小不该失败：{bad}'
        assert info['lowerable'] == [('map/app/old.mjs', 1, 2)], f'没报「可下调」：{info["lowerable"]}'
        bad, info = gate.check_terms(baseline={'terms': {'map/app/old.mjs': 1}}, root=root)
        assert not bad and not info['lowerable'], '持平应放行且无可下调'
    case('放行：账本内文件计数变小（并报可下调）', baselined_shrinks)

    def excluded_paths_ignored():
        term = "const x = '庄园 天城 tc_upper';\nel.style.color = 'red';\nconst z = { zIndex: 9 };\n"
        root = fake_root({
            'map/packs/eden/data.mjs': term, 'map/data/x.mjs': term, 'map/estate/main.js': term,
            'map/vendor/lib.mjs': term, 'map/props/prop_a/scene.mjs': term, 'map/section.js': term,
            'map/world.html': term, 'map/tavern/test-page.html': term, 'tests/a.mjs': term, 'tools/b.mjs': term,
            'map/app/ok.mjs': 'export const a = 1;\n'})
        names = [p.relative_to(root).as_posix() for p in gate.engine_files(root)]
        assert names == ['map/app/ok.mjs'], f'范围外路径进了扫描面：{names}'
        for fn in (gate.check_terms, gate.check_zindex, gate.check_inline_style, gate.check_line_count):
            bad, _ = fn(baseline={}, root=root)
            assert not bad, f'{fn.__name__} 扫了范围外路径：{bad}'
    case('忽略：packs / data / estate / vendor / props 子目录 / 原型 / tests / tools', excluded_paths_ignored)

    def engine_scope_covers():
        root = fake_root({r: 'x\n' for r in (
            'map/core/a.mjs', 'map/app/a.mjs', 'map/tavern/a.mjs', 'map/tavern/eden-map.js', 'map/ui/a.js',
            'map/ui/a.mjs', 'map/three/a.mjs', 'map/root.mjs', 'map/viewer.html', 'map/props/viewer3d.html')})
        got = {p.relative_to(root).as_posix() for p in gate.engine_files(root)}
        assert len(got) == 10, f'引擎范围少了文件：{sorted(got)}'
    case('范围：引擎 10 类路径全在扫描面里', engine_scope_covers)

    def zindex_object_literal():
        root = fake_root({'map/app/fps.mjs': "Object.assign(el.style, { zIndex: 99999 });\n",
                          'map/app/ok.mjs': "const s = { zIndex: 'var(--zu-hud)' }; el.style.zIndex = String(z);\n"
                                            "const c = 'z-index: var(--zv-fx)'; // z-index: 5 in a comment\n"})
        bad, _ = gate.check_zindex(baseline={}, root=root)
        assert len(bad) == 1 and 'map/app/fps.mjs:1:' in bad[0] and '99999' in bad[0], f'zIndex: 数字 的判定不对：{bad}'
        bad, _ = gate.check_zindex(baseline={'zindex': {'map/app/fps.mjs': 1}}, root=root)
        assert not bad, f'账本内的一处应放行：{bad}'
    case('拦截：`zIndex: 99999` 对象字面量；令牌 / 注释放行', zindex_object_literal)

    def line_cap():
        big = 'x\n' * 401
        root = fake_root({'map/app/big.mjs': big, 'map/app/edge.mjs': 'x\n' * 400})
        bad, _ = gate.check_line_count(baseline={}, root=root)
        assert len(bad) == 1 and 'map/app/big.mjs: 401' in bad[0], f'401 行的新文件判定不对：{bad}'
        bad, info = gate.check_line_count(baseline={'lines': {'map/app/big.mjs': 401}}, root=root)
        assert not bad and not info['lowerable'], f'账本持平应放行：{bad}'
        bad, info = gate.check_line_count(baseline={'lines': {'map/app/big.mjs': 500}}, root=root)
        assert not bad and info['lowerable'] == [('map/app/big.mjs', 401, 500)], f'应放行并报可下调：{info}'
        root2 = fake_root({'map/app/big.mjs': 'x\n' * 402})
        bad, _ = gate.check_line_count(baseline={'lines': {'map/app/big.mjs': 401}}, root=root2)
        assert bad, '账本文件再长一行应被拦'
    case('拦截：401 行的新文件；账本文件不许再长；持平放行', line_cap)

    def core_is_hard():
        root = fake_root({'map/core/big.mjs': 'x\n' * 401, 'map/core/t.mjs': "const a = '庄园';\n"})
        base = {'lines': {'map/core/big.mjs': 401}, 'terms': {'map/core/t.mjs': 1}}
        assert gate.check_baseline_shape(base), 'core 条目进账本没被拒'
        bad, _ = gate.check_line_count(baseline=base, root=root)
        assert bad, 'core 超长不该被账本放行'
        bad, _ = gate.check_terms(baseline=base, root=root)
        assert bad, 'core 卡词不该被账本放行'
        assert not gate.check_baseline_shape({'lines': {'map/app/x.mjs': 401}}), '合法账本被误拒'
    case('拦截：map/core 进账本被拒，且账本也放行不了 core 违规', core_is_hard)

    def update_never_raises():
        base = {'_note': 'n', 'lines': {'a.mjs': 500}, 'zindex': {'b.mjs': 2}, 'terms': {'c.mjs': 3},
                'inline_style': {}}
        cur = {'lines': {'a.mjs': 450}, 'zindex': {'b.mjs': 2}, 'terms': {}, 'inline_style': {}}
        new, down, grew = gate.lowered_baseline(base, cur)
        assert not grew and new['lines'] == {'a.mjs': 450} and new['terms'] == {}, f'下调结果不对：{new} {grew}'
        assert len(down) == 2, f'该报两条下降：{down}'
        for cur2 in ({**cur, 'zindex': {'b.mjs': 3}}, {**cur, 'terms': {'c.mjs': 1, 'new.mjs': 1}}):
            new, down, grew = gate.lowered_baseline(base, cur2)
            assert grew, f'增长 / 新增文件没被识别：{cur2}'
    case('--update-baseline：只降不升，增长 / 新文件被识别', update_never_raises)

    def update_cli_refuses():
        path = pathlib.Path(tmp.name) / 'baseline.json'
        original = {'_note': 'n', 'lines': {}, 'zindex': {'b.mjs': 2}, 'terms': {}, 'inline_style': {}}
        path.write_text(json.dumps(original), encoding='utf-8')
        saved = (gate.BASELINE_PATH, gate.current_counts)
        try:
            gate.BASELINE_PATH = path
            gate.current_counts = lambda root=gate.ROOT: {'lines': {}, 'zindex': {'b.mjs': 5}, 'terms': {},
                                                          'inline_style': {}}
            out = io.StringIO()
            with redirect_stdout(out):
                rc = gate._cli(argparse.Namespace(init_baseline=False, update_baseline=True))
            assert rc == 1 and '拒绝' in out.getvalue(), f'增长时没拒绝：{rc} {out.getvalue()}'
            assert json.loads(path.read_text(encoding='utf-8')) == original, '拒绝时不该改账本文件'
            gate.current_counts = lambda root=gate.ROOT: {'lines': {}, 'zindex': {'b.mjs': 1}, 'terms': {},
                                                          'inline_style': {}}
            with redirect_stdout(io.StringIO()):
                rc = gate._cli(argparse.Namespace(init_baseline=False, update_baseline=True))
            assert rc == 0 and json.loads(path.read_text(encoding='utf-8'))['zindex'] == {'b.mjs': 1}, '下调没写进去'
        finally:
            gate.BASELINE_PATH, gate.current_counts = saved
    case('--update-baseline CLI：增长拒绝且不改文件，下降写入', update_cli_refuses)

    def inline_style_rules():
        root = fake_root({'map/app/a.mjs': (
            "el.style.background = 'red';\n"            # 计
            "el.style.color = c; el.style.display = 'none';\n"   # 计 2
            "el.style = 'x';\n"                          # 计
            "el.style.cssText = 'a:b';\n"                # 计 1（cssText，不重复算赋值）
            "h.innerHTML = '<i style=\"color:red\">x</i>';\n"     # 计
            "h.innerHTML = `<i style=${v}>x</i>`;\n"     # 计
            "h.innerHTML = '<i style=\"--a:1\">x</i>';\n"     # 只有自定义属性：不计
            "h.innerHTML = `<i style='--a: 1; --b: ${v}px;'>x</i>`;\n"   # 多条自定义属性：不计
            "h.innerHTML = '<i style=\"--a:1;color:red\">x</i>';\n"    # 混有外观声明：计
            "el.style.left = x + 'px'; el.style.top = y; el.style.width = w; el.style.height = h;\n"  # 不计
            "el.style.transform = 't'; el.style.setProperty('--gx', v);\n"                   # 不计
            "if (el.style.color === 'red') {}\n"         # 比较不计
            "const css = `<style>.a{color:red}</style>`;\n"       # <style> 块不计
            "// el.style.color = 'blue' in a comment\n")})
        bad, info = gate.check_inline_style(baseline={}, root=root)
        assert info['counts'] == {'map/app/a.mjs': 8}, f'内联样式计数不对：{info["counts"]}'
        assert any('map/app/a.mjs:1:' in b for b in bad), f'报错没写行号：{bad[:2]}'
    case('计数：内联样式赋值 / cssText / style 属性，几何 / 自定义属性（含 style="--x:v" 全自定义属性的属性）/ <style> / 注释不计', inline_style_rules)

    def namespaces_not_terms():
        root = fake_root({'map/app/ns.mjs': "const k = 'eden'; const e = window.edenMap; post('eden-map:ready');\n"
                                             "const v = 'eden_map'; class EdenMap {}\n"})
        bad, info = gate.check_terms(baseline={}, root=root)
        assert not bad and not info['counts'], f'命名空间名被当成卡词：{bad}'
    case('放行：eden / edenMap / eden-map: / eden_map / EdenMap 是命名空间不是卡词', namespaces_not_terms)

    def i18n_values_only():
        root = fake_root({'map/i18n/zh.json': json.dumps({'庄园': 'ok', 'a': '欢迎来到庄园', 'b': ['伊甸']},
                                                          ensure_ascii=False, indent=1),
                          'map/i18n/en.json': json.dumps({'a': 'welcome'})})
        bad, info = gate.check_terms(files=[], baseline={}, root=root)
        assert info['counts'] == {'map/i18n/zh.json': 2}, f'词典应只数值（键不算）：{info["counts"]}'
        assert bad and 'map/i18n/zh.json:' in bad[0], f'词典报错没写文件：{bad}'
    case('计数：i18n 词典只扫值不扫键', i18n_values_only)

    def overlap_counts_once():
        root = fake_root({'map/app/a.mjs': "const s = '伊甸庄园';\n"})
        _, info = gate.check_terms(baseline={}, root=root)
        assert info['counts'] == {'map/app/a.mjs': 1}, f'重叠词应按最长词只数一次：{info["counts"]}'
    case('计数：重叠词（伊甸庄园 / 庄园 / 伊甸）按最长词只数一次', overlap_counts_once)

    def tc_globals_rules():   # S5-3：旧 TC* 全局硬零（window. / P. / parent. / globalThis. 前缀）；注释、非引擎路径、别的前缀不拦
        root = fake_root({'map/app/a.mjs': "window.TCEvents.set(m);\nconst x = P.TCChars;\nparent.TCStore.get('k');\nglobalThis.TC3d = 1;\n"
                                           "// window.TCSheet in a comment\nwindow.ViewerDrawer.set('peek'); const TCCvd = 1; window.TCthreeFX2 = 0;\n"})
        bad, n = gate.check_tc_globals(root=root)
        assert n == 1 and len(bad) == 4, f'应拦 4 处（TCthreeFX2 小写第三字母不是 TC<大写>），实际 {len(bad)}：{bad}'
        assert 'map/app/a.mjs:1:' in bad[0] and 'map/app/a.mjs:4:' in bad[3], f'行号不对：{bad}'
        root = fake_root({'map/estate/main.js': "window.TCthreeFX = {};\n", 'tools/browser/x.mjs': "window.TCEvents;\n"})
        bad, n = gate.check_tc_globals(root=root)
        assert not bad and n == 0, f'引擎范围外（庄园页 / 工具）不该被扫：{bad}'
        bad, n = gate.check_tc_globals()
        assert not bad and n > 100, f'仓库现状有旧 TC* 全局或扫描面太小：{bad[:3]} {n}'
    case('拦截：新引擎代码里的 window.TC* / P.TC*（硬零；注释、庄园页、工具不计）；仓库现状零', tc_globals_rules)

    def core_still_zero_terms():
        assert not gate.check_pack0(), 'map/core 出现卡词'
    case('仓库现状：map/core 卡词硬零', core_still_zero_terms)

    def comment_terms_rules():   # 阶段 A：注释里的卡词也拦（同一词表、只数注释），map/core 硬零，令牌样式表的注释同样扫
        root = fake_root({'map/app/c.mjs': "// 这里进庄园\nconst a = 1;   // 伊甸与天城\n/* 多行\n  天城 */\nconst ok = 'x';\n",
                          'map/ui/t.css': "/* 庄园配色 */\n:root { --a: 1; }\n",
                          'map/viewer.html': "<!-- 庄园 -->\n<div>ok</div>\n"})
        bad, info = gate.check_comment_terms(baseline={}, root=root)
        assert info['counts'] == {'map/app/c.mjs': 4, 'map/ui/t.css': 1, 'map/viewer.html': 1}, f'注释卡词计数不对：{info["counts"]}'
        assert any('map/app/c.mjs:1:' in b and '注释' in b for b in bad), f'新注释卡词没被拦（或没写行号）：{bad}'
        bad, _ = gate.check_terms(baseline={}, root=root)
        assert not bad, f'检查 4 应仍只数代码（注释不计）：{bad}'
        bad, _ = gate.check_comment_terms(baseline={'comment_terms': {'map/app/c.mjs': 4, 'map/ui/t.css': 1, 'map/viewer.html': 1}}, root=root)
        assert not bad, f'账本内持平应放行：{bad}'
        bad, _ = gate.check_comment_terms(baseline={'comment_terms': {'map/app/c.mjs': 3, 'map/ui/t.css': 1, 'map/viewer.html': 1}}, root=root)
        assert bad and '4 > 账本 3' in bad[0], f'账本内计数变大没被拦：{bad}'
        root = fake_root({'map/core/x.mjs': "// 庄园\nexport const a = 1;\n"})
        bad, _ = gate.check_comment_terms(baseline={'comment_terms': {'map/core/x.mjs': 5}}, root=root)
        assert bad and 'map/core/x.mjs:1:' in bad[0], f'map/core 注释卡词应硬零：{bad}'
        root = fake_root({'map/packs/eden/a.mjs': "// 庄园\n", 'map/estate/m.js': "// 庄园\n", 'tools/t.mjs': "// 庄园\n", 'map/app/ok.mjs': "// 中性\n"})
        bad, _ = gate.check_comment_terms(baseline={}, root=root)
        assert not bad, f'范围外路径（设定包 / 庄园页 / 工具）不该被扫：{bad}'
        base = gate.load_baseline()
        bad, info = gate.check_comment_terms(baseline=base)
        assert not bad and info['scanned'] > 100, f'仓库现状注释里有卡词或扫描面太小：{bad[:3]} {info["scanned"]}'
        assert not base.get('comment_terms'), f'账本 comment_terms 现为空，只许缩不许长：{base.get("comment_terms")}'
    case('拦截：注释里的新卡词（// /* */ <!-- --> / 令牌样式表）；map/core 硬零；仓库现状零', comment_terms_rules)

    tmp.cleanup()
    if failures:
        print(f'架构看门狗门控自测：{len(failures)} 项失败')
        return 1
    print('架构看门狗门控自测：全过（引用拦得住 / 机制术语放行 / 账本只减不增 / 仓库现状干净）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
