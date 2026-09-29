# r1 — mobile player (375, iPhone WebKit) — score 6.5/10
Good: 44px rows/targets, switch toggles, tab counts, no backdrop-filter added (only drop-shadow filter on markers), pane scrolls at 34dvh.

- **P1 Layer rail overlaps people pane** — chars_iphone_pane.jpg: 伊甸庄园/上层/中层/下层 rail sits over the right edge of the list, on top of 莉娜/雷恩 switches. Fix: on ≤640px with #evbar pane open, hide or lift the rail / narrow the sheet. Accept: phone+iphone _pane shots show every switch unobstructed and tappable.
- **P1 On-layer people hidden with pane open** — chars_iphone_pane.jpg: 卡尔/莉娜 at 施粥站 (current layer) but no avatar marker visible; sheet covers ~45% of map. Fix: pan so on-layer people sit in visible area, or lower sheet cap on phones. Accept: on-layer markers visible with pane open.
- **P2** Add gap/divider between row (fly) button and switch.
- **P2** Avatar https URLs load an external image (user-supplied, no-referrer) — mention in help text.
