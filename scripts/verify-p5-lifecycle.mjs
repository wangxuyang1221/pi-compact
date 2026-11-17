import './fixture/relative-socket.mjs';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tui, cli, root, waitFor, provenance } from './fixture/runtime.mjs';
const dir = join(root, 'artifacts/P5/lifecycle', String(Date.now()));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'runner.json'), JSON.stringify({ pid: process.pid, provenance }));
const observer = join(root, 'scripts/p5/observer.ts');
const product = join(root, 'src/index.ts');
const review = join(root, 'scripts/p5/lifecycle-observer.ts');
const results = [];
const capture = (t, name) => {
  const screen = t.tmux('capture-pane', '-p', '-t', 'fixture');
  const file = join(t.dir, name + '.json');
  writeFileSync(join(t.dir, name + '.txt'), screen);
  writeFileSync(file, JSON.stringify({ cols: 120, rows: 40, theme: 'dark', ansi: t.tmux('capture-pane', '-e', '-p', '-t', 'fixture') }));
  execFileSync('conda', ['run', '--no-capture-output', '-n', 'codex-py312', 'python', join(root, 'scripts/p5/render-capture.py'), file, join(t.dir, name + '.png')]);
  return screen;
};
const options = { variant: 'baseline', observer: false, seed: 800, captureReady: false, extraEnv: { REVIEW_PRODUCT: product } };
const count = (t, e) => t.log().filter(x => x.event === e).length;
async function command(t, text, event) { const n = count(t, event); await t.text(text); await waitFor(() => count(t, event) > n, text); }
for (const scenario of process.argv.slice(2).length ? process.argv.slice(2) : ['symlink', 'lifecycle', 'scope', 'final-dispose']) {
  try {
    if (scenario === 'symlink') {
      const alias = join(dir, 'alias'); mkdirSync(alias); symlinkSync(join(root, 'src'), join(alias, 'src'), 'dir');
      const t = await tui(join(dir, scenario), { ...options, extensions: [observer, join(alias, 'src/index.ts')] });
      try {
        await command(t, '/compact', 'compaction_end');
        await waitFor(() => /Context compacted|Compacted from/.test(t.tmux('capture-pane', '-p', '-t', 'fixture')), 'completion display');
        const screen = capture(t, 'actual');
        const result = { scenario, ready: t.log().find(e => e.event === 'ready'), divider: screen.includes('Context compacted'), native: screen.includes('Compacted from'), warning: readFileSync(join(t.dir, 'raw.ansi'), 'utf8').includes('visual downgrade'), nativeRequests: count(t, 'native-request') };
        assert.equal(result.nativeRequests, 1); assert(result.ready.managed); assert(result.divider); assert(!result.native); results.push(result);
      } finally { await t.stop(); }
    }
    if (scenario === 'lifecycle') {
      const t = await tui(join(dir, scenario), { ...options, extensions: [observer, review, product] });
      try {
        await command(t, '/compact', 'compaction_end');
        await waitFor(() => t.tmux('capture-pane', '-p', '-t', 'fixture').includes('Context compacted'), 'divider');
        await command(t, '/review-multi', 'review-multi-done');
        await command(t, '/p5-disable', 'ready');
        await command(t, '/review-state', 'review-state');
        await command(t, '/review-enable', 'ready');
        await waitFor(() => t.tmux('capture-pane', '-p', '-t', 'fixture').includes('Context compacted'), 're-enabled divider');
        capture(t, 'reenabled');
        await command(t, '/review-chain', 'review-chain');
        await command(t, '/p5-disable', 'ready');
        await command(t, '/review-state', 'review-state');
        await command(t, '/review-enable', 'ready');
        await command(t, '/review-state', 'review-state');
        capture(t, 'chained-reenabled');
        await command(t, '/p5-disable', 'ready');
        await command(t, '/review-state', 'review-state');
        const events = t.log().filter(e => e.event.startsWith('review-'));
        const before = events.find(e => e.event === 'review-multi-before');
        assert(before.a && before.b && !before.unmanaged);
        const afterA = events.find(e => e.event === 'review-multi-after-a');
        assert(!afterA.a && afterA.b && afterA.aReleased && afterA.bActive && afterA.aLockReleased);
        const afterB = events.find(e => e.event === 'review-multi-after-b');
        assert(!afterB.b && afterB.bReleased && afterB.bLockReleased);
        assert.deepEqual(afterB.before, afterB.after); assert(afterB.error.includes('Session is disposed'));
        const states = events.filter(e => e.event === 'review-state');
        assert.deepEqual(states.map(e => e.currentDividers), [0, 0, 1, 0]);
        assert.deepEqual(states.map(e => e.peerPrototype), [false, true, false, true]);
        assert(states.at(-1).peerCalls > states[1].peerCalls);
        for (const state of states.slice(1)) {
          assert(state.retained.every(c => !c.enabled && c.peer && c.marker));
        }
        results.push({ scenario, events, nativeRequests: count(t, 'native-request'), normalRequests: count(t, 'normal-request') });
      } finally { await t.stop(); }
    }
    if (scenario === 'scope') {
      for (const variant of ['baseline', 'head']) {
        const result = await cli(join(dir, scenario, variant), { variant, observer: false, extensions: [join(root, 'scripts/regressions/scope.ts')] });
        const checks = result.events.filter(e => e.event === 'scope-result');
        assert.equal(result.code, 0); assert.equal(checks.length, 8); assert(checks.every(e => e.ok));
        results.push({ scenario, variant, pass: true, checks, requests: result.events.filter(e => e.event === 'normal-request').length });
      }
    }
    if (scenario === 'final-dispose') {
      const t = await tui(join(dir, scenario), { ...options, extensions: [observer, review, product] });
      try {
        await command(t, '/compact', 'compaction_end');
        await waitFor(() => t.tmux('capture-pane', '-p', '-t', 'fixture').includes('Context compacted'), 'divider');
        await command(t, '/review-chain', 'review-chain');
        await command(t, '/p5-disable', 'ready');
        await command(t, '/review-enable', 'ready');
        await command(t, '/review-final-dispose', 'review-final-dispose');
        const result = t.log().find(e => e.event === 'review-final-dispose');
        for (const k of ['uiRegistryReleased', 'safetyRegistryReleased', 'addRestoredToPeer', 'disposeRestored', 'dividerGone', 'lockReleased']) assert(result[k], k);
        assert.deepEqual(result.before, result.after); assert(result.error.includes('Session is disposed'));
        assert.equal(count(t, 'normal-request'), 0);
        results.push({ scenario, result, nativeRequests: count(t, 'native-request'), normalRequests: count(t, 'normal-request') });
      } finally { await t.stop(); }
    }
  } catch (e) { results.push({ scenario, error: String(e), stack: e.stack }); }
  writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
}
console.log(dir);
assert(results.every(r => !r.error), 'probe infrastructure completed');
