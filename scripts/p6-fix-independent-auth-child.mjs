import fs from 'node:fs';
import net from 'node:net';
import https from 'node:https';
const out=process.argv[2];
const observed={pid:process.pid,ppid:process.ppid,networkPreload:process.env.NODE_OPTIONS??null,socketGuardPresent:/NETWORK_BYPASS_DENIED|network-blocked|return block/.test(String(net.Socket.prototype.connect)),httpsGuardPresent:/NETWORK_BYPASS_DENIED|return block/.test(String(https.request))};
net.Socket.prototype.connect=function(...args){const value=Array.isArray(args[0])?args[0][0]:args[0];observed.outerStop={host:value?.host,port:value?.port,networkSent:false};throw new Error('INDEPENDENT_OUTER_DENY');};
try{https.request('https://fixture.invalid/independent');}catch(e){observed.requestError=e.message;}
fs.appendFileSync(out,JSON.stringify(observed)+'\n');
console.log('synthetic-only');
