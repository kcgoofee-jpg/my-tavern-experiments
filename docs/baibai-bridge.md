# BaiBai Image bridge (ST-BaiBai-Image)

The map can hand a room to [ST-BaiBai-Image](https://github.com/baibai-git/ST-BaiBai-Image)
("柏宝绘") and keep the result in the room's own gallery. The extension is an **optional
dependency**: if it is not installed, nothing on the map changes and no button appears.

## What we read

* `getCharacters({ floor })` — the appearance library the extension builds from the story.
  Passing a floor returns the snapshot **as of that message**, so a portrait can use the
  appearance the character had at that point in the timeline. The bridge normalises it to
  `{ revision, floor, list: [{ name, tag, nl, source, scope, fields }] }` and drops entries
  that have neither a name nor a tag; name-only entries are kept (they can be displayed but
  not generated with).
* `getBackendStatus()` — `backend`, `model`, `configured`, `supportsCharacters`, and the
  extension's own human-readable `reason` when it is not ready. We show that sentence as-is
  rather than inventing our own copy.
* `subscribe(listener)` — the character library changed (new chat, new entry, manual edit).
  Falls back to the `st-baibai-image:changed` DOM event when `subscribe` is missing.

## What we do

1. The room card gets an extra button when the extension is present.
2. The panel assembles the prompt from **your** inputs: an artist string (kept first, as the
   extension's own docs recommend), scene tags, and the tags of up to two characters picked
   from its library. `composePrompt` only trims, orders and de-duplicates — it never invents
   content.
3. Generation goes through `generate()` with `onProgress` wired to the panel (queued /
   generating / queued-remote / retrying / saving) and an `AbortController` for cancel.
4. The result is shown, and can be saved into **our** gallery. Saving re-encodes to webp
   (≤1600 px, same path as an upload), writes it into the room's IndexedDB scope, and records
   `seed` plus the exact prompt as the image's note, so a shot can be reproduced later.

Multi-character prompts follow the extension's own rule: they are only used when the current
backend supports them (`supportsCharacters`), and we deliberately do **not** degrade by
splicing character tags into `prompt` — their docs point out that produces overlapping bodies.
When the backend cannot do it, only the first selected character's tag is used.

## What we deliberately do not do

* **Never call NovelAI directly.** The extension wraps its requests in a concurrency gate
  (429 cooldown, minimum spacing, exponential backoff). Bypassing it would spend *the user's*
  rate limit and look like the extension broke.
* **Never touch its credentials.** The public API does not return the endpoint or API key.
* **Never write into the chat.** Images the extension makes do not enter the message stream,
  and ours do not either; keeping one means putting it into our own gallery, not into
  `message.extra`.
* The bridge only speaks `apiVersion === 1`. On any other value `generate()` is refused
  outright instead of guessing at a changed payload.
* Errors are branched on `error.code` (`aborted`, `not_configured`, `invalid_args`,
  `rate_limited`, `backend_error`), never on message text, because that text is free to change.

## Where it lives

| Piece | File |
|---|---|
| Bridge (no DOM, testable) | `map/tavern/baibai.mjs` |
| Panel (DOM only) | `map/ui/illust-panel.js` |
| Entry on the room card | `map/ui/room-gallery-panel.js` (button appears only when the extension is present) |
| Tests | `tests/baibai.test.mjs` (stubbed global, 16 cases) |

## The iframe detail

The map viewer and the estate page are iframes inside the tavern page, but the extension is
installed in the tavern page — its `globalThis.STBaiBaiImage` lives on the parent window. The
bridge therefore looks up **own window → parent → top**, ignoring cross-origin errors. In an
iframe it also listens for the ready event on the parent. Cross-origin frames simply see
nothing, which degrades to "not installed".

## Known limits

* There is no public API to list what the extension already generated, so the map can only
  reference images **we** generated (or that you uploaded into our gallery). Images made for
  the chat itself do not come back to the map.
* A room's illustration is stored per scope like any other gallery image (this chat only, or
  shared across chats) and stays on this device.
* Saving is best-effort: if the quota is full the panel says so and offers nothing else —
  it never silently drops an image.
