// 把 mock.html 渲染成 PNG：node docs/design/custom-v2/render.mjs（用 tools/browser/lib.mjs 找 playwright）
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { pw } from '../../../tools/browser/lib.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url)), out = path.join(dir, 'shots'); fs.mkdirSync(out, { recursive: true });
const url = q => pathToFileURL(path.join(dir, 'mock.html')).href + q;
const b = await pw.chromium.launch();
for (const [vp, w, h] of [['desk', 900, 620], ['m375', 375, 812]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  for (const s of ['card', 'v3d', 'conflict', 'hub']) for (const th of ['dark', 'light']) {
    await p.goto(url(`?s=${s}&theme=${th}`)); await p.screenshot({ path: path.join(out, `${s}_${vp}_${th}.png`) });
  }
  await p.goto(url('?s=card&theme=dark&lang=en')); await p.screenshot({ path: path.join(out, `card_${vp}_dark_en.png`) });
  await p.close();
}
await b.close();
