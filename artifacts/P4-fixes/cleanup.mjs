import assert from 'node:assert/strict';
import { readdirSync,readFileSync,writeFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../../scripts/fixture/runtime.mjs';
import { base,evidenceRoots } from './evidence-roots.mjs';
const files=evidenceRoots.flatMap(dir=>readdirSync(dir,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()).map(entry=>join(entry.parentPath,entry.name)));
const pids=new Set();const stopped=new Set();const sockets=new Set();const checks=[];
for(const file of files){
 if(/\/(?:first-)?events.jsonl$/.test(file))for(const event of readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse))if(event.event==='preload')pids.add(event.pid);
 if(/\/(?:first-)?cleanup.json$/.test(file)&&file!==join(base,'cleanup.json')){const record=JSON.parse(readFileSync(file));for(const pid of record.panePids??[]){pids.add(pid);if(!record.alive?.includes(pid))stopped.add(pid);}assert.deepEqual(record.alive,[]);assert.equal(record.socketExists,false);assert.equal(record.listenerCheck.stdout,'');checks.push(file);}
 if(file.endsWith('/processes.json')){const record=JSON.parse(readFileSync(file));record.pids.forEach(pid=>pids.add(pid));sockets.add(record.socket);}
 if(file.endsWith('/result.json')){const records=JSON.parse(readFileSync(file));for(const record of Array.isArray(records)?records:[records])if(record.pid){pids.add(record.pid);if(record.code!==null)stopped.add(record.pid);}}
}
const alive=[...pids].filter(pid=>{try{process.kill(pid,0);return true;}catch{return false;}}).map(pid=>({pid,command:spawnSync('ps',['-p',String(pid),'-o','pid=,ppid=,lstart=,command='],{encoding:'utf8'}).stdout.trim()}));
const reused=alive.filter(record=>stopped.has(record.pid)&&!record.command.includes(root));
const owned=alive.filter(record=>!reused.includes(record));
const remainingSockets=[...sockets].filter(existsSync);
const listeners=spawnSync('lsof',['-nP','-a','-p',[...pids].filter(pid=>!reused.some(record=>record.pid===pid)).join(','),'-iTCP','-sTCP:LISTEN'],{encoding:'utf8'});
const output={checkedAt:new Date().toISOString(),roots:evidenceRoots,pids:[...pids],checkedSessionCleanups:checks.length,sockets:[...sockets],aliveOwned:owned,reusedPids:reused,remainingSockets,listeners:{status:listeners.status,stdout:listeners.stdout,stderr:listeners.stderr},note:'Every TUI stop records descendants, waits for exit and checks sockets/listeners. CLI runs await process exit. Reused PIDs are reported, never killed. Short-lived command and rendering children are awaited by their parent commands.'};
writeFileSync(join(base,'cleanup.json'),JSON.stringify(output,null,2));
assert.deepEqual(owned,[]);assert.deepEqual(remainingSockets,[]);assert.equal(listeners.stdout,'');
console.log(JSON.stringify({pass:true,pids:pids.size,sockets:sockets.size,sessionCleanups:checks.length,reusedPids:reused.length}));
