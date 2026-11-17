import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../..', import.meta.url));
const base = join(root, 'artifacts/P2-fixes');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const frozen = JSON.parse(readFileSync(join(base, 'final-source.json')));
const sourceMismatch = Object.entries(frozen).filter(([file, digest]) => hash(join(root, file)) !== digest);
assert.equal(sourceMismatch.length, 0);
const files = readdirSync(base, { recursive: true });
const pids = new Set();
let networkAttempts = 0;
for (const file of files.filter(file => file.endsWith('/events.jsonl'))) {
  for (const line of readFileSync(join(base, file), 'utf8').trim().split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.event === 'preload') pids.add(event.pid);
    if (event.event === 'network-blocked') networkAttempts++;
  }
}
for (const file of files.filter(file => file.endsWith('/cleanup.json'))) {
  for (const pid of JSON.parse(readFileSync(join(base, file))).panePids ?? []) pids.add(pid);
}
const alive = [...pids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
const sockets = [...readdirSync(root).filter(file => file.endsWith('.sock')), ...files.filter(file => file.endsWith('.sock'))];
const listener = spawnSync('lsof', ['-nP', '-a', '-p', [...pids].join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
assert.deepEqual(alive, []); assert.deepEqual(sockets, []); assert.equal(listener.stdout, ''); assert.equal(networkAttempts, 0);
const oldEvidenceDiff = execFileSync('git', ['diff', '408293f206eb871f9299b46a7b7105227b9bbb6b', '--', 'artifacts/P1', 'artifacts/P2'], { cwd: root, encoding: 'utf8' });
assert.equal(oldEvidenceDiff, '');
const regression = files.filter(file => /^regression-\d+\/result.json$/.test(file)).sort().at(-1);
const cases = JSON.parse(readFileSync(join(base, regression))).results;
assert.equal(cases.length, 11); assert(cases.every(row => row.status === 'PASS'));
const checks = join(base, 'checks/artifacts');
const live = JSON.parse(readFileSync(join(checks, 'P2/live-results.json')));
assert.equal(live.length, 10); assert(live.every(row => row.status === 'PASS'));
const perf = JSON.parse(readFileSync(join(checks, 'P2/perf-results.json')));
assert(perf.pass); assert.equal(perf.config.samples, 60);
const configRows = JSON.parse(readFileSync(join(perf.path, 'config/samples.json')));
assert.equal(configRows.length, 60);
assert(configRows.every(row => row.enterToOutputMs >= 0 && row.enterToOutputMs <= row.enterToCaptureMs));
const samples = JSON.parse(readFileSync(join(perf.path, 'samples.json')));
assert.equal(samples.length, 10);
const method = JSON.parse(readFileSync(join(perf.path, 'method.json')));
for (const [file, digest] of Object.entries(method.provenance.source)) assert.equal(hash(join(root, file)), digest, file);
const packageAudit = JSON.parse(readFileSync(join(checks, 'P2/package/audit.json')));
assert(packageAudit.pass); assert.equal(hash(join(base, 'package/pi-compact-0.1.0.tgz')), packageAudit.sha256);
const extras = ['persistence', 'capacity-recovery'].map(name => {
  const paths = files.filter(file => file.startsWith(name + '/') && file.endsWith('/result.json')).sort();
  const path = paths.at(-1); assert(path);
  const result = JSON.parse(readFileSync(join(base, path))); assert(result.pass);
  return { name, path, pass: true, native: result.native, normal: result.normal };
});
const summary = { sourceMismatch, sourceManifest: 'final-source.json', extras, regression, cases, live, perf: { bySize: perf.bySize, config: perf.config.byKind, continuation: perf.continuation }, package: { sha256: packageAudit.sha256, files: packageAudit.audit.length },
  cleanup: { pids: [...pids], alive, sockets, networkAttempts, listener: { exitCode: listener.status, stdout: listener.stdout } }, oldEvidenceUnchanged: true };
writeFileSync(join(base, 'audit-result.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: true, regression, pids: pids.size, sockets: sockets.length, oldEvidenceUnchanged: true }));
