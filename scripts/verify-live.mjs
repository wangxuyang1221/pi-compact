import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cli, tui, root, waitFor, provenance } from './fixture/runtime.mjs';
const flags = process.argv.slice(2);
if (flags.includes('--pr') && flags[flags.indexOf('--pr') + 1] === 'P2') { await import('./verify-p2.mjs'); process.exit(); }
const selected = flags.includes('--lane') ? Number(flags[flags.indexOf('--lane') + 1]) : undefined;
const base = flags.includes('--output') ? join(root, flags[flags.indexOf('--output') + 1]) : join(root, 'artifacts/P1');
const count = (t, event) => t.log().filter(item => item.event === event).length;
const ended = (t, n = 1) => waitFor(() => count(t, 'compaction_end') >= n, 'compaction completion');
const settled = (t, n = 1) => waitFor(() => count(t, 'agent_settled') >= n, 'agent settled');
const success = t => assert.equal(t.log().findLast(event => event.event === 'compaction_end')?.success, true);
const blocked = t => assert.equal(t.log().findLast(event => event.event === 'compaction_end')?.success, false);
const lanes = {
  async 1(dir) {
    for (const variant of ['baseline', 'head']) {
      const t = await tui(join(dir, variant), { variant, seed: 800 });
      try {
        await t.text('/compact KEEP_CUSTOM_MARKER'); await ended(t); success(t);
        assert.equal(count(t, 'native-request'), 1);
        assert.equal(t.log().find(event => event.event === 'native-request').instructions, true);
        assert.equal(t.log().findLast(event => event.event === 'compaction_end').checkpoints, 1);
        await t.capture('native');
      } finally { await t.stop(); }
    }
    copyFileSync(join(dir, 'head/native.png'), join(dir, 'native.png'));
  },
  async 2(dir) {
    const t = await tui(dir, { seed: 800 });
    try {
      await t.text('CURRENT_INPUT_MARKER ' + 'x'.repeat(35200)); await settled(t); success(t);
      const log = t.log();
      assert(log.findIndex(event => event.event === 'compaction_end') < log.findIndex(event => event.event === 'normal-request'));
      assert(log.find(event => event.event === 'prepare-input').currentInput);
      assert.equal(count(t, 'normal-request'), 1);
      await t.capture('first-input');
    } finally { await t.stop(); }
  },
  async 3(dir) {
    const seed = join(dir, 'seed');
    const result = await cli(seed, { variant: 'baseline', seed: 800 });
    assert.equal(result.code, 0);
    const t = await tui(join(dir, 'resume'), { sessionFile: join(seed, 'session.jsonl') });
    try {
      await t.text('CURRENT_INPUT_MARKER ' + 'x'.repeat(35600)); await settled(t); success(t);
      assert.equal(count(t, 'normal-request'), 1);
      assert(t.log().find(event => event.event === 'prepare-input').currentInput);
      await t.capture('resume');
      copyFileSync(join(t.dir, 'resume.png'), join(dir, 'resume.png'));
    } finally { await t.stop(); }
  },
  async 4(dir) {
    const t = await tui(dir, { tools: true });
    try {
      await t.text('CURRENT_INPUT_MARKER Run alpha beta gamma'); await settled(t); success(t);
      assert.deepEqual(t.log().filter(event => event.event === 'tool-complete').map(event => event.name), ['gamma', 'beta', 'alpha']);
      assert(t.log().findLastIndex(event => event.event === 'tool-complete') < t.log().findIndex(event => event.event === 'native-request'));
      assert.equal(count(t, 'normal-request'), 2);
      const session = readFileSync(join(dir, 'session.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
      assert.deepEqual(session.filter(entry => entry.message?.role === 'toolResult').map(entry => entry.message.toolCallId).sort(), ['call0|fc0', 'call1|fc1', 'call2|fc2']);
      await t.capture('tools');
    } finally { await t.stop(); }
  },
  async 5(dir) {
    const automatic = await tui(join(dir, 'automatic'), { seed: 800, mode: 'failure' });
    try {
      await automatic.text('CURRENT_INPUT_MARKER ' + 'x'.repeat(35200));
      await settled(automatic); blocked(automatic);
      assert.equal(count(automatic, 'native-request'), 1);
      assert.equal(count(automatic, 'normal-request'), 0);
      await automatic.text('/fixture-probe');
      await waitFor(() => count(automatic, 'probe-complete'), 'automatic failure entry probes');
      assert.equal(count(automatic, 'normal-request'), 0);
      await automatic.capture('automatic-failure');
    } finally { await automatic.stop(); }
    const t = await tui(dir, { seed: 800, mode: 'failure' });
    try {
      t.control({ mode: 'failure', retryFromFailureHook: true });
      await t.text('/compact'); await ended(t); blocked(t);
      await t.text('/fixture-probe'); await waitFor(() => count(t, 'probe-complete'), 'all entry probes');
      assert.equal(count(t, 'normal-request'), 0);
      assert.equal(count(t, 'native-request'), 1);
      const probe = t.log().find(event => event.event === 'probe-complete');
      assert(probe.after >= probe.before);
      assert.equal(probe.state, 'blocked');
      assert.equal(t.log().find(event => event.event === 'failure-hook-retry').rejected, true);
      assert.equal(probe.warming.state, 'inactive');
      assert.equal(probe.warmRunExists, false);
      await t.capture('failure');
    } finally { await t.stop(); }
  },
  async 6(dir) {
    const t = await tui(dir, { seed: 800, mode: 'delay' });
    try {
      await t.text('/compact'); await waitFor(() => count(t, 'native-request'), 'pending native request');
      await t.capture('pending'); t.key('Escape'); await ended(t); blocked(t);
      assert.equal(t.log().findLast(event => event.event === 'compaction_end').checkpoints, 0);
      assert.equal(count(t, 'normal-request'), 0);
      await t.capture('cancel');
    } finally { await t.stop(); }
  },
  async 7(dir) {
    const t = await tui(dir, { seed: 800, mode: 'delay' });
    try {
      t.control({ mode: 'delay', reentry: true });
      await t.text('/compact'); await waitFor(() => count(t, 'native-request'), 'pending request');
      await t.text('CURRENT_INPUT_MARKER queued during compact');
      t.key('Escape'); await ended(t); blocked(t);
      assert.equal(count(t, 'normal-request'), 0);
      assert.equal(count(t, 'native-request'), 1);
      assert.equal(count(t, 'reentry-rejected'), 1);
      t.control({ mode: 'success' });
      await t.text('/compact KEEP_CUSTOM_MARKER'); await ended(t, 2); success(t); await settled(t);
      assert.equal(count(t, 'normal-request'), 1);
      assert.equal(t.log().findLast(event => event.event === 'compaction_end').checkpoints, 1);
      await t.capture('reentry');
    } finally { await t.stop(); }
  },
  async 8(dir) {
    const one = await tui(join(dir, 'one'), { seed: 800, mode: 'delay' });
    const two = await tui(join(dir, 'two'), { seed: 800, mode: 'delay' });
    try {
      await one.text('/compact'); await two.text('/compact');
      await waitFor(() => count(one, 'native-request') && count(two, 'native-request'), 'both requests');
      one.key('Escape'); await ended(one); blocked(one);
      two.control({ mode: 'success' }); await ended(two); success(two);
      assert.equal(one.log().findLast(event => event.event === 'compaction_end').checkpoints, 0);
      assert.equal(two.log().findLast(event => event.event === 'compaction_end').checkpoints, 1);
      await one.capture('cancelled'); await two.capture('isolation');
      copyFileSync(join(two.dir, 'isolation.png'), join(dir, 'isolation.png'));
      await two.text('/fixture-isolation');
      await waitFor(() => count(two, 'same-process-continued'), 'same-process isolation');
      const isolation = two.log().find(event => event.event === 'same-process-isolation');
      assert.equal(isolation.one, 'blocked'); assert.equal(isolation.two, 'idle');
      assert.equal(isolation.oneCheckpoints, 0); assert.equal(isolation.twoCheckpoints, 1);
    } finally { await one.stop(); await two.stop(); }
  },
  async 9(dir) {
    const unsupported = await cli(join(dir, 'unsupported'), { unsupported: true });
    assert.equal(unsupported.code, 78);
    assert.equal(unsupported.events.filter(event => event.event === 'normal-request').length, 0);
    const t = await tui(join(dir, 'oversized'));
    try {
      await t.text('CURRENT_INPUT_MARKER ' + 'x'.repeat(40000)); await settled(t); blocked(t);
      assert.equal(count(t, 'normal-request'), 0);
      assert(count(t, 'native-request') <= 1);
      await t.capture('compatibility');
      copyFileSync(join(t.dir, 'compatibility.png'), join(dir, 'compatibility.png'));
    } finally { await t.stop(); }
    const disk = await tui(join(dir, 'disk'), { seed: 800 });
    try {
      await disk.text('/fixture-write-failure'); await waitFor(() => count(disk, 'write-failure-armed'), 'fault injection');
      await disk.text('/compact'); await ended(disk); blocked(disk);
      assert.equal(disk.log().findLast(event => event.event === 'compaction_end').checkpoints, 0);
      assert.equal(count(disk, 'normal-request'), 0);
      await disk.capture('native-write-failure');
    } finally { await disk.stop(); }
    const payload = await tui(join(dir, 'payload'));
    try {
      payload.control({ mode: 'success', mutatePayload: true });
      await payload.text('CURRENT_INPUT_MARKER payload conflict'); await settled(payload);
      assert.equal(count(payload, 'normal-request'), 0);
      await payload.text('/fixture-state'); await waitFor(() => count(payload, 'state'), 'payload state');
      assert.equal(payload.log().find(event => event.event === 'state').state, 'blocked');
      await payload.capture('payload-conflict');
    } finally { await payload.stop(); }
  },
  async 10(dir) {
    const t = await tui(join(dir, 'reload'), { seed: 800, mode: 'failure' });
    try {
      await t.text('/compact'); await ended(t); blocked(t);
      for (let n = 1; n <= 2; n++) {
        await t.text('/reload');
        await waitFor(() => t.log().filter(event => event.event === 'session-start' && event.reason === 'reload').length >= n, 'reload');
      }
      await t.text('/fixture-probe'); await waitFor(() => count(t, 'probe-complete'), 'blocked after reload');
      assert.equal(count(t, 'normal-request'), 0); assert.equal(count(t, 'native-request'), 1);
      await t.capture('reload'); copyFileSync(join(t.dir, 'reload.png'), join(dir, 'reload.png'));
    } finally { await t.stop(); }
    const resumed = await tui(join(dir, 'recovery'), { sessionFile: join(t.dir, 'session.jsonl') });
    try {
      await resumed.text('/fixture-state'); await waitFor(() => count(resumed, 'state'), 'recovery state');
      assert.equal(resumed.log().find(event => event.event === 'state').state, 'blocked');
      await resumed.text('/fixture-probe'); await waitFor(() => count(resumed, 'probe-complete'), 'recovery probes');
      assert.equal(count(resumed, 'normal-request'), 0); assert.equal(count(resumed, 'native-request'), 0);
      await resumed.capture('recovery');
    } finally { await resumed.stop(); }
  },
};
mkdirSync(base, { recursive: true });
const results = [];
for (const [number, run] of Object.entries(lanes)) {
  if (selected && Number(number) !== selected) continue;
  const dir = join(base, `lane-${number}`);
  if (existsSync(dir)) { mkdirSync(join(base, 'attempts'), { recursive: true }); renameSync(dir, join(base, 'attempts', `${Date.now()}-lane-${number}`)); }
  mkdirSync(dir, { recursive: true });
  try { await run(dir); results.push({ lane: Number(number), status: 'PASS' }); }
  catch (error) { results.push({ lane: Number(number), status: 'FAIL', error: String(error), stack: error.stack }); }
  writeFileSync(join(dir, 'verdict.json'), JSON.stringify({ ...results.at(-1), provenance, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
writeFileSync(join(base, selected ? `lane-${selected}-run.json` : 'live-results.json'), JSON.stringify(results, null, 2));
if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
