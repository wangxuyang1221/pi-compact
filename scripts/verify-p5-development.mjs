import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tui, root, waitFor, provenance } from './fixture/runtime.mjs';
const dir = join(root, 'artifacts/P5-development/runs', String(Date.now()));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'runner.json'), JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
const options = { variant: 'baseline', observer: false, extensions: [join(root, 'scripts/p5/observer.ts'), join(root, 'src/index.ts')], seed: 800, captureReady: false };
const count = (t, name) => t.log().filter(e => e.event === name).length;
const screen = t => t.tmux('capture-pane', '-p', '-t', 'fixture');
const screenshots = [];
async function resize(t, cols) {
  t.tmux('resize-window', '-t', 'fixture', '-x', String(cols), '-y', '40');
  await waitFor(() => screen(t).split('\n').some(line => /^─+$/.test(line) && line.length === cols), `terminal redraw at ${cols}`);
}
async function capture(t, name, theme = 'dark') {
  const cols = Number(t.tmux('display-message', '-p', '-t', 'fixture', '#{pane_width}').trim());
  const rows = Number(t.tmux('display-message', '-p', '-t', 'fixture', '#{pane_height}').trim());
  const record = { at: Date.now(), cols, rows, theme, ansi: t.tmux('capture-pane', '-e', '-p', '-t', 'fixture') };
  const path = join(t.dir, name + '.json');
  writeFileSync(path, JSON.stringify(record));
  writeFileSync(join(t.dir, name + '.txt'), screen(t));
  screenshots.push({ path, png: join(t.dir, name + '.png') });
  return screen(t);
}
const results = [];
const cases = {
  async baseline() {
    const t = await tui(join(dir, 'baseline'), { ...options, extensions: [join(root, 'scripts/p5/observer.ts')] });
    try {
      await resize(t, 90);
      await t.text('/compact');
      await waitFor(() => count(t, 'compaction_end'), 'baseline success');
      await waitFor(() => screen(t).includes('Compacted from'), 'native card');
      assert((await capture(t, 'native')).includes('[compaction]'));
      assert.equal(count(t, 'native-request'), 1);
    } finally { await t.stop(); }
  },
  async manual() {
    const t = await tui(join(dir, 'manual'), options);
    try {
      await resize(t, 90);
      await t.text('/compact KEEP_CUSTOM_MARKER');
      await waitFor(() => screen(t).includes('Context compacted'), 'divider frame');
      assert.equal(screen(t).split('Context compacted').length - 1, 1);
      assert(!screen(t).includes('[compaction]'));
      await capture(t, 'dark-90');
      const before = readFileSync(join(t.dir, 'session.jsonl'));
      t.key('C-o');
      await waitFor(() => screen(t).includes('Synthetic native summary.'), 'Ctrl+O true summary');
      await capture(t, 'expanded-90');
      t.key('C-o');
      await waitFor(() => screen(t).includes('Context compacted'), 'Ctrl+O collapsed');
      assert(readFileSync(join(t.dir, 'session.jsonl')).equals(before), 'expansion does not change history');
      assert.equal(count(t, 'native-request'), 1);
      assert.equal(count(t, 'normal-request'), 0);
      for (const cols of [120, 40, 20]) {
        await resize(t, cols);
        await waitFor(() => screen(t).includes('Context compacted'), `resize ${cols}`);
        await capture(t, 'resize-' + cols);
      }
      await resize(t, 90);
      await t.text('/p5-theme light');
      await waitFor(() => count(t, 'p5-theme'), 'light theme applied');
      await capture(t, 'light-90', 'light');
      await t.text('/p5-peer');
      await waitFor(() => screen(t).includes('PEER RENDERER'), 'peer renderer');
      await capture(t, 'coexist', 'light');
      for (let i = 0; i < 2; i++) {
        const ready = count(t, 'ready');
        await t.text('/reload');
        await waitFor(() => count(t, 'ready') > ready, 'actual reload');
        await waitFor(() => screen(t).includes('Context compacted'), 'divider after reload');
        assert.equal(screen(t).split('Context compacted').length - 1, 1);
      }
      await capture(t, 'reload-twice', 'light');
      await t.text('/p5-disable');
      await waitFor(() => t.log().some(e => e.event === 'ready' && e.extensions.every(p => !p.endsWith('/src/index.ts'))), 'product absent from reloaded extensions');
      await waitFor(() => screen(t).includes('Compacted from'), 'native after disable');
      assert(!screen(t).includes('Context compacted'));
      await t.text('/p5-peer');
      await waitFor(() => screen(t).includes('PEER RENDERER'), 'peer after disable');
      await capture(t, 'disabled', 'light');
      assert.equal(count(t, 'native-request'), 1);
      assert.equal(count(t, 'normal-request'), 0);
    } finally { await t.stop(); }
  },
  async automatic() {
    const t = await tui(join(dir, 'automatic'), options);
    try {
      await t.text('CURRENT_INPUT_MARKER ' + 'x'.repeat(35200));
      await waitFor(() => count(t, 'agent_settled'), 'automatic continued');
      await waitFor(() => screen(t).includes('Context compacted'), 'automatic divider');
      assert.equal(count(t, 'native-request'), 1);
      assert.equal(count(t, 'normal-request'), 1);
      assert.equal(screen(t).split('Context compacted').length - 1, 1);
      await capture(t, 'automatic');
    } finally { await t.stop(); }
  },
  async failure() {
    for (const mode of ['failure', 'delay']) {
      const t = await tui(join(dir, mode), { ...options, mode });
      try {
        await t.text('/compact');
        await waitFor(() => count(t, 'native-request'), 'summary request');
        if (mode === 'delay') t.key('Escape');
        await waitFor(() => count(t, 'compaction_end'), mode + ' settled');
        await waitFor(() => !screen(t).includes('Compacting context'), 'failure cleanup');
        assert(!screen(t).includes('Context compacted'));
        assert.equal(t.log().filter(e => e.event === 'compaction_end' && e.success).length, 0);
        assert.equal(count(t, 'normal-request'), 0);
        assert.equal(readFileSync(join(t.dir, 'session.jsonl'), 'utf8').split('"type":"compaction"').length - 1, 0);
        await capture(t, mode);
      } finally { t.control({ mode: 'success' }); await t.stop(); }
    }
  },
};
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cases)) {
  try { await cases[name](); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: String(error), stack: error.stack }); }
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ provenance, results, screenshots }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
for (const { path, png } of screenshots) execFileSync('conda', ['run', '--no-capture-output', '-n', 'codex-py312', 'python', join(root, 'scripts/p5/render-capture.py'), path, png]);
console.log(dir);
assert(results.every(r => r.pass), 'P5 development scenarios');
