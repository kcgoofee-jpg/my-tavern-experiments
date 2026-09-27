#!/usr/bin/env python3
"""给审阅代理打包一份简报（brief.md）+ 本轮全部提示词（已填好路径）。只用标准库。

用法：
  python3 tools/review/pack.py --stage city --round 2 --out <目录> --images 'scratch/r2/*.png' docs/drafts/v7_*.jpg \
      [--since <上轮提交>] [--changes "本轮改了什么"] [--facts facts.md]
  --stage：city（阶段 1 中 / 下层）· upper（阶段 2 上层庄园）· clouds（阶段 3）· render8k（阶段 4）· estate（伊甸庄园 C3）· ui（面板 E4 / E5）
产出：
  <目录>/brief.md                        图片清单（尺寸）、本轮改动（git log / diff --stat）、NOTES 最后两节、GOAL 近况与用户原话、门控阈值
  <目录>/prompts/<人设>.md               固定人设提示词（{{BRIEF}} {{ROUND}} {{OUT}} 已替换），报告写到 <目录>/reports/<人设>.md
  <目录>/prompts/_fresh_persona.md       现编人设的元提示词（编排代理读它，现编一位，报告写到 reports/fresh_r<N>.md）
  <目录>/prompts/_architect.md           架构师汇总（最后跑）
所有审阅代理用 Opus。流程见 tools/review/README.md。
"""
import argparse, glob, os, re, struct, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

GOOD_ENOUGH = [  # 渲染「够用」门槛（用户 2026-09-27 同意，见 docs/reviews/rp_value_study/architect.md (b)）
    '严格（不达标不过）：与设定一致 ≥ 7；省流档 2000 px 与 375 px 手机上一眼认出是哪一层、哪片城区；标记可读（对比度 ≥ 4.5，1080p 推流后仍可读）',
    '严格：TT 内性能——省流首屏 ≤ 3 s、单层标准档 ≤ 1.5 MB、开关面板 20 次 JS 堆不增长；标准档下无明显瑕疵（只判有 / 无）',
    '参考（不阻断）：写实度（≥ 6 为宜）、园林与建筑史、拼缝与重复；8K 局部只抽查明显瑕疵，不打分',
    '每条问题标注在哪一档可见（省流 2000 / 标准 4000 / 清晰 8000）；只在清晰档可见的自动降为 P2',
    '轮次：每个资产每个版本最多 2 轮；一轮提升 < 0.5 分就提前停；到上限按最高分版本发；遗留进 backlog，不开新轨道',
    '`art/rp_glance`（RP 玩家扫一眼）可以否决「再开一轮」',
]
STAGES = {
    'city': (['art/rp_glance', 'art/setting', 'art/readability', 'art/realistic_aerial', 'art/seams'],
             ['渲染无报错；`python3 tools/check_maps.py` 通过', *GOOD_ENOUGH,
              '没有穿模或压在路上的楼；中层检查点与下层 7 号井平面位置不变']),
    'upper': (['art/rp_glance', 'art/setting', 'art/readability', 'art/realistic_aerial', 'art/seams', 'art/garden_history'],
              [*GOOD_ENOUGH, '伊甸在默认视野里一眼最显眼；英式 / 法式 800 m、苏州 / 岭南约 400 m 视野能认出（严格）',
               '不做岛影（用户未批准）；航线不计门控']),
    'clouds': (['art/rp_glance', 'art/readability', 'art/realistic_aerial'],
               ['俯视读得出「厚云层、岛浮在上面」；不做岛影，只留白云遮挡岛底', *GOOD_ENOUGH]),
    'render8k': (['art/rp_glance', 'art/seams'],
                 ['四张都生成；`check_maps.py` 通过', '每层抽 3 处 8K 局部：只查明显瑕疵（锯齿、橘皮、断线、怪影），不打分',
                  '浏览器（`node tools/browser/accept.mjs <目录>`）：省流首屏 ≤ 3 s、切层、云雾开关、事态飞行正常；桌面与 375 手机截图']),
    'estate': (['art/rp_glance', 'estate/architect', 'estate/interior', 'estate/luxury_marketer', 'estate/interaction_perf'],
               [*GOOD_ENOUGH, '庄园重点：马桶、毛巾近景「清楚有质感」（严格）；不再要求每位 ≥ 8']),
    'ui': (['ui/phone', 'ui/rp', 'ui/design', 'ui/a11y', 'ui/weak_net'],
           ['与上轮同步骤复跑，逐条确认 `docs/ui-audit.md` 的编号（✅ / ⚠ / ❌）',
            '没有新的 P0 / P1 回归；E5 前后对比每位人设的分数',
            '浏览器验收 `node tools/browser/accept.mjs <目录>` 全部 ✓']),
}


def sh(*cmd):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()


def img_size(path):
    try:
        with open(path, 'rb') as f:
            head = f.read(26)
            if head[:8] == b'\x89PNG\r\n\x1a\n':
                return struct.unpack('>II', head[16:24])
            if head[:2] == b'\xff\xd8':                    # JPEG：找 SOF 段
                f.seek(2)
                while True:
                    m = f.read(4)
                    if len(m) < 4 or m[0] != 0xFF: return None
                    ln = struct.unpack('>H', m[2:4])[0]
                    if m[1] in (0xC0, 0xC1, 0xC2):
                        h, w = struct.unpack('>xHH', f.read(5)); return w, h
                    f.seek(ln - 2, 1)
    except OSError:
        pass
    return None


def notes_tail(n=2, max_lines=45):
    p = os.path.join(ROOT, 'NOTES_FROM_LOCAL.md')
    if not os.path.exists(p): return '（没有 NOTES_FROM_LOCAL.md）'
    txt = open(p, encoding='utf-8').read()
    secs = re.split(r'(?m)^(?=## )', txt)[1:]
    out = []
    for s in secs[-n:]:
        lines = s.rstrip().splitlines()
        out.append('\n'.join(lines[:max_lines]) + ('\n…（截断）' if len(lines) > max_lines else ''))
    return '\n\n'.join(out)


def goal_recent():
    p = os.path.join(ROOT, 'docs', 'GOAL_v0.9.1.md')
    if not os.path.exists(p): return '', ''
    lines = open(p, encoding='utf-8').read().splitlines()
    todo = [l.strip() for l in lines if re.match(r'\s*- [☐◐]', l)]
    user = [l.strip() for l in lines if re.search(r'用户[^。]{0,6}20\d\d-\d\d-\d\d', l)]
    cut = lambda l: l if len(l) <= 260 else l[:260] + '…'
    return '\n'.join(map(cut, todo)), '\n'.join(map(cut, user))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--stage', required=True, choices=STAGES)
    ap.add_argument('--round', type=int, default=1)
    ap.add_argument('--out', required=True)
    ap.add_argument('--images', nargs='*', default=[], help='图片路径或通配（可多个）')
    ap.add_argument('--since', help='上一轮的提交（默认 HEAD~1）')
    ap.add_argument('--changes', default='', help='本轮改动的一段话（给审阅者看）')
    ap.add_argument('--facts', help='设定事实 / 额外说明文件（原样并入简报）')
    ap.add_argument('--personas', help='只用这些人设（逗号分隔，如 art/seams,art/setting）')
    a = ap.parse_args()

    out = os.path.abspath(a.out); os.makedirs(os.path.join(out, 'prompts'), exist_ok=True); os.makedirs(os.path.join(out, 'reports'), exist_ok=True)
    personas, gates = STAGES[a.stage]
    if a.personas: personas = a.personas.split(',')
    since = a.since or 'HEAD~1'

    imgs = []
    for g in a.images:
        hits = sorted(glob.glob(os.path.expanduser(g))) or ([g] if os.path.exists(g) else [])
        if not hits: print('找不到图片：', g, file=sys.stderr)
        imgs += [os.path.abspath(h) for h in hits]
    img_lines = []
    for p in imgs:
        s = img_size(p); kb = os.path.getsize(p) // 1024
        img_lines.append(f'- `{p}`' + (f'（{s[0]}×{s[1]}，{kb} KB）' if s else f'（{kb} KB）'))

    todo, user = goal_recent()
    brief = [f'# 审阅简报：{a.stage} 第 {a.round} 轮', '',
             f'仓库 `{ROOT}`，分支 `{sh("git", "rev-parse", "--abbrev-ref", "HEAD")}`，HEAD `{sh("git", "rev-parse", "--short", "HEAD")}`，对比基准 `{since}`。',
             '只读：不改仓库文件、不做 git 操作。图片用 Read 打开。', '',
             '## 门控阈值（docs/GOAL_v0.9.1.md）', *[f'- {g}' for g in gates],
             '- 每轮除固定人设外，还有一位根据本轮改动现编的审阅者（`tools/review/fresh_persona.md`），分数同等计入。', '',
             '## 图片 / 材料', *(img_lines or ['（未给图片）']), '']
    if a.changes: brief += ['## 本轮改动（编排者说明）', a.changes, '']
    brief += ['## 提交记录', '```', sh('git', 'log', '--oneline', f'{since}..HEAD') or '（无）', '```', '',
              '## 改动文件（git diff --stat，不含 map/art 瓦片）', '```',
              '\n'.join(sh('git', 'diff', '--stat=120', since, '--', '.', ':(exclude)map/art').splitlines()[-40:]) or '（无）', '```', '']
    if a.facts: brief += ['## 设定事实 / 额外说明', open(a.facts, encoding='utf-8').read().strip(), '']
    brief += ['## GOAL 未完成项', todo or '（无）', '', '## 用户原话（GOAL 里带日期的要求）', user or '（无）', '',
              '## NOTES_FROM_LOCAL.md 最后两节', notes_tail(), '']
    bpath = os.path.join(out, 'brief.md')
    open(bpath, 'w', encoding='utf-8').write('\n'.join(brief))

    def render(src, name, report):
        t = open(os.path.join(HERE, src), encoding='utf-8').read()
        t = t.replace('{{BRIEF}}', bpath).replace('{{ROUND}}', str(a.round)).replace('{{OUT}}', os.path.join(out, 'reports', report))
        open(os.path.join(out, 'prompts', name), 'w', encoding='utf-8').write(t)
    for p in personas:
        render(f'personas/{p}.md', p.replace('/', '_') + '.md', p.replace('/', '_') + '.md')
    render('fresh_persona.md', '_fresh_persona.md', f'fresh_r{a.round}.md')
    render('architect_synthesis.md', '_architect.md', 'verdict.md')
    print(f'简报 {bpath}')
    print(f'提示词 {len(personas)} 位固定人设 + 现编元提示词 + 架构师 → {out}/prompts/')
    print('下一步：每个 prompts/*.md 各派一个 Opus 审阅代理（_fresh_persona.md 先由编排者现编人设再派），全部回来后派架构师（_architect.md）。')


if __name__ == '__main__':
    main()
