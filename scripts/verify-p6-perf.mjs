import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { tui, root, waitFor, events } from './fixture/runtime.mjs';
import { options } from './p6/common.mjs';
import { sha } from './p6/package.mjs';
const dir = join(root, 'artifacts/P6/perf', String(Date.now()));
mkdirSync(dir, { recursive: true });
const pkg = join(root, 'artifacts/P6/release/package');
const method = { claim: 'Report local installed-package control costs and retained synthetic data. No speedup or model-quality claim.', pairs: 5, task: 'Twelve complete tool turns with 7000 filler characters each; identical native/head task and ledger.csv bytes', order: 'native then installed head for each pair; no parallel performance tests', timing: 'Compaction event start through event end minus measured fixture transport span; includes fsync, encoding and observer logging. Completion is command send until agent_settled observed with 30ms polling. Neither is network latency.', limiter: 'Separate CPU profile and stage profiler outputs; do not infer speedup if effects are smaller than variation', machine: { uptime: execFileSync('uptime', { encoding: 'utf8' }).trim(), cores: execFileSync('sysctl', ['-n', 'hw.ncpu'], { encoding: 'utf8' }).trim() }, tarballSHA: sha(join(root, 'artifacts/P6/release/pi-compact-0.1.0.tgz')) };
writeFileSync(join(dir, 'method.json'), JSON.stringify(method, null, 2));
const rows = [];
for (let i = 0; i < 5; i++) for (const variant of ['native', 'head']) {
  const t = await tui(join(dir, `${i}-${variant}`), options(pkg, { installed: variant === 'head' }));
  try {
    const command = async (text, event) => { const n = t.log().filter(e => e.event === event).length; await t.text(text); await waitFor(() => t.log().filter(e => e.event === event).length > n, text); };
    await command('/p6-task', 'p6-task-seeded');
    const fileSHA = sha(join(t.dir, 'cwd/ledger.csv'));
    const began = performance.now();
    await command('/compact', 'compaction_end');
    await command('CURRENT_INPUT_MARKER recall all facts pending file and tool results without modifying files', 'agent_settled');
    const completionMs = performance.now() - began;
    const log = t.log();
    const start = log.find(e => e.event === 'compaction_start'); const end = log.find(e => e.event === 'compaction_end');
    const transport = log.filter(e => e.event === 'transport-span' && e.at >= start.at && e.at <= end.at).reduce((n, e) => n + e.ms, 0);
    const requests = log.filter(e => e.event === 'actual-request');
    const recall = log.findLast(e => e.event === 'recall-evidence');
    const score = ['FACT_0=value_0', 'FACT_11=value_11', 'FACT_PENDING=idempotency_test', 'FACT_ROW=A1_pending', 'FACT_TOOL_11=result_11'].every(f => recall.recovered.includes(f)) && sha(join(t.dir, 'cwd/ledger.csv')) === fileSHA;
    assert(score && end.success && requests.length === 2);
    const normal = requests.find(e => e.phase === 'normal');
    rows.push({ i, variant, path: t.dir, readyMs: t.readyMs, inputBodyBytes: Buffer.byteLength(JSON.stringify(requests[0].body)), continuationBodyBytes: Buffer.byteLength(JSON.stringify(normal.body)), dispatches: requests.length, localIntervalMinusFixtureMs: end.at - start.at - transport, completionMs, score: 4, errors: 0, fileSHA });
    writeFileSync(join(dir, 'samples.json'), JSON.stringify(rows, null, 2));
  } finally { await t.stop(); }
}
const stats = values => { const v = [...values].sort((a,b) => a-b); return { n: v.length, min: v[0], median: v[Math.floor(v.length/2)], max: v.at(-1), p95: v[Math.ceil(v.length*.95)-1] }; };
const summary = Object.fromEntries(['native','head'].map(variant => [variant, Object.fromEntries(['readyMs','inputBodyBytes','continuationBodyBytes','localIntervalMinusFixtureMs','completionMs'].map(key => [key, stats(rows.filter(r => r.variant === variant).map(r => r[key]))]))]));
const startupDelta = stats(Array.from({length: 5}, (_,i) => rows.find(r => r.i === i && r.variant === 'head').readyMs - rows.find(r => r.i === i && r.variant === 'native').readyMs));
assert(startupDelta.p95 <= 150, 'P1 startup budget');
const checks = [
  ['hotpath', 'scripts/verify-p4-hotpath.mjs', { P4_HOT_PAIRS: '5' }],
  ['config', 'scripts/verify-p2-config.mjs', {}],
  ['protocol', 'scripts/verify-p3-perf.mjs', { P3_PAIRS: '5' }],
  ['restore', 'scripts/verify-p4-perf.mjs', { P4_PAIRS: '5' }],
  ['renderer', 'scripts/verify-p5-perf.mjs', {}],
  ['protocol-profile', 'scripts/verify-p3-perf.mjs', { P3_PAIRS: '1', P3_PROFILE: '1' }],
];
const stages = [];
for (const [name, script, extra] of checks) {
  const run = spawnSync(process.execPath, ['--import=./scripts/fixture/relative-socket.mjs', script], { cwd: root, env: { ...process.env, PI_TEST_ENTRY: join(pkg, 'src/index.ts'), ...extra }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(join(dir, name + '.log'), run.stdout + run.stderr);
  stages.push({ name, status: run.status, diagnostic: name.includes('profile') });
  writeFileSync(join(dir, 'stages.json'), JSON.stringify(stages, null, 2));
  console.log(JSON.stringify(stages.at(-1)));
}
assert(rows.every(r => events(r.path).filter(e => e.event === 'network-blocked').length === 0));
writeFileSync(join(dir, 'summary.json'), JSON.stringify({ method, summary, startupDelta, stages, verdict: 'Local fixture budgets only; no real-network or quality conclusion' }, null, 2));
console.log(dir);
assert(stages.filter(s => !s.diagnostic).every(s => s.status === 0), 'Stage budgets');
