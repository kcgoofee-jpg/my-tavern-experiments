// 宿主脚本源码（C2 第 4 步拆分后）：入口 map/tavern/eden-map.js + host-th / host-routes / host-lifecycle + mvu-bridge（P2）拼在一起，
// 给按源码对照的测试用（断言内容不变，只是代码分到了几个文件里）。不是测试文件（不匹配 *.test.mjs）。
import { readFileSync } from 'node:fs';
export const HOST_FILES = ['map/tavern/eden-map.js', 'map/tavern/host-th.mjs', 'map/tavern/host-routes.mjs', 'map/tavern/host-lifecycle.mjs', 'map/tavern/mvu-bridge.mjs'];
export const HOST_SRC = HOST_FILES.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
