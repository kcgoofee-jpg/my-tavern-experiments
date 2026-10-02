# map/estate · 庄园网页三维（estate2）

页面 `index.html` + `main.js`；协议见 `index.html` 顶部注释。旧 v1 程序生成模型（building / site / furniture / lib.js、demo.html）已删；`plan.js` 只剩旧数据，选择器 / 自定义还在读它，不再驱动三维。

## 文件

| 文件 | 内容 | 生成 |
|---|---|---|
| `model/site.glb` / `site_low.glb` | 整岛外观：地面（俯视渲染贴图）、岩基、主楼外壳 `house_shell(_vc)`、中 / 西 / 东三区建筑 `site_{c,w,e}(_vc)` | `blender/estate2/web_scene.py` → `export_web.py` → gltf-transform（webp + meshopt；低档 resize + simplify） |
| `model/house.glb` | 主楼室内体量 B2–F3（每层 `f_<层>_struct` / `f_<层>_furn`，B2 医疗中心 `f_B2_med`），进楼层视图才加载；两档同一个文件（0.5 MB）。glb 有两个场景（B2 医疗块在第二个里），加载器把每个场景的节点都挂进默认场景 | `house_web.py` + `medical_web.py`（medical_b2.py），gltf-transform merge --merge-scenes + meshopt |
| `model/zones.json` | 室外热点（名字 / 别名对齐 maps.json 的 areas） | `blender/estate2/web_zones.py` |
| `model/manifest.json` | 档位文件名、F1 标高（30 m） | 手写 |
| `../data/eden_estate_rooms.json` | 房间精确多边形（楼层条、拾取、高亮、飞行） | `blender/estate2/floorplans.py` |

## 视图

- 外观：整岛，室外热点，跟地图的时段（U-FIX-4 的时钟胶囊：清晨 / 白天 / 黄昏 / 夜）。楼层 B2…F3：外壳在楼面以上 1.5 m 截断（墙内侧涂浅灰当截面），地下层隐藏地面；这是唯一带房间名、房里的人和房间卡的视图。分段只有这两个按钮，键 1 = 外观、2 = 楼层（x 光视图已删，D38）。
- 档位：`?tier=low|std`；自动 = 省流 / 慢网 / 内存 ≤ 4 GB / 地图「省流」档 → low；新款手机（iPhone 不报内存）走 std。
- 清晰度：像素比 min(DPR, 2)、始终 MSAA、贴图各向异性 8（低档 4）+ 三线性 mip；连续动画 2 秒帧率 < 30 自动降到 1.5。
- 挡土墙：地面 / 岩体 / 分区烘焙里的竖直陡面（俯视烘焙拉成条纹的）载入时拆出，换成按世界坐标平铺的石砌纹（canvas 生成，3.2 m 一块）；岩体只换离外缘 > 45 m 的台地墙，外圈悬崖保留。
- 背景：分时段的天空渐变（scene.background）+ 云海圆盘（着色器 fbm，岛底上方 18 %），配色锚在昼夜关键帧的雾色上（`map/three/backdrop.mjs`，地标查看器共用）。截面色只在墙真的被剖开时涂（`uCut`），外观视图里背面就是正常烘焙面。
- 夜面：夜里每块烘焙面向自己的中间调提（`map/three/night-look.mjs`），烘焙的日光长影子随之抹平（A4）。窗玻璃按清单 `x-night-glow` 点名的材质（没点名就按材质名认窗 / 玻璃）加一层暖光，按世界坐标分格：每层亮度不同、约两成窗暗着。当前 site.glb 没有可分离的窗材质，等台账 `glb:estate:night-glow` 重出。
- 休眠：查看器收到 eden-map:sleep 时把画好的庄园 iframe 隐藏 + estate:pause（停 rAF，GPU 资源留着），wake 时 estate:resume 直接接着用；宿主 3 分钟后卸载整页才释放；省流 / 低内存照旧拆。glb 走 Cache API（eden-estate-glb，键带 manifest.v；重出模型要改 v）。
- 衣帽间：主卧套间里单独一个子热点（F2-57w，卡：主卧带衣帽间、主人通道开进衣帽间），卡按钮「衣帽间图集」。
- 标注开关：右下「标」按钮或 L 键，按查看者记在 localStorage `edenEstateLabels`。

## 重出模型

```
Blender -b --factory-startup -P blender/props/dairy_parlour/build.py -- --res 64 --samples 1 --out /tmp/d.png --blend /tmp/dairy.blend
E2_DAIRY_BLEND=/tmp/dairy.blend Blender -b --factory-startup -P blender/estate2/web_scene.py -- --save /tmp/scene.blend
Blender -b /tmp/scene.blend -P blender/estate2/export_web.py -- --out /tmp/site_raw.glb --samples 64 --top 4096   # 约 8 分钟（M 系 GPU）
G="npx -y @gltf-transform/cli"
$G webp /tmp/site_raw.glb /tmp/w.glb --quality 78 && $G meshopt /tmp/w.glb map/estate/model/site.glb --level medium
$G resize /tmp/site_raw.glb /tmp/r.glb --width 2048 --height 2048 && $G resize /tmp/r.glb /tmp/r2.glb --width 1024 --height 1024 --pattern rock \
  && $G simplify /tmp/r2.glb /tmp/rs.glb --ratio 0.5 --error 0.0015 && $G webp /tmp/rs.glb /tmp/rw.glb --quality 68 && $G meshopt /tmp/rw.glb map/estate/model/site_low.glb --level medium
python3 blender/estate2/web_zones.py
```

测试：`node tools/browser/estate3d.mjs <out> [--drafts docs/drafts]`（截图 + 飞行 / 热点 / 图集 / 标注开关）。

## Day-night / particle hand-tuning (Part 9)

Open `estate/index.html?stats=1` standalone (`stats=1` keeps the loop redrawing every frame, so draw
calls and luminance are readable), then in the console:

- `__estate.dayNight.setClock({ day: 1, min: 750 })` jumps the world clock (minutes: 30 night /
  390 dawn / 750 noon / 1095 dusk); `__estate.dayNight.describe()` reports the current phase, sun
  intensity and how many baked materials are graded; `__estate.npcs.set(schedule, clock)` moves the
  NPCs with it. `__estate.dayNight.setPeriod('night')` jumps to a whole period (what the clock popover
  sends), `__estate.nightLook()` reports how many window materials light up at night and the current
  uGlow / uNight.
- `__estate.fx.set('rain' | 'snow' | 'sand' | 'aurora', intensity)` switches weather, `set('none', 0)`
  clears it; `__estate.fx.describe()` reports type / intensity / draw calls, `__estate.fx.layers()` the
  `fx` slot registration. Embedded in the viewer, prefix with `document.querySelector('#estate').contentWindow.`;
  host scripts use `window.TCthreeFX`.
- End-to-end probe: `node tools/browser/p9_daynight_fx.mjs <out>` (clock 00:00 → 24:00 plus ten particle
  cycles; checks luminance, emissive, searchlight, draw call ≤ 1 and no leaks).
