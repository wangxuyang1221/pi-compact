import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const append=fs.appendFileSync, sync=fs.fsyncSync, rename=fs.renameSync, unlink=fs.unlinkSync;
const file=process.env.PI_FIXTURE_CONTROL+'.fault';
let fired;
const config=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):undefined;
const fire=control=>{fired=control.nonce;append(process.env.PI_FIXTURE_LOG,JSON.stringify({at:performance.now(),event:'disk-fault-fired',mode:control.kind})+'\n');};
fs.appendFileSync=function(path,data,...args){
  const control=config();
  if(control&&fired!==control.nonce&&['partial','kill'].includes(control.kind)&&path===control.file&&String(data).includes('"type":"compaction"')){
    append(path,String(data).slice(0,70));fire(control);
    if(control.kind==='kill')process.kill(process.pid,'SIGKILL');
    throw new Error('Synthetic partial checkpoint append');
  }
  return append.call(this,path,data,...args);
};
fs.fsyncSync=function(fd){
  const control=config();
  if(control&&fired!==control.nonce&&control.kind==='fsync'&&fs.fstatSync(fd).ino===fs.statSync(control.file).ino){fire(control);throw new Error('Synthetic checkpoint fsync failure');}
  return sync.call(this,fd);
};
fs.renameSync=function(from,to){
  const control=config();
  if(control&&fired!==control.nonce&&control.kind==='idle-rename'&&to===control.file+'.pi-compact-state.json'&&JSON.parse(fs.readFileSync(from)).kind==='idle'){fire(control);throw new Error('Synthetic idle journal rename failure');}
  return rename.call(this,from,to);
};
fs.unlinkSync=function(path){
  const control=config();
  if(control&&fired!==control.nonce&&control.kind==='commit-unlink'&&path===control.file+'.pi-compact-pending.json'){unlink.call(this,path);fire(control);throw new Error('Synthetic post-unlink commit failure');}
  return unlink.call(this,path);
};
syncBuiltinESMExports();
