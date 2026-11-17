import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

mkdirSync('scratch/package-contract', { recursive: true });
const dir = mkdtempSync(resolve('scratch/package-contract/run-'));
execFileSync('pnpm', ['pack', '--pack-destination', dir], { stdio: 'pipe' });
const tarball = join(dir, readdirSync(dir).find(name => name.endsWith('.tgz'))!);
const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
execFileSync('tar', ['-xzf', tarball, '-C', dir]);
const manifest = JSON.parse(readFileSync(join(dir, 'package/package.json'), 'utf8'));
after(() => rmSync(dir, { recursive: true, force: true }));

test('release loads through the Pi resource entry and host-provided runtime', () => {
  assert.equal(manifest.name, 'pi-compact');
  assert.deepEqual(manifest.pi.extensions, ['./src/index.ts']);
  for (const entry of manifest.pi.extensions) {
    assert(files.includes('package/' + entry.replace(/^\.\//, '')));
    assert.match(readFileSync(join(dir, 'package', entry), 'utf8'), /export default/);
  }
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(manifest.peerDependencies, { '@earendil-works/pi-coding-agent': '1.5.2', '@earendil-works/pi-tui': '1.5.2' });
});

test('release contains only user docs, manifest and extension sources', () => {
  assert.equal(new Set(files).size, files.length);
  for (const file of files) {
    assert(!file.includes('..'));
    assert(!/(?:scratch|tests?|fixtures?|auth|opaque|node_modules|artifacts|audit|\.env|\.jsonl|\.tgz)/i.test(file), file);
    assert(/^package\/(?:package\.json|README\.md|src\/[a-z0-9/-]+\.ts|docs\/(?:compatibility|install|recovery|live-acceptance|p[1-5]-[a-z-]+)\.md)$/.test(file), file);
  }
  for (const file of ['README.md', 'docs/compatibility.md', 'docs/install.md', 'docs/recovery.md', 'docs/live-acceptance.md']) assert(files.includes('package/' + file), file);
});
