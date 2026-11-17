import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const blocked = kind => { fs.appendFileSync(process.env.ACCEPTANCE_PREFLIGHT_LOG, kind + '\n'); throw new Error('PREFLIGHT_SIDE_EFFECT'); };
const read = fs.readFileSync;
fs.readFileSync = function (path, ...args) {
  if (/auth\.json|history|pi-coding-agent.*dist/.test(String(path))) return blocked('auth-or-host-read');
  return read.call(this, path, ...args);
};
globalThis.fetch = () => blocked('fetch');
net.Socket.prototype.connect = () => blocked('socket');
http.request = https.request = () => blocked('request');
childProcess.spawn = childProcess.execFileSync = () => blocked('child');
syncBuiltinESMExports();
