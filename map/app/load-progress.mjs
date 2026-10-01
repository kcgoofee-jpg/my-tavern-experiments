// 查看器整屏加载层（#loading）的进度：平面瓦片与三维页共用 map/ui/progress.mjs（fix3）
import { mountProgress } from '../ui/progress.mjs';
let LP = null;
export const loadingProgress = () => LP || (LP = mountProgress(document.querySelector('#loading > div'), { labelEl: document.querySelector('#loading > div > span') }));
