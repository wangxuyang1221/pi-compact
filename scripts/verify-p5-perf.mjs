import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tui, root, waitFor, provenance } from './fixture/runtime.mjs';
const dir = join(root, 'artifacts/P5-development/perf', String(Date.now()));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'runner.json'), JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
const method = { claim: 'Actual host collapsed component render and invalidate+resize add <= 2ms p95 at 20/90/120 cells; fixture success to terminal write <=100ms.',
  samplesPerSide: 1000, groups: 5, warmup: 200, order: 'alternate native/head; reverse initial order each group',
  timed: 'synchronous component.render or component.invalidate+render; new and native separately instantiated with identical summary',
  excluded: 'assertions, text checks, log writes, PNG conversion, video encoding, network, CPU profile',
  endToEnd: 'compaction_end subscriber to first completed terminal.write containing Context compacted; terminal write is not monitor photon latency',
  machine: { load: execFileSync('uptime', { encoding: 'utf8' }).trim(), cores: execFileSync('sysctl', ['-n', 'hw.ncpu'], { encoding: 'utf8' }).trim() }, provenance };
writeFileSync(join(dir, 'method.json'), JSON.stringify(method, null, 2));
for (const profile of [false, true]) {
  const path = join(dir, profile ? 'profile' : 'measured');
  const t = await tui(path, { observer: false, extensions: [join(root, 'scripts/p5/observer.ts')], seed: 800, captureReady: false, profile,
    extraEnv: { PI_FIXTURE_P5_PROFILE: profile ? '1' : '0' } });
  try {
    await t.text('/compact');
    await waitFor(() => t.log().some(e => e.event === 'p5-first-frame'), 'first frame');
    await t.text('/p5-perf ' + join(path, 'samples.json'));
    await waitFor(() => t.log().some(e => e.event === 'p5-perf-done'), 'component benchmark', 50000);
    assert.equal(t.log().filter(e => e.event === 'native-request').length, 1);
    assert.equal(t.log().filter(e => e.event === 'normal-request').length, 0);
    assert(t.log().find(e => e.event === 'p5-first-frame').ms <= 100);
  } finally { await t.stop(); }
}
const cpuFile = readdirSync(join(dir, 'profile')).find(f => f.endsWith('.cpuprofile'));
const cpu = JSON.parse(readFileSync(join(dir, 'profile', cpuFile), 'utf8'));
const nodes = new Map(cpu.nodes.map(n => [n.id, n]));
const times = new Map();
for (let i = 0; i < cpu.samples.length; i++) times.set(cpu.samples[i], (times.get(cpu.samples[i]) ?? 0) + cpu.timeDeltas[i]);
const top = [...times].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id, us]) => ({ us, ...nodes.get(id).callFrame }));
writeFileSync(join(dir, 'profile-summary.json'), JSON.stringify(top, null, 2));
const raw = JSON.parse(readFileSync(join(dir, 'measured/samples.json'), 'utf8'));
const records = raw.records.map(({ samples: _samples, ...rest }) => rest);
const summary = { pass: raw.pass, checksum: raw.checksum, errors: raw.errors, records, method, profileSummary: top.slice(0, 10) };
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(dir);
