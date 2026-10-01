// 宿主脚本源码（C2 第 4 步、S5-1 拆分后）：入口 map/tavern/eden-map.js + host-th / host-routes / host-lifecycle + mvu-bridge（P2）+ 八个 flow 模块拼在一起，
// 给按源码对照的测试用（断言内容不变，只是代码分到了几个文件里）。不是测试文件（不匹配 *.test.mjs）。
import { readFileSync } from 'node:fs';
export const HOST_FILES = ['map/tavern/eden-map.js', 'map/tavern/host-tavernhelper.mjs', 'map/tavern/host-routes.mjs', 'map/tavern/host-lifecycle.mjs', 'map/tavern/mvu-bridge.mjs',
  'map/tavern/llm-flow.mjs', 'map/tavern/loot-flow.mjs', 'map/tavern/chars-flow.mjs', 'map/tavern/timeline-flow.mjs', 'map/tavern/host-api.mjs', 'map/tavern/root-store.mjs', 'map/tavern/host-checks.mjs', 'map/tavern/modes-flow.mjs'];
export const HOST_SRC = HOST_FILES.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
