import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, cli, tui, waitFor, provenance } from './fixture/runtime.mjs';
import { options, count, input } from './p2/common.mjs';
const args = process.argv.slice(2);
const pairs = args.includes('--pairs') ? Number(args[args.indexOf('--pairs') + 1]) : 5;
const dir = join(root, 'artifacts/P2-reconstruction/perf', String(Date.now())); mkdirSync(dir, { recursive: true });
const configure = path => {
  options.configure(path);
  const file = join(path, 'agent/models.json'); const data = JSON.parse(readFileSync(file)); data.providers.fixture.models[0].contextWindow = 200000; writeFileSync(file, JSON.stringify(data));
};
const perfOptions = size => ({ ...options, configure, extensions: [...options.extensions, join(root, 'scripts/p2/perf-observer.ts')], extraEnv: { PI_P2_MESSAGES: String(size) }, captureReady: false });
const method = { claim: 'Bounded check of total local request boundary p95 delta <=10ms against ordinary native Pi, paired samples per size. No speedup claim.', pairs, sizes: [1000, 10000],
  order: '1000 then 10000, alternating baseline/head in each pair', region: 'Awaited agent.prepareRequest and transformContext plus synchronous stream invocation. Includes projection and settings I/O; excludes model network and responses.',
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
      assert(JSON.stringify(t.log().find(e => e.event === 'normal-request')).includes('CURRENT_INPUT_MARKER'));
      assert(readFileSync(join(t.dir, 'session.jsonl'), 'utf8').includes('Synthetic complete.'));
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
const bySize = [1000,10000].map(size => ({ size, baseline: stats(samples.filter(s => s.size === size).map(s => s.baseline.prepareMs)), head: stats(samples.filter(s => s.size === size).map(s => s.head.prepareMs)), added: stats(samples.filter(s => s.size === size).map(s => s.addedMs)) }));
const result = { path: dir, bySize, pass: bySize.every(s => s.added.p95 <= 10) };
writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); assert(result.pass, 'local boundary budget');
