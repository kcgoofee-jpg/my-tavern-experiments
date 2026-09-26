#!/usr/bin/env python3
# 在云端给的《母畜庄园世界书_地图联动版》上补本机审阅定下的规则，输出新版 JSON（不改源文件）。
# 用法：python3 tools/build_worldbook.py <源.json> <输出.json>
# 改动：
#   「地图联动规范」加频率上限、状态更新、内容硬边界，以及紧凑写法（⌖）说明；
#   「场景与社会渗透」加 [天城事态] 注入的用法（只作背景，亲密场景最多一句）。
# 示范标签原文要与 map/tavern/events.mjs 的 EXAMPLES 一致（模型原样复述时不上图）。
import json, sys

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
by = {e['comment']: e for e in d['entries'].values()}

r = by['地图联动规范']
c = r['content']
add = '''频率：多数楼层一个标签都没有；只在出现新的快讯 / 通报 / 终端情报、或事件升级 / 解除时加；同一事件不每楼重复；它和「场景与社会渗透」共用每轮 1–2 个的名额，不另加。
边界：标签和载体只写城市治安、灾害、网络、公共事务；任何性相关或束缚类内容都不要写进标签（地图会整条丢弃）。
紧凑写法（也认）：<span style="display:none">⌖类型｜层·地点｜等级｜标题｜来源</span>，等级写 0 表示已解除。
'''
if '频率：多数楼层' not in c:
    c = c.replace('</地图联动规范>', add + '</地图联动规范>')
r['content'] = c

s = by['场景与社会渗透']
if '[天城事态]' not in s['content']:
    s['content'] = s['content'].replace('  - 同一个细节不连续两轮使用。', '''  - 同一个细节不连续两轮使用。
  - 看到 [天城事态] 提示时：那是这座城此刻正在发生的事，只作背景；需要时用一句环境声、窗外的光或旁人一句话带过，不展开、不科普；亲密场景里最多一次。''', 1)
assert '[天城事态]' in s['content'] and '频率：多数楼层' in r['content']
json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('wrote', out, len(d['entries']), 'entries')
