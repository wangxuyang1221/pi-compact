import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cli, root, waitFor } from '../../../scripts/fixture/runtime.mjs';

const out = dirname(fileURLToPath(import.meta.url));
const dir = join(out, 'interruption', String(Date.now()));
mkdirSync(dir, { recursive: true });
assert.equal((await cli(join(dir, 'seed'), { variant: 'baseline', seed: 100 })).code, 0);
const sessionFile = join(dir, 'seed/session.jsonl');
const lockFile = sessionFile + '.pi-compact-state.json.lock';
const dead = spawnSync(process.execPath, ['-e', '']);
assert.equal(dead.status, 0);
assert.throws(() => process.kill(dead.pid, 0), { code: 'ESRCH' });
writeFileSync(lockFile, JSON.stringify({ pid: dead.pid, nonce: 'crashed-owner' }));
const gate = join(dir, 'interrupted');
mkdirSync(gate, { recursive: true });
const running = cli(gate, { sessionFile, extraEnv: {
  PI_LOCK_GATE_TARGET: lockFile, PI_LOCK_GATE_DIR: gate,
  NODE_OPTIONS: `--import=${join(root, 'scripts/fixture/preload.mjs')} --import=${join(out, 'stale-lock-gate.mjs')}`,
} });
let pid;
try {
  await waitFor(() => existsSync(join(gate, 'waiting.json')), 'acquisition paused');
  pid = JSON.parse(readFileSync(join(gate, 'waiting.json'))).pid;
  assert.equal(JSON.parse(readFileSync(lockFile + '.claim')).pid, pid);
  process.kill(pid, 'SIGKILL');
  await running;
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  const files = [sessionFile, lockFile, lockFile + '.claim'];
  const hashes = () => files.map(file => createHash('sha256').update(readFileSync(file)).digest('hex'));
  const before = hashes();
  const rejected = await cli(join(dir, 'rejected'), { sessionFile }, 'CURRENT_INPUT_MARKER must not run');
  assert.notEqual(rejected.code, 0);
  assert.equal(rejected.events.filter(e => e.event === 'normal-request').length, 0);
  assert.deepEqual(hashes(), before);
  unlinkSync(lockFile + '.claim');
  const restored = await cli(join(dir, 'restored'), { sessionFile }, 'CURRENT_INPUT_MARKER inspected recovery');
  assert.equal(restored.code, 0);
  assert.equal(restored.events.filter(e => e.event === 'normal-request').length, 1);
  assert.equal(existsSync(lockFile), false);
  assert.equal(existsSync(lockFile + '.claim'), false);
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ verdict: 'PASS', killedAcquirer: pid,
    retainedHashes: before, rejectedCode: rejected.code, requestsAfterInspectedRecovery: 1 }, null, 2));
  console.log(dir);
} finally {
  writeFileSync(join(gate, 'release'), 'cleanup');
  await running;
  if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
}
