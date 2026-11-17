import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { root } from '../fixture/runtime.mjs';
const base = join(root, 'artifacts/P5-development');
const latest = name => readFileSync(join(base, name + '.log'), 'utf8').trim().split('\n').at(-1);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const events = path => readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const live = latest('live'), perf = latest('perf'), pack = latest('package'), demo = latest('demo'), disposal = latest('disposal');
const liveResult = json(join(live, 'result.json'));
assert(liveResult.results.every(r => r.pass));
const product = Object.fromEntries(readdirSync(join(root, 'src'), { recursive: true }).filter(p => p.endsWith('.ts')).map(p => ['src/' + p, hash(join(root, 'src', p))]));
for (const [path, sha] of Object.entries(product)) assert.equal(liveResult.provenance.source[path], sha, `live source ${path}`);
const manual = events(join(live, 'manual/events.jsonl'));
assert.equal(manual.filter(e => e.event === 'native-request').length, 1);
assert.equal(manual.filter(e => e.event === 'normal-request').length, 0);
assert.equal(manual.filter(e => e.event === 'ready').length, 4);
assert(manual.findLast(e => e.event === 'p5-shutdown').registryReleased);
assert(manual.findLast(e => e.event === 'p5-shutdown').addRestored);
for (const lane of ['manual', 'automatic']) {
  const log = events(join(live, lane, 'events.jsonl'));
  assert.equal(log.filter(e => e.event === 'compaction_end' && e.success).length, 1);
  assert.equal(events(join(live, lane, 'session.jsonl')).filter(e => e.type === 'compaction').length, 1);
}
for (const lane of ['failure', 'delay']) {
  const log = events(join(live, lane, 'events.jsonl'));
  assert.equal(log.filter(e => e.event === 'compaction_end' && e.success).length, 0);
  assert.equal(events(join(live, lane, 'session.jsonl')).filter(e => e.type === 'compaction').length, 0);
  assert.equal(log.filter(e => e.event === 'normal-request').length, 0);
}
const rawPerf = json(join(perf, 'measured/samples.json'));
assert(rawPerf.pass && rawPerf.errors === 0 && rawPerf.groups === 5 && rawPerf.samplesPerSide === 1000);
assert.equal(rawPerf.records.length, 30);
const perfGroups = [];
for (const width of [20, 90, 120]) for (const operation of ['render', 'resize']) {
  const rows = rawPerf.records.filter(r => r.width === width && r.operation === operation);
  const values = rows.map(r => r.added.p95).sort((a, b) => a - b);
  perfGroups.push({ width, operation, addedP95MedianMs: values[2], minMs: values[0], maxMs: values[4], nativeP95Ms: rows.map(r => r.baseline.p95), headP95Ms: rows.map(r => r.head.p95) });
}
const frames = ['manual', 'automatic'].map(lane => ({ lane, ms: events(join(live, lane, 'events.jsonl')).find(e => e.event === 'p5-first-frame').ms }));
frames.push({ lane: 'perf-measured', ms: events(join(perf, 'measured/events.jsonl')).find(e => e.event === 'p5-first-frame').ms });
assert(frames.every(e => e.ms <= 100));
const audit = json(join(pack, 'audit.json'));
assert.equal(hash(join(root, audit.tgz)), audit.sha256);
for (const [path, sha] of Object.entries(product)) assert.equal(hash(join(pack, 'package', path)), sha, `package source ${path}`);
assert(json(join(pack, 'package-run/result.json')).pass);
assert(json(join(pack, 'downgrade-run/result.json')).pass);
const directDispose = events(join(disposal, 'events.jsonl')).find(e => e.event === 'p5-disposed');
assert(directDispose.uiRegistryReleased && directDispose.safetyRegistryReleased && directDispose.addRestored && directDispose.disposeRestored && directDispose.lockReleased);
assert.equal(readFileSync(join(disposal, 'stderr.txt'), 'utf8'), '');
const video = json(join(demo, 'recording.json'));
assert(video.durationSeconds >= 30 && video.durationSeconds <= 60);
for (const [path, sha] of Object.entries(product)) assert.equal(video.provenance.source[path], sha, `video source ${path}`);
const roots = [base, latest('p1-fixes'), latest('p1-scope')];
const allFiles = [...new Set(roots.flatMap(dir => readdirSync(dir, { recursive: true }).map(path => join(dir, path))))];
const logs = allFiles.filter(path => path.endsWith('/events.jsonl'));
const allEvents = logs.flatMap(path => events(path));
assert.equal(allEvents.filter(e => e.event === 'network-blocked').length, 0);
const pids = new Set(allEvents.filter(e => e.event === 'preload').map(e => e.pid));
const cleanups = allFiles.filter(path => path.endsWith('/cleanup.json') && path !== join(base, 'cleanup.json')).map(path => ({ path: relative(root, path), ...json(path) }));
for (const clean of cleanups) {
  clean.panePids?.forEach(pid => pids.add(pid));
  assert.deepEqual(clean.alive, []);
  assert.equal(clean.socketExists, false);
  assert.equal(clean.listenerCheck.stdout, '');
}
for (const path of allFiles.filter(path => path.endsWith('/runner.json'))) pids.add(json(path).pid);
const alive = [...pids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
assert.deepEqual(alive, []);
const listener = spawnSync('lsof', ['-nP', '-a', '-p', [...pids].join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
assert.equal(listener.stdout, '');
const sockets = readdirSync(root).filter(p => p.endsWith('.sock'));
assert.deepEqual(sockets, []);
const ps = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n').filter(line => line.includes(root) && /(?:tmux|bundle\/cli|verify-p5|record-p5)/.test(line));
assert.deepEqual(ps, []);
const protectedFiles = ['src/pi-adapter/session.ts', 'src/pi-adapter/journal.ts', 'src/pi-adapter/compatibility.ts', 'src/state.ts', 'docs/design.md', 'docs/roadmap.md', 'docs/p1-adapter.md', 'tests/adapter.test.ts', 'tests/persistence.test.ts', 'scripts/fixture', 'scripts/regressions', 'scripts/verify-p1-fixes.mjs', 'scripts/verify-p1-scope.mjs', 'scripts/verify-perf.mjs'];
execFileSync('git', ['diff', '--exit-code', '82c33d45ba7b351c9cefbfa2390d651953c80f31', '--', ...protectedFiles], { cwd: root });
const compact = { verdict: 'PASS development candidate on P1; final P5 pending P4', paths: { live, perf, pack, demo, disposal, p1Fixes: latest('p1-fixes'), p1Scope: latest('p1-scope') }, product,
  scenarios: liveResult.results, performance: { groups: perfGroups, firstFrames: frames, limiter: 'synchronous ANSI width/truncation, native layout invalidation and theme formatting; see profile-summary.json. Assertions are outside timed regions.' },
  package: { sha256: audit.sha256, tgz: audit.tgz, files: audit.files }, video: { durationSeconds: video.durationSeconds, frames: video.frames, source: video.source },
  cleanup: { checkedPids: [...pids], alive, sockets, listenerCheck: { status: listener.status, stdout: listener.stdout, stderr: listener.stderr }, tmuxCleanups: cleanups.length, rootProcessMatches: ps },
  directDispose, networkBlocked: 0, protectedFilesUnchanged: protectedFiles };
writeFileSync(join(base, 'evidence-summary.json'), JSON.stringify(compact, null, 2));
writeFileSync(join(base, 'cleanup.json'), JSON.stringify(compact.cleanup, null, 2));
console.log(JSON.stringify({ pass: true, pids: pids.size, scenarios: liveResult.results.length, performanceGroups: rawPerf.records.length, package: audit.sha256, videoSeconds: video.durationSeconds }));
