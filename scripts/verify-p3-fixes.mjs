import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { root, tui, waitFor, sourceHashes } from './fixture/runtime.mjs';
import { options, count, entries } from './p3/common.mjs';

const base = join(root, 'artifacts/P3-fixes/runs', String(Date.now()));
mkdirSync(base, { recursive: true });
const results = [];
const recoveryOptions = { ...options, extensions: [...options.extensions, join(root, 'scripts/p3/recovery-observer.mjs')],
  extraEnv: { ...options.extraEnv, NODE_OPTIONS: '--import=' + join(root, 'scripts/p3/recovery-fault.mjs') } };
const save = () => writeFileSync(join(base, 'result.json'), JSON.stringify(results, null, 2));
const state = async t => {
  const before = count(t, 'state');
  await t.text('/p3-state');
  await waitFor(() => count(t, 'state') > before, 'state command completed');
  return t.log().findLast(e => e.event === 'state');
};

for (const kind of ['direct-retry', 'blocked-input', 'restart', 'kill-idle']) {
  const dir = join(base, kind);
  let t = await tui(dir, recoveryOptions);
  try {
    await t.text('/p3-seed 8000'); await waitFor(() => count(t, 'seed'), 'seed');
    await t.text('/compact'); await waitFor(() => count(t, 'extension-success'), 'old checkpoint');
    const prior = entries(dir).find(e => e.type === 'compaction').id;
    await t.text('/p3-seed 4000'); await waitFor(() => count(t, 'seed') === 2, 'new source');
    const before = readFileSync(join(dir, 'session.jsonl'));
    writeFileSync(join(dir, 'before.jsonl'), before);
    await t.text('/p3-fault ' + (kind === 'kill-idle' ? kind : 'rollback-fail'));
    await waitFor(() => count(t, 'disk-fault-armed'), 'fault armed');
    await t.text('/compact');
    await waitFor(() => count(t, kind === 'kill-idle' ? 'independent-kill-idle' : 'independent-rollback-failed'), 'fault fired');
    const partial = readFileSync(join(dir, 'session.jsonl'));
    copyFileSync(join(dir, 'session.jsonl'), join(dir, 'after-fault.jsonl'));
    copyFileSync(join(dir, 'session.jsonl.pi-compact-pending.json'), join(dir, 'pending-at-fault.json'));
    if (kind !== 'kill-idle') {
      assert.equal((await state(t)).state, 'blocked');
      const remote = count(t, 'remote-request');
      await t.text('/compact');
      await state(t);
      assert.equal(count(t, 'remote-request'), remote, 'retry does no model work while recovery fails');
      await t.text('/p3-write-check');
      await waitFor(() => count(t, 'write-check'), 'write checks');
      assert(t.log().find(e => e.event === 'write-check').attempts.every(a => a.rejected));
      await t.text('BLOCKED_DURING_FAULT'); await state(t);
      assert(readFileSync(join(dir, 'session.jsonl')).equals(partial), 'pending bytes remain frozen');
      await t.text('/p3-restore'); await waitFor(() => count(t, 'disk-restored'), 'disk restored');
      if (kind !== 'direct-retry') {
        await t.text('BLOCKED_AFTER_RESTORE'); await state(t);
        assert(readFileSync(join(dir, 'session.jsonl')).equals(partial), 'restoring disk alone does not admit writes');
      }
    } else await waitFor(() => existsSync(join(dir, 'exit-code')), 'kill exited');
    if (kind === 'restart' || kind === 'kill-idle') {
      await t.stop();
      for (const f of ['events.jsonl', 'cleanup.json', 'processes.json', 'raw.ansi']) copyFileSync(join(dir, f), join(dir, 'first-' + f));
      if (existsSync(join(dir, 'control.json.fault'))) unlinkSync(join(dir, 'control.json.fault'));
      t = await tui(dir, recoveryOptions);
      assert(readFileSync(join(dir, 'session.jsonl')).equals(before), 'restart recovers exact old bytes');
      assert.equal((await state(t)).state, 'blocked');
    }
    assert.equal(count(t, 'normal-request'), 0);
    const remote = count(t, 'remote-request');
    const success = count(t, 'extension-success');
    await t.text('/compact'); await waitFor(() => count(t, 'extension-success') === success + 1, 'first retry succeeds');
    assert.equal(count(t, 'remote-request'), remote + 1, 'recovery precedes one summary request');
    const checkpoints = entries(dir).filter(e => e.type === 'compaction');
    assert.equal(checkpoints.length, 2); assert.equal(checkpoints[0].id, prior);
    assert(readFileSync(join(dir, 'session.jsonl')).subarray(0, before.length).equals(before));
    assert(!existsSync(join(dir, 'session.jsonl.pi-compact-pending.json')));
    const settled = count(t, 'agent_settled');
    await t.text('CURRENT_INPUT_MARKER recovered'); await waitFor(() => count(t, 'agent_settled') > settled, 'normal continuation');
    assert.equal(count(t, 'normal-request'), 1); assert.equal(count(t, 'network-blocked'), 0);
    await t.capture('outcome');
    results.push({ kind, pass: true, dir, prior, source: sourceHashes() });
  } catch (error) { results.push({ kind, pass: false, dir, error: String(error), stack: error.stack }); }
  finally { await t.stop(); }
  save(); console.log(JSON.stringify({ ...results.at(-1), source: undefined }));
}

for (const variant of ['baseline', 'head']) {
  const dir = join(base, 'small-' + variant);
  const t = await tui(dir, { ...options, variant, extraArgs: ['--provider', 'fixture', '--model', 'fixture-model'], configure(dir) {
    options.configure(dir);
    const path = join(dir, 'agent/models.json'); const models = JSON.parse(readFileSync(path));
    models.providers.fixture.models[0].contextWindow = 4096;
    writeFileSync(path, JSON.stringify(models));
  } });
  try {
    await t.text('/p3-seed 1000'); await waitFor(() => count(t, 'seed'), 'small seed');
    await t.text('/compact'); await waitFor(() => count(t, 'extension-success'), 'small native compaction');
    await t.text('CURRENT_INPUT_MARKER small'); await waitFor(() => count(t, 'agent_settled'), 'small continuation');
    assert.equal(count(t, 'native-request'), 1); assert.equal(count(t, 'normal-request'), 1);
    assert.equal(count(t, 'remote-request'), 0); assert.equal(entries(dir).filter(e => e.type === 'compaction').length, 1);
    results.push({ kind: 'small-' + variant, pass: true, dir, source: sourceHashes() });
  } catch (error) { results.push({ kind: 'small-' + variant, pass: false, dir, error: String(error) }); }
  finally { await t.stop(); }
  save(); console.log(JSON.stringify({ ...results.at(-1), source: undefined }));
}

const dir = join(base, 'opaque-small');
const t = await tui(dir, recoveryOptions);
try {
  await t.text('/p3-seed 8000'); await waitFor(() => count(t, 'seed'), 'opaque source');
  await t.text('/compact'); await waitFor(() => count(t, 'extension-success'), 'opaque checkpoint');
  await t.text('/p3-small-model'); await waitFor(() => count(t, 'small-model'), 'small model');
  t.control({ mode: 'success', remote: 'failure' });
  await t.text('/compact'); await waitFor(() => count(t, 'compaction_end') === 2, 'small fallback');
  assert.equal((await state(t)).state, 'blocked');
  assert.equal(count(t, 'native-request'), 0); assert.equal(count(t, 'normal-request'), 0);
  assert.equal(entries(dir).filter(e => e.type === 'compaction').length, 1);
  results.push({ kind: 'opaque-small', pass: true, dir, source: sourceHashes() });
} catch (error) { results.push({ kind: 'opaque-small', pass: false, dir, error: String(error) }); }
finally { await t.stop(); }
save(); console.log(JSON.stringify({ ...results.at(-1), source: undefined }));
assert(results.every(result => result.pass));
