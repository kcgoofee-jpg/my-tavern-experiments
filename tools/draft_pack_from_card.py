#!/usr/bin/env python3
"""从角色卡 / 世界书导出（JSON，只读）起一份设定包草稿：层与地点候选、别名。给 tools/new_pack.py --from-draft 用。

用法：
  python3 tools/draft_pack_from_card.py <卡或世界书.json> [--out 草稿.json] [--layers 上层,中层,下层] [--max 40]
读：chara_card_v2 / v3 的 data.character_book.entries，或世界书导出的 entries（dict 或 list）。只读条目的标题（comment / name）与触发词（keys / key），
不读、不输出条目正文。按标题里的地点字样（街、区、馆、塔、港、宫、堡、井、市场…）挑地点候选；标题或触发词里出现 --layers 的层名就归到那一层，否则放进「未分层」。
草稿不能写进仓库（卡的内容不进公开仓库）：--out 指向仓库里时拒绝。默认写到 ~/Downloads/酒馆/草稿/<卡名>.draft.json。
草稿是起点：地点要人工核对、补坐标（new_pack 先随机摆，之后在 <层>.json 里改 nx / ny）。只用标准库。
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLACE = re.compile(r'(街|路|区|巷|馆|楼|塔|港|码头|宫|殿|堡|城|镇|村|井|市场|集市|广场|公园|学院|大学|医院|教堂|神殿|酒馆|酒吧|旅店|车站|站|基地|哨所|营|府|宅|庄园|别墅|岛|山|谷|湖|河|森林|矿|工厂|仓库|监狱|法院|议会|总部|分局)$')


def entries(doc):
    d = doc.get('data', doc) if isinstance(doc, dict) else {}
    book = (d.get('character_book') or {}).get('entries') if isinstance(d, dict) else None
    es = book if book is not None else doc.get('entries', []) if isinstance(doc, dict) else []
    return list(es.values()) if isinstance(es, dict) else list(es or [])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('--out'); ap.add_argument('--layers', default='')
    ap.add_argument('--max', type=int, default=40)
    a = ap.parse_args()
    doc = json.load(open(a.src, encoding='utf-8'))
    name = (doc.get('data', {}) or {}).get('name') or doc.get('name') or os.path.splitext(os.path.basename(a.src))[0]
    safe = re.sub(r'[^\w.-]+', '_', str(name))
    out = os.path.abspath(a.out or os.path.expanduser(f'~/Downloads/酒馆/草稿/{safe}.draft.json'))
    if os.path.commonpath([out, ROOT]) == ROOT: sys.exit(f'草稿不写进仓库（卡内容不进公开仓库）：{out}')
    layers = [l.strip() for l in a.layers.split(',') if l.strip()]
    buckets = {l: [] for l in layers}; buckets['未分层'] = []
    seen = set()
    for e in entries(doc):
        if not isinstance(e, dict): continue
        title = str(e.get('comment') or e.get('name') or '').strip()
        keys = [str(k).strip() for k in (e.get('keys') or e.get('key') or []) if str(k).strip()]
        cand = [t for t in [title, *keys] if t and len(t) <= 20 and PLACE.search(re.sub(r'[（(].*?[)）]', '', t))]
        if not cand: continue
        nm = title if title and len(title) <= 20 else min(cand, key=len)   # 标题优先（任一叫法像地点就收这一条）
        nm = re.sub(r'^[^·：:]*[·：:]', '', nm).strip() or nm
        if nm in seen: continue
        seen.add(nm)
        hay = title + ' ' + ' '.join(keys)
        lay = next((l for l in layers if l in hay), '未分层')
        buckets[lay].append({'name': nm, 'alias': sorted({k for k in keys if k != nm and len(k) <= 20})[:8], 'src': '草稿：来自卡世界书条目标题（请核对）'})
    draft = {'_说明': f'由 {os.path.basename(a.src)} 的世界书条目标题 / 触发词生成的草稿（不含正文）。核对后：python3 tools/new_pack.py <id> --title … --from-draft 本文件',
             'layers': [{'name': l, 'places': ps[:a.max]} for l, ps in buckets.items() if ps]}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(draft, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'写入 {out}：' + ('，'.join(f"{l['name']} {len(l['places'])} 处" for l in draft['layers']) or '没有认出地点'))


if __name__ == '__main__':
    main()
