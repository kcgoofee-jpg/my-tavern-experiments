# 房间图集（room gallery）

代码：`map/ui/room-gallery-panel.js`（UI）、`map/core/room-gallery-logic.mjs`（纯逻辑，`node --test` 测）、
`map/core/room-gallery-db.mjs`（IndexedDB 读写，只在浏览器里跑）、`map/data/gallery.json`（公开清单）、
`tools/gallery_review.py`（所有者审核工具）。

## 模型：本地私有 vs 公开

- 默认、且对绝大多数用户来说唯一的模式：图片上传后缩到 ≤1600px、转 webp，存在**这台浏览器**的 IndexedDB 里。
  分「仅本聊天」（按 SillyTavern 当前 chatId 隔离）和「全部聊天共用」（这台设备上所有聊天共用）两种存放范围，
  但两者都**只在本机**，不会离开浏览器，我们的代码不扫描、不上传、不检查这些图。
- 图片旁的可见性控件（「仅自己」｜「投稿到公开图集」）：
  - 「仅自己」：留在本机，别人永远看不到。
  - 「投稿」：只是打一个「想公开」的标记；**不会自动上传任何东西**。真正决定收不收的是仓库所有者，手动跑
    `tools/gallery_review.py` 审核。
- 「投稿」「导出投稿包」这些 UI，**默认对所有人隐藏**，只有本机在 设置 → 高级 打开「维护者模式」才会出现。
  这不是权限校验（客户端脚本没法安全鉴权任何人），只是给仓库所有者自己用的工作流开关：对普通用户来说，
  「公开图集」这个概念根本不存在，他们的图永远只在本机、只是私有的。

## 真正的安全边界：GitHub 仓库权限

查看器代码本身**无法**判断打开它的人是谁。能不能把图放进公开图集，唯一真正的把关点是：
**只有仓库所有者（kcgoofee-jpg）能提交 `map/data/gallery.json`**。查看器只做两件事，且只做这两件事：

1. 只显示 `gallery.json` 里登记过的图，并且这些图必须落在 `map/art/gallery/<roomId>/` 目录下——见
   `map/core/room-gallery-logic.mjs` 的 `safeGalleryImagePath()`；面板渲染前都会过这一步，拒绝任何别的来源
   （比如清单里塞一个外部 URL）。
2. `tools/check_maps.py` 在门控里额外校验 `gallery.json`：每条记录的文件名不能带路径穿越、类型必须在
   webp/jpg/jpeg/png 白名单里、对应文件必须真的存在于 `map/art/gallery/<roomId>/` 下、单文件不超过 3MB。
   不满足就是错误，`tools/smoke.sh` 会拦。

陌生人拿到这份代码也没法让自己的图出现在别人的公开图集里——他们改不了别人仓库里的 `gallery.json`，而查看器
从不信任除这个文件之外的任何来源。

## 所有者怎么收投稿

1. 用户在图集面板把想投稿的图切到「投稿」，点「导出投稿包」——下载 `<roomId>_manifest.json` +
   `<roomId>_NN.webp` 到浏览器默认下载目录。这一步不会打开任何提交链接（`buildIssueUrl` 生成的链接只在
   维护者模式下才会用到，见下）。
2. 所有者把这些文件挪进收件箱目录，例如 `~/Downloads/eden-map/gallery-inbox/`（C3 英文化；旧 `~/Downloads/酒馆/gallery-inbox/` 可用 --inbox 指回；文件可直接原样放，不用建子目录）。
3. 跑：

   ```bash
   python3 tools/gallery_review.py                     # 默认收件箱 ~/Downloads/eden-map/gallery-inbox/
   python3 tools/gallery_review.py --inbox <别的目录>
   ```

   对每张图会看到：尺寸、文件大小、sha256、来源房间，以及一个**仅供参考**的 NSFW 打分（见下）。
   所有者按 `y`（收录）/ `n`（拒绝）/ `s`（跳过，下次再看）逐张决定。**没有任何一张图会被自动收录**——
   分类器打分再低也不会自动通过，标记为疑似的也不会自动拒绝，只是默认建议 `n`，最终都是人按的键。
   按 `y` 的图会被复制进 `map/art/gallery/<roomId>/`，并写进 `map/data/gallery.json`。
4. 跑 `python3 tools/check_maps.py`（或 `bash tools/smoke.sh`）确认门控通过，再提交 `map/data/gallery.json`
   与新增的 `map/art/gallery/**` 文件。

### NSFW 分类器说明

`tools/gallery_review.py` 优先用开源的 [`opennsfw2`](https://github.com/bhky/opennsfw2)（Yahoo open_nsfw 的
Keras/TF 移植，纯本地推理，不需要联网就能跑）。没装的话：

```bash
python3 -m pip install opennsfw2 tensorflow
```

第一次真正调用时，`opennsfw2` 会去拉取一次模型权重（工具会打印一行清楚的提示），之后离线复用。没装这个包
也完全能用本工具——每张图的打分会显示「未扫描」，照常靠人工看图决定，**不会**因为没有分类器就放得更松或
收得更紧。分类器分数从来只是列在旁边参考，从不参与任何自动通过/拒绝的判断。

## 定期人工复核

`gallery.json` 里已经收录的图，建议不定期（比如每次发版前）重新扫一遍：

```bash
python3 tools/gallery_review.py --audit
```

这个模式**不会改任何文件**，只是对已收录的每张图重新算尺寸/大小/sha256/NSFW 打分并打印出来，标出新出现的
「疑似」项，供所有者人工再看一眼、决定要不要手动把哪张图从 `gallery.json` 和 `map/art/gallery/` 里删掉。

## 边界

- 本工具、`gallery_review.py`、查看器代码，都**不会**碰用户标了「仅自己」的图——那些图只存在浏览器
  IndexedDB 里，从不会出现在文件系统、从不会被扫描或上传。
- `tools/gallery_review.py` 只处理用户**主动导出**到收件箱目录的投稿包；不会去读 SillyTavern/TavernHelper
  的任何本机数据目录，也不会自己去找用户的浏览器 profile。
