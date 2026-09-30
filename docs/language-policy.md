# Language policy

Decided 2026-09-29. This repo goes English from here on, **incrementally** — no big-bang
translation of what already exists.

## The rule

1. **New documents are written in English.** A Chinese edition of a new doc is welcome as
   a separate `*.zh.md` file; the English one is canonical.
2. **New prose added to an existing document is English.** Adding a fresh section to a
   Chinese doc in English is intentional: the Chinese body stays as the historical
   record, the new material enters in English.
3. **Existing documents are grandfathered.** They are not translated wholesale, not
   renamed, and not restructured for language reasons. A half-translated repo is worse
   than a mixed one, because nobody can tell which half is authoritative.

## Why incremental and not a sweep

* The Chinese docs are load-bearing: `docs/agent-brief.md`, `docs/handoff.md` and the
  setting docs are read by agents and by the card author on every session. Rewriting them
  wholesale would invalidate every quoted line in `docs/reviews/`, the historical task
  briefs, and the issue history.
* Machine identifiers already had to be ASCII (see `tools/check_ascii.py`); that audit is
  about paths, JSON keys and `id` fields, not about prose. This policy is about prose.

## Exception: tool-generated templates

`tools/landmark.py new` writes `docs/landmarks/<id>.md` and `<id>.checklist.md` from Chinese
templates, and `tools/landmark.py gapcheck` compares the two side by side. Those scaffolds stay in
the template language: translating them by hand would break the tool's own round-trip and the
reviewer's diff. The gate only looks at files that are new since the baseline tag, so an untranslated
scaffold will be flagged — add it to `ALLOW` with this reason rather than rewriting the template.

## How it is enforced

`tools/check_doc_language.py`, wired into `tools/smoke.sh`:

* A document does not exist at the latest `map-v*` release tag → it is **new**.
* A new `.md` whose CJK character ratio is **5% or more** fails the gate.
* Exempt, on purpose: `*.zh.md` (Chinese edition), `docs/archive/**` and `docs/history/**`
  (verbatim archives), plus an explicit `ALLOW` list in the script, each entry carrying
  its reason.

Existing docs are grandfathered by construction — the baseline is a release tag, so the
gate can never retroactively fail a document that already shipped.

## Exception: index and quote-heavy documents

`docs/todo.md` is the living tracker: English only, no `*.zh.md` edition (it changes with every prompt, so a
mirror would always lag). Its migration table quotes the archived items it replaced, verbatim and in Chinese,
so a reader can trace each one back and the wording cannot drift. Its own prose is English, but the quotes
push the file over the CJK threshold — it is listed in `ALLOW` with that reason. The same applies to any
future index built the same way: quote the source, explain in English, allow the file.

Agent prompts kept in the repo (`docs/plans/render-loop.md`) are English only as well: they are read by agents,
and the operator's Chinese notes live in the chat.

## What this means in practice

* **Documents** are what the gate checks. New `docs/**/*.md` in English.
* **Code comments and tool output follow the file's existing language.** A Chinese file
  stays Chinese; a brand-new tool may be written in English or Chinese, but pick one and
  do not mix inside a file. This is deliberately *not* gated: the repo's tooling speaks
  Chinese and flipping that mid-file would read worse than it gains.
* **New UI strings** still need both `zh.json` and `en.json` (the i18n parity test enforces
  that). Author them in English first, then translate — the English string is the source.
* **Commit messages**: English as well (user decision 2026-09-29; the earlier "Chinese, as before"
  line is superseded). No `Co-Authored-By` trailer. Not gated — the history predates this rule and is
  not rewritten.
* Setting docs that quote the original card verbatim keep the quoted Chinese (the card is
  the source of truth); the surrounding explanation is English.
