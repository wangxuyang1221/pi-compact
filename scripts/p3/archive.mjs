import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root } from '../fixture/runtime.mjs';
const base = join(root, 'artifacts/P3');
const roots = [base, ...['P1-fixes/runs/1794821848337', 'P1-scope/runs/1794821849484', 'P2-fixes/regression-1794821850640', 'P2-fixes/persistence/1794821851796', 'P2-reconstruction/run-1794822714143', 'P2-reconstruction/run-1794823657889', 'P2-reconstruction/perf/1794822884429', 'P2-reconstruction/perf/1794822996769'].map(path => join(root, 'artifacts', path))];
const files = roots.flatMap(dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => relative(root, join(entry.parentPath, entry.name)))).filter(file =>
  !file.includes('/tmp/') && !file.includes('/package/package/') && !file.endsWith('/auth.json') &&
  !/artifacts\/P3\/(REPORT\.md|manifest\.json|archive-verification\.json|archive-files\.txt|archive\.log|evidence\.tar\.gz)$/.test(file) &&
  !/\/review\/(demo\.mp4|lane[234]\.png|frames\/\d+\.png)$/.test(file)).sort();
const hash = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
const contents = files.map(path => ({ path, bytes: readFileSync(join(root, path)).length, sha256: hash(path) }));
const list = join(base, 'archive-files.txt');
writeFileSync(list, files.join('\n') + '\n');
const archive = 'artifacts/P3/evidence.tar.gz';
execFileSync('tar', ['-czf', join(root, archive), '-T', list], { cwd: root, env: { ...process.env, COPYFILE_DISABLE: '1' } });
const publicFiles = ['review/demo.mp4', 'review/lane2.png', 'review/lane3.png', 'review/lane4.png', 'package/pi-compact-0.1.0.tgz'].map(path => 'artifacts/P3/' + path);
const manifest = { archive: { path: archive, bytes: readFileSync(join(root, archive)).length, sha256: hash(archive) },
  exclusions: 'Compile caches/tmp, extracted package duplicate, generated synthetic auth.json, PNG video frames, standalone visuals, REPORT, manifest, post-archive verification, file list and the currently written archive.log. All raw requests, JSONL, journals, fault records, text frames and closed logs are retained.',
  standalone: publicFiles.map(path => ({ path, sha256: hash(path) })), contents };
writeFileSync(join(base, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ files: contents.length, archive: manifest.archive }));
