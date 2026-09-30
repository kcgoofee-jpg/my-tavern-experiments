// node --import this-file <test.mjs>: while a v1 test file runs in a child process, every import of map/here.mjs is answered by
// here_recorder.mjs, which re-exports the real module and records each buildIndex / resolveHere call.
import { registerHooks } from 'node:module';
const RECORDER = new URL('./here_recorder.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    const r = next(specifier, context);
    return /\/map\/here\.mjs$/.test(r.url) ? { ...r, url: RECORDER, shortCircuit: true } : r;
  },
});
