import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
const root = process.cwd(), base = resolve('artifacts/P2-reconstruction');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const since = 1794817281392;
const fresh = dir => existsSync(dir) ? readdirSync(dir).filter(name => Number(name.match(/\d{13}/)?.[0]) >= since).map(name => join(dir, name)) : [];
const scopes = [base, ...fresh('artifacts/P2-fixes'), ...fresh('artifacts/P2-fixes/persistence'), ...fresh('artifacts/P1-fixes/runs'), ...fresh('artifacts/P1-scope/runs'), ...[2, 3, 7].map(n => `artifacts/P2/lane-${n}`), ...fresh('artifacts/P2/attempts')].filter(existsSync).map(path => resolve(path));
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() && !['node_modules', 'unpack', 'tmp'].includes(entry.name) ? walk(join(dir, entry.name)) : entry.isFile() ? [join(dir, entry.name)] : []);
const files = [...new Set(scopes.flatMap(walk))];
const eventFiles = files.filter(p => p.endsWith('/events.jsonl'));
const pids = new Set(), sockets = [], runs = [];
for (const path of eventFiles) {
  const events = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const dir = path.slice(0, -'/events.jsonl'.length);
  events.filter(e => e.event === 'preload').forEach(e => pids.add(e.pid));
  assert.equal(events.filter(e => e.event === 'network-blocked').length, 0, path);
  const cleanupPath = join(dir, 'cleanup.json');
  if (existsSync(cleanupPath)) {
    const cleanup = JSON.parse(readFileSync(cleanupPath));
    cleanup.panePids.forEach(pid => pids.add(pid));
    assert.deepEqual(cleanup.alive, []);
    assert.equal(cleanup.socketExists, false);
    assert.equal(cleanup.listenerCheck.stdout, '');
  }
  const socket = join(root, createHash('sha256').update(dir).digest('hex').slice(0, 8) + '.sock');
  assert(!existsSync(socket), socket);
  sockets.push(socket);
  runs.push({ path: relative(root, dir), events: events.length, native: events.filter(e => e.event === 'native-request').length, normal: events.filter(e => e.event === 'normal-request').length });
}
const alive = [...pids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
assert.deepEqual(alive, []);
const listeners = spawnSync('lsof', ['-nP', '-a', '-p', [...pids].join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
assert.equal(listeners.stdout, '');
const evidence = Object.fromEntries(files.filter(p => /\.(jsonl|json|log|mjs|ts|tgz)$/.test(p) && !/\/(agent|unpack|tmp)\//.test(p) && !p.endsWith('/audit.log') && !p.endsWith('/audit-result.json') && !p.endsWith('/evidence-manifest.json')).map(p => [relative(root, p), hash(p)]));
writeFileSync(join(base, 'evidence-manifest.json'), JSON.stringify(evidence, null, 2));
const source = Object.fromEntries(['src', 'scripts', 'tests'].flatMap(dir => walk(dir)).filter(p => /\.(ts|mjs|py)$/.test(p)).map(p => [p, hash(p)]));
writeFileSync(join(base, 'final-source.json'), JSON.stringify(source, null, 2));
const finalPerf = JSON.parse(readFileSync(join(base, 'perf/1794818528817/method.json')));
for (const [path, sha] of Object.entries(finalPerf.provenance.source).filter(([p]) => p.startsWith('src/'))) assert.equal(source[path], sha, path);
const green = JSON.parse(readFileSync(join(base, 'run-1794818499100/result.json')));
assert.equal(green.results.length, 18); assert(green.results.every(r => r.status === 'PASS'));
for (const [path, sha] of Object.entries(green.provenance.source).filter(([p]) => p.startsWith('src/'))) assert.equal(source[path], sha, path);
const result = { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), worktree: root,
  scopes, runs, pids: [...pids], alive, socketsChecked: sockets.length, listenerCheck: { status: listeners.status, stdout: listeners.stdout, stderr: listeners.stderr }, networkBlocked: 0,
  source, finalPerfSourceMatches: true, greenSourceMatches: true, rawFiles: Object.keys(evidence).length };
writeFileSync(join(base, 'audit-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ runs: runs.length, pids: pids.size, alive, sockets: sockets.length, rawFiles: result.rawFiles }));
