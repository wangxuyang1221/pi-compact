import '../p3/preload.mjs';
import fs from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
const original = globalThis.fetch;
const note = (event, data = {}) => fs.appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const mapFile = process.env.PI_FIXTURE_CONTROL + '.opaque-map';
const facts = new Map(fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile)) : []);
const control = () => JSON.parse(fs.readFileSync(process.env.PI_FIXTURE_CONTROL));
const findFacts = text => [...new Set(text.match(/(?:FACT_[A-Z_0-9]+|database|retry|file|timezone)=[A-Za-z0-9_./:-]+/g) ?? [])].join(' ');
const sse = text => {
  const item = { type: 'message', id: 'msg_migration', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
  return new Response([
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { status: 'completed', output: [item], usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } } },
  ].map(e => 'data: ' + JSON.stringify(e) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
};
globalThis.fetch = async (url, options) => {
  if (new URL(String(url)).origin !== 'https://fixture.invalid') return original(url, options);
  const raw = typeof options.body === 'string' ? options.body : (new Headers(options.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(options.body) : Buffer.from(options.body)).toString('utf8');
  const body = JSON.parse(raw);
  const remote = body.input?.some(item => item.type === 'compaction_trigger');
  const migration = raw.includes('Convert this checkpoint to a complete readable continuation summary.');
  const native = raw.includes('<conversation>') || raw.includes('# Conversation');
  const phase = remote ? 'remote' : migration ? 'source' : native ? 'native' : 'normal';
  const account = new Headers(options.headers).get('chatgpt-account-id') ?? 'api-key-fixture';
  note('actual-request', { phase, model: body.model, account, url: String(url), body });
  const recovered = findFacts([raw, ...(body.input ?? []).map(item => facts.get(item.encrypted_content) ?? '')].join(' '));
  if (migration) {
    note('source-request', { body, account });
    while (control().source === 'delay') {
      options.signal?.throwIfAborted();
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    options.signal?.throwIfAborted();
    if (control().source === 'failure') return new Response('synthetic source failure', { status: 400 });
    note('source-fixture-success', { recovered });
    return sse('Readable continuation. ' + recovered);
  }
  const response = await original(url, { ...options, body: raw });
  const events = (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  if (remote) {
    for (const item of events.at(-1)?.response?.output ?? []) if (item.type === 'compaction') facts.set(item.encrypted_content, recovered);
    fs.writeFileSync(mapFile, JSON.stringify([...facts]));
  } else {
    const text = (native ? 'Readable continuation. ' : 'Recalled facts. ') + recovered;
    note('recall-evidence', { phase, recovered });
    for (const event of events) {
      if (event.type === 'response.output_text.delta') event.delta = text;
      if (event.choices?.[0]?.delta?.content) event.choices[0].delta.content = text;
      for (const item of [event.item, ...(event.response?.output ?? [])].filter(Boolean)) for (const part of item.content ?? []) if (part.type === 'output_text') part.text = text;
    }
  }
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
};
globalThis[Symbol.for('pi-compact.fixture.fetch')] = globalThis.fetch;
