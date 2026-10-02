// 当前生效的世界时段（'' = 时段系统关闭 / 读不到世界时间）：与多时段底图换档同一个来源（custom-tint 的 todNow，宿主时钟或时钟弹层选的档）。
// 单独成模块：底图换档、插图、羽化与城外雾都要读它，而带自装副作用的模块（app/tier-fog.mjs、app/clouds.mjs）不能被核心模块 import ——
// 那种模块在 node 测试里求值时会让进程挂着不退出（顶层 setInterval 既不跑也不清）。
import { plugins } from './plugins.mjs';
export const periodNow = () => plugins.CustomNamesView?.todNow?.() || '';
