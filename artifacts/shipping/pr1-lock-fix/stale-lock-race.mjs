import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cli, tui, root, waitFor } from '../../../scripts/fixture/runtime.mjs';

const out = dirname(fileURLToPath(import.meta.url));
const dir = join(out, 'stale-lock-race', String(Date.now()));
mkdirSync(dir, {recursive: true});
const seed = await cli(join(dir, 'seed'), {variant: 'baseline', seed: 100});
assert.equal(seed.code, 0);
const sessionFile = join(dir, 'seed/session.jsonl');
const lockFile = sessionFile + '.pi-compact-state.json.lock';
const dead = spawnSync(process.execPath, ['-e', '']);
assert.equal(dead.status, 0);
assert.throws(() => process.kill(dead.pid, 0), {code: 'ESRCH'});
writeFileSync(join(dir, 'dead-process.json'), JSON.stringify({pid: dead.pid, exitCode: dead.status}));
writeFileSync(lockFile, JSON.stringify({pid: dead.pid, nonce: 'synthetic-crashed-owner'}));
const gates = ['one', 'two'].map(name => join(dir, name));
for (const gate of gates) mkdirSync(gate, {recursive: true});
const starts = gates.map(gate => tui(gate, {sessionFile, captureReady: false,
  extraEnv: {PI_LOCK_GATE_TARGET: lockFile, PI_LOCK_GATE_DIR: gate,
    NODE_OPTIONS: `--import=${join(root, 'scripts/fixture/preload.mjs')} --import=${join(out, 'stale-lock-gate.mjs')}`}
}).then(value => ({value}), error => ({error: String(error)})));
let one, two;
try {
  await waitFor(() => gates.every(gate => existsSync(join(gate, 'waiting.json'))), 'both contenders observed dead owner');
  writeFileSync(join(gates[0], 'release'), 'release first takeover');
  const first = await starts[0];
  if (first.error) throw new Error(first.error);
  one = first.value;
  const firstLock = JSON.parse(readFileSync(lockFile));
  assert.equal(firstLock.pid, one.log().find(e => e.event === 'preload').pid);
  writeFileSync(join(dir, 'first-lock.json'), JSON.stringify(firstLock));
  writeFileSync(join(gates[1], 'release'), 'release second takeover after first ready');
  const second = await starts[1];
  if (second.error) throw new Error(second.error);
  two = second.value;
  const secondLock = JSON.parse(readFileSync(lockFile));
  assert.equal(secondLock.pid, two.log().find(e => e.event === 'preload').pid);
  assert.notEqual(firstLock.pid, secondLock.pid);
  await one.text('CURRENT_INPUT_MARKER first owner after takeover');
  await waitFor(() => one.log().some(e => e.event === 'agent_settled'), 'first owner request');
  await two.text('CURRENT_INPUT_MARKER second owner after takeover');
  await waitFor(() => two.log().some(e => e.event === 'agent_settled'), 'second owner request');
  await one.capture('first-owner');
  await two.capture('second-owner');
  const sessionText = readFileSync(sessionFile, 'utf8');
  assert(sessionText.includes('first owner after takeover') && sessionText.includes('second owner after takeover'));
  const result = {dir, firstLock, secondLock, bothInputsPersisted: true, firstManaged: one.log().find(e => e.event === 'ready').managed,
    secondManaged: two.log().find(e => e.event === 'ready').managed,
    firstRequests: one.log().filter(e => e.event === 'normal-request').length,
    secondRequests: two.log().filter(e => e.event === 'normal-request').length,
    schedulingOnly: 'Each process pauses immediately before the real unlinkSync of the stale lock. No lock operation is mocked, skipped or replaced.',
    verdict: 'FAIL: two live managed Pi processes own and write the same persistent session after concurrent dead-owner recovery'};
  assert.equal(result.firstRequests, 1);
  assert.equal(result.secondRequests, 1);
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  for (const gate of gates) writeFileSync(join(gate, 'release'), 'cleanup');
  const completed = await Promise.all(starts);
  for (const result of completed) if (result.value) await result.value.stop();
}
