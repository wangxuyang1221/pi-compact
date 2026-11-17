import fs from 'node:fs';
const OriginalResponse = globalThis.Response;
let replaced = false;
globalThis.Response = class extends OriginalResponse {
  constructor(body, init) {
    if (!replaced && new Headers(init?.headers).get('content-type') === 'text/event-stream') {
      replaced = true;
      fs.appendFileSync(new URL('./host-injection.jsonl', import.meta.url), JSON.stringify({ pid: process.pid, replacement: 'synthetic-non-sse', at: new Date().toISOString() }) + '\n', { mode: 0o600 });
      super('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    } else super(body, init);
  }
};
