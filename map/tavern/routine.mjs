// NPC 日常漫游 / 日程模拟（Part 5-3）：宿主侧入口。计算全在共享的叶子层 map/core/routine.mjs ——
// 查看器（app/wander.mjs，确定性时钟驱动漫游）与宿主（填入在场表）要按同一张日程表挪人，而 core 不许回引 tavern，
// 所以实现下沉、这里原样转发（导出名与行为一字不改，tests/routine.test.mjs 照旧跑）。
export * from '../core/routine.mjs';
