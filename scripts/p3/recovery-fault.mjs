import './preload.mjs';
import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const append=fs.appendFileSync,truncate=fs.ftruncateSync,rename=fs.renameSync;const controlFile=process.env.PI_FIXTURE_CONTROL+'.fault';let fired=false;
const config=()=>fs.existsSync(controlFile)?JSON.parse(fs.readFileSync(controlFile)):undefined;
const note=(event,data={})=>append(process.env.PI_FIXTURE_LOG,JSON.stringify({at:performance.now(),event,...data})+'\n');
fs.appendFileSync=function(file,data,...args){const c=config();if(c?.kind==='rollback-fail'&&!fired&&file===c.file&&String(data).includes('"type":"compaction"')){fired=true;append.call(this,file,String(data).slice(0,70));note('independent-partial');throw Error('Independent partial write');}return append.call(this,file,data,...args);};
fs.ftruncateSync=function(fd,len){const c=config();if(c?.kind==='rollback-fail'&&fs.fstatSync(fd).ino===fs.statSync(c.file).ino){note('independent-rollback-failed');throw Error('Independent rollback write denied');}return truncate.call(this,fd,len);};
fs.renameSync=function(from,to){const c=config();const r=rename.call(this,from,to);if(c?.kind==='kill-idle'&&to===c.file+'.pi-compact-state.json'&&JSON.parse(fs.readFileSync(to)).kind==='idle'){note('independent-kill-idle');process.kill(process.pid,'SIGKILL');}return r;};syncBuiltinESMExports();
