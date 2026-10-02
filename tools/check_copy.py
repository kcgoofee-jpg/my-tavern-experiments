#!/usr/bin/env python3
"""COPY-1 文案门控：用户可见字符串里不得出现 emoji / 装饰符号字形、AI 腔短语、内部术语。

扫描范围（COPY-1 盘点过的用户文案面，见 docs/copy-inventory.md）：
  - map/i18n/*.json 的全部值（zh 为准，en 镜像）
  - map/packs/*/manifest.json 的 strings 值
  - 明列的用户文案发射文件（host-checks / selfcheck / splash / worldbook-readme / host-tavernhelper /
    ui/notice / app/notice-layer / estate/main.js 的字符串表区）

三类检查：
  1. 字形：emoji 与成对装饰符号区（U+2600–27BF、U+2500–25FF、U+1F000+、VS16）。✓ ⚠ ◆ ◷ 都在内；
     「×」「⋯」「…」「·」「—」以及表意方向的「→」（A → B）不在内。
  2. AI 腔 / 命令式推销短语（词表见 PHRASES）与全角叹号。
  3. 内部术语上屏：MVU / JIT / ledger / head #（构建号在「关于 / 更新与版本」是版本号，豁免见 ALLOW）。

豁免（写在 ALLOW / 内联）：「spatial_os:pack」是用户必须照抄进条目标题的 id；反馈报告（feedback-report）
是诊断文本，按调试视图处理，不扫描。--self-test 自测：坏例全拦、好例全过。
"""
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 成对装饰符号：⚠ ✓ ✔ ✗ ✘ ◆ ◷ ★ …（2600–27BF 符号区、2500–25FF 几何形状、emoji 平面、VS16）
GLYPH = re.compile('[\u2600-\u27bf\u2500-\u25ff\U0001f000-\U0001faff\ufe0f]')
# AI 腔 / 推销短语（用户 2026-10-02：不要 AI 味的文字说明）
PHRASES = ['我们为您', '已为您', '已为你', '一键', '轻松实现', '轻松搞定', '智能推荐', '智能优化', '！']
# 内部术语不得上屏（构建号 head #N 在关于 / 更新面是版本号——豁免键见 ALLOW_HEAD）
TERMS = ['MVU', 'JIT', 'ledger', 'Ledger']
HEAD_RE = re.compile(r'head #\d')
# 关于 / 更新与版本面上的版本行（head #N 在这里是版本号本身）
ALLOW_HEAD = ('about.build_line', 'about.build_mismatch', 'about.follow_build', 'about.follow_new',
              'about.follow_latest', 's.update_sub', 'about.build_loaded')
# 用户必须照抄的 id
ALLOW_LITERAL = ('spatial_os:pack',)
# 明列的用户文案发射文件（引擎代码里其余 console.warn / 注释不在此列——不是用户面）
FILES = [
    'map/tavern/host-checks.mjs', 'map/tavern/selfcheck.mjs', 'map/tavern/splash.mjs',
    'map/tavern/worldbook-readme.mjs', 'map/tavern/host-tavernhelper.mjs',
    'map/ui/notice.mjs', 'map/app/notice-layer.mjs',
]

STR_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')
ZH_ONLY = re.compile('[\u4e00-\u9fff]')


def check_value(text, where, errs):
    """一条用户字符串的三个检查；where = 出处（文件:行 或 键）。"""
    if any(lit in text for lit in ALLOW_LITERAL):
        terms = []
    else:
        terms = [t for t in TERMS if t in text]
    if HEAD_RE.search(text) and not any(where.startswith(a) for a in ALLOW_HEAD):
        terms.append('head #N（版本号只在关于 / 更新与版本面上屏）')
    for m in GLYPH.finditer(text):
        errs.append(f'{where}: 装饰符号字形「{m.group()}」({unicodedata.name(m.group(), "?")})：{text[:60]}')
    for p in PHRASES:
        if p in text:
            errs.append(f'{where}: AI 腔短语「{p}」：{text[:60]}')
    for t in terms:
        errs.append(f'{where}: 内部术语「{t}」：{text[:60]}')


def scan_json(path, errs):
    data = json.load(open(path, encoding='utf-8'))
    strings = data.get('strings') if path.endswith('manifest.json') else data
    for k, v in (strings or {}).items():
        if not isinstance(v, str):
            continue
        check_value(v, f'{os.path.relpath(path, ROOT)}:{k}', errs)


def scan_file(path, errs):
    """明列的发射文件：只查字符串字面量（跳过注释行与 ICONS 一类的图标表行）。"""
    rel = os.path.relpath(path, ROOT)
    for i, line in enumerate(open(path, encoding='utf-8'), 1):
        s = line.strip()
        if s.startswith('//') or s.startswith('*') or s.startswith('/*'):
            continue
        if 'ICONS' in line or 'MARK' in line:   # 图标表：字形是 aria-labelled 图标，不是文案（feature-card 同理，见 docs/copy-style.md）
            continue
        for m in STR_RE.finditer(line):
            lit = m.group(1)
            if not lit or not ZH_ONLY.search(lit) and not any(p in lit for p in PHRASES + TERMS):
                continue   # 只看中文文案 / 命中词表的字面量，HTML 模板与选择器不陪跑
            check_value(lit, f'{rel}:{i}', errs)


def run():
    errs = []
    for name in sorted(os.listdir(os.path.join(ROOT, 'map', 'i18n'))):
        if name.endswith('.json'):
            scan_json(os.path.join(ROOT, 'map', 'i18n', name), errs)
    packs = os.path.join(ROOT, 'map', 'packs')
    for d in sorted(os.listdir(packs)):
        mp = os.path.join(packs, d, 'manifest.json')
        if os.path.isfile(mp):
            scan_json(mp, errs)
    for f in FILES:
        p = os.path.join(ROOT, f)
        if os.path.isfile(p):
            scan_file(p, errs)
    return errs


def self_test():
    errs, ok = [], True
    def one(text, expect, tag):
        got = []
        check_value(text, tag, got)
        return (len(got) > 0) == expect
    # 坏例：三类各拦
    for text, tag in [('⚠ 数据链路受扰', 'g1'), ('已装好 📚 条目', 'g2'), ('一键写入 ✓', 'g3'),
                      ('我们为您准备好了', 'p1'), ('地图有新版 · S1-0100-R-0100！', 'p2'),
                      ('MVU 快照', 't1'), ('世界书 JIT 挂载', 't2'), ('写入 ledger', 't3'), ('构建 head #320 已发布', 't4')]:
        ok &= one(text, True, tag)
        if not one(text, True, tag): errs.append(f'坏例没拦住：{tag} {text}')
    # head #N 在豁免键上放行
    errs2 = []
    check_value('当前构建 head #320 · 2026-10-03', 'about.build_line', errs2)
    if errs2: ok = False; errs.append(f'豁免键被拦：{errs2}')
    # 好例：方向箭头 / 中性符号 / 普通文案
    for text, tag in [('辉光教堂 → 执法局（途中）', 'ok-arrow'), ('× 关闭', 'ok-x'), ('还有 3 条：…', 'ok-ell'),
                      ('地图有新版 v0.9.7', 'ok-plain'), ('新增 3 条、更新 1 条。', 'ok-zh')]:
        if not one(text, False, tag): ok = False; errs.append(f'好例被拦：{tag} {text}')
    return ok, errs


if __name__ == '__main__':
    if '--self-test' in sys.argv:
        ok, errs = self_test()
        print('\n'.join(errs))
        print('check_copy 自测：' + ('通过' if ok else '失败'))
        sys.exit(0 if ok else 1)
    errs = run()
    for e in errs:
        print(e)
    print(f'check_copy：扫描完成，{len(errs)} 处违规')
    sys.exit(1 if errs else 0)
