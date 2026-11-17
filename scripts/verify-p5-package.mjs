import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tui, root, waitFor, provenance } from './fixture/runtime.mjs';
const dir = join(root, 'artifacts/P5-development/package', String(Date.now()));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'runner.json'), JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
execFileSync('pnpm', ['pack', '--pack-destination', dir], { cwd: root });
const tgz = join(dir, readdirSync(dir).find(f => f.endsWith('.tgz')));
execFileSync('tar', ['-xzf', tgz, '-C', dir]);
const files = readdirSync(join(dir, 'package'), { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => relative(join(dir, 'package'), join(f.parentPath, f.name))).sort();
const expected = [...JSON.parse(readFileSync(join(root, 'package.json'))).files.filter(f => f !== 'src'), 'package.json', ...readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => relative(root, join(f.parentPath, f.name)))].sort();
assert.deepEqual(files, expected, 'exact package whitelist');
for (const path of files.filter(f => f !== 'package.json')) assert(readFileSync(join(dir, 'package', path)).equals(readFileSync(join(root, path))), path);
const packed = JSON.parse(readFileSync(join(dir, 'package/package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
delete manifest.packageManager;
assert.deepEqual(packed, manifest);
assert(files.every(f => !/(?:fixture|test|auth|node_modules)/.test(f)));
writeFileSync(join(dir, 'audit.json'), JSON.stringify({ tgz: relative(root, tgz), sha256: createHash('sha256').update(readFileSync(tgz)).digest('hex'), files, fileHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(join(dir, 'package', file))).digest('hex')])), sourceByteMatch: true, manifestSemanticMatch: true, provenance }, null, 2));
for (const variant of ['package', 'downgrade']) {
  if (variant === 'downgrade') {
    cpSync(join(dir, 'package/src'), join(dir, 'downgrade/src'), { recursive: true });
    const path = join(dir, 'downgrade/src/index.ts');
    const source = readFileSync(path, 'utf8');
    assert(source.includes('installRenderer(host, pi);'));
    writeFileSync(path, source.replace('installRenderer(host, pi);', 'installRenderer({ ...host, CompactionSummaryMessageComponent: undefined }, pi);'));
  }
  const path = join(dir, variant + '-run');
  const t = await tui(path, { variant: 'baseline', observer: false, extensions: [join(root, 'scripts/p5/observer.ts'), join(dir, variant, 'src/index.ts')], seed: 800, captureReady: false });
  try {
    assert(t.log().find(e => e.event === 'ready').managed);
    if (variant === 'downgrade') {
      await waitFor(() => t.tmux('capture-pane', '-p', '-t', 'fixture').includes('visual downgrade'), 'visual downgrade notice');
      writeFileSync(join(path, 'downgrade-notice.txt'), t.tmux('capture-pane', '-p', '-t', 'fixture'));
    }
    await t.text('/compact');
    await waitFor(() => t.log().some(e => e.event === 'compaction_end' && e.success), 'package actual success');
    await waitFor(() => t.tmux('capture-pane', '-p', '-t', 'fixture').includes(variant === 'package' ? 'Context compacted' : 'Compacted from'), 'package completion card');
    const screen = t.tmux('capture-pane', '-p', '-t', 'fixture');
    if (variant === 'downgrade') {
      assert(!screen.includes('Context compacted'));
      assert(readFileSync(join(path, 'raw.ansi'), 'utf8').includes('visual downgrade'));
      await t.text('CURRENT_INPUT_MARKER safe continuation with native UI');
      await waitFor(() => t.log().some(e => e.event === 'agent_settled'), 'downgrade continuation');
      assert.equal(t.log().filter(e => e.event === 'normal-request').length, 1);
    }
    writeFileSync(join(path, 'screen.txt'), screen);
    writeFileSync(join(path, 'screen.json'), JSON.stringify({ cols: 120, rows: 40, theme: 'dark', ansi: t.tmux('capture-pane', '-e', '-p', '-t', 'fixture') }));
    assert.equal(t.log().filter(e => e.event === 'native-request').length, 1);
    assert.equal(t.log().filter(e => e.event === 'network-blocked').length, 0);
    writeFileSync(join(path, 'result.json'), JSON.stringify({ pass: true, facadeCapabilityLoss: variant === 'downgrade', events: t.log() }, null, 2));
  } finally { await t.stop(); }
}
console.log(dir);
