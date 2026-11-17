import fs from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, durableWrite } from './live/guard.mjs';
const base = resolve('artifacts/P6-isolation-fixes');
const roots = [join(base, 'before'), join(base, 'runs'), resolve('artifacts/P6-executor/runs/isolation-fix-normal-1')];
for (const line of fs.readFileSync(join(base, 'faults.log'), 'utf8').trim().split('\n')) {
  const row = JSON.parse(line); if (row.run) roots.push(row.run);
}
const pids = new Set(), manifest = [];
const walk = path => {
  if (!fs.existsSync(path)) return;
  for (const entry of fs.readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!entry.isFile()) continue;
    if (['processes.json', 'owner.lock', 'auth-command-marker.jsonl', 'install.jsonl'].includes(entry.name)) {
      for (const line of fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)) {
        const item = JSON.parse(line); for (const pid of [...(item.pids ?? []), item.pid].filter(Number.isInteger)) pids.add(pid);
      }
    }
    if ((!file.includes('/raw/') && ['processes.json', 'cleanup.json', 'result.json', 'results.json', 'ledger.json', 'independent-observation.json'].includes(entry.name)) || entry.name === 'auth-command-marker.jsonl') {
      const content = fs.readFileSync(file);
      if (/TEST_SECRET|SYNTHETIC_OPAQUE_|Bearer |encrypted_content|chatgpt_account_id|"authorization"|"cookie"/.test(content.toString())) throw new Error('Restricted content');
      const name = relative(resolve('artifacts'), file);
      const to = join(base, 'public', name); fs.mkdirSync(resolve(to, '..'), { recursive: true }); fs.writeFileSync(to, content);
      manifest.push({ path: name, sha256: digest(content) });
    }
  }
};
for (const root of roots) walk(root);
const alive = [...pids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
const check = spawnSync('lsof', ['-nP', '-a', '-p', [...pids].join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
if (![0, 1].includes(check.status)) throw new Error('Listener audit failed');
const cleanup = { registeredPids: [...pids].sort((a,b)=>a-b), alive, listenerCount: check.stdout.trim() ? check.stdout.trim().split('\n').length - 1 : 0, sockets: fs.readdirSync('.').filter(p=>p.endsWith('.sock')), note: 'No task listener or tmux was started. Includes synthetic credential-child reproductions; crash fixture dead locks are retained. Synchronous helper commands were awaited.' };
durableWrite(join(base, 'cleanup.json'), cleanup);
durableWrite(join(base, 'public-manifest.json'), manifest);
if (alive.length || cleanup.listenerCount || cleanup.sockets.length) throw new Error('Cleanup incomplete');
console.log(JSON.stringify({ registeredPids: pids.size, publicFiles: manifest.length, alive, listeners: cleanup.listenerCount, sockets: cleanup.sockets.length }));
