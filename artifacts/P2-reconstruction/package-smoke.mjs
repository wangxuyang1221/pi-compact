import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root, tui, waitFor, provenance } from '../../scripts/fixture/runtime.mjs';
import { options, count, input } from '../../scripts/p2/common.mjs';
const dir = join(root, 'artifacts/P2-reconstruction/package-delivery'); const unpack = join(dir, 'unpack'); mkdirSync(unpack, { recursive: true });
const tarball = join(dir, 'pi-compact-0.1.0.tgz'); execFileSync('tar', ['-xzf', tarball, '-C', unpack]);
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = readdirSync(join(unpack, 'package'), { recursive: true }).filter(p => /\.(ts|md|json)$/.test(p));
const audit = files.map(file => ({ file, hash: sha(join(unpack, 'package', file)), matches: file === 'package.json' ? undefined : sha(join(unpack, 'package', file)) === sha(join(root, file)) }));
assert(audit.every(row => row.matches !== false));
const packed = JSON.parse(readFileSync(join(unpack, 'package/package.json'))); const source = JSON.parse(readFileSync(join(root, 'package.json'))); delete source.packageManager; assert.deepEqual(packed, source);
assert(files.every(p => !p.includes('fixture') && !p.includes('node_modules') && !p.includes('tests')));
const t = await tui(join(dir, 'smoke'), { ...options, variant: 'baseline', extensions: [join(unpack, 'package/src/index.ts'), ...options.extensions] });
try {
  await t.text('/compact-config'); await waitFor(() => t.tmux('capture-pane', '-p', '-t', 'fixture').includes('90%'), 'packed config command');
  await t.text('/p2-budget 9000'); await waitFor(() => count(t, 'budget'), 'packed budget'); await t.text(input); await waitFor(() => count(t, 'agent_settled'), 'packed continuation');
  assert.equal(count(t, 'native-request'), 1); assert.equal(count(t, 'normal-request'), 1); assert.equal(t.log().find(e => e.event === 'compaction_end').success, true); assert.equal(count(t, 'network-blocked'), 0);
  await t.capture('smoke');
} finally { await t.stop(); }
const result = { pass: true, tarball, sha256: sha(tarball), audit, provenance }; writeFileSync(join(dir, 'audit.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ pass: true, sha256: result.sha256, files: files.length }));
