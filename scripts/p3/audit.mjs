import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root, provenance, sourceHashes } from '../fixture/runtime.mjs';
import * as host from '@earendil-works/pi-coding-agent';
import { coverage } from '../../src/checkpoint.ts';

const base = join(root, 'artifacts/P3');
const local = path => join(root, 'artifacts', path.split('/artifacts/')[1]);
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const lines = file => readFileSync(file, 'utf8').trim().split('\n').filter(line => line.startsWith('{')).map(JSON.parse);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => sha(JSON.stringify(value));
const current = sourceHashes();
const verifySource = source => {
  for (const [file, hash] of Object.entries(source)) if (file !== 'scripts/p3/audit.mjs') assert.equal(current[file], hash, file);
};
const selected = lines(join(base, 'acceptance-final.log')).filter(row => row.dir).map(row => ({ ...row, dir: local(row.dir) }));
assert.equal(selected.length, 25);
assert(selected.every(row => row.pass));
const checks = [];
for (const row of selected) {
  const { dir } = row;
  const result = json(join(dir, '../result.json')).find(item => local(item.dir) === dir);
  verifySource(result.source);
  const events = lines(join(dir, 'events.jsonl'));
  const entries = lines(join(dir, 'session.jsonl'));
  const checkpoints = entries.filter(entry => entry.type === 'compaction');
  const successes = events.filter(event => event.event === 'extension-success');
  assert.equal(new Set(successes.map(event => event.id)).size, successes.length);
  assert(events.every(event => event.event !== 'network-blocked'));
  for (const event of successes) {
    const entry = checkpoints.find(entry => entry.id === event.id);
    assert(entry);
    if (event.checkpoint) assert.deepEqual(entry.details.piCompact, event.checkpoint);
  }
  for (const event of events.filter(event => event.event === 'compaction_end' && event.success)) {
    if (row.kind !== 'native-baseline') assert.equal(event.journal.kind, 'idle');
  }
  for (const entry of checkpoints) {
    const cp = entry.details?.piCompact;
    if (!cp) continue;
    assert.equal(cp.schemaVersion, 1);
    assert.equal(cp.source.sourceLeaf, entry.parentId);
    assert.equal(cp.source.firstKept, entry.firstKeptEntryId);
    assert(cp.source.entries.every(id => entries.some(item => item.id === id)));
    const ids = new Set();
    const branch = [];
    let ancestor = entry;
    while (ancestor?.parentId) { ids.add(ancestor.parentId); ancestor = entries.find(item => item.id === ancestor.parentId); branch.unshift(ancestor); }
    assert(cp.source.entries.every(id => ids.has(id)));
    assert.deepEqual(coverage(host, branch, cp.source.firstKept), cp.source);
    assert(!JSON.stringify(cp).includes('fixture.fixture'));
    if (cp.kind === 'opaque') {
      assert(!('text' in cp));
      assert(/^[0-9a-f]{64}$/.test(cp.compatibility.account));
      const bytes = Buffer.byteLength(JSON.stringify(cp.items));
      assert.equal(cp.budget.bytes, bytes);
      assert.equal(cp.budget.tokens, Math.max(bytes + cp.items.length * 32, cp.budget.outputTokens * 2));
      const returns = events.filter(event => event.event === 'remote-fixture-success').map(event => event.items);
      if (row.kind !== 'kill' || successes.some(event => event.id === entry.id)) assert(returns.some(items => JSON.stringify(items) === JSON.stringify(cp.items)));
    } else {
      assert.equal(cp.text, entry.summary);
      assert(!('items' in cp));
    }
  }
  const requests = events.filter(event => ['normal-request', 'remote-request'].includes(event.event));
  for (const request of requests) {
    const input = request.input ?? request.body.input;
    assert(!JSON.stringify(input).includes('Codex remote checkpoint.'));
    for (const item of input.filter(item => item.type === 'compaction')) {
      const cp = checkpoints.map(entry => entry.details?.piCompact).find(cp => cp?.items?.some(candidate => JSON.stringify(candidate) === JSON.stringify(item)));
      assert(cp, 'opaque request has durable origin');
      const start = input.findIndex(item => JSON.stringify(item) === JSON.stringify(cp.items[0]));
      assert(start >= 0);
      assert.deepEqual(input.slice(start, start + cp.items.length), cp.items);
    }
  }
  for (const event of events.filter(event => event.event === 'native-request')) {
    const body = JSON.stringify(event.body);
    assert(!body.includes('SYNTHETIC_OPAQUE'));
    assert(!body.includes('Codex remote checkpoint.'));
  }
  for (const file of ['source-before.jsonl', 'before-fault.jsonl']) if (existsSync(join(dir, file))) {
    const before = readFileSync(join(dir, file));
    assert(readFileSync(join(dir, 'session.jsonl')).subarray(0, before.length).equals(before));
  }
  const cleanup = json(join(dir, 'cleanup.json'));
  assert.deepEqual(cleanup.alive, []);
  assert.equal(cleanup.socketExists, false);
  assert.equal(cleanup.listenerCheck.stdout, '');
  assert(!existsSync(join(dir, 'session.jsonl.pi-compact-pending.json')));
  if (row.kind === 'large-fallback') {
    const cp = checkpoints.at(-1).details.piCompact;
    const requests = events.filter(event => event.event === 'native-request');
    assert.equal(cp.segments.length, requests.length);
    let end = 0;
    for (const [index, segment] of cp.segments.entries()) {
      const text = requests[index].body.input.flatMap(item => item.content ?? []).find(part => part.text?.includes('<conversation>')).text;
      const chunk = text.split('<conversation>\n[User]: ')[1].split('\n</conversation>')[0];
      assert.equal(segment.start, end);
      assert.equal(segment.end - segment.start, chunk.length);
      assert.equal(segment.hash, digest(chunk));
      assert.deepEqual(segment.entries, cp.source.entries);
      end = segment.end;
    }
  }
  if (row.kind === 'kill') {
    const pending = json(join(dir, 'pending-before-recovery.json'));
    const before = readFileSync(join(dir, 'before-fault.jsonl'));
    assert(readFileSync(join(dir, 'partial.jsonl')).subarray(0, before.length).equals(before));
    assert(events.filter(event => event.event === 'state').every(event => event.state === 'blocked'));
    assert(pending);
  }
  checks.push({ lane: row.lane, kind: row.kind, dir: relative(root, dir), checkpoints: checkpoints.length, successes: successes.length, pass: true });
}
const perfLine = lines(join(base, 'perf-final.log')).at(-1);
perfLine.base = local(perfLine.base);
const samples = json(join(perfLine.base, 'samples.json'));
assert.equal(samples.length, 60);
for (const sample of samples) { assert(sample.pass); verifySource(sample.source); }
const p95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
const head = samples.filter(sample => sample.variant === 'head');
assert.equal(p95(head.map(sample => sample.localMs)), perfLine.summary.head.localMs.p95);
assert.equal(p95(head.map(sample => sample.resumeMs)), perfLine.summary.head.resumeMs.p95);
assert(perfLine.summary.pass);
const packageAudit = json(join(base, 'package/audit.json'));
assert.equal(sha(readFileSync(join(base, 'package/pi-compact-0.1.0.tgz'))), packageAudit.sha256);
for (const file of packageAudit.files.filter(file => file.file !== 'package.json')) assert.equal(sha(readFileSync(join(root, file.file))), file.sha256);
const recall = lines(join(base, 'recall.log')).at(-1);
recall.base = local(recall.base);
assert(recall.pass);
for (const result of json(join(recall.base, 'result.json'))) { assert(result.pass); verifySource(result.source); }
const oldProvenance = json(join(local(samples[0].dir), 'result.json')).provenance;
for (const key of ['cliHash', 'packageHash', 'installedSources', 'bundle']) assert.deepEqual(oldProvenance[key], provenance[key]);
const initial = readdirSync(join(base, 'perf')).sort()[0];
const initialProvenance = json(join(base, 'perf', initial, '0-head/result.json')).provenance;
for (const key of ['cliHash', 'packageHash', 'installedSources', 'bundle']) assert.deepEqual(initialProvenance[key], provenance[key]);
const output = { pass: true, product: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), source: current, checks,
  sourceCheck: 'Every recorded runtime source hash must match. Only this post-run auditor is excluded; it never runs in Pi.', recall,
  performance: { directory: relative(root, perfLine.base), summary: perfLine.summary }, package: packageAudit, installedUnchanged: true, provenance };
writeFileSync(join(base, 'audit.json'), JSON.stringify(output, null, 2));

const roots = [base, ...['P1-fixes/runs/1794821848337', 'P1-scope/runs/1794821849484', 'P2-fixes/regression-1794821850640', 'P2-fixes/persistence/1794821851796', 'P2-reconstruction/run-1794822714143', 'P2-reconstruction/run-1794823657889', 'P2-reconstruction/perf/1794822884429', 'P2-reconstruction/perf/1794822996769'].map(path => join(root, 'artifacts', path))];
const rawFiles = roots.flatMap(dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)));
const pids = new Set();
const stopped = new Set();
const sockets = new Set();
for (const file of rawFiles) {
  if (file.endsWith('/events.jsonl') || file.endsWith('/first-events.jsonl')) for (const event of lines(file)) if (event.event === 'preload') pids.add(event.pid);
  if (file.endsWith('/cleanup.json') || file.endsWith('/first-cleanup.json')) {
    const record = json(file);
    for (const pid of record.panePids ?? []) { pids.add(pid); if (!record.alive?.includes(pid)) stopped.add(pid); }
  }
  if (file.endsWith('/processes.json')) { const record = json(file); record.pids.forEach(pid => pids.add(pid)); sockets.add(record.socket); }
  if (file.endsWith('/result.json')) { const value = json(file); if (value.pid) pids.add(value.pid); }
}
const alive = [...pids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
const reusedPids = alive.map(pid => ({ pid, command: spawnSync('ps', ['-p', String(pid), '-o', 'pid=,ppid=,lstart=,command='], { encoding: 'utf8' }).stdout.trim() })).filter(record => stopped.has(record.pid) && !record.command.includes(root) && record.command.includes('/Applications/Google Chrome.app/'));
const aliveOwned = alive.filter(pid => !reusedPids.some(record => record.pid === pid));
const remainingSockets = [...sockets].filter(existsSync);
const listeners = spawnSync('lsof', ['-nP', '-a', '-p', [...pids].join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
const cleanup = { checkedAt: new Date().toISOString(), pids: [...pids], sockets: [...sockets], aliveOwned, reusedPids, remainingSockets, listeners: { status: listeners.status, stdout: listeners.stdout, stderr: listeners.stderr } };
writeFileSync(join(base, 'cleanup.json'), JSON.stringify(cleanup, null, 2));
assert.deepEqual(aliveOwned, []);
assert.deepEqual(remainingSockets, []);
assert.equal(listeners.stdout, '');
console.log(JSON.stringify({ pass: true, product: output.product, cases: checks.length, samples: samples.length, processes: pids.size, sockets: sockets.size, archivePending: true }));
