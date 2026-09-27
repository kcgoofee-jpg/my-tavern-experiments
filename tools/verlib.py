"""版本号与标签的共用规则（check_version.py / version_code.py / build_preview_script.py；JS 侧同一套在 map/tavern/selfcheck.mjs）。

规范版本（VERSION 文件、CHANGELOG 小节、README「当前发布版本」都写这个）：
  - 系列 1（沿用）：X.Y.Z，小修补丁 X.Y.Z.P；标签 map-vX.Y.Z[.P]
  - 系列 ≥ 2（版本号从 0 重新数）：S<n>:X.Y.Z[.P]；标签 map-s<n>-vX.Y.Z[.P]（不和 map-v0.x 撞）
build.json 只写 version = X.Y.Z[.P]，系列在构建编码前缀 S<n> 里。排序按（系列, 各段；缺的段按 0）。详见 docs/versioning.md。
"""
import re

FULL_RE = re.compile(r'(?:S(\d+):)?(\d+\.\d+\.\d+(?:\.\d+)?)')
TAG_RE = re.compile(r'map-(?:s(\d+)-)?v(\d+\.\d+\.\d+(?:\.\d+)?)')
CODE_RE = re.compile(r'S(\d+)-(\d+(?:p\d+)?)-([RBTD])-(\d{4})')


def parse(full):
    """'S2:0.1.0' → (2, '0.1.0')；'0.9.6' → (1, '0.9.6')；不合规返回 None"""
    m = FULL_RE.fullmatch(str(full).strip())
    return (int(m.group(1) or 1), m.group(2)) if m else None


def full(series, ver):
    return f'S{int(series)}:{ver}' if int(series) > 1 else str(ver)


def tag_of(v):
    s, ver = parse(v)
    return f'map-s{s}-v{ver}' if s > 1 else f'map-v{ver}'


def ver_of_tag(tag):
    m = TAG_RE.fullmatch(str(tag).strip())
    return full(m.group(1) or 1, m.group(2)) if m else None


def key(v):
    s, ver = parse(v)
    p = [int(x) for x in ver.split('.')]
    return (s, *(p + [0] * (4 - len(p))))


def code_seg(ver):
    """构建编码的版本段：0.9.6 → 0906，0.9.6.1 → 0906p1，1.12.3 → 11203（ver 不带系列）"""
    p = [int(x) for x in ver.split('.')]
    return f'{p[0]}{p[1]}{p[2]:02d}' + (f'p{p[3]}' if len(p) > 3 else '')


def display(v):
    s, ver = parse(v)
    return (f'S{s} ' if s > 1 else '') + f'v{ver}'
