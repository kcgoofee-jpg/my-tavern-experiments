// node tools/browser/gallery.mjs —— 房间图集（map/ui/gallery.js）：关闭按钮不压在图片上（手机 / 窄窗 / 矮窗 / 桌面）；有重叠时退出码 1
import { ensureServer, newPage, closeAll, BASE } from './lib.mjs';
const srv = await ensureServer(); let fail = 0;
try {
  for (const [preset, vw] of [['phone', 0], ['iphone', 0], ['desktop', 0], ['desktop', [480, 900]], ['desktop', [700, 420]], ['desktop', [375, 340]], ['desktop', [560, 420]]]) {
    const P = await newPage(preset); if (vw) await P.page.setViewportSize({ width: vw[0], height: vw[1] });
    await P.page.goto(BASE + 'viewer.html?map=world');
    const r = await P.page.evaluate(async base => {
      const G = await import(base + 'ui/gallery.js');
      // db5c8b2f 起通用图集数据已清空（衣帽间渲染图改走 closet/ 三维入口），本测试只测 openGallery 布局（关闭按钮不压图），改用指向仓库已有图的合成图集
      G.openGallery({ title: '布局测试', dir: 'art/', images: [{ f: 'world_1k', zh: '测试大图' }] }, { base });
      const img = document.querySelector('.rg-img'); await img.decode().catch(() => {});
      const a = img.getBoundingClientRect(), b = document.querySelector('.rg-x').getBoundingClientRect();
      const over = !(b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom);
      return { over, img: [a.left, a.top, a.width, a.height].map(Math.round), x: [b.left, b.top, b.width, b.height].map(Math.round), vw: innerWidth, vh: innerHeight };
    }, BASE);
    const ok = !r.over && r.img[2] > 0 && r.img[3] > 0; if (!ok) fail++;
    console.log(ok ? '✓' : '✗', preset, vw || '', JSON.stringify(r)); await P.close();
  }
} catch (e) { fail++; console.log('✗ 运行', e.message.split('\n')[0]); }
finally { await closeAll(); srv?.stop?.(); }
process.exit(fail ? 1 : 0);
