import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root, provenance } from '../fixture/runtime.mjs';
export const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export function pack() {
  const base = join(root, 'artifacts/P6');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'release-'));
  execFileSync('pnpm', ['pack', '--pack-destination', dir], { stdio: 'pipe' });
  const tgz = join(dir, 'pi-compact-0.1.0.tgz');
  execFileSync('tar', ['-xzf', tgz, '-C', dir]);
  const pkg = join(dir, 'package');
  const files = readdirSync(pkg, { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => relative(pkg, join(f.parentPath, f.name))).sort();
  const manifest = { tgz: relative(root, tgz), sha256: sha(tgz), productSHA: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), files: Object.fromEntries(files.map(f => [f, { bytes: readFileSync(join(pkg, f)).length, sha256: sha(join(pkg, f)) }])), host: provenance };
  for (const file of files) {
    const source = readFileSync(join(root, file));
    assert.deepEqual(source, execFileSync('git', ['show', `${manifest.productSHA}:${file}`], { cwd: root }), 'Uncommitted package source: ' + file);
    if (file === 'package.json') {
      const expected = JSON.parse(source);
      delete expected.packageManager;
      assert.deepEqual(JSON.parse(readFileSync(join(pkg, file))), expected, 'Package metadata mismatch');
    } else assert.equal(sha(join(pkg, file)), sha(join(root, file)), 'Package source mismatch: ' + file);
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir, pkg, tgz, manifest };
}
