import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, tui, root, waitFor, provenance } from './fixture/runtime.mjs';
const dir = join(root, 'artifacts/P1-fixes/runs', String(Date.now()));
mkdirSync(dir, { recursive: true });
const options = { observer: false, extensions: [join(root, 'scripts/regressions/observer.ts')] };
const results = [];
const count = (t, name) => t.log().filter(e => e.event === name).length;
const cases = {
  async dispose() {
    const result = await cli(join(dir, 'dispose'), { ...options, extraEnv: { PI_FIXTURE_PROBE: 'dispose' } }, 'CURRENT_INPUT_MARKER live peer control');
    const probe = result.events.find(e => e.event === 'disposed-probe');
    assert(probe, result.code);
    assert(probe.error?.includes('disposed'));
    assert.deepEqual(probe.after, probe.before);
    assert.equal(probe.managed, false);
    assert.equal(probe.released, true);
    const requests = result.events.filter(e => e.event === 'normal-request');
    assert.equal(requests.length, 1);
    assert(JSON.stringify(requests[0].input).includes('live peer control'));
    const last = result.events.find(e => e.event === 'last-disposed-probe');
    assert(last?.error?.includes('disposed'));
    assert.deepEqual(last.after, last.before);
    assert(last.registryReleased && last.dispatcherReleased && last.lockReleased);
  },
  async disabled() {
    for (const variant of ['baseline', 'head']) {
      const path = join(dir, 'disabled-' + variant);
      const result = await cli(path, { ...(variant === 'head' ? options : {}), variant, compaction: { enabled: false, reserveTokens: 8000 } }, 'CURRENT_INPUT_MARKER ' + 'x'.repeat(12000));
      assert.equal(result.events.filter(e => e.event === 'normal-request').length, 1);
      assert.equal(result.events.filter(e => e.event === 'native-request').length, 0);
      assert.equal(existsSync(join(path, 'session.jsonl.pi-compact-state.json')), false);
    }
    const path = join(dir, 'disabled-overflow');
    const result = await cli(path, { ...options, compaction: { enabled: false, reserveTokens: 8000 } }, 'CURRENT_INPUT_MARKER ' + 'x'.repeat(44000));
    assert.equal(result.events.filter(e => e.event === 'normal-request').length, 0);
    assert.equal(result.events.filter(e => e.event === 'native-request').length, 0);
    assert.equal(JSON.parse(readFileSync(join(path, 'session.jsonl.pi-compact-state.json'))).kind, 'blocked');
  },
  async retry() {
    const path = join(dir, 'retry');
    const gate = join(path, 'release');
    const t = await tui(path, { ...options, seed: 800, mode: 'failure', extraEnv: { PI_FIXTURE_FAILURE_GATE: gate } });
    try {
      await t.text('/compact');
      await waitFor(() => count(t, 'failure-hook-enter'), 'failure hook');
      t.control({ mode: 'delay' });
      await t.text('/compact');
      await t.text('/regression-barrier');
      await waitFor(() => count(t, 'input-barrier'), 'second command dispatched');
      assert.equal(count(t, 'native-request'), 1, 'retry waits for native finally');
      writeFileSync(gate, 'release');
      await waitFor(() => count(t, 'native-request') === 2, 'retry after native finally');
      t.control({ mode: 'success' });
      await waitFor(() => count(t, 'extension-success') === 1, 'retry checkpoint');
      await t.capture('retry');
      await t.text('CURRENT_INPUT_MARKER retry continued');
      await waitFor(() => count(t, 'agent_settled'), 'request after retry');
      assert.equal(count(t, 'normal-request'), 1);
      assert.equal(count(t, 'native-request'), 2);
      const entries = readFileSync(join(path, 'session.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(entries.filter(e => e.type === 'compaction').length, 1);
      assert.equal(t.log().filter(e => e.event === 'compaction_end' && e.success).length, 1);
    } finally {
      writeFileSync(gate, 'release');
      t.control({ mode: 'success' });
      await t.stop();
    }
  },
  async ownership() {
    const t = await tui(join(dir, 'owner'), { ...options, seed: 800 });
    try {
      const file = join(t.dir, 'session.jsonl');
      const before = readFileSync(file);
      const lock = readFileSync(file + '.pi-compact-state.json.lock');
      const contender = await cli(join(dir, 'contender'), { ...options, sessionFile: file }, 'CURRENT_INPUT_MARKER unowned writer');
      assert(readFileSync(file).equals(before), 'unowned process changed the session bytes');
      assert.deepEqual(readFileSync(file + '.pi-compact-state.json.lock'), lock);
      assert.equal(contender.events.filter(e => ['normal-request', 'native-request'].includes(e.event)).length, 0);
      assert.notEqual(contender.code, 0);
      await t.text('CURRENT_INPUT_MARKER owner still usable');
      await waitFor(() => count(t, 'agent_settled'), 'owner prompt');
      assert.equal(count(t, 'normal-request'), 1);
      await t.capture('owner');
    } finally { await t.stop(); }
  },
  async shared() {
    const result = await cli(join(dir, 'shared-manager'), { ...options, seed: 100, extraEnv: { PI_FIXTURE_PROBE: 'shared-manager' } });
    const probe = result.events.find(e => e.event === 'shared-manager-probe');
    assert(probe?.error);
    assert.equal(probe.unchanged, true);
    assert.equal(result.events.filter(e => e.event === 'normal-request').length, 1);
  },
};
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cases)) {
  try { await cases[name](); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: String(error), stack: error.stack }); }
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ provenance, results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
console.log(dir);
assert(results.every(r => r.pass), 'P1 regression contracts');
