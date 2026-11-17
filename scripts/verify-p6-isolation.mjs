import assert from 'node:assert/strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { fixtureGrant } from './live-acceptance.mjs';
import { digest, durableWrite, privateTree } from './live/guard.mjs';

const root = resolve('artifacts/P6-isolation-fixes/runs', String(Date.now()));
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const packageFile = resolve(process.argv[2] ?? 'artifacts/P6-executor/release/pi-compact-0.1.0.tgz');
const packageHash = digest(fs.readFileSync(packageFile));
let authCase;
let restoreAttack;
const spawn = cp.spawn;
cp.spawn = function (file, args, options) {
  if (args[0]?.endsWith('/scripts/live/worker.mjs') && args.at(-1) === 'restored' && restoreAttack) {
    const agent = join(restoreAttack.evidenceDir, 'raw/agent');
    fs.renameSync(agent, agent + '-saved');
    fs.symlinkSync(restoreAttack.outside, agent);
  }
  if (args[0]?.endsWith('/scripts/live/worker.mjs') && authCase) {
    args = ['--import=' + resolve('scripts/p6-fix-independent-auth-inject.mjs'), ...args];
    options = { ...options, env: { ...options.env, P6_AUTH_PROBE: authCase } };
  }
  return spawn.call(this, file, args, options);
};
syncBuiltinESMExports();
const { execute } = await import('./live/executor.mjs');
const rows = [];
for (const name of ['unused', 'target', 'expired']) {
  authCase = name;
  const evidenceDir = join(root, 'auth-' + name);
  const result = await execute({ grant: fixtureGrant(evidenceDir, packageHash), packageFile });
  assert(!fs.existsSync(join(evidenceDir, 'raw/auth-command-marker.jsonl')));
  if (name === 'unused') {
    assert.equal(result.status, 'pass'); assert.equal(result.dispatches, 9);
    assert.equal(result.processRestart.beforeReservations, 5);
  } else {
    assert.equal(result.failure, name === 'expired' ? 'AUTH_EXPIRED' : 'AUTH_FORMAT_DENIED');
    assert.equal(result.dispatches, 0);
  }
  const cleanup = JSON.parse(fs.readFileSync(join(evidenceDir, 'cleanup.json')));
  assert.equal(cleanup.alive, false); assert.equal(cleanup.listenerCount, 0);
  rows.push({ name: 'auth-' + name, status: 'pass', dispatches: result.dispatches, cleanup });
}
authCase = undefined;
{
  const evidenceDir = join(root, 'restore-path');
  const outside = evidenceDir + '-outside'; fs.mkdirSync(outside, { mode: 0o700 });
  restoreAttack = { evidenceDir, outside };
  const result = await execute({ grant: fixtureGrant(evidenceDir, packageHash), packageFile });
  assert.notEqual(result.status, 'pass');
  assert.equal(JSON.parse(fs.readFileSync(join(evidenceDir, 'ledger.json'))).rows.length, 5);
  assert.deepEqual(fs.readdirSync(outside), []);
  const cleanup = JSON.parse(fs.readFileSync(join(evidenceDir, 'cleanup.json')));
  assert.equal(cleanup.alive, false); assert.equal(cleanup.listenerCount, 0);
  rows.push({ name: 'restored-worker-path-check', status: 'pass', dispatches: 5, outsideUnchanged: true, cleanup });
  restoreAttack = undefined;
}
for (const path of ['raw', 'raw/agent', 'raw/home', 'raw/native/sessions', 'raw/tmp', 'raw/grant.json.next', 'ledger.json.next']) {
  const evidenceDir = join(root, 'path-' + path.replaceAll('/', '-'));
  const outside = evidenceDir + '-outside';
  fs.mkdirSync(outside, { recursive: true, mode: 0o700 });
  const marker = join(outside, 'marker'); fs.writeFileSync(marker, 'unchanged', { mode: 0o600 });
  const link = join(evidenceDir, path);
  fs.mkdirSync(dirname(link), { recursive: true, mode: 0o700 });
  fs.symlinkSync(path.endsWith('.next') ? marker : outside, link);
  await assert.rejects(execute({ grant: fixtureGrant(evidenceDir, packageHash), packageFile }), /EVIDENCE_PATH_DENIED/);
  assert.deepEqual(fs.readdirSync(outside), ['marker']); assert.equal(fs.readFileSync(marker, 'utf8'), 'unchanged');
  assert(!fs.existsSync(join(evidenceDir, 'ledger.json')));
  rows.push({ name: path, status: 'pass', dispatches: 0, outsideUnchanged: true });
}
const temp = join(root, 'exclusive-write');
fs.writeFileSync(temp + '.next', 'preserved', { mode: 0o600 });
assert.throws(() => durableWrite(temp, {}), /EEXIST/);
assert.equal(fs.readFileSync(temp + '.next', 'utf8'), 'preserved');
rows.push({ name: 'exclusive-temporary-file', status: 'pass' });
const broad = join(root, 'broad'); fs.mkdirSync(broad, { mode: 0o700 }); fs.chmodSync(broad, 0o755);
assert.throws(() => privateTree(broad), /EVIDENCE_PERMISSIONS_DENIED/);
fs.chmodSync(broad, 0o700);
rows.push({ name: 'private-permissions', status: 'pass' });
const boundary = cp.spawnSync(process.execPath, ['--input-type=module', '-e', `
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {networkBoundary} from './scripts/live/network.mjs';
const cachedSpawn=cp.spawn; const boundary=networkBoundary('offline-fixture');
for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) assert.throws(()=>cp[name]('unreachable'), /SUBPROCESS_DENIED/);
assert.throws(()=>cachedSpawn('unreachable'), /SUBPROCESS_DENIED/);
assert.equal((await boundary.close()).trackedSockets,0);
`], { encoding: 'utf8' });
assert.equal(boundary.status, 0, boundary.stderr);
rows.push({ name: 'subprocess-exports-and-cached-spawn', status: 'pass' });
durableWrite(join(root, 'results.json'), { packageHash, rows });
console.log(JSON.stringify({ status: 'pass', cases: rows.length, evidence: root }));
