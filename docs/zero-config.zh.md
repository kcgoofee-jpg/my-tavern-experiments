# 零配置、通用脚本、运行时读卡与查看器内编辑（S9 / S9b 设计）

> 中文版；英文版 `docs/zero-config.md` 为准（标题结构相同，由 `tools/check_zh_mirror.py` 把关）。计划步骤 **S9-design** 的产出
> （计划 `docs/plans/spatial-os.md` §5 阶段 C 的 S9 / S9b、§10 作者走查、决策 D13；todo I-12、E-08）。状态：**设计稿，工作决定已按默认
> 采用**（2026-10-01 用户不在：下面审阅表里每一条的推荐项就是工作决定，用户可以在 `docs/todo.md` §3 推翻任何一条）。本文件不带任何
> 代码改动。它给内核契约新增的规则预留为 **K-R90 … K-R103**（`docs/kernel-schema.md` §13「Planned in S9」；K-R79–K-R89 留给并行的
> S8 设计）。规则全文随附录里的步骤规格落地。文中对现有代码的描述都在 origin/preview `7958b5ad`（head #207）上核对过。

## 0. 审阅表（Z-01 … Z-19）

每行一个真正要拍板的问题。「工作决定」= 推荐项，2026-10-01 按默认采用（自动驾驶）。同一份清单也在 `docs/todo.md` §3，一条一行。
agent brief 已经定死的规则（引擎绝不写卡、绝不写用户的世界书；新开关默认关；不弹阻塞对话框）不作为选项列出。

| 编号 | 问题 | 选项 | 后果 | 推荐（工作决定） |
|---|---|---|---|---|
| Z-01 | 包的来源按什么顺序找 | A：按计划顺序——卡内嵌 → 索引匹配 → 用户网址 / 文件 → 自动。B：先看用户对这张卡的明确选择（网址、文件、某个内置包或「自动」），再卡内嵌 → 索引匹配 → 自动。 | A：卡里嵌了坏包或恶意包时用户永远换不掉；网址 / 文件那一档只有在既没内嵌又没匹配时才走得到。B：自动的几档仍按计划顺序；用户随时能覆盖（kernel-schema §2.3 出于安全已经这样定过）。 | **B** |
| Z-02 | 怎样算「索引匹配」 | A：给每个内置包打分：本聊天里已经有这个包的聊天变量（100）；卡名、作者或标签里出现 `match.card` 的词（每个字段 10）；卡自己的世界书里有条目标题等于 `match.worldbook` 的词（每个 5）；≥ 10 分才算候选，同分按索引顺序。B：只看卡名。 | A：已经用过某个内置包的聊天，不管卡叫什么都继续用它；改了名的卡靠两个条目标题也能认出来；单个共同词不会决定结果（I-26：列了标题的包，卡名/作者/标签词只有在某个标题命中时才计分）。B：卡改名或重新导出后地图就悄悄没了。 | **A** |
| Z-03 | 单独打开的查看器（没有酒馆；仓库的演示与测试页） | A：照旧打开索引里的 `default` 包。B：打开一个零配置演示。 | A：现有探针和公开演示全都照常；默认值是数据（`packs/index.json`），不是代码；酒馆宿主从不用它。B：为了没有用户收益的事重写探针框架。 | **A** |
| Z-04 | 卡的世界书里哪些条目变成地点节点 | A：只收认得出是地点的条目（标题或某个关键词里有当前语言的内核地点词，或者是外层已经是地点的嵌套标题）；其余忽略（聊天里提到时生长仍会补上）。B：每个条目都当候选。C：一个都不收（只靠生长）。 | A：误收的地点很少（人物、规则、势力都进不来）；没有地点词的真实地点要等聊天提到才出现。B：人物和规则条目变成地图上的点。C：陌生卡第一屏是空的。 | **A** |
| Z-05 | 自动包稳不稳定 | A：每个聊天推导一次，存进聊天变量；只有卡的指纹（名字、头像、条目标题、变量结构）变了才重推；节点 id 是名字的哈希，没改的地点 id 不变，长出来的节点保留。B：每次加载都重推。 | A：用户看到的东西不会在两次打开之间乱动；改过的卡会被重新读取。B：一次无关的世界书修改就可能把地图打乱。 | **A** |
| Z-06 | 没有包的卡用什么 id | A：`c_<卡名 + 头像文件名的哈希>`（kernel-schema O-7），导出时保留，所以嵌回卡里后用户别名、藏物、迷雾都还在。B：所有卡共用一个 id `auto`。 | A：两张卡永远不共享地图状态。B：不同卡的状态混在同一个存储命名空间里。 | **A** |
| Z-07 | 生长（K-R26）在哪里运行 | A：只对自动包运行（在从卡里读出的节点之上）。B：作者写的包也可以用一个默认关的开关打开。 | A：作者写的包保持原样（不认识的名字照旧进「未上图」挑选器）。B：现在就多一条要测的路径；以后再加也来得及。 | **A** |
| Z-08 | 开场白里的地点起什么作用 | A：只决定打开时看哪里（`ui.start`）。B：同时当作当前位置。 | A：不凭空造状态（brief 规则 4：开场白提到一个地点不等于说明人在那里）；地图在故事开始的地方打开。B：聊天还没说就先出现「你在这里」。 | **A** |
| Z-09 | 自动包用什么语言 | A：按卡名、开场白和条目标题的文字比例判断（汉字 ≥ 30 % → `zh`，假名 ≥ 10 % → `ja`，谚文 ≥ 30 % → `ko`，否则 `en`）；不足 20 个字母时用界面语言。B：总是用界面语言。 | A：在英文界面里读中文卡，也能用中文的地名匹配和行程句式。B：一半用户拿到错误的词表。 | **A** |
| Z-10 | 查看器怎样打开 schema-2 包（I-12） | A：在内存里把 v2 包投影成查看器已经会画的注册表形状（地图、标记、点位文件作为虚拟文件），再直接从 v2 树建节点运行时。B：改写查看器各模块，直接读 v2。 | A：schema-1 包的任何查看器模块行为都不变；第一个包不动；以后仍可逐个模块迁移（K-R61）。B：一次动到所有查看器模块；第一个包的一致性有风险。 | **A** |
| Z-11 | 示意图视图怎么画 | A：生成一张图（只有线和点，没有文字）作为单张图片源打开，节点名用普通标记显示；「任意图片作底图」也走同一条路。B：地图组件之外另写一个 DOM / SVG 渲染器。C：canvas。 | A：只有一条绘制路径，标记、卡片、事件、图层都照常工作；包里的任何文字都不会进图片（K-R64）。B / C：要多维护一个渲染器。 | **A** |
| Z-12 | 带图片的包体积上限 | A：所有外来包一律 1 MB，图片也算在内（大约三张照片）。B：嵌在卡里 1 MB；从网址或文件加载 8 MB；每张图解码后 ≤ 3 MB。C：不允许内嵌图片，只能用链接。 | A：零代码作者没法同时带一张底图和一组图集。B：卡保持轻量（宿主把卡放在内存里），文件可以带真正的底图；图片仍然计入上限（E-08）。C：需要图床，违背 D13。 | **B** |
| Z-13 | 包里用 https 链接引用的图片（K-09 C） | A：跟现有的立绘开关（默认开）走。B：新开关「加载包里链接的图片」，默认关。 | A：打开一张卡就会在没问过的情况下连第三方站点。B：用户主动打开后链接才加载；内嵌图和内置包的图始终显示。 | **B** |
| Z-14 | 编辑模式的改动存在哪里 | A：本浏览器里每个包一份本地草稿（位置、父节点、别名、图片），叠在加载的包上显示，导出时并进去；从不写进聊天或卡。B：存进聊天变量，跟着聊天走。 | A：编辑和游玩分开；一键就能重置。B：这张卡的每个聊天都带一份副本，滑动重生也撤不掉。 | **A** |
| Z-15 | 编辑内置包 | A：导出一份新 id 的完整外来副本。B：导出叠加层（K-R67 的 `overlay.v2.json` 形状），只含改动，由维护者提交。C：内置包不开放编辑模式。 | A：副本会丢掉只有内置包才有的东西（瓦片线路、三维页、旧名）。B：用一个通用文件取代原来的维护者模式手工合并；什么都不丢。C：维护者另走一套流程。 | **B** |
| Z-16 | 用户自己加的别名（「这个名字指那个地点」，K-R25）进不进导出 | A：进，作为对应节点的别名。B：不进。 | A：作者在游玩中教给地图的东西保留下来。B：导出时丢失。忽略列表、藏物、迷雾、事件永远不导出（它们是聊天状态）。 | **A** |
| Z-17 | 用 `tools/build_preview_script.py --pack` 生成的分包脚本 | A：继续认：烘进脚本的包算用户的明确选择；这个参数打印弃用提示，保留到 S10。B：现在就移除。 | A：谁装好的脚本都不会坏。B：示例包的用户得重新导入。 | **A** |
| Z-18 | 用户已经存在本浏览器里的私有图集图片 | A：原地保留；节点的图集按节点名（今天的房间键）和节点 id 都读；旧的「公开 / 投稿」标记在编辑模式之外忽略；不迁移数据。B：把记录迁移到节点 id。 | A：什么都不会丢；旧标记本身从来没有导出过任何东西。B：一次 IndexedDB 改写，有失败风险，却没有可见收益。 | **A** |
| Z-19 | 脚本运行中用户切到另一张卡 | A：宿主重新解析包；包变了就停掉当前实例、启动新实例（现有的接管路径），不刷新页面。B：显示一条被动提示「刷新后切换地图」。 | A：一个脚本无缝服务所有卡（D13）。B：更简单，但刷新之前屏幕上一直是错的地图。 | **A** |

## 1. 范围

S9 让引擎不写代码就能用于任何卡：一个通用脚本、按卡挑选包、一张自己出现的示意图，以及把自动结果变成包的导出。S9b 让作者在查看器里
细化这个包并挂图片。四个实现提示词（Sonnet · High），各一个单元（见附录）：

- **S9-1** —— 查看器原生打开 schema-2 包（I-12）：投影到查看器注册表、v2 节点运行时、隐式与显式示意图视图、图片视图作为单张图片源。
- **S9-2** —— 通用脚本：宿主里按卡解析包（用户选择、卡内嵌、索引、自动）、内置索引、网址 / 文件导入、v2 包的宿主侧、外来包给模型文字的
  生效开关、切卡重启。
- **S9-3** —— 运行时读卡、带生长的自动包、导出为包、探针 `autopack`。
- **S9b** —— 编辑模式、`media` 块、包图片与私有图片、任意图片作底图、房间图集迁移（E-08）、探针 `pack_editor`。

不在范围内：外部契约改名（`window.EdenMap`、存储键、聊天变量、入口文件、消息类型、第一个包的旧名；S10）；`tools/card_to_pack.py` 与技能
（S11；复用这里定义的读卡规则和夹具）；外来包的三维视图（在自检里列为「暂不显示」）；声明式图层（S8）。

## 2. 通用脚本与包的解析（K-R90–K-R92、K-R99）

### 2.1 一个脚本

发布的酒馆助手脚本就是 `tools/build_preview_script.py` 已经生成的加载器（CDN 线路、钉住的跟随、关于页戳记），只是不再烘入任何包。
包在运行时由入口最先导入的门卫模块选出（`map/tavern/pack-gate.mjs`，带顶层 `await` 的模块，所以入口同步启动时 `window.__tcPack`
已经备好，和今天烘入脚本时完全一样）。入口文件名、`window.__tcPack`、存储与聊天变量名都保持原样到 S10。

### 2.2 卡键与按卡选择

- **卡键** = `k` + `fnv36(name + "\n" + avatar)`，`name` 与 `avatar` 来自读卡桥（`mvu-bridge.cardInfo`，版权页用的同一条三级降级链；
  读取逻辑挪进一个共用小模块，让门卫在桥建好之前也能调用）。读不到卡 → 卡键 `k0`（没有按卡选择、没有内嵌包，索引只看聊天证据）。
- **按卡选择**（设置 → 高级 → 「地图包」，S9-2）：`automatic`（默认：走自动的几档）、`index:<id>`（某个内置包）、`url:<https 网址>`、
  `file`（用户选的包文件）。按卡键存在本浏览器里（§11）。旧的烘入式 `window.__tcPack` 算作选择 `baked`（Z-17）。

### 2.3 解析顺序（K-R90）

**K-R90 —— 包的解析。** 启动时和每次切卡时，宿主为当前卡解析出一个包；第一个给出可用包的来源胜出：
0. 用户对这张卡的选择（Z-01），或烘入脚本的包（Z-17）；
1. 卡内嵌的包（K-R91）；
2. 索引里最佳的匹配（K-R92）；
3. 自动包（K-R95）。

某一档的包被拒（`validate2` 不给包、取不到、超出体积上限）就落到下一档，并留一条自检记录；不阻塞、不弹对话框（brief 规则 6）。
结果是 `{ id, source: 'choice' | 'baked' | 'card' | 'index' | 'auto', trust: 'shipped' | 'foreign', schema, manifest }`：只有内置索引
里列出的包是 `shipped`（K-R63）。当结果是 id 等于 `core/pack.mjs` `DEFAULT_ID` 的内置包（持有旧名的那个包）时，宿主的启动和 S9 之前
完全一样：不注入包对象，所有名字、键和注入文字逐字不变。解析只读：读卡桥给的卡、卡自己的世界书、聊天变量的顶层键、内置索引、用户的
选择；不上传任何东西。

### 2.4 卡内嵌的包（K-R91）

**K-R91 —— 卡里嵌的包。** 依次读：(1) 读卡桥返回的卡的 `data.extensions.spatial_os`——一个所有块都内联的清单对象，或装着它的 JSON
字符串；(2) 卡自己的世界书（当前角色的主书和附加书；绝不读全局书或聊天书）里，按书序和条目序第一个标题（`name`，旧宿主 `comment`）
去掉首尾空白后等于 `spatial_os:pack` 的条目；条目内容是 JSON 文本。不管条目启用与否都读（作者应当把它停用，宿主就不会把它发给模型）。
包必须是 schema 2（schema-1 包是一组文件，没法内嵌）、全部内联、不超过 1 MB（Z-12），并以外来身份通过 `validate2`；id 等于内置包 id
的会被拒（K-R63）。引擎绝不写卡和卡的书（brief 规则 5）：把包放进卡是作者自己的动作（§6.4）。

### 2.5 索引与匹配（K-R92）

**K-R92 —— 内置索引。** `map/packs/index.json` = `{ "schema": 1, "default": "<包 id>", "packs": [ { "id", "schema", "title",
"i18n"?, "match"? } ] }`，每个内置包一行，按显示顺序；`match` 与清单同形（`card.name | creator | tags`、`worldbook`）。schema-2 包这一行
的 `match` 必须与它的清单一致；schema-1 包只有这一行里有 `match`。`tools/check_pack.py` 对照各包检查索引。某个包对当前卡的得分（Z-02）：

| 证据 | 分 |
|---|---|
| 聊天变量里有这个包的聊天变量（`chatVarOf(id, manifest)`）作为顶层键，值是对象 | 100 |
| 卡名里出现某个 `match.card.name` 词（规范化后，K-R17，子串） | 10 |
| 作者里出现某个 `match.card.creator` 词 | 10 |
| 某个 `match.card.tags` 词等于卡的某个标签（规范化后） | 10 |
| 每个等于（规范化后）卡自己的书里某条目标题的 `match.worldbook` 标题 | 5 |

≥ 10 分才是候选；最高分胜，同分按索引顺序。词都是字面字符串（没有模式，K-R01）。`default` 只有单独打开的查看器读（Z-03）。

### 2.6 用户网址与本地文件（K-R99）

**K-R99 —— 导入包。** 用户在设置里给一个 https 网址或选一个文件。网址的请求不带凭据、不带来源，读取时有 8 MB 的流式上限（Z-12），按
JSON 解析；文件同样处理。只收 schema 2；网址包里以路径给出的块相对网址所在目录解析（K-R64：必须留在它下面），文件包里的路径块一律拒收。
包是外来的，要通过 `validate2`。文件包的文本和网址包最近一次成功的副本都按卡键存在本浏览器（IndexedDB，§11），之后离线也能启动；网址
每次启动重新取，取不到就用副本。被拒的导入在包设置框里显示一行被动说明（拒了什么，取自问题列表），并保留之前的包。

### 2.7 切卡与重启

门卫监听宿主的聊天切换事件。卡键变了就重新解析（K-R90）；解析出的包 id 或来源变了，就经现有的接管路径（`host-lifecycle.mjs`：旧实例
的 `kill()` 与清理）停掉正在运行的实例，再带防缓存参数（`?k=<卡键>`）重新求值入口，用新的 `window.__tcPack` 启动一个新实例（Z-19）。
持有全包状态的模块在新实例启动时重新设置（画像、事件地理、世界书前缀、聊天变量根）；一个探针按 A → B → A 切换，检查 B 的东西一点不剩。

### 2.8 宿主交给查看器什么

注入的 `window.__tcPack` 增加字段 `schema`、`source`、`trust`（schema-1 包保持 `build_preview_script.py` 写的
`{ id, chatVar, manifest, events }`）。schema-2 包的 `manifest` 是校验后、所有块都内联的包（网址包另带 `base`，即网址目录）。自动包在聊天
进行中会变（生长）：这时宿主发新消息 `eden-map:pack` `{ manifest, rev, source, trust }`，查看器原地重建节点运行时、重画打开着的示意图（§5.5）。

## 3. 运行时读卡（K-R93、K-R94）

### 3.1 输入

`readCard()`（宿主，S9-3）收集一个普通对象 `CardSource`：
`{ name, creator, tags[], avatar, greeting, books: [{ name, entries: [{ title, keys[], enabled, initvar? }] }], stat, initvar }`。
`greeting` 是去掉宿主宏的卡的第一条消息；`stat` 是当前 `stat_data`（MVU，只读）；`initvar` 是卡的变量初始化条目（标题里带方括号、含
`initvar`，不分大小写）的解析结果。除这一条外不读任何条目内容。下面的一切都是 `CardSource` 的纯函数（`map/core/card-read.mjs`），所以 S11
的 `tools/card_to_pack.py` 可以共用规则和夹具（`tests/fixtures/cardread/*.json`）。

### 3.2 世界书条目到节点候选

**K-R93 —— 从卡的世界书取地点候选。** 对卡自己的书里的每个条目，按书序和条目序：
1. 跳过：内嵌包条目（K-R91）、变量初始化条目、带我们归属标记的条目（`extra.eden_id` / `extra.spatial_id`）、标题超过 40 个码点的、标题
   （规范化后）等于已发现名册表里某个人名的（K-R41）。
   *I-26：* 名字和键读取时去掉 emoji 和 `{{...}}` 宏（留在开头的「的」之类所有格助词一并去掉）；标题里有 `|` 的是 `职位|姓名`（人，不是地点，其姓名在别处也跳过）；
   分隔符标题（两端是成串的 `=`、`-`、`*`…）和以文档类 emoji 开头的标题（规则、笔记）不是地点；清理后路径相同的两个条目合成一个节点，键合并。
2. 去掉标题开头的一个方括号标签（`[...]` 或全角括号），按 K-R26 第 2 步的分隔符从外到内切成段。
3. 最内一段含有当前语言内核地点词表里的词（`core/vocab.mjs` 新词表 `PLACE`：中文的城、街、馆、室、港、山、学院之类的地点后缀；英文的
   town、city、street、inn、tavern、castle、hall、room、harbour、district、forest、academy 之类），或某个关键词就是这样的词，或外层那段已经
   是地点候选（Z-04），这个条目就是地点。
4. 节点：id `w_` + `fnv36(规范化标题)`；`name` = 最内一段；`alias` = 名字加上那些是普通词的关键词（1–20 个码点，不是 `/.../` 那样的模式，
   不含通配符）；父节点 = 外层那段指的候选，否则根。
5. 最多 150 个候选；之后的丢弃（一条自检记录）。

除这些词表外，不按文字含义做任何判断（brief 规则 8）；内容从不过滤。

### 3.3 变量与实体字段

**K-R94 —— 从卡里取变量、人物、开场视图与语言。**
- **vars**：K-R38 的自动发现在 `stat` 上跑；`stat` 为空时在 `initvar` 的结构上跑（JSON，或 YAML 子集：映射、序列、标量、注释）。发现的路径
  写进自动包的 `vars`，导出时一起带走；用户的变量映射仍然优先（K-R38）。
- **entities**：在同一份结构上，用 K-R41 的发现（K-06 C）得到分组，用 K-R42 的发现得到字段。
- **start**（`ui.start`，Z-08）：在开场白前 400 个码点里用 `locate`（K-R24，不带 `here`）找到的节点；只决定打开时的视图，从不当作当前位置。首条消息只是个短标记（不足 40 个码点）时，改读第一条更长的备选开场白（I-26）。
- **lang**（Z-09）：在卡名、开场白和条目标题的字母里（至少 20 个）：汉字 ≥ 30 % → `zh`；否则假名 ≥ 10 % → `ja`；否则谚文 ≥ 30 % →
  `ko`；否则 `en`；字母太少 → 界面语言。`zh`、`en` 以外的语言用 `en` 内核词表（K-R07）。

### 3.4 开场节点与语言

两者都是自动包的字段（`ui.start`、`lang`），随包导出；作者可以在导出文件里改，开场视图也可以在编辑模式里改（「从这里打开」）。

## 4. 自动包与生长（K-R95）

### 4.1 身份与存放

**K-R95 —— 自动包。** 其他来源都给不出包时，宿主从 `CardSource` 建一个：
`{ id: 'c_' + fnv36(name + "\n" + avatar), schema: 2, title: <卡名，截到 80>, lang, nodes（K-R93）, vars, entities（K-R94）, ui: { start } }`；
没有视图（用隐式示意图视图，K-R96），没有 events 块（中性分类，K-R53），没有 llm 块。它是外来包（K-R63）。存储名按包 id 走现有推导
（`core/pack.mjs` `prefixOf`、`chatVarOf`），到 S10 为止。推导出的包和长出的节点是可丢弃的缓存，放在这个包的聊天变量的 ASCII 键 `auto` 下：
`{ v: 1, fp, pack, grown: [node], seen: [text] }`（`seen` = 生长已经消费过的地点文字，最多 400 条）。

### 4.2 稳定性

`fp` = 卡名、头像、排序后的规范化条目标题、排序后的变量结构键路径的 `fnv36`。启动时：`auto` 在且 `fp` 相同 → 原样用；没有或 `fp` 不同 →
重新推导（Z-05）。节点 id 是名字的哈希，没变的地点 id 不变；父节点还在的长出节点保留。

### 4.3 生长

生长（K-R26）只对自动包运行（Z-07），作用在「推导节点 + 长出节点」这棵树上：宿主读到的每个地点文字（地点变量值、地点标签、人物与事件
标签里的地点），按消息顺序，每条文字一次。长出的节点进 `auto.grown`；集合变了，宿主就发 `rev + 1` 的 `eden-map:pack`。

### 4.4 重算

`recomputeGrowth(messages, derived)` 从零重建 `grown`：文字取自每条消息的标签，以及为那条消息记下的地点值（宿主提供消息变量时取 MVU 消息
变量，否则取标签）。同一个聊天，实时生长和重算必须得到相同的节点（brief 规则 4；测法同 K-R75）。出现偏差只在自检里计数，绝不悄悄修复。

## 5. 查看器里的 schema-2 包（K-R96、K-R97；I-12）

### 5.1 投影到查看器注册表

**K-R96 —— 打开 schema-2 包。** `core/pack.mjs` 在 `schema: 1` 之外也接受 `schema: 2`，把 v2 清单交给 `resolveBlocks` + `validate2` +
`withDefaults`（只有内置包按受信校验）。查看器随后在一份投影上工作（Z-10），即 `map/core/pack-v2-view.mjs` 里的纯函数 `projectV2(pack, { base })`：
- **地图** = 主视图（显式或隐式，§5.2）类型为 `tiles`、`image` 或 `schematic` 的节点；地图 id 就是节点 id；`start` = `ui.start` 映射到
  它所在视图的主人（K-R34）。
- 每张地图：`{ title: <节点名>, title_en?: <i18n.en.name>, kind: 'points', base: <瓦片源>, data: <虚拟路径>, markers: { <节点 id>: { name,
  name_en?, alias } }, view: { extent_m } }`；`extent_m` 取视图的 `extent`，否则 `[1600, 1000]`。
- **瓦片源**：`tiles` → 包目录下的 DZI 路径（内置包与网址包；卡包与文件包拒收）；`image` → 由 `src`（在包目录下）或 `media`（K-R101）得到的
  `{ type: 'image', url }`；`schematic` → `{ type: 'image', url: <生成的图> }`（K-R97）。
- **虚拟点位文件** `v2/<包 id>/<地图 id>.json` = `{ extent_m, markers: [{ id, nx, ny, r }] }`，位置取 `positionOf`（K-R31、K-R32）或示意图
  布局；靠预先填入查看器的 JSON 缓存提供，所以每个按地图取数据的模块拿到的东西都不变。
- `model3d` 视图暂不投影（自检：「三维视图暂不显示」）。

v2 包的节点运行时（`makeRuntimeV2(pack)`）用 `buildTree` 从 `pack.nodes` 建，提供与 `makeRuntime` 相同的接口（crumbs、parent、children、
levels、kind、host、geo……），地图 id = 投影出的地图。

### 5.2 隐式示意图视图

没有 `views` 块的包，在根和每个有子节点的节点上都有一个隐式示意图视图（布局 `tree`，深度 2，`open: locate`）。于是定位一个节点会打开其
父节点的示意图并聚焦它（K-R34 规则 3），进入一个有子节点的节点会打开它自己的示意图。隐式视图从不导出。

### 5.3 示意图布局

**K-R97 —— 示意图的布局与图片。** `layoutSchematic(tree, owner, { layout, depth })` → `{ <节点 id>: { x, y } }`，取值 0..1，确定性的（同一棵树
→ 同一张图）。`tree`（默认）：主人在顶部正中；它的后代按层排成行，直到 `depth`；每个节点的宽度份额等于它子树在深度内的叶子数；父节点居中
在子节点上方；一行超过 12 个节点就折成几行。`list`：按声明顺序排成一列。`grid`：每行 ⌈√n⌉ 个。`radial`：主人在中心，子节点在环上。图片
（`schematicImage(layout)`）是 1600 × 1000 单位的 SVG，每条父子边一条线、每个节点一个点，编码成 `data:image/svg+xml` 网址；里面没有文字、
没有包里的任何值（Z-11、K-R64）。节点名是普通标记，所以搜索、卡片、事件、抽屉都和任何地图上一样。

### 5.4 图片视图

`image` 视图（K-R30）作为单张图片打开（`{ type: 'image', url }`），不用 DZI 切片。位置是图片宽高的比例（K-R31）。很大的图仍建议用
`tools/make_dzi.py` 切片（仅内置包）。

### 5.5 实时更新

收到 `rev` 更高的 `eden-map:pack` 时，查看器重新投影、重建运行时；打开着的是示意图且布局变了，就按原缩放重新打开；标记、当前位置和事件重新
摆放。schema-1 包永远收不到这条消息。

## 6. 导出与导入（K-R98）

### 6.1 导出写什么

**K-R98 —— 导出为包。** 「导出为包」（设置 → 高级 → 地图包）写一个 JSON 文件 `<包 id>.pack.json`：当前的包（自动、内嵌、导入或网址包），
所有块内联，另加
- 长出的节点（作为普通节点；保留 `g_` id，K-R10），
- 并入的编辑草稿（§7），
- 用户别名，作为对应节点的别名（Z-16；节点不存在的别名丢弃），
- 包图片（K-R101），以 data 网址内联；私有图片永远不带（K-R102），
- 由读卡信息填好的 `credits.card`（K-R08）。
它从不包含聊天状态（藏物、迷雾、事件、忽略列表、结算记录）、隐式视图，或内核只对内置包才读的字段（`cdn`、`legacy`、`x-page`）。id 保留
（Z-06）。文件必须以外来身份通过 `validate2` 并在 8 MB 以内；否则导出列出问题，不写任何文件。小于 1 MB 的文件标注「可以放进卡里」。

### 6.2 内置包：导出叠加层

内置包的导出只写改动，形状是 K-R67 的叠加层（`overlay.v2.json`：`nodes` 带 `id` 和改过的 `at`、`parent`、`alias`，外加 `media`），文件名
`<包 id>.overlay.json`（Z-15）。维护者把它并进 `map/packs/<id>/overlay.v2.json`；它取代了原来的图集维护者模式。

### 6.3 往返

同一张卡导入导出的文件（K-R99），得到同样的节点树、同样文字定位到同样节点、同样的位置、同样的包图片。测试：导出 → 再导入 → 再导出，字节完全相同。

### 6.4 把包放进卡里

引擎绝不写卡（brief 规则 5）。包设置框给作者两份拷贝：文件本身（用于网址，或卡编辑器的扩展字段 `spatial_os`），以及「复制为世界书条目」，
即贴进一个标题为 `spatial_os:pack` 的新条目里的 JSON 文本，并提示保持该条目停用。

## 7. 编辑模式（K-R100；S9b）

### 7.1 开关与草稿

**K-R100 —— 编辑模式。** 设置 → 高级里一个开关（「编辑模式」，默认关，按 brief 规则 6 登记）。开着时查看器显示编辑栏和 §7.2 的操作；关着
时这些一概不画。改动进每个包 id 一份的本地草稿（Z-14）：`{ v: 1, nodes: { <id>: { at?, parent?, alias_add?[] } }, add: [node], views:
{ <id>: view }, media: { <id>: item }, attach: { <节点 id>: [media id] }, start? }`，存在本浏览器（图片放 IndexedDB）。加载的包叠上草稿显示
（与 K-R67 叠加层同样的合并）。「丢弃草稿」清空它。草稿从不写进聊天、卡或世界书。

### 7.2 操作

- **移动**：在 `tiles` 或 `image` 视图上拖动标记；写 `at = { x, y, view }`（K-R31：编辑器总是写 `at.view`）。示意图没有坐标系：上面不能拖
  （先按 §7.3 给节点配一张图）。
- **改父节点**：地点卡上一个列表，只列不是自己也不是自己后代的节点（不可能造出环）。
- **加别名**：地点卡上一个文本框（1–60 个码点，K-R27 的上限）。
- **加地点**：在有坐标系的视图上「在这里新建地点」，在点到的位置加节点 `e_<fnv36(name + parent)>`。
- **从这里打开**：把 `ui.start` 设成当前视图的主人。
- **挂图片**：§8。
- **导出**：§6。

### 7.3 任意图片作底图

在任何节点上「用一张图片作这个地点的地图」：用户选 PNG / JPEG / WebP；重新编码成 WebP（质量 0.82，长边 ≤ 4096 px，丢掉元数据），存成包
图片（K-R101）；节点得到一个 `media` 指向它的 `image` 视图。原来有示意图位置的子节点，把那些位置当作在新坐标系里的初始 `at`，所以画面不跳，
之后可以拖动。不需要 DZI 切片；`tools/make_dzi.py` 仍是内置包里超大图片的建议。

## 8. 包图片与私有图片（K-R101、K-R102；E-08）

### 8.1 media 块

**K-R101 —— 包图片。** 一个可选的第十个块 `media`（在 schema 2 之内新增，K-R62）=
`{ <media id>: { src, w?, h?, note?, i18n?: { <语言>: { note } }, credit? } }`（id 形如 `^[a-z][a-z0-9_]{0,63}$`），加上节点字段
`media: [<media id>]`（节点的图集，有序，最多 32 张）和 `image` 视图字段 `media`（`src` 的替代）。schema-1 包的叠加层可以带 `media` 和节点
`media` 列表（K-R67 合并：条目按 id，列表整体替换）。

### 8.2 允许的来源与上限

`src` 只能是下面之一：
1. 包目录下的相对路径，以 `.webp`、`.png`、`.jpg` 或 `.jpeg` 结尾（内置包与网址包；把今天图集的来源守卫推广：不许 `..`、不许协议头、不许
   反斜杠，按网址解析后仍在包目录下）；
2. `data:image/(webp|png|jpeg);base64,` 加 base64 文本，解码后最多 3 MB（任何包）；
3. 图片文件类型、不带查询串的 `https://` 网址（K-R43 的网址规则），只有开关「加载包里链接的图片」开着时才加载（Z-13）；关着时显示带说明的占位。

其他一律拒收：该条目丢弃并留一条自检记录（K-R06），永远到不了页面。每个值都在运行时按这些精确模式重查（K-R64）。K-R66 的字符串上限不适用
于 `media.*.src` 里的 data 网址；data 网址计入文档体积上限：卡内嵌包 1 MB，网址或文件包 8 MB（Z-12）。每个包最多 200 个 media 条目。

### 8.3 本机私有图片

**K-R102 —— 私有图片。** 用户可以给任何节点加只给自己看的图片；它们只存在本浏览器（现有的图集 IndexedDB，记录按作用域、`n:<节点 id>` 和
图片 id 存；作用域照旧有「仅本聊天」和「全部聊天」），**永远**不会被导出、嵌入或发往任何地方。节点的图集先显示包图片，再显示私有图片；
S9b 之前按房间名存的私有记录，通过节点名找到（Z-18）。编辑模式里可以把一张私有图片复制进包（「加入包」），在草稿里生成一张包图片；原私有
记录仍是私有的。

### 8.4 第一个包的图集迁移

`map/data/gallery.json`（公开投稿清单）和 `map/data/room_galleries.json`（仓库自带渲染图的房间图集）今天都是空的。它们在清单里的条目
（`data.gallery`、`data.galleries`）以及 maps 模式里标记的 `gallery` 条目，由第一个包叠加层里的 `media` 块和节点 `media` 列表取代（迁移时为空）；
地点卡的图集入口和三维庄园页都通过一个辅助函数读节点的包图片。两个文件在同一次提交里删除（这次提交改了包清单：前后加 FREEZE_MAPS）。

### 8.5 移除的东西

维护者模式开关（`optGalleryMaintainer`，存储键 `edenGalleryMaintainerMode`）、它的 i18n 键（`s.gallery_group`、`s.gallery_maintainer`、
`s.gallery_maintainer_hint`）、GitHub issue 链接生成（`buildIssueUrl`）及其仓库常量、「投稿 / 导出投稿包」相关文字，以及
`map/ui/room-gallery-panel.js` 和 `map/core/room-gallery-logic.mjs` 里的手工合并说明。保留：来源守卫（`isValidGalleryFile`、
`safeGalleryImagePath`，推广为 K-R101 规则 1）、私有图集、它的配额和作用域。

## 9. 外来包给模型的文字（K-R103；K-08 B）

**K-R103 —— 外来包给模型的文字何时生效。** 外来包的 `llm` 块（模板、世界书条目、书名）只有在宿主开关「让模型使用这个包的文字」对该包打开、
且用户确认过当前文字时才交给宿主：开关存 `{ <包 id>: <llm 块规范 JSON 的 fnv36> }`；存的哈希和包里的不同时，开关按关处理，直到用户在设置里
再确认一次（一行被动说明，不弹对话框）。默认关。关着时用包语言的内核模板，不写任何世界书条目。开着时 K-R65 照样适用。内置包不受影响。

## 10. 内核契约新增（计划）

| 编号 | 规则 | 本文位置 | 随哪一步落地 |
|---|---|---|---|
| K-R90 | 包的解析顺序、结果、旧默认包的启动 | §2.3 | S9-2 |
| K-R91 | 卡内嵌的包 | §2.4 | S9-2 |
| K-R92 | 内置索引与匹配得分 | §2.5 | S9-2 |
| K-R93 | 从卡的世界书取地点候选 | §3.2 | S9-3 |
| K-R94 | 从卡里取变量、人物、开场视图与语言 | §3.3 | S9-3 |
| K-R95 | 自动包、它的存放、稳定性与生长 | §4 | S9-3 |
| K-R96 | 打开 schema-2 包：投影与 v2 运行时 | §5.1 | S9-1 |
| K-R97 | 示意图布局与图片 | §5.3 | S9-1 |
| K-R98 | 导出为包（以及内置包的叠加层导出） | §6 | S9-3（叠加层导出：S9b） |
| K-R99 | 按网址或文件导入包 | §2.6 | S9-2 |
| K-R100 | 编辑模式与草稿 | §7 | S9b |
| K-R101 | 包图片：media 块、来源、上限 | §8.1–§8.2 | S9b |
| K-R102 | 私有图片 | §8.3 | S9b |
| K-R103 | 外来包给模型的文字何时生效 | §9 | S9-2 |

改动的现有规则（由落地新规则的那一步修订文字）：K-R26（在自动包的推导节点之上运行，S9-3）、K-R60（`nodes` / `views` 两行：隐式示意图视图，
S9-1）、K-R66（按来源的上限与 media 豁免，S9b）、§2.3（保留名变成 K-R90 / K-R91，S9-2）、§14.2 O-7（由 K-R95 关闭，S9-3）。

## 11. 新增的消息、存储键与开关

全部沿用今天的名字新增（S10 和其他名字一起改）。

| 类别 | 名字 | 所有者 | 含义 |
|---|---|---|---|
| 消息 宿主 → 查看器 | `eden-map:pack` `{ manifest: object, rev: number, source: string?, trust: string? }` | `tavern/auto-pack.mjs` | 自动包变了（生长）；S9-3 |
| 消息 查看器 → 宿主 | `eden-map:pack-pick` `{ kind: string, url: string?, text: string?, id: string? }` | `app/pack-settings.mjs` | 用户对这张卡的包选择；S9-2 |
| 存储键 | `edenMapPackPick`（JSON `{ <卡键>: 选择 }`，在还不知道包时就要读，所以永远不按包加命名空间） | `tavern/pack-gate.mjs` | 按卡选择；S9-2 |
| 存储键 | `edenMapPackRemote`（`'0'`） | 查看器 | 开关：加载包里链接的图片（Z-13）；S9b |
| 存储键 | `edenMapPackLlm`（JSON，`{}`） | 宿主 | K-R103 每个包的生效哈希；S9-2 |
| 存储键 | `edenMapEdit`（`'0'`） | 查看器 | 编辑模式开关；S9b |
| 存储键前缀 | `edenMap:edit:` + 包 id | `app/pack-edit.mjs` | 编辑草稿（不含图片）；S9b |
| IndexedDB | `edenMapPacks` / store `packs`（键 = 卡键） | `core/pack-store-db.mjs` | 文件包与网址包的最近成功副本；S9-2 |
| IndexedDB | 现有图集数据库，作用域 `edit:<包 id>` | `app/pack-edit.mjs` | 草稿图片；S9b |
| 聊天变量键 | `<包聊天变量>.auto` | 宿主 | K-R95 缓存；S9-3 |

宿主读的开关放在现有 `eden-map:th` 的 `prefs` 对象里传（和 `edenMapLedgerWrite` 一样），并在 `SCHEMA` 头部注释里写明；文案补 zh 与 en。

## 12. 给 S10 的备注

- `docs/naming.md` 已经记了宏别名的备注（`{{eden_here}}` 等宏改用 `spatial_*` 名字，旧名保留）。S9 不加任何宏。
- 上面的新名字故意沿用今天的前缀（`eden-map:`、`edenMap*`、`window.__tcPack`）；S10 的对照表必须列上它们（`eden-map:pack`、
  `eden-map:pack-pick`、`edenMapPackPick`、`edenMapPackRemote`、`edenMapPackLlm`、`edenMapEdit`、`edenMap:edit:`、`edenMapPacks`）。
- 旧默认包的启动（K-R90 最后一段）在 S10 把第一个包迁到 K-R05 名字（带迁移）时结束。

## 13. 步骤计划与和 S8 的并行

| 规格 | 大小 | 文件（新建 / 修改） | 能否与 S8-1…3 并行 |
|---|---|---|---|
| S9-1 | M（约 6 h） | 新建 `map/core/pack-v2-view.mjs`、`map/core/schematic.mjs`、`map/app/nodes-runtime-v2.mjs`；修改 `map/core/pack.mjs`、`map/app/current-pack.mjs`、`map/app/boot.mjs`、`map/app/map-switch.mjs`、`map/app/json-cache.mjs`、`map/app/topbar.mjs`、`map/viewer.html`（只改首帧预载那几行）、`tools/browser/pack_minimal.mjs`、`tools/browser/known-failures.json`、测试、kernel-schema §4 / §12、ARCHITECTURE | 与任何改 `boot.mjs`、`map-switch.mjs`、`nodes-runtime.mjs` 或查看器首帧脚本的 S8 步骤**串行**；与只动 `layer-host.mjs`、`core/layer-registry.mjs`、`pack-v2-spec.mjs` 图层部分和图层 schema 的 S8 步骤可以并行 |
| S9-2 | L（约 6 h） | 新建 `map/tavern/pack-gate.mjs`、`map/tavern/card-source.mjs`、`map/core/pack-index.mjs`、`map/core/pack-store-db.mjs`、`map/tavern/pack-runtime-v2.mjs`、`map/app/pack-settings.mjs`、`map/packs/index.json`；修改 `map/tavern/eden-map.js`（在已有一行上加一个 import）、`map/tavern/host-tavernhelper.mjs`、`map/tavern/mvu-bridge.mjs`、`map/tavern/profile-load.mjs`、`map/tavern/event-geo-load.mjs`、`map/tavern/llm-flow.mjs`、`map/core/storage.mjs`、`map/core/protocol.mjs`、`map/app/settings.mjs`、`map/viewer.html`（高级页一行）、`map/i18n/{zh,en}.json`、`tools/check_pack.py`、`tools/build_preview_script.py`、`tools/browser/host_stub.mjs`、测试、kernel-schema §2.3 | **可以并行**（宿主与核心文件；共用的 `storage.mjs`、`protocol.mjs`、i18n、`viewer.html` 都是按行追加——变基冲突时两边都保留） |
| S9-3 | L（约 6 h） | 新建 `map/core/card-read.mjs`、`map/core/yaml-shape.mjs`、`map/core/grow.mjs`、`map/core/pack-export.mjs`、`map/tavern/auto-pack.mjs`、`tools/browser/autopack.mjs`、`tests/fixtures/cardread/*`；修改 `map/core/vocab.mjs`（`PLACE`）、`map/tavern/pack-gate.mjs`、`map/tavern/card-source.mjs`、`map/app/pack-settings.mjs`、`map/app/boot.mjs`（经 `host-messages.mjs` 处理 `eden-map:pack`）、`map/app/host-messages.mjs`、`map/core/protocol.mjs`、i18n、测试、kernel-schema §3.9 | **可以并行**，除非某个 S8 步骤也改 `boot.mjs` / `host-messages.mjs`（只加一个处理分支；两边都保留） |
| S9b | L（约 6 h） | 新建 `map/app/pack-edit.mjs`、`map/app/pack-edit-view.mjs`、`map/core/pack-media.mjs`、`tools/browser/pack_editor.mjs`；修改 `map/core/pack-v2-spec.mjs`（media 块、节点 / 视图 `media`）、`map/core/pack-v2.mjs`（按来源的上限、media 豁免）、`map/core/overlay-v2.mjs`、`map/data/schema/v2/{manifest,nodes,views}.schema.json` + 新 `media.schema.json`、`map/ui/room-gallery-panel.js`、`map/core/room-gallery-logic.mjs`、`map/app/card-links.mjs`、`map/estate/main.js`、`map/app/settings.mjs`、`map/viewer.html`（高级页：维护者那几行变成编辑模式那几行）、`map/i18n/{zh,en}.json`、`map/core/storage.mjs`、`map/packs/eden/manifest.json`、`map/packs/eden/overlay.v2.json`、`map/data/schema/{pack,maps}.schema.json`，删除 `map/data/gallery.json`、`map/data/room_galleries.json`，`map/estate/model/manifest.json`（`galleries`）、`tools/check_pack.py`、`tools/check_overlay.mjs`、`tests/room_gallery.test.mjs`、`tools/browser/room_gallery_ui.mjs`、kernel-schema §2.4 / §4 / §13 | **在 S8-1 之后串行**（两者都改 `pack-v2-spec.mjs`、v2 schema 和 `check_pack.py`） |

顺序：S9-1 → S9-2 → S9-3 → S9b（S9-3 的探针需要 S9-1 的 v2 查看器和 S9-2 的门卫；S9b 需要 S9-3 的导出器）。S9-2 可以和 S9-1 并行
（文件不相交，kernel-schema 除外，而那是按节追加的）。

## 14. 风险

- **切卡重启**（Z-19）：某个模块若把包状态存在实例之外，就可能漏出旧包。缓解：A → B → A 探针步骤；S9-2 的停止规则。
- **地点词**（K-R93）是启发式：误收靠名册排除和上限压住；漏收靠生长补上。
- **门卫里的顶层 await** 会让入口晚启动读卡那段时间（一次读卡桥调用、两次读书、一次取索引；按卡键缓存）。预算：最多 300 ms，超时就用手上已有的
  来源先启动，再经重启纠正（Z-19）。
- **包里的 data 网址** 会占内存；按来源的上限（Z-12）和每张 3 MB 的上限把它压住。
- **第一个包的一致性**：旧默认包的启动让第一个包的路径不变；每个规格的测试都把它的注入文字和截图与基线比较。

## 附录 —— 可执行规格

下面每个规格都是给一个 Sonnet · High 会话的完整提示词，**以英文版为准**（执行者读英文版 `docs/zero-config.md` 附录；这里只给中文摘要，
便于审阅）。行号以 origin/preview `7958b5ad` 为准。

### S9-1 —— 查看器打开 schema-2 包（I-12）

#### 0. 为什么

`viewer.html?pack=minimal` 今天显示重试卡（`core/pack.mjs` 只收 schema 1）。这一步之后 schema-2 包原生打开（Z-10 投影、Z-11 示意图），
schema-1 包（第一个包、示例包）行为完全不变。

#### 1. 先读

brief；本文 §0（Z-10、Z-11）、§5、§10、§13；kernel-schema K-R30–K-R35、K-R60、K-R63、K-R64、§2.1；`core/pack.mjs`、`pack-v2.mjs`、
`nodes.mjs`、`app/nodes-runtime.mjs`、`current-pack.mjs`、`boot.mjs`、`json-cache.mjs`、`map-switch.mjs`、`topbar.mjs`、`viewer.html` 首帧脚本、
minimal 包与 `pack_minimal` 探针（行号见英文版）。

#### 2. 范围

做：契约文字 K-R96、K-R97；`core/schematic.mjs`；`core/pack-v2-view.mjs`；`app/nodes-runtime-v2.mjs`；加载路径；图片瓦片源；`pack_minimal`
探针通过、去掉已知失败；文档与 RESULT。不做：宿主、包解析、读卡、生长、导出、编辑、media、v2 三维视图、任何 schema-1 行为改动、S8 图层模块。

#### 3. 准备

新 worktree `s9-1-v2view`；基线 node 测试与 smoke 全绿；先在未改的树上拍 s43 截图、跑 `pack_town` 与 `pack_minimal`。

#### 4. 任务

T1 契约；T2 示意图布局与 SVG（无文字）；T3 投影（地图、虚拟点位文件、问题列表）；T4 v2 运行时（与 `makeRuntime` 同接口）；T5 加载路径
（`pack.mjs` 收 schema 2、`current-pack.mjs` 校验、`seedJSON`、`boot.mjs` 用投影、`viewer.html` 不增行）；T6 `{ type: 'image', url }` 瓦片源与
只认 DZI 字符串的读者跳过；T7 探针；T8 文档（ARCHITECTURE、todo I-12 划掉）。

#### 5. 约束

schema-1 包完全一致；文件 ≤ 400 行；`viewer.html` 不增行；`map/core` 不引外部；示意图不含包值和文字。

#### 6. 测试

`schematic.test.mjs`、`pack_v2_view.test.mjs`、`nodes_runtime_v2.test.mjs`、`pack.test.mjs` 增补；只增不减。

#### 7. 验证

node 测试、smoke、`pack_minimal` 全过、`pack_town` 与基线一致、s43 截图一致或在基线噪声内。

#### 8. 提交与推送

三次提交（核心、查看器、文档 + RESULT），按 brief 的提交规则；推送后看 CI。不改地图数据：不需要 FREEZE_MAPS。

#### 9. 停止规则

截图或 schema-1 探针超出噪声、需要改写 T5 / T6 以外的查看器模块、文件超 400 行或 `viewer.html` 增行、推送被拒或 CI 失败两次、测试数下降：
停下报告。只增加信息的差异钉进测试并在 todo §3 立 Q 项。

#### 10. 报告

brief §5 的 RESULT 块，外加 minimal 检查数、s43 一致数、新文件行数。

### S9-2 —— 通用脚本与包的解析

#### 0. 为什么

今天包靠 `build_preview_script.py --pack` 烘进脚本，宿主默认第一个包。这一步之后一个脚本服务所有卡：用户选择 → 卡内嵌 → 索引 → 自动
（自动包本身在 S9-3；在那之前这一档给出只有根节点的空自动包）。

#### 1. 先读

brief；本文 §0、§2、§9、§11、§13；kernel-schema §2.3、K-R05、K-R06、K-R09、K-R63–K-R66、K-08；`packNs`、`eden-map.js` 前几行与
`__tcPack` 注入、`mvu-bridge.cardInfo`、`profile-load`、`event-geo-load`、`host-lifecycle`、`llm-flow`、`worldbook-sync` 读书部分、存储与
协议登记、设置开关接线、`build_preview_script.py`、`check_pack.py`、`host_stub.mjs`、`docs/card-digest.md` L343。

#### 2. 范围

做：契约 K-R90、K-R91、K-R92、K-R99、K-R103；索引与得分；读卡与门卫；v2 包的宿主侧；网址 / 文件导入；K-R103 开关；切卡重启；构建工具；
测试与文档。不做：读卡成节点、生长、自动包、导出（S9-3）；编辑与 media（S9b）；任何改名（S10）；写卡或任何世界书。

#### 3. 准备

新 worktree `s9-2-gate`；基线全绿；先跑 `e7_host`、`th_adopt`、`pack_town`、`follow_pin` 记下结果。

#### 4. 任务

T1 契约；T2 `map/packs/index.json`（第一个包的匹配词取自 card-digest 记录的卡名字段与五个条目标题，逐字照抄并在 RESULT 里列出行号）、
`core/pack-index.mjs`、`check_pack.py` 检查索引；T3 `card-source.mjs`（读卡桥挪过来，版权页输出不变）、`pack-gate.mjs`（顶层 await，300 ms
预算，旧默认包不注入）、`eden-map.js` 在已有一行加 import；T4 `packNs` 收 schema 2、`pack-runtime-v2.mjs`；T5 `pack-store-db.mjs`、
`pack-settings.mjs`、`eden-map:pack-pick`、高级页一行、登记键与文案；T6 K-R103；T7 切卡 A → B → A；T8 `--pack` 打印弃用提示；T9 测试与文档。

#### 5. 约束

第一个包一致：注入文字、聊天变量写入、世界书写入逐字不变；只读当前角色自己的书；`eden-map.js` 不增行；不弹阻塞对话框。

#### 6. 测试

`pack_index`、`pack_gate`、`pack_import`、`pack_llm_gate` 四个新测试文件；登记相关测试增补；现有注入文字夹具原样通过。

#### 7. 验证

node 测试、smoke、`e7_host`、`th_adopt`、`pack_town`、`follow_pin` 与基线一致；包设置框在 375 px 截图看一次。

#### 8. 提交与推送

四次提交（索引、门卫、设置与开关、文档 + RESULT）；不改 `maps.json` 或清单：不需要 FREEZE_MAPS。

#### 9. 停止规则

第一个包一致性失败、门卫的顶层 await 让入口启动失败、切卡后两次修复仍残留上一张卡的状态（报告是哪个模块；选项 A 改为提示刷新、B 逐模块
重置钩子）、`eden-map.js` 增行、推送被拒或 CI 失败两次、测试数下降：停下报告。

#### 10. 报告

RESULT 块，外加索引行数与匹配词出处行号、注入文字一致性、切卡结果、新文件行数。

### S9-3 —— 运行时读卡、自动包、导出

#### 0. 为什么

这一步之后陌生卡会显示其地点的示意图，位置能落点，人物与物品可用，结果能导出成包并原样导回。新探针 `autopack`。

#### 1. 先读

brief；本文 §3、§4、§6、§11；kernel-schema K-R10、K-R15–K-R26、K-R38、K-R41、K-R42、K-R53、K-R63–K-R66、K-R71、O-7；`lexicon`、`vocab`、
`profile`、变量发现、`locate`、`nodes`、`legacy-custom`（用户别名）、事件与人物解析、S9-1 / S9-2 新增的模块、`host-messages.mjs`、
`host_stub.mjs`。

#### 2. 范围

做：契约 K-R93–K-R95、K-R98 与 K-R26 / O-7 修订；`card-read.mjs`、`yaml-shape.mjs`、`vocab.PLACE`；`grow.mjs`；`auto-pack.mjs`；查看器实时
更新；`pack-export.mjs` 与导出 / 复制按钮；探针 `autopack`；文档与 RESULT。不做：编辑、media、内置包叠加层导出（S9b）；`card_to_pack.py`（S11）；
作者包的生长；写卡。

#### 3. 准备

新 worktree `s9-3-autopack`；基线全绿并记下测试数。

#### 4. 任务

T1 契约；T2 读卡（纯函数，夹具 `zh_city.json` 与 `en_harbour.json` 都是编的卡，不含真实卡文字）；T3 生长（纯函数，确定性，重算）；T4 宿主
自动包（指纹复用、每轮生长、`eden-map:pack`、协议登记）；T5 查看器收到更高 `rev` 时重新投影；T6 导出（规范键序、`validate2` 无问题、≤ 8 MB、
标注能否放进卡；复制为世界书条目）；T7 探针（en 与 zh 两张卡：示意图、落点、生长、人物与物品、导出 → 重置 → 导入后一致；桌面与 375 px）；
T8 文档。

#### 5. 约束

第一个包时 `auto-pack.mjs` 永不调用；读卡只读标题、关键词、开场白、变量结构和 initvar 条目，不按含义过滤；作者包不生长；文件 ≤ 400 行。

#### 6. 测试

`card_read`、`yaml_shape`、`grow`、`auto_pack`、`pack_export` 五个新测试文件（含导出 → 导入 → 导出字节一致、实时生长 = 重算）。

#### 7. 验证

node 测试、smoke、`autopack` 全过、`pack_minimal` 仍通过。

#### 8. 提交与推送

三次提交（读卡与生长、自动包与实时更新、导出与探针 + RESULT）；不改地图数据：不需要 FREEZE_MAPS。

#### 9. 停止规则

第一个包的测试或探针变化、两次修复后实时生长与重算仍不一致、往返两次修复后仍不逐字节一致、探针需要 T5 以外的查看器改动、推送被拒或 CI
失败两次、测试数下降：停下报告。

#### 10. 报告

RESULT 块，外加 autopack 检查数、读卡夹具结果、往返是否一致与体积、新文件行数。

### S9b —— 编辑模式、包图片、任意图片作底图（E-08）

#### 0. 为什么

这一步之后作者能在查看器里细化包——位置、父节点、别名、图片、图片作底图——并在不开终端的情况下导出；旧的维护者模式图集流程取消。新探针
`pack_editor`。

#### 1. 先读

brief（§2.6 新开关）；本文 §6、§7、§8、§11、§13；kernel-schema K-R30–K-R32、K-R43、K-R64、K-R66、K-R67、K-09；`pack-v2-spec.mjs`、
`pack-v2.mjs` 上限、`overlay-v2.mjs`、v2 schema、`room-gallery-panel.js`、`room-gallery-logic.mjs`、`room-gallery-db.mjs`、`gallery.js`、
`card-links.mjs`、`estate/main.js`、设置与 `viewer.html` 高级页、i18n、第一个包的清单、三维清单、相关测试与探针、S9-3 导出器、S9-1 投影。

#### 2. 范围

做：冻结；契约 K-R100–K-R102 与 K-R66 / K-R67 / K-R98 修订；media 进 schema 与校验；编辑模式与草稿；任意图片作底图；图集走通用流程、去掉
维护者模式；第一个包迁移；探针；文档、解冻、RESULT。不做：三维庄园页自己的房间界面（读包图片以外）；图层（S8）；存储或图集数据库改名（S10）；
任何上传到服务器的功能。

#### 3. 准备

新 worktree `s9b-edit`；基线全绿；先在未改的树上跑 `room_gallery_ui` 并拍 s43 截图。

#### 4. 任务

T0 冻结（T6 改包清单并删地图数据：前后加 FREEZE_MAPS）；T1 契约；T2 `pack-media.mjs`、schema 与 `validate2`（按来源的上限、data 网址豁免字符串
上限）；T3 编辑开关（维护者三行原位变成编辑模式三行，`viewer.html` 不增行）、`pack-edit.mjs` 草稿与操作、`pack-edit-view.mjs` 编辑栏与拖动；T4
图片作底图（WebP 0.82、长边 ≤ 4096 px，子节点继承示意图位置）；T5 图集面板按节点 id、先包图片后私有图片、编辑模式里「加入包」，删掉维护者模式
与 issue 链接等；T6 第一个包迁移（两份空文件删除、清单与叠加层修改，没有可见变化）；T7 探针 `pack_editor` 与更新 `room_gallery_ui`；T8 文档、
E-08 划掉、删除 FREEZE_MAPS。

#### 5. 约束

第一个包除设置高级页外无可见变化；私有图片永不进入导出、叠加层导出、发给宿主的消息或网址；`viewer.html` 不增行；`room-gallery-panel.js` 必须变短；
新开关默认关并登记。

#### 6. 测试

`pack_media`、`pack_edit`、`overlay_media` 新测试；`room_gallery.test.mjs` 删除维护者相关用例（在 RESULT 里逐条点名）并补「公开读作私有」与
「私有图片永不导出」。

#### 7. 验证

node 测试、smoke、`pack_editor` 与 `room_gallery_ui` 全过、s43 截图除高级页外一致。

#### 8. 提交与推送

五次提交（media、编辑模式、冻结、图集迁移、探针 + 文档 + 解冻 + RESULT）。

#### 9. 停止规则

T0 时 FREEZE_MAPS 已存在、第一个包截图在高级页外有差异、OSD 在探针浏览器里打不开 data 网址图片源（报告错误；选项 A 用 Blob 的对象网址、
B 用 canvas 瓦片源）、测试里私有图片出现在导出中、文件超 400 行或 `viewer.html` 增行、推送被拒或 CI 失败两次、测试数下降超过点名删除的图集
用例：停下报告（自己建的 FREEZE_MAPS 要删掉）。

#### 10. 报告

RESULT 块，外加 `pack_editor` 检查数、删除与保留的图集键 / 函数、迁移删改的文件、新文件行数与 `room-gallery-panel.js` 前后行数。
