#!/usr/bin/env node
// 当前地点解析自查（card-map 第 6 步）：把包里每个地点的 name / alias / 「层·地点」写法都喂给 map/app/here-v2.mjs（节点树上的当前地点，与查看器同一套），
// 核对落到正确的图和标记；再把 --extra 文件里的原文（每行一条，例如卡开场白 / MVU 初值里的地点写法）逐条解析并打印结果。
// 用法：node skills/card-map/check_here.mjs <包 id> [--extra 地点写法.txt]
// 失败（落错图 / 落错标记 / 解析不出）时退出码 1。路径一律经 fileURLToPath，含中文的仓库路径也能用。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeHere } from '../../map/app/here-v2.mjs';
import { rebaseRegistry, resolve } from '../../map/core/pack.mjs';

const MAP = fileURLToPath(new URL('../../map/', import.meta.url));
const J = p => JSON.parse(readFileSync(MAP + p, 'utf8'));
const [id, ...rest] = process.argv.slice(2);
if (!id) { console.error('用法：node skills/card-map/check_here.mjs <包 id> [--extra 文件]'); process.exit(2); }
const man = resolve(J(`packs/${id}/manifest.json`));
const reg = rebaseRegistry(J(`packs/${id}/maps.json`), man.base);
const idx = makeHere({ manifest: man, maps: reg });
let bad = 0, ok = 0;
for (const [mid, m] of Object.entries(reg.maps)) {
  const layer = m.layer?.name;
  for (const [key, mk] of Object.entries(m.markers || {})) {
    const words = new Set([mk.name, ...(mk.alias || [])]);
    if (layer) words.add(`${layer}·${mk.name}`);
    for (const w of words) {
      const r = idx.here(w);
      const hit = r && r.map === mid && (r.marker == null || r.marker === key);
      if (hit) { ok++; continue; }
      bad++; console.log(`✗ ${w} → 期望 ${mid}/${key}，实际 ${r ? `${r.map}/${r.marker ?? '-'}（级别 ${r.level}）` : '解析不出'}`);
    }
  }
}
const ei = rest.indexOf('--extra');
if (ei >= 0) for (const line of readFileSync(rest[ei + 1], 'utf8').split('\n').map(s => s.trim()).filter(Boolean)) {
  const r = idx.here(line);
  console.log(`${r ? '·' : '?'} ${line} → ${r ? `${r.map}/${r.marker ?? '-'}（级别 ${r.level}）` : '解析不出（考虑加 alias）'}`);
}
console.log(`${id}：${ok} 个写法落点正确，${bad} 个不对`);
process.exit(bad ? 1 : 0);
