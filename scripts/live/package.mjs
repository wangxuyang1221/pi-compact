import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { digest, durableWrite } from './guard.mjs';
const root = resolve('.');
const dir = resolve(process.argv[2] ?? join(root, 'artifacts/P6-executor/release'));
fs.mkdirSync(dir, { recursive: true });
execFileSync('pnpm', ['pack', '--pack-destination', dir], { stdio: 'pipe' });
const tgz = join(dir, 'pi-compact-0.1.0.tgz');
execFileSync('tar', ['-xzf', tgz, '-C', dir]);
const pkg = join(dir, 'package');
const files = {};
for (const file of fs.readdirSync(pkg, { recursive: true, withFileTypes: true })) {
  if (!file.isFile()) continue;
  const path = join(file.parentPath, file.name), name = relative(pkg, path);
  if (!/^(src\/.*\.ts|README\.md|docs\/.*\.md|package\.json)$/.test(name)) throw new Error('Unexpected package member');
  const bytes = fs.readFileSync(path);
  files[name] = { bytes: bytes.length, sha256: digest(bytes) };
  if (name === 'package.json') {
    const expected = JSON.parse(fs.readFileSync(join(root, name), 'utf8')); delete expected.packageManager;
    assert.deepEqual(JSON.parse(bytes), expected, 'Package metadata mismatch');
  } else if (digest(fs.readFileSync(join(root, name))) !== digest(bytes)) throw new Error('Package source mismatch');
}
const coreDiff = execFileSync('git', ['diff', '713acbf87bfa87b3d6eb208fb55bdb3b6651fd49', '--', 'src'], { encoding: 'utf8' });
if (coreDiff) throw new Error('Unexpected product source change');
const manifest = { productSHA: '713acbf87bfa87b3d6eb208fb55bdb3b6651fd49', packageRebuiltFor: 'docs/live-acceptance.md', sha256: digest(fs.readFileSync(tgz)), files };
durableWrite(join(dir, 'manifest.json'), manifest);
console.log(JSON.stringify({ sha256: manifest.sha256, members: Object.keys(files).length }));
