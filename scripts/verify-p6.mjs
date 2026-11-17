import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tui, root, waitFor } from './fixture/runtime.mjs';
import { count, entries } from './p3/common.mjs';
import { options, install, filter } from './p6/common.mjs';
import { pack, sha } from './p6/package.mjs';
const release = pack();
const dir = join(root, 'artifacts/P6/local', String(Date.now()));
mkdirSync(dir, { recursive: true });
const results = [];
const screen = t => t.tmux('capture-pane', '-p', '-t', 'fixture');
const command = async (t, text, event) => { const before = count(t, event); await t.text(text); await waitFor(() => count(t, event) > before, text); };
const capture = (t, name) => {
  const file = join(t.dir, name + '.json');
  writeFileSync(file, JSON.stringify({ cols: 120, rows: 40, theme: 'dark', ansi: t.tmux('capture-pane', '-e', '-p', '-t', 'fixture') }));
  execFileSync('conda', ['run', '--no-capture-output', '-n', 'codex-py312', 'python', join(root, 'scripts/p5/render-capture.py'), file, join(t.dir, name + '.png')]);
};
const checks = ['FACT_0=value_0','FACT_11=value_11','FACT_TOOL_0=result_0','FACT_TOOL_11=result_11','FACT_PENDING=idempotency_test','FACT_FILE=ledger.csv','FACT_ROW=A1_pending','database=sqlite','retry=3'];
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['native', 'installed', 'auto', 'long-restore', 'migration', 'network-error', 'quota', 'cancel', 'doublefail', 'lifecycle']) {
  let t;
  try {
    const lane = join(dir, name);
    t = await tui(lane, options(release.pkg, { installed: name !== 'native' }));
    const loaded = t.log().find(e => e.event === 'p6-loaded');
    assert.equal(loaded.managed, name !== 'native');
    assert(!loaded.paths.includes(join(root, 'src/index.ts')));
    if (name !== 'native') assert(loaded.paths.includes(join(release.pkg, 'src/index.ts')));
    if (name === 'installed') {
      install(lane, release.pkg);
      assert.equal(JSON.parse(readFileSync(join(lane, 'agent/settings.json'))).packages.length, 1);
      await t.text('/compact-config threshold 80');
      await waitFor(() => { try { return JSON.parse(readFileSync(join(lane, 'cwd/.pi/pi-compact.json'))).thresholdPercent === 80; } catch { return false; } }, 'threshold saved');
      await t.text('/compact-config');
      await waitFor(() => screen(t).includes('80%'), 'threshold visible'); capture(t, 'config');
    }
    if (name === 'auto') { await t.text('/compact-config threshold 5'); await waitFor(() => { try { return JSON.parse(readFileSync(join(lane, 'cwd/.pi/pi-compact.json'))).thresholdPercent === 5; } catch { return false; } }, 'auto threshold'); }
    await command(t, '/p6-task', 'p6-task-seeded');
    const fileHash = sha(join(lane, 'cwd/ledger.csv'));
    if (name === 'auto') {
      await command(t, 'CURRENT_INPUT_MARKER automatic boundary', 'agent_settled');
      assert(count(t, 'extension-success') > 0);
    } else if (name === 'native') await command(t, '/compact', 'compaction_end');
    else if (['network-error','quota','doublefail','cancel'].includes(name)) {
      t.control({ remote: name === 'cancel' ? 'delay' : name === 'doublefail' ? 'failure' : name, mode: name === 'doublefail' ? 'failure' : 'success' });
      const n = count(t, 'compaction_end'); await t.text('/compact');
      if (name === 'cancel') { await waitFor(() => count(t, 'remote-request') > 0, 'pending'); t.key('Escape'); }
      await waitFor(() => count(t, 'compaction_end') > n, 'error compaction finished');
      if (['cancel','doublefail'].includes(name)) {
        assert.equal(entries(lane).filter(e => e.type === 'compaction').length, 0);
        const before = count(t, 'actual-request');
        await command(t, 'CURRENT_INPUT_MARKER blocked ordinary continuation', 'agent_settled');
        assert.equal(count(t, 'actual-request'), before);
        capture(t, 'blocked');
        t.control({ remote: 'success', mode: 'success' });
        await command(t, '/compact', 'extension-success');
      } else {
        assert.equal(entries(lane).findLast(e => e.type === 'compaction').details.piCompact.kind, 'text');
        assert(count(t, 'p6-injected-error') >= 1);
      }
    } else await command(t, '/compact', 'extension-success');
    await waitFor(() => !screen(t).includes('Compacting context'), 'redraw');
    await waitFor(() => screen(t).includes(name === 'native' ? 'Compacted from' : 'Context compacted'), 'completion divider');
    capture(t, 'completed');
    if (name === 'installed') {
      const sessionFile = join(lane, 'session.jsonl'); await t.stop();
      const resumed = join(dir, 'config-restored'); mkdirSync(resumed, { recursive: true }); symlinkSync(join(lane, 'cwd'), join(resumed, 'cwd'), 'dir');
      t = await tui(resumed, { ...options(release.pkg), sessionFile, configure(path) { options(release.pkg).configure(path); copyFileSync(join(lane, 'control.json.opaque-map'), join(path, 'control.json.opaque-map')); } });
      await t.text('/compact-config'); await waitFor(() => screen(t).includes('80%'), 'saved configuration after restart'); capture(t, 'config-restored');
    }
    if (name === 'long-restore') {
      for (let n = 0; n < 2; n++) {
        await command(t, '/p6-task', 'p6-task-seeded');
        await command(t, '/compact', 'extension-success');
      }
      assert.equal(entries(lane).filter(e => e.type === 'compaction' && e.details.piCompact.kind === 'opaque').length, 3);
      const sessionFile = join(lane, 'session.jsonl');
      const map = join(lane, 'control.json.opaque-map');
      await t.stop();
      t = await tui(join(dir, 'restored'), { ...options(release.pkg), sessionFile,
        configure(path) { options(release.pkg).configure(path); copyFileSync(map, join(path, 'control.json.opaque-map')); copyFileSync(join(lane, 'cwd/ledger.csv'), join(path, 'cwd/ledger.csv')); } });
      assert.equal(count(t, 'actual-request'), 0);
      capture(t, 'restored');
      t.control({ remote: 'failure', mode: 'success' });
      await command(t, '/p6-task', 'p6-task-seeded');
      await command(t, '/compact', 'extension-success');
      assert.equal(entries(lane).findLast(e => e.type === 'compaction').details.piCompact.kind, 'text');
      await command(t, '/p6-task', 'p6-task-seeded');
      await command(t, '/compact', 'extension-success');
    }
    if (name === 'migration' || name === 'lifecycle') {
      await command(t, '/p4-model deepseek/deepseek-chat', 'selected');
      t.control({ mode: 'success', source: 'success' });
      await command(t, '/compact', 'extension-success');
      const cp = entries(lane).findLast(e => e.type === 'compaction');
      assert.equal(cp.details.piCompact.kind, 'text');
      t.key('C-o'); await waitFor(() => screen(t).includes('Readable continuation'), 'readable migration'); capture(t, 'migrated'); t.key('C-o');
    }
    if (name === 'lifecycle') {
      filter(lane, release.pkg, false);
      await command(t, '/reload', 'p6-loaded');
      assert(!t.log().findLast(e => e.event === 'p6-loaded').paths.includes(join(release.pkg, 'src/index.ts')));
      capture(t, 'disabled');
      filter(lane, release.pkg, true); await command(t, '/reload', 'p6-loaded');
      assert.equal(t.log().findLast(e => e.event === 'p6-loaded').managed, true);
      install(lane, release.pkg, 'remove'); await command(t, '/reload', 'p6-loaded');
      assert(!t.log().findLast(e => e.event === 'p6-loaded').paths.includes(join(release.pkg, 'src/index.ts')));
      const sessionFile = join(lane, 'session.jsonl');
      await t.stop();
      const resumed = join(dir, 'after-remove'); mkdirSync(resumed, { recursive: true }); symlinkSync(join(lane, 'cwd'), join(resumed, 'cwd'), 'dir');
      t = await tui(resumed, { ...options(release.pkg, { installed: false }), sessionFile });
      assert.equal(t.log().find(e => e.event === 'p6-loaded').managed, false);
      await command(t, '/p6-task', 'p6-task-seeded');
      await command(t, '/compact', 'compaction_end');
      await waitFor(() => screen(t).includes('Compacted from'), 'native after removal'); capture(t, 'removed');
    }
    await command(t, 'CURRENT_INPUT_MARKER recall every FACT, pending test, file and tool results without editing files', 'agent_settled');
    const recall = t.log().findLast(e => e.event === 'recall-evidence' && e.phase === 'normal');
    assert(recall); for (const check of checks) assert(recall.recovered.includes(check), check);
    const normal = t.log().findLast(e => e.event === 'actual-request' && e.phase === 'normal');
    if (normal.model === 'deepseek-chat') assert(!JSON.stringify(normal.body).includes('encrypted_content'));
    assert.equal(sha(join(t.dir, 'cwd/ledger.csv')), fileHash);
    assert.equal(count(t, 'network-blocked'), 0);
    capture(t, 'continued');
    results.push({ name, pass: true, path: t.dir, checks, fileHash, dispatches: count(t, 'actual-request') + count(t, 'p6-injected-error'), source: 'synthetic transport through actual installed CLI/loader/encoder; not model quality' });
  } catch (error) { results.push({ name, pass: false, error: String(error), stack: error.stack }); if (t) { try { capture(t, 'failure'); } catch (captureError) { results.at(-1).captureError = String(captureError); } } }
  finally { if (t) { t.control({ remote: 'success', mode: 'success', source: 'success' }); await t.stop(); } }
  writeFileSync(join(dir, 'results.json'), JSON.stringify({ release: release.manifest.sha256, packageManifest: relative(root, join(release.dir, 'manifest.json')), results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
console.log(dir);
assert(results.every(r => r.pass), 'P6 local fixtures');
