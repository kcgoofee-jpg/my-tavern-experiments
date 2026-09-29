#!/usr/bin/env python3
"""房间图集：仓库所有者手动审核投稿包，决定谁能进 map/data/gallery.json（真正的“谁能公开”由 GitHub 仓库权限把关——
只有仓库所有者能提交这个文件；本工具只是所有者自己整理投稿用的本地小工具，不是身份验证）。

投稿包怎么来：用户在房间图集面板里把某几张图切到「投稿」→点「导出投稿包」，浏览器下载 <roomId>_manifest.json
+ 若干 <roomId>_NN.webp 到下载目录。所有者手动把这些文件挪到收件箱目录（例如 ~/Downloads/酒馆/gallery-inbox/），
本工具扫描收件箱，列出每个包的图（尺寸、大小、sha256、来源房间），跑一遍开源 NSFW 分类器**仅供参考**，
所有者一张张按 y/n/s 决定，只有明确按 y 的才会被复制进 map/art/gallery/<roomId>/ 并写进 gallery.json。
分类器打分从不自动通过或自动拒绝任何图；被标记（flagged）的图默认建议拒绝，但最终仍由所有者自己按键决定。

本工具只处理「用户主动导出到收件箱」的投稿包，绝不扫描/读取用户本机私有图库（IndexedDB 里那些没被标记
「投稿」的图，本工具根本碰不到——那些图只存在浏览器 IndexedDB 里，从不会出现在文件系统的收件箱目录）。

用法：
  python3 tools/gallery_review.py                          # 交互审核 ~/Downloads/酒馆/gallery-inbox/ 里的新投稿包
  python3 tools/gallery_review.py --inbox <dir>             # 换收件箱目录
  python3 tools/gallery_review.py --audit                   # 复核 gallery.json 里已收录的图（不问要不要收录，只重新打分 + 报告）
  python3 tools/gallery_review.py --yes-to-all              # 危险：跳过确认，仅用于本工具自己的测试，不要在真实审核里用

NSFW 分类器（仅供参考，从不自动决策）：
  优先用 `opennsfw2`（开源，Bhargavi/Yahoo open_nsfw 的 Keras/TF 移植，纯本地推理，不联网）。
  没装的话，跑 `python3 -m pip install opennsfw2 tensorflow` 后再用；本工具不会替你静默安装或联网下载模型——
  第一次用到时会打印一行清楚的提示（模型权重由 opennsfw2 包自己管理，首次调用会从其官方发布拉取，之后离线缓存）。
  装不了/不想装也能用：分类器缺失时每张图打分显示「未扫描」，本工具照常等人工看图决定，不会因为没有分类器就更宽松或更严格。
"""
import argparse
import hashlib
import json
import os
import shutil
import sys

REPO = os.path.dirname(os.path.abspath(os.path.join(__file__, '..')))
MAP_ROOT = os.path.join(REPO, 'map')
GALLERY_JSON = os.path.join(MAP_ROOT, 'data', 'gallery.json')
GALLERY_DIR = os.path.join(MAP_ROOT, 'art', 'gallery')
DEFAULT_INBOX = os.path.expanduser('~/Downloads/eden-map/gallery-inbox/')   # C3 英文化；旧 ~/Downloads/酒馆/gallery-inbox/ 可用 --inbox 指回去
MAX_BYTES = 3 * 1024 * 1024
ALLOWED_EXT = {'.webp', '.jpg', '.jpeg', '.png'}
FLAG_THRESHOLD = 0.5   # opennsfw2 打分 ≥ 这个值就在列表里标「⚠ 疑似」，仅提示，不阻止人工放行


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def image_dims(path):
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size
    except Exception as e:
        return (None, None)


_nsfw_model = None
_nsfw_tried = False


def nsfw_score(path):
    """返回 0..1 的分数（越高越像 NSFW）或 None（没装分类器/推理失败——不代表安全，只代表没扫）。"""
    global _nsfw_model, _nsfw_tried
    if not _nsfw_tried:
        _nsfw_tried = True
        try:
            import opennsfw2 as n2
            print('[gallery_review] 首次用到 opennsfw2：模型权重由该包自己管理，若本机没有缓存会去其发布地址下载一次，之后离线复用。', file=sys.stderr)
            _nsfw_model = n2
        except Exception:
            _nsfw_model = None
    if _nsfw_model is None:
        return None
    try:
        return float(_nsfw_model.predict_image(path))
    except Exception as e:
        print(f'[gallery_review] NSFW 推理失败（{path}）：{e}', file=sys.stderr)
        return None


def find_manifests(inbox):
    if not os.path.isdir(inbox):
        return []
    out = []
    for f in sorted(os.listdir(inbox)):
        if f.endswith('_manifest.json'):
            out.append(os.path.join(inbox, f))
    return out


def load_gallery():
    if os.path.exists(GALLERY_JSON):
        with open(GALLERY_JSON, encoding='utf-8') as f:
            return json.load(f)
    return {"_说明": "公开图集清单，结构见 tools/gallery_review.py / map/core/room-gallery-logic.mjs 的 buildExportManifest()", "rooms": {}}


def save_gallery(gal):
    with open(GALLERY_JSON, 'w', encoding='utf-8') as f:
        json.dump(gal, f, ensure_ascii=False, indent=2)
        f.write('\n')


def describe(path, room):
    w, h = image_dims(path)
    size = os.path.getsize(path)
    sha = sha256_of(path)
    score = nsfw_score(path)
    ext_ok = os.path.splitext(path)[1].lower() in ALLOWED_EXT
    problems = []
    if not ext_ok:
        problems.append(f'类型不在白名单 {sorted(ALLOWED_EXT)}')
    if size > MAX_BYTES:
        problems.append(f'{size} 字节超过 {MAX_BYTES}')
    return {
        'path': path, 'room': room, 'w': w, 'h': h, 'bytes': size, 'sha256': sha,
        'nsfw_score': score, 'flagged': score is not None and score >= FLAG_THRESHOLD,
        'problems': problems,
    }


def print_item(info):
    fn = os.path.basename(info['path'])
    score_s = '未扫描' if info['nsfw_score'] is None else f"{info['nsfw_score']:.2f}" + ('  ⚠ 疑似' if info['flagged'] else '')
    print(f"  文件：{fn}")
    print(f"    房间：{info['room']}   尺寸：{info['w']}×{info['h']}   大小：{info['bytes']} 字节   sha256：{info['sha256'][:16]}…")
    print(f"    NSFW 打分（仅供参考，不代表最终结论）：{score_s}")
    if info['problems']:
        print(f"    ⛔ 硬性问题（不满足 check_maps 的 gallery.json 检查，即使批准也建议先修）：{'；'.join(info['problems'])}")


def prompt_decision(info, yes_to_all):
    if yes_to_all:
        return 'y'
    default = 'n' if info['flagged'] or info['problems'] else None
    hint = 'y=收录 / n=拒绝 / s=跳过（下次再看）'
    if default:
        hint += f'（NSFW 疑似或有硬性问题，默认建议 n，但由你决定）'
    while True:
        ans = input(f"    决定？{hint}: ").strip().lower()
        if ans in ('y', 'n', 's'):
            return ans
        if ans == '' and default:
            return default


def review(inbox, yes_to_all, note_author):
    manifests = find_manifests(inbox)
    if not manifests:
        print(f'收件箱 {inbox} 里没有 *_manifest.json 投稿包（用户从图集面板「导出投稿包」下载后手动放进这个目录）。')
        return 0
    gal = load_gallery()
    gal.setdefault('rooms', {})
    approved = rejected = skipped = 0
    for mpath in manifests:
        with open(mpath, encoding='utf-8') as f:
            manifest = json.load(f)
        room = manifest.get('room')
        if not room:
            print(f'✗ {mpath}: manifest 没有 room 字段，跳过')
            continue
        print(f"\n投稿包 {os.path.basename(mpath)} · 房间「{room}」· {len(manifest.get('images', []))} 张")
        for im in manifest.get('images', []):
            fn = im.get('file')
            fp = os.path.join(inbox, fn) if fn else None
            if not fp or not os.path.exists(fp):
                print(f'  ✗ 清单里的文件缺失：{fn}')
                continue
            info = describe(fp, room)
            print_item(info)
            ans = prompt_decision(info, yes_to_all)
            if ans == 's':
                skipped += 1
                continue
            if ans == 'n':
                rejected += 1
                continue
            # y：即使批准，硬性问题（类型/大小）也不能进仓库——check_maps 会拦，这里直接先拦
            if info['problems']:
                print(f"    ✗ 硬性问题没解决，不能收录：{'；'.join(info['problems'])}")
                rejected += 1
                continue
            dest_dir = os.path.join(GALLERY_DIR, room)
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, fn)
            shutil.copy2(fp, dest)
            entry = {'file': fn, 'w': im.get('w'), 'h': im.get('h'), 'note': im.get('note', '')}
            if note_author:
                entry['author'] = note_author
            room_entry = gal['rooms'].setdefault(room, {'images': []})
            room_entry['images'] = [e for e in room_entry['images'] if e.get('file') != fn] + [entry]
            approved += 1
            print(f'    ✓ 已收录 → map/art/gallery/{room}/{fn}')
    save_gallery(gal)
    print(f'\n完成：{approved} 张收录，{rejected} 张拒绝，{skipped} 张跳过。gallery.json 已更新——记得 `python3 tools/check_maps.py` 再提交。')
    return 0


def audit():
    """复核已经在 gallery.json 里的图：重新算 sha256/尺寸/NSFW 分，报告但不改文件——定期人工抽查用（docs/gallery.md）。"""
    gal = load_gallery()
    n = 0
    flagged_any = False
    for room, rr in (gal.get('rooms') or {}).items():
        for im in rr.get('images', []):
            fn = im.get('file')
            fp = os.path.join(GALLERY_DIR, room, fn) if fn else None
            n += 1
            if not fp or not os.path.exists(fp):
                print(f'✗ {room}/{fn}: 文件缺失（gallery.json 有记录但仓库里没有）')
                continue
            info = describe(fp, room)
            score_s = '未扫描' if info['nsfw_score'] is None else f"{info['nsfw_score']:.2f}"
            flag = ' ⚠ 疑似，建议人工复核' if info['flagged'] else ''
            if info['flagged']:
                flagged_any = True
            print(f"{room}/{fn}: {info['w']}×{info['h']}  {info['bytes']}B  nsfw={score_s}{flag}" + (f"  ⛔ {'；'.join(info['problems'])}" if info['problems'] else ''))
    print(f'\n复核完：{n} 张已收录的图。' + ('有标记为疑似的，请人工打开看一眼。' if flagged_any else '没有新的疑似标记。'))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--inbox', default=DEFAULT_INBOX, help='投稿包收件箱目录（默认 ~/Downloads/酒馆/gallery-inbox/）')
    ap.add_argument('--audit', action='store_true', help='复核 gallery.json 里已收录的图，不审新投稿')
    ap.add_argument('--yes-to-all', action='store_true', help='危险：跳过交互确认，全部按 y 处理——只给本工具自己的自动化测试用')
    ap.add_argument('--author', default='', help='本轮收录写进 entry.author 的署名（可选）')
    args = ap.parse_args()
    if args.audit:
        return audit()
    return review(args.inbox, args.yes_to_all, args.author)


if __name__ == '__main__':
    sys.exit(main())
