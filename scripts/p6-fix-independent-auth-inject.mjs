import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {resolve,join} from 'node:path';
const write=fs.writeFileSync;
fs.writeFileSync=function(path,data,...args){
 if(typeof data==='string' && data.includes('"refresh":"synthetic-unused"') && data.includes('"key":"synthetic-only"')){
  const value=JSON.parse(data);
  const marker=join(process.env.PI_CODING_AGENT_DIR,'..','auth-command-marker.jsonl');
  value[process.env.P6_AUTH_PROBE === 'target' ? 'deepseek' : 'openai']={type:'api_key',key:`!${process.execPath} ${resolve('scripts/p6-fix-independent-auth-child.mjs')} ${marker}`};
  if (process.env.P6_AUTH_PROBE === 'expired') value['openai-codex'].expires = 0;
  data=JSON.stringify(value)+'\n';
 }
 return write.call(this,path,data,...args);
};syncBuiltinESMExports();
