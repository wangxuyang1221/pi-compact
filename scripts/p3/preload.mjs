import '../fixture/preload.mjs';
import './fault-preload.mjs';
import { zstdDecompressSync } from 'node:zlib';
import { appendFileSync, readFileSync } from 'node:fs';
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const native = globalThis.fetch;
let count = 0;
const sse = events => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
globalThis.fetch = async (url, options) => {
  const entered = performance.now();
  try {
  if (new URL(String(url)).origin !== 'https://fixture.invalid') return await native(url, options);
  const raw = typeof options.body === 'string' ? options.body : (new Headers(options.headers).get('content-encoding') === 'zstd' ? zstdDecompressSync(options.body) : Buffer.from(options.body)).toString('utf8');
  options = { ...options, body: raw };
  const body = JSON.parse(raw);
  if (!body.input?.some(item => item.type === 'compaction_trigger')) return native(url, options);
  const control = JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL));
  count++;
  note('remote-request', { count, body });
  if (control.remote === 'delay') await new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Fixture cancelled')), { once: true });
    const check = () => {
      if (options.signal.aborted) return;
      if (JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL)).remote !== 'delay') resolve();
      else setTimeout(check, 20).unref();
    };
    check();
  });
  if (control.remote === 'failure') return sse([{ type: 'response.failed', response: { error: { message: 'Synthetic remote failure' } } }]);
  const output = [
    { type: 'message', id: `msg_before_${count}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Synthetic checkpoint metadata before.', annotations: [] }] },
    { type: 'compaction', id: `cmp_${count}`, encrypted_content: `SYNTHETIC_OPAQUE_${count}_` + 'x'.repeat(256) },
    { type: 'message', id: `msg_after_${count}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Synthetic checkpoint metadata after.', annotations: [] }] },
  ];
  if (control.remote === 'bad') output[1].encrypted_content = null;
  if (control.remote === 'tools') output.push({ type: 'function_call', id: `fc_checkpoint_${count}`, call_id: `checkpoint_call_${count}`, name: 'alpha', arguments: '{}' }, { type: 'function_call_output', call_id: `checkpoint_call_${count}`, output: 'Already executed synthetic result.' });
  const events = output.map((item, output_index) => ({ type: 'response.output_item.done', output_index, item }));
  if (control.remote !== 'half') events.push({ type: 'response.completed', response: { id: `remote_${count}`, status: 'completed', output, usage: { input_tokens: 1000, output_tokens: 128, total_tokens: 1128 } } });
  note('remote-fixture-success', { count, items: output });
  return sse(events);
  } finally { note('transport-span', { ms: performance.now() - entered }); }
};
globalThis[Symbol.for('pi-compact.fixture.fetch')] = globalThis.fetch;
