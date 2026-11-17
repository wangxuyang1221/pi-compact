import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cli, tui, root, waitFor } from '../../../scripts/fixture/runtime.mjs';

const out = dirname(fileURLToPath(import.meta.url));
const dir = join(out, 'green', String(Date.now()));
mkdirSync(dir, { recursive: true });
const seed = await cli(join(dir, 'seed'), { variant: 'baseline', seed: 100 });
assert.equal(seed.code, 0);
const sessionFile = join(dir, 'seed/session.jsonl');
const lockFile = sessionFile + '.pi-compact-state.json.lock';
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const dead = spawnSync(process.execPath, ['-e', '']);
assert.equal(dead.status, 0);
assert.throws(() => process.kill(dead.pid, 0), { code: 'ESRCH' });
writeFileSync(lockFile, JSON.stringify({ pid: dead.pid, nonce: 'synthetic-crashed-owner' }));
const gate = join(dir, 'owner');
mkdirSync(gate, { recursive: true });
const start = tui(gate, { sessionFile, captureReady: false, extraEnv: {
  PI_LOCK_GATE_TARGET: lockFile, PI_LOCK_GATE_DIR: gate,
  NODE_OPTIONS: `--import=${join(root, 'scripts/fixture/preload.mjs')} --import=${join(out, 'stale-lock-gate.mjs')}`,
} }).then(value => ({ value }), error => ({ error }));
let owner;
const rejections = [];
try {
  await waitFor(() => existsSync(join(gate, 'waiting.json')), 'owner paused before stale unlink');
  assert(existsSync(lockFile + '.claim'));
  const before = { session: digest(sessionFile), lock: digest(lockFile), claim: digest(lockFile + '.claim') };
  const contender = await cli(join(dir, 'during-recovery'), { sessionFile }, 'CURRENT_INPUT_MARKER contender during recovery');
  assert.notEqual(contender.code, 0);
  assert.equal(contender.events.filter(e => e.event === 'normal-request').length, 0);
  assert.deepEqual({ session: digest(sessionFile), lock: digest(lockFile), claim: digest(lockFile + '.claim') }, before);
  rejections.push({ phase: 'during-recovery', code: contender.code, unchanged: before });
  writeFileSync(join(gate, 'release'), 'allow owner takeover');
  const started = await start;
  if (started.error) throw started.error;
  owner = started.value;
  assert.equal(existsSync(lockFile + '.claim'), false);
  const identity = JSON.parse(readFileSync(lockFile));
  assert.equal(identity.pid, owner.log().find(e => e.event === 'preload').pid);
  const after = { session: digest(sessionFile), lock: digest(lockFile) };
  const late = await cli(join(dir, 'after-recovery'), { sessionFile }, 'CURRENT_INPUT_MARKER contender after recovery');
  assert.notEqual(late.code, 0);
  assert.equal(late.events.filter(e => e.event === 'normal-request').length, 0);
  assert.deepEqual({ session: digest(sessionFile), lock: digest(lockFile) }, after);
  rejections.push({ phase: 'after-recovery', code: late.code, unchanged: after });
  await owner.text('CURRENT_INPUT_MARKER sole owner accepted');
  await waitFor(() => owner.log().some(e => e.event === 'agent_settled'), 'owner request settled');
  assert.equal(owner.log().filter(e => e.event === 'normal-request').length, 1);
  const session = readFileSync(sessionFile, 'utf8');
  assert(session.includes('sole owner accepted'));
  assert(!session.includes('contender during recovery') && !session.includes('contender after recovery'));
  await owner.capture('sole-owner');
  const cleanup = await owner.stop();
  owner = undefined;
  assert.equal(existsSync(lockFile), false);
  const restarted = await cli(join(dir, 'restart'), { sessionFile }, 'CURRENT_INPUT_MARKER clean restart');
  assert.equal(restarted.code, 0);
  assert.equal(restarted.events.filter(e => e.event === 'normal-request').length, 1);
  assert.equal(existsSync(lockFile), false);
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ verdict: 'PASS', rejections, identity,
    ownerRequests: 1, restartRequests: 1, cleanup, schedulingOnly: 'Original unlink is delayed; no filesystem operation is skipped or replaced.' }, null, 2));
  console.log(dir);
} finally {
  writeFileSync(join(gate, 'release'), 'cleanup');
  const result = await start;
  if (owner) await owner.stop();
  else if (result.value && !existsSync(join(gate, 'cleanup.json'))) await result.value.stop();
}
