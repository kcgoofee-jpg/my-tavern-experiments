#!/usr/bin/env python3
"""读卡覆盖核对：把各读者报告里的「文件:起-止」行号范围求并集，对照 lines.json 的总行数，列出没人读过的段落。

用法：
  python3 skills/card-map/coverage.py <导出目录> <读者报告.md> [更多报告 ...]
报告里任何形如 `book.txt:1-240`、`greet.txt:12-80`（全角冒号、~、– 也认）的写法都算读过。
没覆盖的段落打印成同样格式，直接交给补读者；全覆盖时退出码 0，否则 1。只用标准库。
"""
import json, os, re, sys

RANGE = re.compile(r'([\w.\-]+\.(?:txt|json))\s*[:：]\s*(\d+)\s*[-–~～]\s*(\d+)')


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    d = sys.argv[1]
    total = json.load(open(os.path.join(d, 'lines.json'), encoding='utf-8'))
    seen = {k: set() for k in total}
    for rep in sys.argv[2:]:
        for f, a, b in RANGE.findall(open(rep, encoding='utf-8').read()):
            if f in seen:
                seen[f].update(range(int(a), int(b) + 1))
    gaps = 0
    for f, n in total.items():
        miss, start = [], None
        for i in range(1, n + 2):
            if i <= n and i not in seen[f]:
                start = start or i
            elif start:
                miss.append((start, i - 1)); start = None
        pct = 100 * (n - sum(b - a + 1 for a, b in miss)) / max(n, 1)
        print(f'{f}: {n} 行，覆盖 {pct:.1f}%' + ('' if not miss else '；未读 ' + ' '.join(f'{f}:{a}-{b}' for a, b in miss)))
        gaps += len(miss)
    sys.exit(1 if gaps else 0)


if __name__ == '__main__':
    main()
