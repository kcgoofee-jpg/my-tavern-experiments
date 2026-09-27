# r1 — fresh persona: "Mei", first-time user of a friend's card, never read docs — score 6.5/10
- **P1 Empty state unexplained** — no ⌖人物 tags / MVU → "人物 0" with no reason. Fix: empty-pane hint ("需要世界书人物标签或 MVU 位置字段") pointing to docs/content-compat.md. Accept: 0-person pane shows hint.
- **P1 Marker legend** — round initial vs square event glyph is distinct, but dashed "approx" ring (zone-only position) is unexplained. Fix: add 人物 + 大致位置 to legend/help. Accept: legend lists both.
- **P2** "第 41 楼" reads like a building storey; say "41 楼（聊天）" or "#41".
- **P2** Estate map shows no people (render() returns on kind==='estate'); show a note instead of silence.
