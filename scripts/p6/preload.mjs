import '../p4/preload.mjs';
import fs from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { syncBuiltinESMExports } from 'node:module';
const read = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  const path = String(file);
  const forbidden = process.env.PI_P6_DENY_ROOT;
  if (forbidden && (path.startsWith(forbidden + '/src/') || path.startsWith(forbidden + '/node_modules/'))) throw new Error('Installed package must not read development source/dependencies: ' + path);
  return read.call(this, file, ...args);
};
syncBuiltinESMExports();
const transport = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const control = JSON.parse(read(process.env.PI_FIXTURE_CONTROL));
  const input = typeof options.body === 'string' ? options.body : (new Headers(options.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(options.body) : Buffer.from(options.body)).toString('utf8');
  if (input.includes('compaction_trigger') && ['network-error', 'quota'].includes(control.remote)) {
    fs.appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event: 'p6-injected-error', kind: control.remote }) + '\n');
    if (control.remote === 'network-error') throw new Error('Synthetic network unavailable');
    return new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'Synthetic quota denied' } }), { status: 403 });
  }
  return transport(url, options);
};
globalThis[Symbol.for('pi-compact.fixture.fetch')] = globalThis.fetch;
