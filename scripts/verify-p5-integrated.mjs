import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, tui, waitFor, provenance } from './fixture/runtime.mjs';
import { options as p4, count, entries } from './p4/common.mjs';
const dir = join(root, 'artifacts/P5/integrated', String(Date.now()));
mkdirSync(dir, { recursive: true });
const options = { ...p4, variant: 'baseline', captureReady: false, extensions: [join(root, 'scripts/p5/observer.ts'), ...p4.extensions, process.env.P5_ENTRY ?? join(root, 'src/index.ts')] };
const screen = t => t.tmux('capture-pane', '-p', '-t', 'fixture');
const results = [];
const command = async (t, text, event) => { const n = count(t, event); await t.text(text); await waitFor(() => count(t, event) > n, text); };
const capture = (t, name) => {
  const path = join(t.dir, name + '.json');
  writeFileSync(path, JSON.stringify({ cols: 90, rows: 40, theme: 'dark', ansi: t.tmux('capture-pane', '-e', '-p', '-t', 'fixture') }));
  writeFileSync(join(t.dir, name + '.txt'), screen(t));
  execFileSync('conda', ['run', '--no-capture-output', '-n', 'codex-py312', 'python', join(root, 'scripts/p5/render-capture.py'), path, join(t.dir, name + '.png')]);
};
async function expanded(t, expected, sessionFile = join(t.dir, 'session.jsonl')) {
  const before = readFileSync(sessionFile);
  const requests = t.log().filter(e => e.event === 'actual-request').length;
  t.key('C-o');
  await waitFor(() => screen(t).includes(expected), 'real checkpoint details');
  const text = screen(t);
  assert(!text.includes('SYNTHETIC_OPAQUE'));
  assert(!text.includes('encrypted_content'));
  assert(!text.includes('synthetic-account'));
  assert(!text.includes('Codex remote checkpoint.'));
  capture(t, 'expanded');
  t.key('C-o');
  await waitFor(() => screen(t).includes('Context compacted'), 'collapse');
  assert(readFileSync(sessionFile).equals(before));
  assert.equal(t.log().filter(e => e.event === 'actual-request').length, requests);
}
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['remote', 'fallback', 'doublefail', 'remote-cancel', 'persist-fail', 'migration']) {
  let t;
  try {
    t = await tui(join(dir, name), options);
    t.tmux('resize-window', '-t', 'fixture', '-x', '90', '-y', '40');
    await command(t, '/p3-seed 8000', 'seed');
    if (name === 'fallback' || name === 'doublefail') t.control({ remote: 'failure', mode: name === 'doublefail' ? 'failure' : 'success' });
    if (name === 'remote-cancel') t.control({ remote: 'delay', mode: 'success' });
    if (name === 'persist-fail') await command(t, '/p3-fault partial', 'disk-fault-armed');
    const settled = count(t, 'compaction_end');
    await t.text('/compact');
    if (name === 'remote-cancel') { await waitFor(() => count(t, 'remote-request'), 'remote pending'); t.key('Escape'); }
    await waitFor(() => count(t, 'compaction_end') > settled, 'compaction settled');
    const success = ['remote', 'fallback', 'migration'].includes(name);
    await waitFor(() => !screen(t).includes('Compacting context'), 'completion redraw');
    if (success) {
      await waitFor(() => screen(t).includes('Context compacted'), 'divider');
      assert.equal(screen(t).split('Context compacted').length - 1, 1);
      assert.equal(count(t, 'extension-success'), 1);
      const entry = entries(t.dir).findLast(e => e.type === 'compaction');
      assert.equal(entry.details.piCompact.kind, name === 'fallback' ? 'text' : 'opaque');
      capture(t, 'completed');
      await expanded(t, name === 'fallback' ? 'Readable continuation.' : 'Remote checkpoint (opaque)');
      if (name !== 'fallback') {
        const d = readFileSync(join(t.dir, 'expanded.txt'), 'utf8');
        for (const line of [`Schema: ${entry.details.piCompact.schemaVersion}`, `Covered entries: ${entry.details.piCompact.source.entries.length}`, `Wire items: ${entry.details.piCompact.items.length}`, `Stored wire bytes: ${entry.details.piCompact.budget.bytes}`]) assert(d.includes(line), line);
      }
    } else {
      assert(!screen(t).includes('Context compacted'));
      assert.equal(count(t, 'extension-success'), 0);
      assert.equal(entries(t.dir).filter(e => e.type === 'compaction').length, 0);
      capture(t, 'failed');
    }
    if (name === 'remote') {
      const sessionFile = join(t.dir, 'session.jsonl');
      await t.stop();
      t = await tui(join(dir, 'restored'), { ...options, sessionFile });
      t.tmux('resize-window', '-t', 'fixture', '-x', '90', '-y', '40');
      await waitFor(() => screen(t).includes('Context compacted'), 'restored divider');
      await expanded(t, 'Remote checkpoint (opaque)', sessionFile);
      assert.equal(count(t, 'actual-request'), 0);
      capture(t, 'restored');
    }
    if (name === 'migration') {
      await command(t, '/p4-model deepseek/deepseek-chat', 'selected');
      const before = readFileSync(join(t.dir, 'session.jsonl'));
      t.control({ mode: 'failure', source: 'failure' });
      await command(t, 'CURRENT_INPUT_MARKER failed migration', 'agent_settled');
      assert.equal(entries(t.dir).filter(e => e.type === 'compaction').length, 1);
      assert.equal(count(t, 'normal-request'), 0);
      assert(readFileSync(join(t.dir, 'session.jsonl')).subarray(0, before.length).equals(before));
      assert.equal(count(t, 'extension-success'), 1);
      capture(t, 'migration-failed');
      t.control({ mode: 'success', source: 'success' });
      await command(t, '/compact', 'extension-success');
      await waitFor(() => screen(t).includes('Context compacted'), 'migration divider');
      assert.equal(count(t, 'extension-success'), 2);
      assert.equal(screen(t).split('Context compacted').length - 1, 1);
      const latest = entries(t.dir).findLast(e => e.type === 'compaction');
      assert.equal(latest.details.piCompact.kind, 'text');
      assert(latest.summary.includes('database=sqlite'));
      await expanded(t, 'database=sqlite');
      assert(!readFileSync(join(t.dir, 'expanded.txt'), 'utf8').includes('Remote checkpoint (opaque)'));
      capture(t, 'migrated');
    }
    assert.equal(count(t, 'network-blocked'), 0);
    results.push({ name, pass: true, path: t.dir, firstFrames: t.log().filter(e => e.event === 'p5-first-frame') });
  } catch (error) {
    if (t) capture(t, 'error');
    results.push({ name, pass: false, error: String(error), stack: error.stack });
  } finally { if (t) { t.control({ mode: 'success', remote: 'success', source: 'success' }); await t.stop(); } }
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ provenance, results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
console.log(dir);
assert(results.every(r => r.pass), 'P5 integrated checkpoints');
