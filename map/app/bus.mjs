// 查看器侧的全局监听器总线（P2-3）：所有 window / document 级监听都登记在这里，卸载时一把摘干净。
// 目标懒解析：模块求值时 window 可能还没就位（单测桩 / 提前求值），取不到就是空总线——on() 安静返回 false，不抛。
import { createListenerBus } from '../core/listeners.mjs';

const lazyWin = {
  addEventListener: (...a) => window.addEventListener(...a),
  removeEventListener: (...a) => window.removeEventListener(...a),
};

export const bus = createListenerBus(lazyWin);
/** 登记：on({ key, type, fn, target?, opts? })；key 全仓唯一（模块名.用途），重复登记先摘旧的 */
export const busOn = o => bus.on(o);
export const busOff = key => bus.off(key);
export const busOffAll = () => bus.offAll();
/** 台账（自检 / 浏览器探针对泄漏）：{ count, byType, targets } */
export const busDescribe = () => bus.describe();

if (typeof window !== 'undefined') window.__listenerBus = bus;   // 探针与自检的读取口（只读台账）
