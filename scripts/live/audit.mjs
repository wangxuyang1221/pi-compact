import fs from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, durableWrite } from './guard.mjs';
const base = resolve('artifacts/P6-executor');
const files = fs.readdirSync(base, { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => join(f.parentPath, f.name));
const pids = new Set();
const publicFiles = [], privateFiles = [];
for (const path of files) {
  const name = relative(base, path);
  if (name.includes('/raw/')) {
    if (name.endsWith('/install.jsonl')) for (const line of fs.readFileSync(path, 'utf8').trim().split('\n').filter(Boolean)) { const event = JSON.parse(line); if (event.pid) pids.add(event.pid); }
    if (/\.jsonl$|opaque-map\.json$/.test(name)) {
      if (fs.statSync(path).mode & 0o077) throw new Error('Raw session permissions are too broad');
      privateFiles.push({ path: name, bytes: fs.statSync(path).size, sha256: digest(fs.readFileSync(path)), mode: '0600' });
    }
    continue;
  }
  if (name.endsWith('/processes.json')) for (const pid of JSON.parse(fs.readFileSync(path)).pids) pids.add(pid);
  if (name.endsWith('/owner.lock')) pids.add(JSON.parse(fs.readFileSync(path)).pid);
  if (name.startsWith('runs/') && /\/(ledger|result|cleanup|processes)\.json$|\/attempts\/[^/]+\.json$/.test(name)) publicFiles.push(name);
  if (name.startsWith('verification/') && name.endsWith('/results.json')) publicFiles.push(name);
}
const alive = [...pids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
const sockets = fs.readdirSync(resolve('.')).filter(name => name.endsWith('.sock'));
const check = spawnSync('lsof', ['-nP', '-a', '-p', [...pids].join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
if (![0, 1].includes(check.status)) throw new Error('Listener check unavailable');
const cleanup = { pids: [...pids].sort((a, b) => a - b), alive, sockets, listenerCheckExit: check.status, listenerCount: check.stdout.trim() ? check.stdout.trim().split('\n').length - 1 : 0, retainedLocks: files.filter(f => f.endsWith('/owner.lock')).map(f => relative(base, f)), note: 'Crash fixture owner locks are retained as evidence. No active process owns them. Short-lived synchronous build helpers were awaited.' };
durableWrite(join(base, 'cleanup.json'), cleanup);
durableWrite(join(base, 'private-raw-manifest.json'), privateFiles);
const directory = join(base, 'public'); fs.mkdirSync(directory, { recursive: true });
for (const name of publicFiles) {
  const text = fs.readFileSync(join(base, name), 'utf8');
  if (/TEST_SECRET|SYNTHETIC_OPAQUE_|Bearer |encrypted_content|chatgpt_account_id|"authorization"|"cookie"/.test(text)) throw new Error('Public evidence contains restricted content');
  const destination = join(directory, name); fs.mkdirSync(resolve(destination, '..'), { recursive: true }); fs.writeFileSync(destination, text);
}
durableWrite(join(base, 'public-manifest.json'), publicFiles.map(path => ({ path, sha256: digest(fs.readFileSync(join(directory, path))) })));
if (alive.length || sockets.length || cleanup.listenerCount) throw new Error('Runtime cleanup incomplete');
console.log(JSON.stringify({ registeredPids: pids.size, alive, sockets, listenerCount: cleanup.listenerCount, publicFiles: publicFiles.length, privateRawFiles: privateFiles.length }));
