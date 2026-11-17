import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, cli, tui, waitFor, provenance } from './fixture/runtime.mjs';
import { options, count, input } from './p2/common.mjs';
import { verifyConfig } from './p2/verify-config.mjs';
import { verifyResume } from './p2/verify-resume.mjs';
const args = process.argv.slice(2);
const pairs = args.includes('--pairs') ? Number(args[args.indexOf('--pairs') + 1]) : 30;
const dir = join(root, 'artifacts/P2/perf', String(Date.now())); mkdirSync(dir, { recursive: true });
const configure = path => {
  options.configure(path);
  const file = join(path, 'agent/models.json'); const data = JSON.parse(readFileSync(file)); data.providers.fixture.models[0].contextWindow = 200000; writeFileSync(file, JSON.stringify(data));
};
const perfOptions = size => ({ ...options, configure, extensions: [...options.extensions, join(root, 'scripts/p2/perf-observer.ts')], extraEnv: { PI_P2_MESSAGES: String(size) }, captureReady: false });
const method = { claim: 'Local request boundary p95 delta <=10ms, TUI config response p95 <=100ms, fixture success to continuation p95 <=500ms.', pairs, sizes: [1000, 10000],
  order: '1000 then 10000, alternating baseline/head in each pair', region: 'Awaited agent.prepareRequest and transformContext plus synchronous stream invocation. Includes projection and settings I/O; excludes model network and responses.',
  command: 'After seed and native UI readiness acknowledgement, hrtime before Enter through unique terminal stdout. Handler, stdin and capture delays remain separate.',
  continuation: 'From fixture-success before synthetic SSE response to first normal-request after auto compaction.',
  workload: 'Fixed alternating one-character user and zero-usage assistant messages. Both sides 200000 context window, no compaction in timed request, isolated agentDir and denied network.',
  machine: { load: execFileSync('uptime', { encoding: 'utf8' }).trim(), cores: execFileSync('sysctl', ['-n', 'hw.ncpu'], { encoding: 'utf8' }).trim() }, provenance };
writeFileSync(join(dir, 'method.json'), JSON.stringify(method, null, 2));
if (args.includes('--profile')) {
const profile = await cli(join(dir, 'profile'), { ...perfOptions(10000), profile: true });
assert.equal(profile.events.filter(e => e.event === 'normal-request').length, 1);
const cpu = JSON.parse(readFileSync(join(dir, 'profile', readdirSync(join(dir, 'profile')).find(p => p.endsWith('.cpuprofile')))));
const nodes = new Map(cpu.nodes.map(n => [n.id, n])); const times = new Map();
for (let i = 0; i < cpu.samples.length; i++) times.set(cpu.samples[i], (times.get(cpu.samples[i]) ?? 0) + cpu.timeDeltas[i]);
writeFileSync(join(dir, 'profile-summary.json'), JSON.stringify([...times].sort((a,b) => b[1] - a[1]).slice(0, 30).map(([id, us]) => ({ us, ...nodes.get(id).callFrame })), null, 2));
}
const samples = [];
for (const size of [1000, 10000]) for (let index = 0; index < pairs; index++) {
  const pair = { size, index };
  for (const variant of ['baseline', 'head']) {
    const t = await tui(join(dir, `${size}-${index}-${variant}`), { ...perfOptions(size), variant });
    try {
      await waitFor(() => count(t, 'perf-seed'), 'complete synthetic seed');
      await t.text(input); await waitFor(() => count(t, 'agent_settled'), 'timed request');
      assert.equal(count(t, 'normal-request'), 1); assert.equal(count(t, 'native-request'), 0); assert.equal(count(t, 'network-blocked'), 0);
      assert.equal(t.log().find(e => e.event === 'perf-seed').messages, size);
      const prepares = t.log().filter(e => e.event === 'prepare-duration'); const streams = t.log().filter(e => e.event === 'stream-duration'); const transforms = t.log().filter(e => e.event === 'transform-duration');
      assert.equal(prepares.length, 1); assert.equal(streams.length, 1); assert.equal(transforms.length, 1);
      pair[variant] = { prepareMs: prepares[0].ms + transforms[0].ms + streams[0].ms, transformMs: transforms[0].ms, normalRequests: 1, errors: 0 };
    } finally { await t.stop(); }
  }
  samples.push({ ...pair, addedMs: pair.head.prepareMs - pair.baseline.prepareMs });
  writeFileSync(join(dir, 'samples.json'), JSON.stringify(samples, null, 2));
  if ((index + 1) % 5 === 0) console.log(JSON.stringify({ size, pairs: index + 1 }));
}
const stats = values => { values = [...values].sort((a,b) => a-b); return { count: values.length, min: values[0], median: values[Math.floor(values.length / 2)], p95: values[Math.ceil(values.length * .95) - 1], max: values.at(-1) }; };
const continuation = [3,4,9].map(lane => {
  const path = join(root, 'artifacts/P2', `lane-${lane}`, lane === 4 ? 'restart/events.jsonl' : 'events.jsonl');
  const events = readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse); const complete = events.find(e => e.event === 'fixture-success');
  const request = events.find(e => e.event === 'normal-request' && e.at > complete.at); assert(request);
  return { lane, ms: request.at - complete.at };
});
const bySize = [1000,10000].map(size => ({ size, baseline: stats(samples.filter(s => s.size === size).map(s => s.baseline.prepareMs)), head: stats(samples.filter(s => s.size === size).map(s => s.head.prepareMs)), added: stats(samples.filter(s => s.size === size).map(s => s.addedMs)) }));
const resume = pairs >= 30 ? await verifyResume(pairs) : undefined;
const config = await verifyConfig(join(dir, 'config'));
const result = { path: dir, bySize, config, continuation, continuationStats: resume ?? stats(continuation.map(s => s.ms)) };
result.pass = bySize.every(s => s.added.p95 <= 10) && result.config.pass && result.continuationStats.p95 <=500;
writeFileSync(join(root, 'artifacts/P2/perf-results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); assert(result.pass, 'P2 performance budgets');
