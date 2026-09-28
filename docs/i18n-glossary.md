# English glossary (2088, magitech)

Audit note: the existing translation in `map/data/maps.json`, `map/i18n/en.json` and
`map/props/*/manifest.json` was already essentially complete and consistent when this
pass started (`python3 tools/check_maps.py` was clean before and after). This glossary
records the rule so future additions stay consistent, and documents the small number of
touch-ups made in this pass.

## Register

2088, technology and magic coexist. Upper-tier Oren material (Eden Manor, Silvercrown Keep,
the Council) reads with a light aristocratic/Victorian formality — "HQ", "convent",
"demesne", capitalised titles. Lower-tier Tiancheng and street-level factions (Well 7,
the Bloodmill) read plainer and harder — no archaism, short nouns, functional names, same
register an English tabloid would use for a slum market.

## Proper names — rule

- **Invented place names with no real-world referent** (天城, 奥伦, etc.) are transliterated
  (Tiancheng, Oren) and never glossed as "Sky City" etc. in running text — a transliteration
  reads as a foreign capital's real name, which fits a 2088 secondary-world empire better than
  a translated nickname.
- **Descriptive names** (庄园/塔/局/教会 compounds) are translated by sense, English word
  order, not calqued: 天城执法局总局 → "Enforcement Bureau HQ", not "Tiancheng Law
  Enforcement Bureau General Bureau".
- **Ambiguous or contested names** are flagged in `docs/i18n-names.md` for the user (already
  present there: Tiancheng vs. Sky City, Bloodmill vs. Meat Grinder, etc.) — this pass did not
  relitigate those; the user's call stands until they say otherwise.
- **Card-canon character/item names** are never altered, regardless of register.

## Core terms

| Chinese | English | Notes |
|---|---|---|
| 以太 | Aether | Capitalised as a substance name throughout (Aether credits, Aether Climate Tower, Aether tide). Chosen over "ether" for period flavour and to avoid confusion with the historical luminiferous-ether sense. |
| 结界 | Ward(s) | "Barrier" was the listed alternative in i18n-names.md; kept "Ward" — it is the established fantasy-genre term for a magical protective boundary and reads correctly as plural UI copy ("Wards" toggle). |
| 以太元 (Æ) | Aether credits / Aether Yuan | "Aether credits" in UI/economy strings (generic), "Aether Yuan" only in the one context that names the currency's official denomination (Central Reserve Office). Kept both — they are different registers of the same referent, not an inconsistency. |
| 灰票 | Grey scrip | Established in i18n-names.md; kept over "grey tickets"/"ash notes" — "scrip" correctly implies informal/black-market paper currency. |
| 防卫军 | Defense Force | Consistent across maps.json and all manifests. |
| 执法局 | Enforcement Bureau | Consistent; branch offices as "…, Lower Branch" / "…HQ". |
| 圣光教会 | Church of Holy Light | Full form in subtitles; "Holy Light" alone in compounds (Holy Light Soup Kitchen). |
| 战斗修女 | Battle-sister(s) | Convent = 修道院. |
| 骑士团 | Knights / Knighthood | "Council Knights" for 议会骑士团. |
| 资产管理委员会 | Asset Management Committee | Institution name, kept in full on first mention per place, "AMC" not used (no abbreviation in source). |
| 魔导 (as in 魔导装甲/魔导军工) | Mage- / Magitech- | "Mage-armor" for battlefield matériel (魔导装甲), "Magitech Arms R&D Centre" for the institution — matches existing usage in en.json/maps.json. |
| 灾害/治安/空防/气候/政治/媒体/民生/军事 (event categories) | Disaster / Public order / Air defense / Climate / Politics / Media / Civic life / Military | Already in map/i18n/en.json `names`; kept as-is. |
| 天城 · 上层/中层/下层 | Upper/Middle/Lower Tier | "Tier" not "Level" or "Floor" — reserved for vertical social strata, distinct from building floors (F1/F2, "floor plan"). |

## UI conventions

- Sentence case for buttons and labels ("View 3D model", not "View 3D Model").
- Placeholders `{n}`, `{name}`, `{title}` etc. kept verbatim — never translated or reordered
  relative to the Chinese source's argument order unless English grammar requires it.
- Card lore quotes stay in Chinese; the English UI prefixes them with the existing
  `src_note` string ("Original lore text (Chinese):") rather than translating the quote.

## Scope note: fields with no English slot

`map/data/addon_places.json` and `map/data/eden_estate_rooms.json` carry no `_en` fields and
their schemas (`map/data/schema/addon_places.schema.json`; no schema file exists for
eden_estate_rooms) do not define one. Per the task's instruction not to invent schema
fields, no `_en` keys were added to either file in this pass. If the user wants an English
surface for the worldbook add-on or estate room names, that needs a schema/consumer change
first (out of scope here) — flagged for the user, not implemented.
