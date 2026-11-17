import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
const root = new URL('./', import.meta.url);
const log = x => fs.appendFileSync(new URL('boundary.jsonl', root), JSON.stringify({ pid: process.pid, ...x }) + '\n', { mode: 0o600 });
log({ event: 'process', argv: process.argv.slice(1) });
const deny = () => { log({ event: 'network-denied' }); throw new Error('INDEPENDENT_NETWORK_DENIED'); };
net.Socket.prototype.connect = deny; tls.connect = deny; dgram.createSocket = deny;
for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6']) { dns[key] = deny; dns.promises[key] = deny; }
globalThis.fetch = deny;
const read = fs.readFileSync, open = fs.openSync;
const check = path => { if (typeof path !== 'number' && /\/(?:\.pi\/agent|\.codex\/(?:auth|sessions)|P6-real\/runs\/[^/]+\/(?:raw|config))/.test(String(path))) { log({ event: 'identity-denied' }); throw new Error('INDEPENDENT_IDENTITY_DENIED'); } };
fs.readFileSync = function(path, ...args) { check(path); return read.call(this, path, ...args); };
fs.openSync = function(path, ...args) { check(path); return open.call(this, path, ...args); };
syncBuiltinESMExports();
