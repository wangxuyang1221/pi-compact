import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root } from '../fixture/runtime.mjs';
const base = join(root, 'artifacts/P2');
const rows = path => readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name); if (['tmp', 'unpack', 'accidental-P1'].includes(name)) return [];
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const audit = [];
for (let lane = 1; lane <=10; lane++) {
  const dir = join(base, `lane-${lane}`); assert.equal(JSON.parse(readFileSync(join(dir, 'verdict.json'))).status, 'PASS');
  const paths = walk(dir).filter(p => p.endsWith('events.jsonl')); const events = paths.flatMap(rows);
  assert.equal(events.filter(e => e.event === 'network-blocked').length, 0);
  const budgets = events.filter(e => e.event === 'budget'); for (const budget of budgets) assert.equal(budget.actual, budget.target);
  if (lane === 2) { assert.equal(events.filter(e => e.event === 'native-request').length, 0); assert(events.some(e => e.event === 'transport-context' && e.tokens === 8999)); }
  if (lane === 3) { assert.equal(events.filter(e => e.event === 'native-request').length, 1); assert(events.some(e => e.event === 'threshold-check' && e.rawTokens ===9000 && e.result)); }
  if (lane === 9) { assert(events.find(e => e.event === 'fixture-success').at - events.find(e => e.event === 'native-request').at >60000); }
  if (lane === 10) { const before = readFileSync(join(dir, 'before.jsonl')); const after = readFileSync(join(dir, 'after.jsonl')); assert(after.subarray(0,before.length).equals(before)); assert.equal(events.filter(e => e.event === 'normal-request').length, 0); }
  const cleanup = walk(dir).filter(p => p.endsWith('cleanup.json')).map(p => JSON.parse(readFileSync(p)));
  assert(cleanup.every(c => !c.alive.length && !c.socketExists && !c.listenerCheck.stdout));
  audit.push({ lane, logs: paths, budgets: budgets.length, processes: cleanup.flatMap(c => c.panePids), networkBlocked: 0, pass: true });
}
const pids = new Set(walk(base).filter(p => p.endsWith('events.jsonl')).flatMap(path => rows(path).filter(e => e.event === 'preload').map(e => e.pid)));
const cleanupFiles = walk(base).filter(p => p.endsWith('cleanup.json'));
for (const path of cleanupFiles) for (const pid of JSON.parse(readFileSync(path)).panePids ?? []) pids.add(pid);
const alive = [...pids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
const sockets = readdirSync(root).filter(p => p.endsWith('.sock'));
const ps = execFileSync('ps', ['-axo', 'pid,ppid,command'], { encoding: 'utf8' }).split('\n').filter(line => line.includes(root) && /tmux -f|dist\/bundle\/cli.js|node scripts\/verify/.test(line));
const listeners = spawnSync('lsof', ['-nP', '-a', '-p', [...pids].join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8', maxBuffer: 1000000 });
const cleanup = { pids: [...pids], alive, sockets, processes: ps, listeners: { code: listeners.status, stdout: listeners.stdout, stderr: listeners.stderr } };
writeFileSync(join(base, 'cleanup.json'), JSON.stringify(cleanup, null, 2)); assert.equal(alive.length, 0); assert.equal(sockets.length, 0); assert.equal(ps.length, 0); assert.equal(listeners.stdout, '');
const source = ['src/policy.ts','src/settings.ts','src/index.ts','src/pi-adapter/session.ts','src/pi-adapter/compatibility.ts','src/pi-adapter/journal.ts','src/state.ts'].map(file => ({ file, sha256: createHash('sha256').update(readFileSync(join(root,file))).digest('hex') }));
const result = { pass: true, lanes: audit, cleanupFiles: cleanupFiles.length, source }; writeFileSync(join(base, 'evidence-audit.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ pass: true, lanes: audit.length, trackedPids: pids.size }));
