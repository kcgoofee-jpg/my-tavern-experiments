#!/usr/bin/env python3
"""机器标识必须 ASCII 的审计（用户 2026-09-29「标准化」指示 + docs/project-design.md §5 命名规则）。

规则（与 docs/project-design.md §5.1 一致，只覆盖「机器标识」，不覆盖用户可见文字）：
  1. 仓库里被跟踪的**路径 / 文件名**：不许出现非 ASCII（C3 已清零，这里防回潮）；
  2. `map/data/**`、`map/packs/**` 的 JSON **键**：非 ASCII 只允许出现在下面 KEYS_OK 列出的文件里
     （那些键是「世界书条目显示名 / 卡原名 / 事件分类名」——运行时按中文匹配，属于功能必需的兼容层）；
  3. JSON 里 `id` / `roomId` 一类**标识字段的值**：必须 ASCII（世界书条目 id、图集 roomId、房间编号…）。

不检查（有意保留中文，翻了会破坏功能）：文档正文、代码注释、UI 文案与 i18n 的**值**、卡原名与别名值、世界书条目显示名。

用法：python3 tools/check_ascii.py        # 0 通过；错误打印到 stderr、退出 1
"""
import glob, json, os, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
os.chdir(ROOT)

# 允许出现非 ASCII 键的文件 → 理由（新增文件要加进来必须同时写理由）
KEYS_OK = {
    'map/data/worldbook_addon.json': '世界书附加条目的显示名 / 别名（运行时按中文名同步到用户的世界书）',
    'map/data/worldbook_aliases.json': '旧中文条目名 → 当前 id 的别名表（旧对话兼容）',
    'map/data/eden_estate_rooms.json': '卡原房间名与别名（名字照抄原卡是硬规则）',
    'map/packs/town/events.json': '事件分类显示名（与 events.mjs 的 CATS 同源）',
    'map/packs/eden/names.en.json': '中文地名 / 分类名 → 英文译名对照表（键是卡原名与地名，运行时按中文匹配；S4-4 由 i18n/en.json 的 names 搬来）',
}
# 标识字段：值必须是 ASCII
ID_FIELDS = ('id', 'roomId', 'cid')

na = lambda s: any(ord(c) > 127 for c in str(s))
errors = []

tracked = subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.split()

# 1) 路径
paths = [f for f in tracked if na(f)]
for f in paths:
    errors.append(f'路径含非 ASCII：{f}（机器标识一律 ASCII；显示名放数据字段里）')

# 2) JSON 键 + 3) 标识字段值
for p in glob.glob('map/data/**/*.json', recursive=True) + glob.glob('map/packs/**/*.json', recursive=True):
    if not os.path.exists(p):
        continue
    try:
        doc = json.load(open(p, encoding='utf-8'))
    except Exception as e:
        errors.append(f'{p} 解析失败：{e}')
        continue
    def walk(x, path=''):
        if isinstance(x, dict):
            for k, v in x.items():
                if na(k) and not str(k).startswith('_') and p not in KEYS_OK:
                    errors.append(f'{p}: 非 ASCII 键 {path}/{k}（该文件未登记在 KEYS_OK；'
                                  f'若确是显示名，请在 tools/check_ascii.py 里登记并写理由）')
                if k in ID_FIELDS and isinstance(v, str) and na(v):   # 只查字符串值：schema 文件里 id 是 schema 对象，不是 id
                    errors.append(f'{p}: 标识字段 {path}/{k} 的值「{v}」含非 ASCII（id 一律 ASCII，另存显示名）')
                walk(v, f'{path}/{k}')
        elif isinstance(x, list):
            for i, v in enumerate(x[:400]):
                walk(v, f'{path}[{i}]')
    walk(doc)

if errors:
    print(f'ASCII 审计：{len(errors)} 个问题', file=sys.stderr)
    for e in errors[:40]:
        print('  错误', e, file=sys.stderr)
    sys.exit(1)
print(f'ASCII 审计：路径 {len(tracked)} 个、JSON 键与标识字段——全部合规'
      f'（{len(KEYS_OK)} 个文件登记为显示名 / 兼容层）')
