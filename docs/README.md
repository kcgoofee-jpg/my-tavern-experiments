# docs 总索引（2026-09-29 全量分类）

## Current documents

Read in this order: agent-brief → ARCHITECTURE → naming → todo → handoff.

- [agent-brief.md](agent-brief.md) — the rules (CLAUDE.md is a symlink to it)
- [ARCHITECTURE.md](ARCHITECTURE.md) — module map, data flow, entity protocol
- [naming.md](naming.md) — naming rules, rename map, glossary
- [entity-protocol.md](entity-protocol.md) — S6 design: entity protocol, drawer tabs, unified stash, Items tab (review sheet P-01…P-14)
- [todo.md](todo.md) — the single tracker (state of the Spatial OS campaign in §0)
- [handoff.md](handoff.md) — last session's handoff (history, dated 2026-09-29)
- [plans/spatial-os.md](plans/spatial-os.md) — the plan of record
- [plans/spatial-os-log.md](plans/spatial-os-log.md) — execution log (RESULT blocks)
- [plans/render-campaign.md](plans/render-campaign.md) — render campaign ledger status
- [cloud-render.md](cloud-render.md) — cloud render operations
- [landmark-pipeline.md](landmark-pipeline.md) — landmark pipeline
- [versioning.md](versioning.md) — versions, tags, update prompts
- [branching.md](branching.md) — branches and sync
- [language-policy.md](language-policy.md) — document language rules

Everything else in docs/ is history unless one of these links to it.

---

新对话 / 新代理先读：handoff.md → agent-brief.md → onboarding.md → project-design.md。

## 1. 接手必读（活文档）
- handoff.md 接手文档（总清单、状态更新）
- agent-brief.md 代理简报（先读这个）
- onboarding.md 上手一页
- project-design.md 项目设计 + 整改计划（C1–C5）
- tooling.md 流程工具
- versioning.md 版本号/标签/更新提示规则
- rejected.md 用户已否决清单（所有人设/审阅必读，禁止复发）
- content-compat.md 用户内容兼容（技术兼容，不审核）

## 2. 状态跟踪 / 待办
- local-cleanup-plan.md 本地清理计划（划线制）
- ui-refactor-backlog.md UI 统一重构待办
- upper-islands-checklist.md 上层八岛可见特征清单（v16，等用户点头）
- card-buildings.md 卡内建筑上图/建模进度
- card-omissions.md 卡里缺什么→怎么补→验收（工作文档）

## 3. 功能设计与流程
- map-events.md 事件联动（已实施）；event-taxonomy.md 事件体系定稿
- interaction-modes.md 脚本↔卡交互（已实施）
- mvu-integration.md 地图×MVU 源码结论（v0.9.9）
- workshop.md 创意工坊设计稿（未实施）
- pack-schema-v1.md 设定包 schema（已冻结）
- gallery.md 房间图集流程
- baibai-bridge.md 柏宝绘（ST-BaiBai-Image）桥：读角色外貌库 / 房间配图 / 三条边界（可选依赖）
- landmark-pipeline.md 地标一键流水线（已上线）
- cloud-render.md 云渲染运维（现行）
- render-deps.md 渲染依赖表；render-performance.md 性能实测；render-retro.md 渲染复盘 v2

## 4. 卡与设定研究（资料，中性转写）
- card-reading.md 读卡流程（可复用）；card-digest.md 卡摘要
- eden-estate.md / eden-lore-space.md / eden-references.md 伊甸庄园
- upper-setting.md / upper-estates.md / upper-islands-references.md 上层
- tiancheng-maps.md 三层地图参考与真实感原则
- world-setting.md 世界图设定稿 v1
- author-compat.md 给卡作者的备忘（草稿，暂不发送）

## 5. 参考板 / 外部资源
- luxury-assets.md 资产许可调查（法务）
- model-sources.md 3D 模型来源调查
- wardrobe-references.md 衣帽间；b2-medical-references.md B2 医疗；landmark-references.md 开局地标

## 6. i18n
- i18n-glossary.md 术语表；i18n-names.md 地名对照（待用户审）；i18n-zh-feedback.md 中文文案笔记

## 7. 审计快照（结论已并入待办，原文留档）
- tavernhelper-audit.md TH 地基检测；ui-audit.md 悬浮窗 UI 审计（E4）

## 8. 子目录
- design/ v2 架构/UI/深度系统设计稿
- generalize/ 通用化（他卡适配）说明
- landmarks/ 各地标设定与 checklist
- perf/ 性能对比报告
- reports/ 偶发报告（token 用量等）
- reviews/ 评审快照（人设评审、gate 记录）
- drafts/ 草稿图（重资产，不入历史）
- history/ 旧云端任务简报（CLOUD_TASK1–8、GOAL v0.9.1 等，天然归档区）

## 9. 归档（过时，只作历史查证）
- archive/2026-09/：morning-brief-0928、overnight-questions、upper-v9-layout（被 v18 取代）、clouds（被方案 B 取代）、MAP_EVENTS_DESIGN（已落地为 map-events.md）
- 归档规则见 archive/README.md
