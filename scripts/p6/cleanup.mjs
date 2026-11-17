import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { root } from '../fixture/runtime.mjs';
const files = execFileSync('git', ['ls-files','--others','--ignored','--exclude-standard','artifacts'], {cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).trim().split('\n').filter(f=>!/\/(?:tmp|node_modules)\//.test(f));
const pids=new Set(), sockets=new Set(), records=[];
for(const file of files.filter(f=>/(?:processes|cleanup|result|runner)\.json$/.test(f))) {
  let data; try { data=JSON.parse(readFileSync(join(root,file))); } catch { continue; }
  records.push(file);
  for(const pid of [...(data.pids??[]),...(data.panePids??[]),...(typeof data.pid==='number'?[data.pid]:[])]) if(Number.isInteger(pid)&&pid>0)pids.add(pid);
  if(data.socket)sockets.add(resolve(data.socket));
}
for(const file of files.filter(f=>f.endsWith('/events.jsonl'))) for(const e of readFileSync(join(root,file),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)) if(e.event==='preload'&&e.pid)pids.add(e.pid);
const alive=[...pids].filter(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});
const socketChecks=[];
for(const socket of sockets) {
  if(!socket.startsWith(root+'/'))throw Error('Foreign socket');
  const check=spawnSync('lsof',['-nP',socket],{encoding:'utf8'});
  if(check.stdout.trim())throw Error('Owned socket still used: '+socket);
  const stale=existsSync(socket); if(stale)unlinkSync(socket);
  socketChecks.push({socket,removedConfirmedUnusedStale:stale,exists:existsSync(socket),lsofStatus:check.status});
}
const listeners=spawnSync('lsof',['-nP','-a','-p',[...pids].join(','),'-iTCP','-sTCP:LISTEN'],{encoding:'utf8'});
const processes=execFileSync('ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').filter(line=>line.includes(root)&&/tmux|pi-coding-agent.*cli|verify-p|record-p/.test(line)&&!line.includes('cleanup.mjs'));
const output={records:records.length,checkedPids:[...pids],alive,sockets:socketChecks,listeners:{status:listeners.status,stdout:listeners.stdout,stderr:listeners.stderr},runtimeProcessScan:processes,notes:'Only this worktree newly generated raw records are inspected. Awaited pnpm/conda/ffmpeg and shell helper invocations have returned. No unrelated process was killed. Synthetic auth files excluded from publication archive.'};
writeFileSync(join(root,'artifacts/P6/cleanup.json'),JSON.stringify(output,null,2));
if(alive.length||listeners.stdout.trim()||processes.length)throw Error('Cleanup incomplete');
console.log(JSON.stringify({pass:true,pids:pids.size,sockets:sockets.size}));
