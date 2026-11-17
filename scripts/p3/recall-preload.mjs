import './preload.mjs';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
const original = globalThis.fetch;
const facts = new Map();
const answer = 'database=sqlite retry=3 file=ledger.csv timezone=Asia/Shanghai';
const note = (event, data) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
globalThis.fetch = async (url, options) => {
  if (new URL(String(url)).origin !== 'https://fixture.invalid') return original(url, options);
  const raw = typeof options.body === 'string' ? options.body : (new Headers(options.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(options.body) : Buffer.from(options.body)).toString('utf8');
  const body = JSON.parse(raw);
  const response = await original(url, options);
  const events = (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  const remote = body.input.some(item => item.type === 'compaction_trigger');
  const native = JSON.stringify(body).includes('<conversation>');
  if (remote) {
    assert(JSON.stringify(body.input).includes(answer));
    for (const item of events.at(-1).response.output) if (item.type === 'compaction') facts.set(item.encrypted_content, answer);
  } else {
    const recovered = native || JSON.stringify(body.input).includes(answer) ? answer : body.input.map(item => facts.get(item.encrypted_content)).find(Boolean);
    assert.equal(recovered, answer, 'Fixture must derive the answer from this actual provider payload');
    note('recall-evidence', { phase: native ? 'native-summary' : 'answer', answer: recovered, via: native ? 'readable-source' : body.input.some(item => item.type === 'compaction') ? 'opaque-token-map' : 'text-summary' });
    for (const event of events) {
      if (event.type === 'response.output_text.delta') event.delta = recovered;
      for (const item of [event.item, ...(event.response?.output ?? [])].filter(Boolean)) for (const part of item.content ?? []) if (part.type === 'output_text') part.text = recovered;
    }
  }
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
};
globalThis[Symbol.for('pi-compact.fixture.fetch')] = globalThis.fetch;
