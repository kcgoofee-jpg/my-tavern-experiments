// Token block for the host page (docs/ui-refactor.md 2.4, S7-2 T1). The host page has no tokens.css (no extra request), so host-lifecycle.mjs injects this copy;
// tests/host_tokens.test.mjs compares every value with map/ui/tokens.css. `#@` stands for the panel root id; the block is scoped so it never leaks into the tavern page.
export const HOST_TOKENS_CSS = `
#@ { --focus: #63b4be; --alert: #ff5a5a; --on-alert: #1a0606; --ok: #7bd88f; --gold: #e6c36a;
  --sh-1: 0 1px 3px rgba(0, 0, 0, .25); --sh-2: 0 6px 20px rgba(0, 0, 0, .30); --sh-3: 0 12px 32px rgba(0, 0, 0, .38);
  --bg: #101418; --surface: #151b20; --surface-2: rgba(255, 255, 255, .06); --line: rgba(255, 255, 255, .12); --line-2: rgba(255, 255, 255, .22);
  --ink: #d5dde4; --ink-2: #b7c1ca; --muted: #8591a0; --accent: var(--gold); --on-accent: #1a1406;
  --r-glass: 14px; --glass-blur-1: 12px; --glass-line-a: 12%; --elev-float: var(--sh-1); --elev-panel: var(--sh-2); --elev-modal: var(--sh-3);
  --glass-1: color-mix(in srgb, var(--surface) 80%, transparent); --glass-2: var(--surface); --glass-line: color-mix(in srgb, var(--ink) var(--glass-line-a), transparent);
  --zh-bar: 3; --zh-pick: 2; --zh-tl: 4; --zh-yield: 10040; --zh-fab: 30000; --zh-panel: 30001; --zh-toast: 30002; --zh-top: 30003; }
#@.em-light { --focus: #2d6c75; --alert: #c0392b; --on-alert: #fff; --ok: #23733b;
  --sh-1: 0 1px 3px rgba(0, 0, 0, .12); --sh-2: 0 6px 20px rgba(0, 0, 0, .15); --sh-3: 0 12px 32px rgba(0, 0, 0, .19);
  --bg: #efeae0; --surface: #f8f5ee; --surface-2: rgba(20, 23, 26, .05); --line: rgba(20, 23, 26, .16); --line-2: rgba(20, 23, 26, .26);
  --ink: #1b1a17; --ink-2: #3b3934; --muted: #635e54; --accent: #7a5d22; --on-accent: #fff; --glass-line-a: 14%; }
/* the host's own names are aliases of the shared tokens */
#@ { --em-gold: var(--gold); --em-alert: var(--alert); --em-on-alert: var(--on-alert); --em-ok: var(--ok); --em-focus: var(--focus); --em-bg: var(--surface); --em-surface-2: var(--surface-2);
  --em-line: var(--line); --em-line-2: var(--line-2); --em-ink: var(--ink); --em-muted: var(--muted); --em-accent: var(--accent); --em-on-accent: var(--on-accent);
  --em-font: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif; }
`;
export const hostTokensCss = id => HOST_TOKENS_CSS.replaceAll('#@', '#' + id);
