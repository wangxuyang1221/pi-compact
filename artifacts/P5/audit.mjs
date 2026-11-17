import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd();
const base = join(root, 'artifacts/P5');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file));
const paths = name => fs.readFileSync(join(base, name), 'utf8').split('\n').filter(line => line.startsWith(root));
const native = paths('ten-lanes-final.log')[0];
const integrated = paths('ten-lanes-final.log')[1];
const lifecycle = paths('lifecycle-freeze.log')[0];
const symlink = paths('symlink-final.log')[0];
const pkg = paths('package-final.log')[0];
const demo = paths('demo-final.log')[0];
const perf = paths('perf-final.log')[0];
const packed = paths('package-integrated.log')[0];
const events = dir => fs.readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const entries = dir => fs.readFileSync(join(dir, 'session.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
const sources = Object.fromEntries(fs.readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => [relative(root, join(f.parentPath, f.name)), hash(join(f.parentPath, f.name))]));
for (const dir of [native, integrated, symlink]) {
  const r = json(join(dir, 'result.json'));
  assert(r.results.every(r => r.pass ?? (r.managed && r.divider && !r.native && r.summaries === 1 && r.checkpoints === 1)));
  for (const [file, digest] of Object.entries(sources)) assert.equal(r.provenance.source[file], digest, dir + file);
}
for (const item of json(join(lifecycle, 'results.json'))) assert(!item.error);
assert(json(join(packed, 'result.json')).results.every(r => r.pass));
for (const name of ['remote', 'fallback', 'doublefail', 'remote-cancel', 'persist-fail', 'migration']) {
  const dir = join(integrated, name), log = events(dir), raw = entries(dir);
  const commits = raw.filter(e => e.type === 'compaction');
  assert.equal(log.filter(e => e.event === 'extension-success').length, commits.length);
  if (['doublefail', 'remote-cancel', 'persist-fail'].includes(name)) { assert.equal(commits.length, 0); assert(!fs.readFileSync(join(dir, 'failed.txt'), 'utf8').includes('Context compacted')); }
  if (name === 'remote') {
    const text = fs.readFileSync(join(dir, 'expanded.txt'), 'utf8');
    const value = commits[0].details.piCompact;
    for (const s of [`Schema: ${value.schemaVersion}`, `Covered entries: ${value.source.entries.length}`, `Wire items: ${value.items.length}`, `Stored wire bytes: ${value.budget.bytes}`]) assert(text.includes(s));
    for (const sensitive of [value.compatibility.account, value.compatibility.endpoint, ...value.items.filter(i => i.encrypted_content).map(i => i.encrypted_content)]) assert(!text.includes(sensitive));
  }
}
const component = json(join(perf, 'measured/samples.json'));
assert.equal(component.records.length, 30); assert.equal(component.errors, 0); assert(component.checksum > 0);
const stats = a => [...a].sort((a,b) => a-b)[Math.ceil(a.length * .95) - 1];
for (const record of component.records) {
  for (const side of ['baseline', 'head', 'added']) { assert.equal(record.samples[side].length, 1000); assert.equal(stats(record.samples[side]), record[side].p95); }
  assert(record.added.p95 <= 2 && record.head.p95 - record.baseline.p95 <= 2);
}
const frames = [native, integrated, pkg, packed, perf].flatMap(dir => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(f => f.isFile() && f.name === 'events.jsonl').flatMap(f => events(f.parentPath).filter(e => e.event === 'p5-first-frame' && !f.parentPath.endsWith('/profile')).map(e => ({ file: relative(root, join(f.parentPath, f.name)), ms: e.ms }))));
assert(frames.length >= 8); assert(frames.every(f => f.ms >= 0 && f.ms <= 100));
const packageAudit = json(join(pkg, 'audit.json'));
for (const [file, digest] of Object.entries(packageAudit.fileHashes)) assert.equal(hash(join(pkg, 'package', file)), digest);
assert.equal(hash(join(pkg, 'pi-compact-0.1.0.tgz')), packageAudit.sha256);
const review = join(base, 'review'); fs.mkdirSync(review, { recursive: true });
const copies = {
  'lane2-dark.png': join(native, 'manual/dark-90.png'), 'lane3-light.png': join(native, 'manual/light-90.png'),
  'lane4-narrow.png': join(native, 'manual/resize-20.png'), 'lane4-40.png': join(native, 'manual/resize-40.png'), 'lane4-120.png': join(native, 'manual/resize-120.png'),
  'lane5-expanded.png': join(native, 'manual/expanded-90.png'), 'lane6-remote.png': join(integrated, 'remote/expanded.png'),
  'lane8-fallback.png': join(integrated, 'fallback/completed.png'), 'lane8-doublefail.png': join(integrated, 'doublefail/failed.png'),
  'migration-expanded.png': join(integrated, 'migration/expanded.png'), 'demo.mp4': join(demo, 'demo.mp4'),
};
for (const [name, source] of Object.entries(copies)) fs.copyFileSync(source, join(review, name));
fs.copyFileSync(join(pkg, 'pi-compact-0.1.0.tgz'), join(base, 'pi-compact-0.1.0.tgz'));
const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', join(review, 'demo.mp4')], { encoding: 'utf8' }));
assert(duration >= 30 && duration <= 60);
const changedCore = execFileSync('git', ['diff', '47f1ca081ceaf9b267a1254e8eef398dc4b86074', '--', ...Object.keys(sources).filter(f => !['src/index.ts', 'src/pi-adapter/renderer.ts', 'src/ui/compaction-divider.ts'].includes(f))], { encoding: 'utf8' });
assert.equal(changedCore, '');
const files = fs.existsSync(join(base, 'evidence-files.json')) ? json(join(base, 'evidence-files.json')) : execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', 'artifacts'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean).filter(f => f !== 'artifacts/P5/cleanup.json');
const cleanups = files.filter(f => f.endsWith('/cleanup.json')).map(file => ({ file, data: json(file) }));
const pids = new Set(); const sockets = new Set(); let blocked = 0;
for (const file of files.filter(f => f.endsWith('/processes.json'))) { const p = json(file); for (const pid of p.pids ?? []) pids.add(pid); if (p.socket) sockets.add(p.socket); }
for (const file of files.filter(f => f.endsWith('/events.jsonl'))) for (const e of events(file.slice(0, -'/events.jsonl'.length))) { if (e.event === 'preload') pids.add(e.pid); if (e.event === 'network-blocked') blocked++; }
for (const { file, data } of cleanups) { assert.equal(data.alive?.length ?? 0, 0, file); assert(!data.socketExists, file); for (const pid of data.panePids ?? []) pids.add(pid); }
const alive = [...pids].filter(pid => { try { process.kill(pid,0); return true; } catch { return false; } });
assert.deepEqual(alive, []); assert([...sockets].every(s => !fs.existsSync(s))); assert.equal(blocked, 0);
const listeners = spawnSync('lsof', ['-nP','-a','-p',[...pids].join(','),'-iTCP','-sTCP:LISTEN'], { encoding: 'utf8' });
assert.equal(listeners.stdout, '');
const cleanup = { pids: [...pids], sockets: [...sockets], cleanupRecords: cleanups.length, alive, listeners: listeners.stdout, networkBlocked: blocked };
fs.writeFileSync(join(base, 'cleanup.json'), JSON.stringify(cleanup,null,2));
const audit = { pass: true, productSHA: execFileSync('git',['rev-parse','0f23577'],{encoding:'utf8'}).trim(), sources, paths: { native, integrated, lifecycle, symlink, pkg, demo, perf, packed }, packageSHA256: packageAudit.sha256, packageFiles: packageAudit.files.length, videoDurationSeconds: duration, frames, component: { records: component.records.length, checksum: component.checksum, errors: component.errors }, copiedVisuals: copies, coreUnchanged: true, cleanup: { pids: pids.size, sockets: sockets.size, records: cleanups.length, networkBlocked: blocked } };
fs.writeFileSync(join(base,'audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify({ pass: true, packageFiles: audit.packageFiles, duration, firstFrames: frames.length, cleanup: audit.cleanup }));
