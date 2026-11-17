import fs from 'node:fs';
import { basename, dirname } from 'node:path';
const config = process.argv[1]?.endsWith('/comparison/worker.mjs') ? process.argv[2] : null;
const mode = config ? basename(dirname(dirname(config))) : '';
const Original = globalThis.Response;
let once = false;
globalThis.Response = class extends Original {
  constructor(body, init) {
    if (!once && ['host-non-sse', 'host-malformed'].includes(mode) && new Headers(init?.headers).get('content-type') === 'text/event-stream') {
      once = true;
      fs.appendFileSync(new URL('./injections.jsonl', import.meta.url), JSON.stringify({ mode, pid: process.pid }) + '\n', { mode: 0o600 });
      if (mode === 'host-non-sse') super('{}', { headers: { 'content-type': 'application/json' } });
      else super('data: {broken}\n\n', init);
    } else super(body, init);
  }
};
