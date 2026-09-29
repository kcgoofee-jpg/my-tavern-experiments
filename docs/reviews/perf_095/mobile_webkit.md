# 性能评估 · mobile_webkit（4GB iPhone / TauriTavern WKWebView / 移动数据 / 500+ 楼 / 频繁开关）

## 1. 检查内容（只做了静态审读，本轮没有跑 Playwright 实测，所以没有运行时数字）
- 体积：viewer.html 148 KB（整页 fetch 一次，缓存后作为 srcdoc 注入）；events.js 44 KB，section.js 44 KB，chars.js 12 KB。
- 长聊天：recompute 只扫描最近 SCAN=80 楼（eden-map.js:349,366），和总楼数无关，500+ 楼不会带来线性增长。
- 开关：关闭后进入 sleep（viewer.close() 并清空 overlay，eden-map.js:300 / viewer.html:1517），3 分钟后卸载 iframe（SLEEP_MS，eden-map.js:268）。
- 瓦片：触屏上 imageLoaderLimit 为 6、maxImageCacheCount 为 30（viewer.html:610）；DPR 上限按档位分别为 1.25/2/3（viewer.html:481-483,604）。
- 毛玻璃：pointer:coarse 或 deviceMemory<=4 时都会关闭 backdrop-filter（viewer.html:27,387-388）。iOS 没有 navigator.deviceMemory，由 coarse 规则兜底，没问题。
- blob iframe：庄园 frame 的 blob URL 在 load 后立即 revoke（viewer.html:866-867），sleep 时执行 frame.remove()。

## 2. 发现
### P0：无
### P1：无（未确认到）
### P2
- P2-1 休眠后在后台预取另一版底图：sleep 3 秒后会调用 slowWarmAlt()（viewer.html:1517,679）。按 viewer.html:680 的注释，leanBg() 在拿不到网络信息的触屏上视为省流并跳过；iOS 没有 navigator.connection，所以大概率已经跳过，但需要在真机上确认。如果没有跳过，就会浪费移动数据。修法：iOS/coarse 直接跳过。0.5h
- P2-2 viewer 里常驻一个 1 s setInterval（viewer.html:1007），休眠的 3 分钟内仍每秒唤醒一次。开销小，但对电量没有好处。修法：sleep 时 clearInterval、wake 时重开，或者只在 open 到全部瓦片加载完之间运行。0.5h
- P2-3 .mk.here::after 的脉冲动画是 infinite，并带 will-change（viewer.html:276），面板打开期间合成层一直在工作。修法：reduced-motion 或省流档时停用，或者播放 N 次后停止。0.5h
- P2-4 超过 3 分钟后再打开是冷启动：要重新解析 148 KB srcdoc，WebKit 缓存未命中时还要重新下载 OSD 和事件脚本，再加首屏瓦片。频繁开关的用户会碰到。修法：html 字符串已缓存；可以按设备调整 SLEEP_MS。1h
### P3
- P3-1 云层 will-change 常驻（viewer.html:436-441），hide() 之后建议移除。
- P3-2 fetchHtml 用 Blob+TextDecoder 多复制一份（eden-map.js:278），148 KB 可以忽略。
- P3-3 maxImageCacheCount 30 × 512² 约 30 MB 解码位图（估算，未实测）。如果 WebContent 进程被杀，可降到 20。

## 3. 价值/成本 Top 5
1. 用真机 Web Inspector 实测：开关 10 次的 JS heap 和 WebContent 内存曲线，以及首帧时间。缺少实测数据是目前最大的短板。2h
2. 确认或强制 iOS 上不跑 slowWarmAlt（P2-1）。0.5h
3. 休眠时停掉 1 s 计时器和脉冲动画（P2-2/P2-3）。1h
4. 确认 viewer.html 在 CDN 上是 gzip 传输；把内联脚本拆出来以便缓存。2h
5. 低内存 iPhone 上把 maxImageCacheCount 降到 20（P3-3）。0.2h
