# Worldbook add-on layout (WB-2)

Status: layout decided and shipped 2026-10-02 (D45); re-verified against a real Mac TT request on 2026-10-03 (§2b). Chinese edition:
`worldbook-layout.zh.md` (plain words, the user's reading copy).
Still not measured: a controlled tag-rate A/B on real models (section 6; the live numbers we do have are in section 5b).

## 1. Why this exists

The add-on book was written for content first; position, depth, role and order were never checked against the card's own book, the
global world-info settings or the prompt cache. This note records the real prompt order, the decision per entry group, the
measurements and what a pack author should do.

## 2. The real prompt order (one Eden turn)

Captured from SillyTavern's own assembly (test ST, port 8010, the card, its book, the user's subscription preset, the add-on, global
world info as in Mac TT: scan depth 2, budget 100 %, recursive on, character strategy 1). Message numbers are from one 62-message request.

| Where | What lands there |
|---|---|
| messages 0-17 | preset blocks |
| 18 / 21 | the preset's `<Lore>` wrapper opens / closes |
| 19 | world info "before": the card's constant + keyword entries, ascending by order. The old layout put our keyword entries last in this message (orders 420-572 sorted after the card's) |
| 20 | world info "after": the card's two entries (orders 306, 308), then ours (901, 902) |
| history | chat messages; the card's depth-4 system entry (order 100) sits six messages before the end |
| depth 2 (system) | the preset's own style block, then our rules in the old layout (order 900) |
| depth 0 (user) | the card's variable rules + variable list (order 200), then our rules in the shipped layout (order 900) — the last message of the request |

How SillyTavern orders: entries are sorted by order, descending, then inserted so that the final text is ascending (lower order first, higher order
nearest the chat). At-depth entries with the same depth and role merge into one message; system messages come last at a depth, so at depth 0 the
card's user block is followed by any system block. Depth counts messages from the end (0 after the latest message, 1 before it).

## 2b. The same order in the user's own Mac TT (2026-10-03)

The table above comes from a test SillyTavern. The player's Mac TT behaves the same way; this is one of its own requests, read from the request log
(`llm-api-551.request.json`, 152 messages, model 假流式-gemini-3.8-flash, Eden card with its own book, the add-on as an extra character book, the
player's preset). Reproduce with `python3 tools/wb_prompt_order.py <request.json> <book.json> <book.json>` (add `--all` when the book's switches have
been changed since the capture, as the on-demand mounting had):

| Where | What lands there |
|---|---|
| message 5 of 152 (user, 59 265 characters) | the card's "before" entries (orders 100-400) and "after" entries (306-309), then our two constants (901 event types, 902 place vocabulary) - one block, in ascending order |
| message 147 | the card's depth-4 output format (order 100, 1700 characters) |
| message 151, the last one | the keyword entries that were on, in ascending order: 937, 938, 1018 - then the card's depth-0 variable rules (200, user, 4157 characters) - then our rules (900, user, 762 characters), last in the request |

Two things worth knowing from this: our rules really are the last thing the model reads, right after the card's own end-of-reply rules, and Mac TT
delivers the depth-1 and depth-0 blocks as one final user message (keyword entries first, then the depth-0 entries by order). That is why the trigger set
can change every turn without moving the rules: both live after the whole history.

## 3. What the cache needs (CCST, read only)

- Claude's cache is a prefix match with one message-level cache point at the end. Anything that changes early in the request rewrites the rest.
- CCST (default placement "inline"): system messages before the first player message form the cached system prompt; later system messages become user
  text merged into the player's turn; depth injections deeper than the last reply are moved next to the current turn.
- CCST `lore_tail` learns which tagged block keeps changing (here the preset's `<Lore>`) and moves it into the newest message. It works only after the
  first change, only for a block under 60 % of the prompt, and only with a wrapper tag. `fold_tail` is moot under inline placement.
- A keyword entry in the static region (before / after the character) therefore costs a whole-history rewrite whenever the trigger set changes, unless
  that learning happens to cover it. A keyword entry one message above the latest only changes the end of the request.

## 4. Decision per entry group (D45)

| Group | Light | Position | Depth / role | Order | Why |
|---|---|---|---|---|---|
| readme | off (disabled) | before character (never injected) | - | 1 | explains the installed book; costs no tokens |
| rules (`map.link-rules`) | constant (blue) | at depth | 0, user | 900 | right after the card's own end-of-reply rules (its depth-0 user block, order 200), so the model reads both as one format block. Only 1 of 17 floors of recent Eden chats carried a tag while our rules sat in a depth-2 system block above the card's depth-0 rules |
| event types, place vocabulary | constant (blue) | after character | - | 901, 902 | static text: identical every turn, so it stays in the cached system prompt and costs about a tenth of its size per turn |
| keyword entries (129: bearings, city / estate lore, places, rooms) | keyword (green) | at depth | 1, system | bearings 910-929, lore 930-949, places 950-999, rooms 1000-1099 | a changing trigger set only changes the end of the request; no dependence on proxy learning or on a wrapper tag; the lore sits next to the player's line it answers |
| chat custom book: index | constant | after character | - | 903 | static |
| chat custom book: places | keyword | at depth | 1, system | 1200+ | same as the add-on's keyword entries |

All our orders are 900 and up (the readme excepted), so they never interleave with the card's 100-500. The bands have gaps so a new entry
family can be inserted without renumbering existing installs (order changes propagate to installed books on the next sync).
Role stays system for keyword entries: a user role at depth 1 broke the cache in the test (section 5, BU row).
Scan depth stays the global value (2): a per-entry override would keep entries on longer and add tokens without a measured gain.
Recursion: our entries prevent recursion both ways, so they neither trigger nor are triggered by the card's entries. Budget: global (100 %).
JIT: toggling entries changes the prompt (the setting's help text says so); the default stays off. Sync keeps its entries on whatever the JIT left behind.

## 5. Measurements

Method: the CCST proxy in dry-run mode (it prepares the request and stores it, no model call), fed with 12 real ST requests per layout from a copy of a
real Eden chat (19 messages) plus 12 scripted turns that change place every turn (worst case). Cache read is the part of the request identical to the
previous request (system prompt, then history; one cache point at the end). Units are characters (about one token each for this text); "eq" weights
read x 0.1 and write x 1.25. Eleven comparisons (turns 2 to 12). N = the card alone, without the add-on.

| Setting | Layout | Hit rate | Written per turn | Equivalent per turn |
|---|---|---|---|---|
| inline, lore_tail on (the user's setting) | N | 93 % | 10.3k | 27.1k |
| | A (before WB-2) | 93 % | 10.4k | 27.9k |
| | B (shipped) | 93 % | 10.3k | 27.7k |
| inline, lore_tail off | N | 26 % | 75.7k | 97.2k |
| | A | 0 % | 104.0k | 130.0k |
| | B | 27 % | 76.2k | 98.0k |
| hoist, lore_tail on (legacy setting) | N | 94 % | 7.0k | 19.3k |
| | A | 94 % | 7.1k | 19.8k |
| | B | 77 % | 26.5k | 42.0k |
| inline, lore_tail on | BU (keyword entries as user role) | 19 % | 67.2k | 85.7k |

Reading: with the user's CCST the layouts are equal (the proxy moves the preset's `<Lore>` block). Without that (no learning yet, another proxy, a preset
without a wrapper, tail off) layout A rewrites everything on every trigger change, layout B costs the same as having no add-on. Under the legacy
"hoist" placement B loses because system messages are hoisted into the system prompt: not the user's setting, accepted. Moving only the rules to depth 0
changes nothing in the cache (K1, rules at depth 2, measured the same as B). Limits: one chat, one preset, one scripted route, dry-run (no turn capture),
`use_resume` on; with `use_resume` off CCST folds the whole history into one string and nothing caches regardless of layout.

## 5b. Tag rate in live traffic (not an A/B)

Counted from the player's own Eden chat on 2026-10-03 (one chat, one model, one swipe per floor, counts only, no chat text read out): the map rewrote the
add-on at 01:08 with the shipped layout, so the replies after that floor ran on layout B.

| Window | Replies | With a map tag |
|---|---|---|
| the whole chat before the rewrite | 73 | 6 |
| the 7 replies right before it | 7 | 5 (two tags each) |
| the 11 replies after it (layout B) | 11 | 9 (two to five tags each) |

Read it as "no regression", not as a win: the add-on was missing from the book between 19:26 on 2026-10-02 and the rewrite, so the earlier rows mix a
missing book and the old depth-2 rules, and the player did not ask for tags in either window (no `（OOC…）` reminder, nothing pasted). Layout B did not
stop the model writing tags; whether it writes more of them is what section 6 has to settle.

## 6. Not measured

Tag rate of layout B against A on real models (profile gg in Mac TT) still has not been run as a controlled A/B: the player's Mac TT was in use
(the app had been open for minutes and a chat was growing), and driving their live roleplay chat is not acceptable. What we have instead is section 5b.
To run the A/B: import the two books under other names, bind one at a time as a global book in a new Eden chat, send the two WB-1 seed turns and 3
swipes each, count `⌖` lines in the saved chat file. On the same machine the layout itself can be checked without any model call, on any request the
player already sent: `python3 tools/wb_prompt_order.py <request log>/llm-api-NNN.request.json <book.json> <book.json> --all`.

## 7. What a pack author should do

1. Constants that must be there every turn and never change: after the character definition, order 900+. Keep them short.
2. The one rule block the model must obey at the end of its reply: at depth 0 with the same role as the card's own end-of-reply rules, order above them.
3. Everything triggered by words: at depth 1, system role. Never before or after the character definition (it shifts the cached prefix). Give each
   entry family its own order band with a gap (the add-on uses 910 / 930 / 950 / 1000, the custom book 1200).
4. Orders 900 and up for the add-on; the card keeps 100-500. Do not move another book's entries.
5. Put one disabled readme entry first in every generated book (version, write time, writer, counts, how to report a bug). The map script rewrites it on each write.
6. Every shipped entry carries `position`; sync follows a layout change on existing installs unless the player moved the entry by hand.

## 8. Installed books: do they need deleting?

No. The map updates the book in place by entry id on every open. An install from before WB-1 keeps its entries: old ids map to new ones through the alias
table, the old "map character location" entry is dropped as an unedited duplicate (kept, lowered, if edited), entries are re-enabled except the ones the JIT
switched off while it is on, and from WB-2 on their positions follow the shipped layout. A renamed old book (the manual import with a version in its name) is
migrated to the stable name and its bindings, and left in place. Duplicates cannot appear: entries are matched by id, not by name.

Checked on the player's Mac TT on 2026-10-03: the book was gone from the world folder twice on the evening of 2026-10-02, and the map recreated it by
itself at 01:08 on 2026-10-03 (its readme entry carries that write time) and re-attached it to the Eden card as an extra character book. No deletion
tombstone was set, so nothing in the map had blocked the recreation, and nothing in the map deletes this book except the "unbind" button in the settings
page (which also sets a tombstone, and would have kept it away). The rest of the map only deletes per-chat books whose name ends in six hex digits and
that carry the map's own entry name, which this book does not. A book deleted outside the map therefore comes back on the next map open; no trace of the
deletion survives in the TavernHelper log.
