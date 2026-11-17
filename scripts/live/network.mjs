import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { refuse, AcceptanceError } from './guard.mjs';

export function networkBoundary(mode) {
  const request = https.request;
  const connect = net.Socket.prototype.connect;
  const tlsConnect = tls.connect;
  const sending = new AsyncLocalStorage();
  const sockets = new Set();
  let denied = 0;
  const block = () => { denied++; refuse('NETWORK_BYPASS_DENIED'); };
  globalThis.fetch = block;
  globalThis.WebSocket = class { constructor() { block(); } };
  net.Socket.prototype.connect = function (...args) {
    const permit = sending.getStore();
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (!permit || mode !== 'real' || !options || typeof options !== 'object' || options.path || options.host !== permit.host || Number(options.port) !== 443) return block();
    sockets.add(this); this.once('close', () => sockets.delete(this));
    return connect.apply(this, args);
  };
  tls.connect = function (...args) {
    const permit = sending.getStore();
    const options = args[0];
    if (!permit || mode !== 'real' || typeof options !== 'object' || options.host !== permit.host || Number(options.port) !== 443) return block();
    return tlsConnect.apply(this, args);
  };
  http.request = https.request = http.get = https.get = http2.connect = dgram.createSocket = block;
  const subprocess = () => refuse('SUBPROCESS_DENIED');
  childProcess.ChildProcess.prototype.spawn = subprocess;
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[name] = subprocess;
  syncBuiltinESMExports();
  return {
    send(url, options) {
      if (mode !== 'real') return block();
      const target = new URL(url);
      return sending.run({ host: target.hostname }, () => new Promise((resolve, reject) => {
        const req = request(target, { method: 'POST', headers: Object.fromEntries(new Headers(options.headers)), agent: false, signal: options.signal }, res => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
          resolve(new Response(Readable.toWeb(res), { status: res.statusCode, headers }));
        });
        req.once('error', () => reject(new AcceptanceError('HTTPS_SEND_FAILED')));
        req.end(options.body);
      }));
    },
    async close() {
      await Promise.all([...sockets].map(socket => new Promise(resolve => { socket.once('close', resolve); socket.destroy(); })));
      return { trackedSockets: sockets.size, listeners: 0, deniedNetworkActions: denied };
    },
  };
}
