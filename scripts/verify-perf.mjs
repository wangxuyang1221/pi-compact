import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, cli, tui, waitFor, provenance, sourceHashes } from './fixture/runtime.mjs';
const dir = join(root, 'artifacts/P1/perf', String(Date.now()));
mkdirSync(dir, { recursive: true });
const method = {
  claim: 'Under a fixed synthetic workload, head adds at most 10 ms p95 at the request boundary and 150 ms p95 until the real TUI editor is ready.',
  workload: '100 repeats of synthetic old history, one retained user turn, then one short prompt; no compaction; zero real network.',
  start: 'Parent spawn of isolated tmux server through actual shim until screen contains editor border and selected model.',
  prepare: 'Sum the awaited prepareRequest chain, stream invocation, and final provider onPayload callback. The same observer measures both sides; provider transport and response time are excluded.',
  count: 30, order: 'baseline then head, alternating on the same machine',
  baseline: 'Pi 1.5.2 without pi-compact; fixture observer only',
  cache: 'JITI disk cache disabled for both sides; OS and Node compile caches not flushed; same setting on both.',
  machine: { load: execFileSync('uptime', { encoding: 'utf8' }).trim(), cores: execFileSync('sysctl', ['-n', 'hw.ncpu'], { encoding: 'utf8' }).trim() },
  provenance,
};
writeFileSync(join(dir, 'method.json'), JSON.stringify(method, null, 2));
const profile = await cli(join(dir, 'profile'), { profile: true, seed: 100 });
assert.equal(profile.events.filter(event => event.event === 'normal-request').length, 1);
const profileFile = readdirSync(join(dir, 'profile')).find(file => file.endsWith('.cpuprofile'));
const cpu = JSON.parse(readFileSync(join(dir, 'profile', profileFile), 'utf8'));
const nodes = new Map(cpu.nodes.map(node => [node.id, node]));
const time = new Map();
for (let n = 0; n < cpu.samples.length; n++) time.set(cpu.samples[n], (time.get(cpu.samples[n]) ?? 0) + cpu.timeDeltas[n]);
writeFileSync(join(dir, 'profile-summary.json'), JSON.stringify([...time].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, us]) => ({ us, ...nodes.get(id).callFrame })), null, 2));
const samples = [];
for (let index = 0; index < 30; index++) {
  const pair = {};
  for (const variant of ['baseline', 'head']) {
    const t = await tui(join(dir, `${index}-${variant}`), { variant, seed: 100, captureReady: false });
    try {
      await t.text('CURRENT_INPUT_MARKER fixed benchmark prompt');
      await waitFor(() => t.log().some(event => event.event === 'agent_settled'), 'benchmark completion');
      const events = t.log();
      assert.equal(events.filter(event => event.event === 'normal-request').length, 1);
      assert.equal(events.filter(event => event.event === 'native-request').length, 0);
      assert.equal(events.filter(event => event.event === 'network-blocked').length, 0);
      assert.equal(events.find(event => event.event === 'agent_settled').outcome, 'stop');
      const boundaries = ['prepare-duration', 'stream-duration', 'payload-duration'];
      for (const event of boundaries) assert.equal(events.filter(item => item.event === event).length, 1);
      const duration = events.filter(event => boundaries.includes(event.event)).reduce((sum, event) => sum + event.ms, 0);
      pair[variant] = { startupMs: t.readyMs, prepareMs: duration,
        requestToSettledMs: events.find(event => event.event === 'agent_settled').at - events.find(event => event.event === 'normal-request').at,
        normalRequests: 1, errors: 0 };
    } finally { await t.stop(); }
  }
  samples.push({ index, ...pair, addedStartupMs: pair.head.startupMs - pair.baseline.startupMs, addedPrepareMs: pair.head.prepareMs - pair.baseline.prepareMs });
  writeFileSync(join(dir, 'samples.json'), JSON.stringify(samples, null, 2));
  if ((index + 1) % 10 === 0) console.log(`Completed ${index + 1}/30 alternating pairs`);
}
const stats = values => {
  values = [...values].sort((a, b) => a - b);
  return { min: values[0], max: values.at(-1), median: (values[14] + values[15]) / 2, p95: values[Math.ceil(values.length * 0.95) - 1] };
};
const continuation = ['lane-2', 'lane-3/resume', 'lane-4', 'lane-7'].map(lane => {
  const events = readFileSync(join(root, 'artifacts/P1', lane, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const complete = events.findLast(event => event.event === 'compaction_end' && event.success);
  const request = events.find(event => event.event === 'normal-request' && event.at > complete.at);
  assert(request, 'fixture continuation reached the network boundary');
  return { lane, successToRequestMs: request.at - complete.at };
});
const summary = { continuation, path: dir, method, baseline: { startup: stats(samples.map(s => s.baseline.startupMs)), prepare: stats(samples.map(s => s.baseline.prepareMs)) },
  head: { startup: stats(samples.map(s => s.head.startupMs)), prepare: stats(samples.map(s => s.head.prepareMs)) },
  addedStartup: stats(samples.map(s => s.addedStartupMs)), addedPrepare: stats(samples.map(s => s.addedPrepareMs)) };
assert.deepEqual(sourceHashes(), provenance.source, 'benchmark source remained unchanged');
summary.pass = summary.addedStartup.p95 <= 150 && summary.addedPrepare.p95 <= 10 && continuation.every(sample => sample.successToRequestMs <= 500);
writeFileSync(join(root, 'artifacts/P1/perf-results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, addedStartup: summary.addedStartup, addedPrepare: summary.addedPrepare }));
assert(summary.pass, 'P1 performance budgets');
