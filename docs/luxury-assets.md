# 顶奢品牌 3D 素材：可用性与许可调研

> 用于：伊甸庄园剖切模型（three.js，公开 GitHub 仓库，公开网页实时渲染）
> 查询日期：2026-09-27。所有结论以文中链接的官方页面为准，本文不是法律意见。
> 标注「未找到官方说明（查询日期 2026-09-27）」的，表示我在列出的 URL 上没查到下载条款，**不等于可以用**。

---

## 1. 结论

**一句话：** 顶奢品牌官方给的 DWG/3DS/Revit 文件，以及 3dsky、TurboSquid、CGTrader、Fab Standard 这类商业平台的模型，**都不能放进公开仓库，也不能在公开 WebGL 页面里下发**。能进仓库的只有 CC0 / CC-BY 来源（Poly Haven、ambientCG、Smithsonian CC0、Sketchfab CC0/CC-BY、Fab CC-BY、BlenderKit CC0）。品牌只能当**风格与材质参考**，本项目按参考做程序建模，配 CC0 贴图。

### 为什么「实时 WebGL 下发 = 分发」

- three.js 需要把几何和贴图以**开放格式**（glTF/GLB、PNG/JPG/KTX2，Draco/Meshopt 压缩）发到访客浏览器。任何人打开开发者工具的 Network 面板就能把 `.glb` 存下来，再用 Blender 打开。
- 商业许可通常要求素材「放在专有格式里，不逆向工程就无法提取」（TurboSquid），或者「嵌入后最终用户无法下载」（CGTrader），或者禁止「以任何方式让第三方把素材当独立文件使用、下载、提取或访问」（Sketchfab Standard）。Draco/Meshopt 都是开放标准，three.js 自带解码器，**不算专有格式**，也满足不了这些要求。
- 公开 GitHub 仓库、GitHub Pages 和 jsDelivr CDN 更直接：原文件本身就被公开再分发了。
- 品牌 BIM/CAD 条款一般只许「用于室内设计 / 建筑项目文件」（Minotti、BIMobject），不许向第三方提供，也不许做进给第三方的产品或服务。一个公开网页就是给第三方的服务。
- 所以这类文件**最多**在本机 Blender 里离线渲染出**静态图片或视频**（B 档）。即便这样，图里也不能出现品牌 logo，也不能暗示品牌背书。

### 三档汇总表

| 来源 | 档 | 一句话理由 |
|---|---|---|
| **Poly Haven** | **A** | CC0，允许再分发，不必署名，提供 glTF |
| **ambientCG** | **A** | CC0，明确允许把原文件放进项目里分发 |
| **Smithsonian Open Access（标 CC0 的）** | **A** | CC0，提供 glTF/OBJ，但题材多为文物和标本 |
| **Sketchfab：CC0** | **A** | 无条件 |
| **Sketchfab：CC-BY / CC-BY-SA** | **A**（要署名；SA 有传染性） | 允许商用和再分发，但必须署名 |
| **Fab：CC-BY 资产** | **A**（要署名） | Fab 上只有 CC-BY 和 Standard 两种许可 |
| **BlenderKit：CC0 资产** | **A** | 官方 FAQ：CC0 可做任何事 |
| Sketchfab：CC-BY-NC(-SA/-ND) | B（默认不采纳） | 非商用限制；仓库一旦被商用或被 fork 商用就有风险 |
| Sketchfab：Standard / Free Standard | B | 禁止让第三方以独立文件形式访问或提取 |
| Fab：Standard（含 Megascans） | B | 源格式只能给协作者，不能独立再分发 |
| BlenderKit：Royalty Free | B | 不能单独再分发，公开仓库里放 .glb 等于单独分发 |
| TurboSquid（Royalty Free） | B | 要求专有、不可提取格式；glTF 网页不满足 |
| CGTrader（Royalty Free） | B | 要求嵌入且最终用户不能下载 |
| 3dsky / 3ddd | B | 明确禁止「把原始模型上传到互联网」 |
| BIMobject（含已并入的 Polantis） | B | 限建筑项目文件使用，禁止提供给第三方 |
| Archiproducts / bim.archiproducts | B | 站点条款禁止复制或商业利用内容 |
| 3D Warehouse | B | 官方 FAQ：放进网站供他人使用属于「不被允许的聚合」 |
| Textures.com | B（仓库 C） | 明确不得以任何开源许可发布，即使修改过 |
| TurboSquid / CGTrader / Sketchfab 的 **Editorial** | C | 仅限新闻或编辑用途，不得暗示品牌关联 |
| 品牌官方文件：Poliform、Molteni&C、B&B Italia、Minotti、Poltrona Frau、Cassina、Rimadesio、Gessi、Dornbracht、Kohler、Villeroy & Boch、Waterworks、Devon&Devon、Baccarat、Flos、Giorgetti、Promemoria、Visionnaire | B | 仅限设计或规划用途（有的明文写出，有的未找到条款），不能再分发 |
| 无官方 3D 下载的品牌：Fendi Casa、Armani/Casa、Bottega Veneta Home、Hermès Maison、Loro Piana Interiors、Lalique、Rubelli、Dedar、Frette、THG Paris | C | 没有官方授权素材；第三方「仿款」模型还涉及外观设计和商标风险，只作风格参考 |

---

## 2. 品牌逐条

说明：「有什么」来自品牌官网的产品页或下载页。几乎所有品牌都要求登录或注册专业账号才能下载；下载前后弹出的条款我无法登录查看，所以大多写「未找到官方说明」。**没有任何一家品牌公开授权过网页实时下发或开源再分发。**所有品牌名和 logo 都是注册商标。

| 品牌 | 有什么（官方） | 许可要点 | 质量 / three.js 适配 | 档 |
|---|---|---|---|---|
| **Poliform** | 产品页有「3D」下载入口，要填资料，链接 30 天有效；另有数字目录 | 下载条款：未找到官方说明（查询日期 2026-09-27） | 目录级 CAD 模型，需 FBX→glTF 转换 | B |
| **Molteni&C** | 产品下载页有 DWG 2D、DWG 3D、3DS，部分有 BIM；A&D「My Area」要登录 | 下载页只见隐私条款，**未找到文件使用条款** | 3DS/DWG 要转格式，材质通常丢失 | B |
| **B&B Italia** | 「Library」有 2D、3D、Revit 组合；另有专业人士保留区 | 未找到官方说明（查询日期 2026-09-27），可查 legals 页 | 同上 | B |
| **Minotti** | 产品页有 2D/3D 文件和 Revit（RFA）库 | **官方明文**：CAD 文件受版权保护、归 Minotti SpA 所有，「仅授权用于室内设计目的，其他用途严格禁止」 | Revit/3D，需转换 | B |
| **Poltrona Frau** | 产品页「Professionals」区有数据表、2D/3D 文件（3D DWG、2D DWG、3DS），另有私有区 | FAQ 只说明可下载，没提使用条款 | 同上 | B |
| **Cassina** | 专业人士工具区有 2D DWG、3D DWG、3DS、FBX、MAX、OBJ、Revit、SKP，部分要登录 | 未找到官方说明（查询日期 2026-09-27） | 格式最全，FBX/OBJ 能直接转 glTF，但仍不能分发 | B |
| **Fendi Casa** | 未找到官方 3D 下载，搜到的都是 Design Connected、TurboSquid 等第三方 | 第三方复刻模型：平台许可（B）加商标和外观设计风险 | — | C |
| **Armani/Casa** | 未找到官方 3D 下载，只见第三方 | 同上 | — | C |
| **Bottega Veneta（Home）** | 未找到官方 3D 下载 | 未找到官方说明（查询日期 2026-09-27） | — | C |
| **Hermès Maison** | 未找到官方 3D 下载，搜索结果全是第三方或用户上传 | 未找到官方说明（查询日期 2026-09-27） | — | C |
| **Loro Piana Interiors** | 只有面料系列展示，未找到数字贴图或 3D 下载 | 未找到官方说明（查询日期 2026-09-27） | 面料风格参考：羊绒、亚麻、丝 | C |
| **Rimadesio**（衣帽间） | 公开下载区只有 PDF 目录、视频、照片；有「Reserved Area」登录入口；公开页面没看到 DWG/3D | 未找到官方说明（查询日期 2026-09-27） | 结构描述很详细，适合当程序建模参考（见 §5.3） | B |
| **Gessi**（卫浴） | Area Pro 产品页有 3D 模型（IGS）、BIM 和技术表 | 未找到官方说明（查询日期 2026-09-27） | IGS 是 NURBS，要先网格化，面数高 | B |
| **Dornbracht**（卫浴） | 下载中心有 3D-DXF、3D-DWG、BIM（DWG/SKP/ArchiCAD/3DS）；另有 250+ 套 BIM 通过 BIMobject 分发 | 走 BIMobject 的数据受 BIMobject 条款约束（见 §3） | 工程数据，面数不均 | B |
| **THG Paris**（卫浴） | 官网只见 PDF 目录，未找到 3D 下载 | 未找到官方说明（查询日期 2026-09-27） | 风格参考：水晶把手、Daum 系列 | C |
| **Waterworks**（卫浴） | 产品页有 2D CAD 块和 3D（3ds、obj） | 未找到官方说明（查询日期 2026-09-27） | OBJ 可转，但不能分发 | B |
| **Devon & Devon**（卫浴） | 「Technical Area」有技术表、2D/3D 模型、安装说明 | 官方说明：2D/3D 文件「仅用于规划」 | — | B |
| **Villeroy & Boch** | pro 站有「3D data」「2D data」下载 | 页面对抓取返回 403；未找到官方说明（查询日期 2026-09-27） | — | B |
| **Kohler** | 在线库 300+ 个 3D 符号（DWG/DXF）；技术规格页 | 未找到使用条款 | DWG 要转 | B |
| **Baccarat**（灯具） | 吊灯产品页有「Download 2D/3D & BIM」入口 | 未找到官方说明（查询日期 2026-09-27） | 水晶吊灯面数极高，网页不适合 | B |
| **Lalique** | 只有 Interior Design Studio / Hospitality 介绍，未找到 3D 下载 | 未找到官方说明（查询日期 2026-09-27） | — | C |
| **Rubelli**（织物） | 官网有面料和 3D 配置器，未找到贴图下载 | 未找到官方说明（查询日期 2026-09-27） | 风格参考：大马士革花纹、丝绒 | C |
| **Dedar**（织物） | 未找到官方贴图下载；第三方 Syncronia 有 Dedar 面料「3D 贴图」 | 第三方站点条款没核实，按 B 处理 | — | C（官方）/ B（Syncronia） |
| **Frette**（床品） | 未找到官方 3D 或贴图下载 | 未找到官方说明（查询日期 2026-09-27） | — | C |
| **Giorgetti**（补） | 有保留区 webup.giorgetti.eu（要登录） | 未找到官方说明（查询日期 2026-09-27） | — | B |
| **Promemoria**（补） | 保留区要注册审核后下载 | 未找到官方说明（查询日期 2026-09-27） | — | B |
| **Visionnaire**（补） | App 里有 200+ 件 3D 产品；「My Visionnaire」会员门户 | 未找到官方说明（查询日期 2026-09-27） | App 内模型无法导出 | B |
| **Flos**（灯具，补） | Professional Space 有 355 个 2D/3D 文件，另有 IES 光域网 | 未找到官方说明（查询日期 2026-09-27） | IES 文件可以参考灯光分布，three.js 没有原生 IES，可手工近似 | B |

**品牌来源链接**（按表格顺序）：

- Poliform：<https://www.poliform.it/en/products/orbis-armchairs/3d/>
- Molteni&C：<https://www.molteni.it/en/product/download/aster> 、<https://www.molteni.it/en/download>
- B&B Italia：<https://content.bebitalia.com/en>
- Minotti：<https://www.minotti.com/en/check-out-minottis-revit-library> ；版权声明见产品页，例如 <https://www.minotti.com/en/daniels>
- Poltrona Frau：<https://www.poltronafrau.com/us/en/faq.html>
- Cassina：<https://www.cassina.com/ww/en/products/lc2-poltrona.html>
- 查过但只找到第三方结果的品牌（Fendi Casa、Armani/Casa、Hermès）：<https://www.turbosquid.com/3d-model/fendi-casa> 、<https://www.designconnected.com/catalog/brand/Fendi-Casa>
- Bottega Veneta Home：在 bottegaveneta.com 上检索无结果，也没有专业下载入口
- Loro Piana Interiors：<https://www.loropiana.com/interiors/collection-2025/matter/index_EN.php>
- Rimadesio：<https://www.rimadesio.it/en/download/> 、<https://www.rimadesio.it/en/product/walk-in-closet/>
- Gessi：<https://areapro.gessi.com/en/product/65002>
- Dornbracht：<https://www.dornbracht.com/en-us/professional/bim-data> 、<https://www.dornbracht.com/en/downloads/>
- THG Paris：<https://www.thg-paris.com/us/en>
- Waterworks：<https://www.waterworks.com/us_en/unparalleled-support>
- Devon & Devon：<https://www.devon-devon.com/eu/technical-area>
- Villeroy & Boch：<https://pro.villeroy-boch.com/lv/lv/bathroom-and-wellness/service/downloads/planning-information/3d-data>
- Kohler：<https://www.kohler.com/en/for-professionals/technical-specifications>
- Baccarat：<https://www.baccarat.com/int_en/lighting/all-lighting/chandeliers/>
- Lalique：<https://fr.lalique.com/en/pages/hospitality>
- Rubelli：<https://www.rubelli.com/en/>
- Dedar：<https://www.syncronia.com/en/download-3d-textures-fabrics-and-carpets-dedar>（第三方）
- Giorgetti：<http://webup.giorgetti.eu/>
- Promemoria：<https://www.promemoria.com/en>
- Visionnaire：<https://www.visionnaire-home.com/products> 、<https://v-web.visionnaire-home.com/>
- Flos：<https://professional.flos.com/en/global/product-downloads/> 、<https://professional.flos.com/en/global/product-downloads/planning-aids/>

> **品牌总结：** 就算是条款没写明的品牌，也应当默认「仅限设计用途、不得再分发」。这是行业惯例，Minotti 就明文这么写，Devon & Devon 也写了「仅用于规划」。而且这些文件都要登录才能下载，下载那一步本身就附带了使用协议。本项目**不下载、不入库任何品牌官方文件**。

---

## 3. 平台逐条

| 平台 | 有什么 / 格式 | 网页实时渲染 | 放进公开仓库 / CDN | 署名 | 商用 / 其它 | 质量 · three.js | 档 |
|---|---|---|---|---|---|---|---|
| **Poly Haven** | HDRI、PBR 贴图（1k–8k）、模型；格式有 glTF、blend、FBX、USD；贴图带 AO/rough/metal/nor_gl/disp，部分有各向异性 | 可以 | 可以（「可以再分发……甚至用在你出售的产品里」） | 不要求（感谢署名） | CC0；网站 logo 和渲染图不在 CC0 范围内 | 模型面数约 0.5k–60k，glTF 可直接用；贴图用 1k/2k | **A** |
| **ambientCG** | PBR 材质（1k–8k，JPG/PNG）、少量模型和 HDRI | 可以 | 可以（明确允许「把原始文件放进你的项目」） | 不要求；建议写法见 §4 | CC0 | 只有贴图，最适合程序建模 | **A** |
| **Smithsonian Open Access** | 3d.si.edu 有 2,000+ 个扫描模型，格式 OBJ 和 glTF | 标 CC0 的可以 | 标 CC0 的可以 | 不要求 | 只有标 CC0 的才算；机构名和商标不在 CC0 内 | 扫描件面数高，要减面；题材是文物和标本 | **A**（只限 CC0） |
| **Sketchfab — CC0** | glTF / 原格式 | 可以 | 可以 | 不要求 | CC0 不清除商标权（如模型带品牌 logo） | 质量参差 | **A** |
| **Sketchfab — CC-BY** | 同上 | 可以 | 可以 | **必须**：作者名、模型链接、许可 | 可商用；CC-BY-SA 的衍生作品要用相同许可 | 同上 | **A** |
| **Sketchfab — CC-BY-NC / NC-SA / NC-ND** | 同上 | 只限非商用 | 只限非商用；ND 不能修改 | 必须 | 公开仓库以后可能被商用 fork；ND 连转换、减面都算修改 | — | B（默认不用） |
| **Sketchfab — Standard / Free Standard** | 付费或免费 | 可嵌入作品，但**不得**让第三方把素材当独立文件使用、下载、提取或访问 | **不可以** | 视听作品中「技术可行时」要署名 | 不能转授权 | glTF 网页下发就违反「不得提取」 | B |
| **Sketchfab — Editorial** | — | 不可商用或推广，不得暗示品牌关联 | 不可以 | — | — | — | C |
| **Fab — CC-BY** | 部分免费资产 | 可以 | 可以 | 必须 | — | 视资产而定 | **A** |
| **Fab — Standard（Personal/Professional）**，含 Quixel Megascans | 模型、贴图、UE 资产；格式有 FBX/OBJ/UE 工程等 | 引擎不限（「不限于 Unreal」），可以把项目连同资产一起商业发行 | **不可以**：Epic 内容 EULA 规定源格式只能给为你开发项目的员工和承包商；Fab 摘要写「不得单独转售或再分发」 | 不要求 | Megascans 2024 年底前免费领取，2025 年起付费，仍是 Standard | 网页 glTF 可被提取，属于灰色地带；公开仓库明确不行 | B |
| **BlenderKit — CC0** | 模型、材质（.blend） | 可以 | 可以 | 不要求 | — | 要在 Blender 里导出 glTF | **A** |
| **BlenderKit — Royalty Free** | 同上 | 只能作为项目的一部分 | 不能单独再分发；不能做「只由素材构成的项目」 | 不要求 | 可商用 | 仓库里放单独的 .glb 等于单独分发 | B |
| **TurboSquid**（Royalty Free） | MAX/FBX/OBJ/C4D/BLEND…，面数从几百到上百万 | 游戏或应用里可以，但模型必须在专有格式里，不逆向工程无法提取 | **不可以**（禁止以可提取的开放格式再分发） | 一般不要求 | Editorial 款不得商用或用于广告 | glTF/Draco 属于开放格式，不满足要求 | B（Editorial C） |
| **CGTrader**（Royalty Free） | 同上 | 必须是嵌入式资产，**最终用户不可下载**；要用专有格式或加密数据库等保护 | **不可以** | 不要求 | Editorial 只限新闻用途 | 同上 | B（Editorial C） |
| **3dsky / 3ddd** | 3ds Max（Corona/V-Ray），导出 FBX/OBJ；很多是品牌仿款，也有厂商免费款 | 可以做游戏等衍生作品，但不能以可编辑、可提取的形式放进去 | **明令禁止**把下载的原始模型上传到互联网 | — | 带图像、logo、商标的模型可能要另找厂商授权；不得用于 logo | 质量高、面数高（室内渲染级） | B |
| **BIMobject**（含 Polantis） | Revit/DWG/SKP/ArchiCAD/3DS 等 BIM；厂商官方数据 | 用途限于建筑行业专业人士的图纸或项目文件；**不得**向第三方出租、分发或提供访问，不得做进给第三方的产品或服务 | 不可以 | — | 厂商可以另订合同；polantis.com/CGU 现在跳转到 bimobject.com | BIM 几何粗细不均，材质简陋 | B |
| **Archiproducts / bim.archiproducts** | SKP、DAE、3DS、OBJ、DWG、DXF、Revit 等 | 站点条款：不得复制或商业利用网站内容，不得基于网站内容制作作品 | 不可以 | — | 下载文件的版权归厂商 | — | B |
| **3D Warehouse** | SKP（可导出 DAE/glTF） | 官方 FAQ：放进网站供他人使用属于「impermissible aggregation」 | 不可以（不得单独转让） | — | 厂商模型上的商标和 logo 必须保留；不得用于 logo | 质量参差 | B |
| **Textures.com** | 照片贴图、PBR | 游戏里可以用 | **不可以**：不得以任何开源许可发布，即使修改过；默认不得再分发 | 游戏里不要求；和模型打包时要写声明 | — | — | B（开源仓库 C） |

**平台来源链接：**

- Poly Haven 许可：<https://polyhaven.com/license>
- ambientCG 许可：<https://docs.ambientcg.com/license/>
- Smithsonian：<https://www.si.edu/openaccess/faq> 、<https://3d.si.edu/collections/openaccesshighlights>（si.edu 对抓取返回 403，CC0 说明取自其 FAQ 的搜索摘要）
- Sketchfab Standard/Editorial 协议：<https://sketchfab.com/licenses>；CC 许可及署名规范：<https://sketchfab.com/developers/download-api/guidelines> 、<https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters/>
- Fab：<https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab> ；EULA 正文 <https://www.fab.com/eula> **被 Cloudflare 拦截（HTTP 403），全文无法直接核对**；源格式条款参照 Epic Content EULA <https://www.unrealengine.com/eula/content>；Megascans 变化见 <https://www.cgchannel.com/2024/10/epic-games-has-made-megascans-free-to-all-but-only-until-the-end-of-2024/>、<https://support.fab.com/s/article/Fab-Transition-FAQs?language=en_US>
- BlenderKit：<https://www.blenderkit.com/docs/licenses/licensing-faq/> 、<https://www.blenderkit.com/terms-and-conditions-2021/>
- TurboSquid：<https://blog.turbosquid.com/royalty-free-license/>
- CGTrader：<https://www.cgtrader.com/pages/terms-and-conditions>
- 3dsky：<https://3dsky.org/faq/115/show> 、<https://3dsky.org/faq/189/show>
- BIMobject：<https://business.bimobject.com/terms-of-service-eula>
- Archiproducts：<https://www.archiproducts.com/en/terms-and-conditions>
- 3D Warehouse：<https://3dwarehouse.sketchup.com/tos> 、<https://help.sketchup.com/en/3d-warehouse/3d-warehouse-terms-use-faq>
- Textures.com：<https://www.textures.com/support/faq-license>

> **Fab Standard 结论（重点）：** Fab 官方摘要说，Standard 许可下的资产可以商用、可以跨引擎使用、可以把包含资产的项目商业发行，只禁止「单独」转售或再分发。但 Epic Content EULA 规定**源格式**只能交给为你开发项目的员工、关联方和承包商。本项目两条都过不去：
> (1) 公开仓库就是把源格式交给所有人；
> (2) 网页下发的 glTF 仍是开放格式，本质上还是源格式。
> 因此本项目把 Fab Standard 划为 **B**：可以本机渲染出图，不入库，不上网页。开源仓库是明确不行；网页实时渲染则缺乏官方明文授权，属于灰色地带。

---

## 4. 商标与署名规则（本项目强制）

### 4.1 商标

| 规则 | 说明 |
|---|---|
| 模型、贴图、UI 上**不出现**任何真实品牌的 logo、字样、交织字母（如 H、FF、Double-G）或标志性图案 | CC0 只放弃著作权，**不放弃商标权**（Sketchfab 的 CC0 说明也这样提醒） |
| 不用品牌名给资产命名 | 文件名写 `wardrobe_glass_bronze.glb`，不写 `rimadesio_zenit.glb` |
| 文案里品牌只能写作「风格参考」 | 例如「衣帽间构成参考了意式高端系统（铝框、玻璃门、皮革内衬）的通行做法」。不写「采用 Poliform 衣帽间」，不暗示合作或背书 |
| 不复刻品牌的**标志性单品外形** | 如 LC2 沙发、Fendi 标志纹样、Hermès H 系列。外观设计专利或注册外观的风险独立于著作权。程序建模要做「同一类型」，不做「同一款」 |
| 第三方「仿款」模型（3dsky、TurboSquid 上的 Minotti、Fendi 同款）一律不用 | 平台许可本身就是 B，再加上外观设计风险 |

### 4.2 署名（CC-BY 必做，CC0 建议做）

在仓库根目录维护 `ASSETS.md`（或 `map/estate/CREDITS.md`），**每个资产一行**；网页上加一个「素材来源」链接，指向这份清单。

CC-BY 写法（按 TASL：Title、Author、Source、License）：

```
"Victorian Armchair" by <作者名> (https://sketchfab.com/3d-models/xxxx) is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: decimated, re-textured, converted to glTF.
```

CC0 可选写法：

```
Marble012 from ambientCG.com, licensed under CC0 1.0 Universal.
black_walnut_veneer_01 by Poly Haven (https://polyhaven.com/a/black_walnut_veneer_01), CC0.
```

- 仓库本身的代码许可（MIT 等）**不会自动**覆盖素材，素材要单独标注许可。
- CC-BY-SA 素材的衍生作品必须仍用 CC-BY-SA。它不能和其它素材「合并成一个」文件，建议单独存放。
- CC-BY-NC 与 CC-BY-ND 不入库。

---

## 5. 给本项目的建议

总原则：**几何靠程序建模**（参考 §5.3 的品牌构成），**表面用 CC0 PBR 贴图**，局部道具用 Poly Haven 的 CC0 glTF 模型。网页端贴图用 1k（远景）或 2k（特写），用 `gltf-transform` 转 KTX2，模型用 Meshopt 压缩。

链接格式：Poly Haven 是 `https://polyhaven.com/a/<id>`，ambientCG 是 `https://ambientcg.com/view?id=<id>`。以下全部是 **CC0**。以下 id 均取自两站 2026-09-27 的官方 API 列表（Poly Haven `api.polyhaven.com/assets`、ambientCG `ambientcg.com/api/v2/full_json`）。

### 5.1 衣帽间

| 用途 | 推荐素材 | 链接 |
|---|---|---|
| 胡桃木柜体 / 饰面 | Poly Haven `black_walnut_veneer_01`、`american_walnut_veneer`、`smoked_walnut_veneer`、`european_walnut_veneer_04`、`walnut_veneer` | <https://polyhaven.com/a/black_walnut_veneer_01> 、<https://polyhaven.com/a/american_walnut_veneer> 、<https://polyhaven.com/a/smoked_walnut_veneer> |
| 浅色橡木 / 灰橡（Poliform 常用的榆木、灰橡替代） | Poly Haven `grey_oak_veneer_01`、`washed_grey_oak_veneer`、`white_oak_veneer` | <https://polyhaven.com/a/grey_oak_veneer_01> |
| 深色护墙板 | Poly Haven `dark_paneled_wood`、`wooden_panels` | <https://polyhaven.com/a/dark_paneled_wood> |
| 抽屉内衬皮革（米色缝线） | ambientCG `Leather035A`（米色、带缝线）、`Leather035D` | <https://ambientcg.com/view?id=Leather035A> |
| 深棕皮革（挂杆包覆、抽屉面） | ambientCG `Leather034A`、`Leather021`；Poly Haven `brown_leather`、`fabric_leather_01` | <https://ambientcg.com/view?id=Leather034A> 、<https://polyhaven.com/a/brown_leather> |
| 麂皮 / 绒面内衬 | ambientCG `Leather039`（suede）；Poly Haven `scuba_suede` | <https://ambientcg.com/view?id=Leather039> 、<https://polyhaven.com/a/scuba_suede> |
| 香槟 / 青铜色铝型材 | ambientCG `Metal048A`（光滑金色）、`Metal048B`（带指纹）、`Metal034`，调低饱和度用作香槟色 | <https://ambientcg.com/view?id=Metal048A> 、<https://ambientcg.com/view?id=Metal034> |
| 拉丝铝 / 拉丝钢 | ambientCG `Metal009`、`Metal012`（拉丝钢）；`Metal051A`（圆形拉丝铝，适合旋钮端面） | <https://ambientcg.com/view?id=Metal009> 、<https://ambientcg.com/view?id=Metal051A> |
| 烟灰 / 透明玻璃门 | 不需要贴图：`MeshPhysicalMaterial`（transmission、roughness 0.05、烟灰 attenuationColor）；需要蚀刻效果时，用 ambientCG `Fabric034`（felt）的 roughness 做细噪声 | — |
| 地面人字拼 / 凡尔赛拼 | Poly Haven `herringbone_parquet`；ambientCG `WoodFloor055`、`WoodFloor060`（Versailles）、`WoodFloor034`–`038`（herringbone） | <https://polyhaven.com/a/herringbone_parquet> 、<https://ambientcg.com/view?id=WoodFloor055> |
| 道具 | Poly Haven `ornate_mirror_01`（穿衣镜，14k 面）、`Ottoman_01`（换鞋凳，4k）、`vintage_suitcase`、`wooden_display_shelves_01` | <https://polyhaven.com/a/ornate_mirror_01> 、<https://polyhaven.com/a/Ottoman_01> |

### 5.2 卫浴

| 用途 | 推荐素材 | 链接 |
|---|---|---|
| 白色抛光大理石（台面、墙） | ambientCG `Marble012`（抛光、带 bathroom 标签）、`Marble021`（白、反光）；Poly Haven `marble_01` | <https://ambientcg.com/view?id=Marble012> 、<https://ambientcg.com/view?id=Marble021> 、<https://polyhaven.com/a/marble_01> |
| 黑色大理石（Nero Marquina 风） | ambientCG `Marble016`（黑、反光）、`Marble002` | <https://ambientcg.com/view?id=Marble016> |
| 绿色大理石（Verde 风） | ambientCG `Marble009`（dark green） | <https://ambientcg.com/view?id=Marble009> |
| 玛瑙 / 缟玛瑙背光墙 | ambientCG `Onyx001`–`Onyx015`（如 `Onyx015`、`Onyx013`），配合 emissive 或 transmission 做背光 | <https://ambientcg.com/view?id=Onyx015> |
| 洞石 | ambientCG `Travertine009` 等 | <https://ambientcg.com/view?id=Travertine009> |
| 马赛克 / 水磨石地面 | Poly Haven `marble_mosaic_tiles`、`terrazzo_tiles` | <https://polyhaven.com/a/marble_mosaic_tiles> 、<https://polyhaven.com/a/terrazzo_tiles> |
| 黄铜、金色龙头和五金 | ambientCG `Metal042A`（shiny gold）、`Metal048A`；铬面直接用 metalness 1、roughness 0.05，不需要贴图 | <https://ambientcg.com/view?id=Metal042A> |
| 毛巾 | Poly Haven `terry_cloth` | <https://polyhaven.com/a/terry_cloth> |
| 反射环境（离线预烘焙或 PMREM） | Poly Haven HDRI `modern_bathroom`、`hotel_room`、`entrance_hall`、`ballroom` | <https://polyhaven.com/a/modern_bathroom> 、<https://polyhaven.com/a/ballroom> |
| 洁具几何 | Poly Haven 没有合适的 CC0 高端洁具。浴缸、台盆、龙头用程序建模，参考 Devon & Devon 独立浴缸、THG 十字把手的「类型」，不复刻具体款式 | — |

### 5.3 灯具

| 用途 | 推荐素材 | 链接 / 面数 |
|---|---|---|
| 古典水晶 / 金属吊灯（主厅、楼梯厅） | Poly Haven `Chandelier_01`（约 26.9k）、`Chandelier_02`（21.5k）、`Chandelier_03`（29.3k） | <https://polyhaven.com/a/Chandelier_01> 、<https://polyhaven.com/a/Chandelier_03> |
| 黄铜烛台 / 壁灯替身 | `brass_candleholders`（41.9k，建议减面）、`wooden_candlestick` | <https://polyhaven.com/a/brass_candleholders> |
| 现代吸顶灯 | `modern_ceiling_lamp_01`（5.6k） | <https://polyhaven.com/a/modern_ceiling_lamp_01> |
| 油灯 / 桌面装饰灯 | `vintage_oil_lamp`（7.2k） | <https://polyhaven.com/a/vintage_oil_lamp> |
| 衣帽间 LED 灯带 | 程序做法：细长 `BoxGeometry` 加 emissive，配合 bloom；不需要素材 | — |
| 光型参考 | 可以看 Flos 公开的 IES 数据了解光分布，但 IES 文件不入库；three.js 用 SpotLight 的 angle 和 penumbra 近似 | — |

### 5.4 织物

| 用途 | 推荐素材 | 链接 |
|---|---|---|
| 丝绒（沙发、窗帘） | Poly Haven `velour_velvet`（带 anisotropy 贴图），three.js 用 `sheen` 与 `sheenColor` | <https://polyhaven.com/a/velour_velvet> |
| 真丝 / 缎面（床品、靠垫） | Poly Haven `crepe_satin`、`crepe_georgette` | <https://polyhaven.com/a/crepe_satin> |
| 提花 / 大马士革（Rubelli 风参考） | Poly Haven `floral_jacquard`、`quatrefoil_jacquard_fabric` | <https://polyhaven.com/a/floral_jacquard> 、<https://polyhaven.com/a/quatrefoil_jacquard_fabric> |
| 羊毛圈圈绒 / 羊绒粗花呢（Loro Piana 风参考） | Poly Haven `wool_boucle`、`poly_wool_herringbone`、`caban` | <https://polyhaven.com/a/wool_boucle> 、<https://polyhaven.com/a/poly_wool_herringbone> |
| 亚麻（窗纱、床头） | Poly Haven `rough_linen` | <https://polyhaven.com/a/rough_linen> |
| 地毯 | ambientCG `Carpet001`–`Carpet016` | <https://ambientcg.com/view?id=Carpet016> |
| 靠垫模型 | Poly Haven `throw_pillows_01`（6.4k） | <https://polyhaven.com/a/throw_pillows_01> |

### 5.5 家具 / 陈设（CC0 模型，glTF 可直接用）

| 房间 | Poly Haven 模型（面数） |
|---|---|
| 门厅 / 客厅 | `ClassicConsole_01`（7.6k）、`ArmChair_01`（5.6k）、`Sofa_01`（4.1k）、`sofa_03`（8k）、`CoffeeTable_01`（10.4k）、`ornate_mirror_01`（14.2k）、`fancy_picture_frame_01`（0.9k）、`antique_ceramic_vase_01`（9.4k）、`brass_vase_01`（21.4k）/`brass_vase_02`（6.9k）、`marble_bust_01`（17.5k）、`mantel_clock_01`（29.7k）、`vintage_grandfather_clock_01`（12.6k） |
| 卧室 | `ClassicNightstand_01`（2k）、`vintage_cabinet_01`（61k，需减面）、`drawer_cabinet`（26.4k） |
| 书房 | `decorative_book_set_01`（112k，远景要用 LOD 或 impostor）、`book_encyclopedia_set_01`（67k）、`chess_set`（77k，只在特写时加载） |
| 绿植 | `potted_plant_04`（6.1k）；`potted_plant_01`、`potted_plant_02` 面数 7–10 万，不建议 |

> 注意：Poly Haven 家具偏「古董 / 维多利亚」风，和新古典顶奢的精致感有差距。建议**只用在远景和陈设点缀**，主家具（沙发、床、衣柜、餐桌）用程序建模配 §5.1–5.4 的贴图。Sketchfab 上的 CC0 / CC-BY 新古典家具可以逐件筛选；每件都要核对页面上的许可标签，并记录进 ASSETS.md。

### 5.6 品牌风格要点（只作程序建模参考，不用其文件）

| 系统 | 官方描述的构成要点 | 程序建模落点 |
|---|---|---|
| **Rimadesio Zenit**（Giuseppe Bavuso 设计） | 挤压铝加铝板结构；「303 bronzo」青铜色结构；合成皮内饰（「157 arena」沙色）；玻璃顶板和抽屉面（「63 grigio trasparente」烟灰透明）；8 mm 挤压铝抽屉，内衬织物或合成皮，边缘是无接缝的「folding」工艺；三种抽屉面：开放式、玻璃面、烤漆面 | 立柱和横档用细型材（约 20–30 mm 见方），青铜色 metal 0.8、rough 0.35；抽屉用薄壁盒体，内衬 `Leather035A`；顶板用烟灰玻璃 |
| **Rimadesio Cover** | 门就是结构件，带水平铝横档；门背面是和结构同色的烤漆铝板；磁吸闭合；有独立式版本；合成皮门板和配件 | 门板分格：水平横档 3–5 道，嵌皮革面板 |
| **Poliform Senzafine**（无门步入式） | 结构为榆木三聚氰胺板；侧框、封边、踢脚为哑光香槟色；背板为「奶白」卷帘纹亚克力；上层搁板正面**集成 LED**；挂杆包覆技术皮革；下层搁板皮革面、香槟框；展示抽屉柜为烟灰玻璃顶、45° 倒角烤漆抽屉面 | 开放式格架；每层搁板前沿加 emissive 细条（LED）；挂杆包皮；中岛展示柜用烟灰玻璃顶 |
| **Molteni&C Gliss Master**（Vincent Van Duysen） | 通过玻璃展示内部；Meridian 玻璃门带水平装饰分隔，和金属框的竖向线条形成节奏；搁板、抽屉、挂杆都有集成 LED；材料为木、烤漆木、彩色蚀刻玻璃；每个部件都可定制 | 玻璃门加水平细分隔条；门内 LED 照亮衣物，形成「橱窗」效果；门框用深色金属 |
| **通用新古典顶奢衣帽间**（综合以上） | 中岛（玻璃顶首饰抽屉，丝绒分格）；镜面端墙；皮革包覆挂杆；分区灯光（色温 2700–3000K） | 中岛抽屉内衬用 `velour_velvet` 深色；天花用暗槽灯带 |
| **卫浴**（Devon & Devon / THG / Gessi 风格） | 独立铸铁或矿石浴缸、爪脚或基座；十字或杠杆把手的黄铜 / 镀金龙头；大理石整墙 | 浴缸用 Lathe 旋转体加 Bevel；龙头用管道 Tube 与十字把手组合；墙面用 `Marble012` / `Marble009` |
| **织物**（Rubelli / Dedar / Loro Piana） | Rubelli：威尼斯大马士革、丝绒；Dedar：高光泽丝混纺；Loro Piana：羊绒、羊驼、亚麻的中性色 | 丝绒用 sheen；提花用 jacquard 贴图；中性色板（燕麦、驼、炭灰） |

来源：<https://www.rimadesio.it/en/product/walk-in-closet/> 、<https://www.poliform.it/us/products/senzafine-walk-in-closet/> 、<https://www.molteni.it/en/us/product/gliss-master> 、<https://www.molteni.it/en/am/atmosphere/gliss-master-meridian-doors>

### 5.7 入库流程（建议）

1. 只从 A 档来源下载，下载时记下 URL、许可和日期。
2. 贴图：原图保留在本机；入库的是 1k/2k 版本，经 `gltf-transform` 转 KTX2 或 WebP。
3. 模型：从 glTF 开始，按需减面，用 Meshopt 压缩，改用中性文件名。
4. 在 `ASSETS.md` 追加一行（资产名、来源 URL、作者、许可、改动）。
5. B 档素材（品牌官方文件、TurboSquid、3dsky 等）只能在**仓库外**的本机目录里用于 Blender 出图，路径写进 `.gitignore`。出图前检查画面里没有 logo。

---

## 7. 本项目实际采用（衣帽间样板间 `map/estate/closet/`）

- A 档，全部 CC0：
  - 贴图 10 组：Poly Haven 8 组（European Walnut Veneer 04、Herringbone Parquet、Velour Velvet、Brown Leather、Crepe Satin、Rough Linen、Poly Wool Herringbone、Quatrefoil Jacquard Fabric），ambientCG 2 组（Marble014、Marble016）。
  - 模型 7 个，都来自 Poly Haven：Vintage Grandfather Clock 01、Ornate Mirror 01、Chandelier 03、Treasure Chest、Fancy Picture Frame 01、Vintage Pocket Watch、Antique Ceramic Vase 01。
  - 逐文件的来源、作者、链接和处理方式见 `map/estate/closet/assets/CREDITS.md`。
- 品牌只作风格参考：
  - 玻璃门配深色金属框，参考 Rimadesio 和 Molteni。
  - 搁板前沿灯带和柜内 LED，参考 Poliform。
  - 皮革衬里抽屉和玻璃顶展示抽屉，参考 Poliform 和 Rimadesio。
  - 页面、模型和文件名里都不出现品牌名或 logo。
- B 档和 C 档来源，一个都没有进仓库。
