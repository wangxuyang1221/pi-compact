import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
const log = (event, data = {}) => fs.appendFileSync(process.env.PI_FIXTURE_LOG, `${JSON.stringify({ at: performance.now(), event, ...data })}\n`);
const block = () => { log('network-blocked', { stack: new Error().stack }); throw new Error('Fixture denies real network access.'); };
net.Socket.prototype.connect = block;
http.request = https.request = http.get = https.get = block;
globalThis.WebSocket = class { constructor() { block(); } };
const read = fs.readFileSync;
fs.readFileSync = function (path, ...args) {
  const name = String(path);
  if (/[/\\]\.pi[/\\]agent[/\\]/.test(name) && !name.startsWith(process.env.PI_CODING_AGENT_DIR)) {
    throw new Error('Fixture denies real Pi configuration and history.');
  }
  return read.call(this, path, ...args);
};
syncBuiltinESMExports();
let normal = 0;
let compact = 0;
const sse = events => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
function response(text, tools = false, chat = false, usageTokens) {
  if (chat) return sse([{ id: 'synthetic', object: 'chat.completion.chunk', model: 'deepseek-chat', choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] },
    { id: 'synthetic', object: 'chat.completion.chunk', model: 'deepseek-chat', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }]);
  const output = tools
    ? ['alpha', 'beta', 'gamma'].map((name, i) => ({ type: 'function_call', id: `fc${i}`, call_id: `call${i}`, name, arguments: '{}', status: 'completed' }))
    : [{ type: 'message', id: `msg${normal}-${compact}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }];
  const events = output.flatMap((item, output_index) => item.type === 'function_call'
    ? [{ type: 'response.output_item.added', output_index, item: { ...item, arguments: '' } }, { type: 'response.function_call_arguments.delta', output_index, delta: '{}' }, { type: 'response.output_item.done', output_index, item }]
    : [{ type: 'response.output_item.added', output_index, item: { ...item, content: [] } }, { type: 'response.content_part.added', output_index, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }, { type: 'response.output_text.delta', output_index, content_index: 0, delta: text }, { type: 'response.output_item.done', output_index, item }]);
  return sse([...events, { type: 'response.completed', response: { id: 'fixture', status: 'completed', output, usage: { input_tokens: usageTokens ? usageTokens - 20 : tools ? 8800 : 100, output_tokens: 20, total_tokens: usageTokens ?? (tools ? 8820 : 120) } } }]);
}
globalThis.fetch = async (url, options) => {
  if (new URL(String(url)).origin !== 'https://fixture.invalid') return block();
  const body = JSON.parse(options.body);
  const native = JSON.stringify(body).includes('<conversation>') || JSON.stringify(body).includes('# Conversation');
  const control = JSON.parse(read(process.env.PI_FIXTURE_CONTROL, 'utf8'));
  if (native) {
    compact++;
    log('native-request', { count: compact, model: body.model, url: String(url), body, currentInput: JSON.stringify(body).includes('CURRENT_INPUT_MARKER'), instructions: JSON.stringify(body).includes('KEEP_CUSTOM_MARKER') });
    if (control.mode === 'delay') await new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('Fixture cancelled')), { once: true });
      const check = () => {
        if (options.signal?.aborted) return;
        if (JSON.parse(read(process.env.PI_FIXTURE_CONTROL, 'utf8')).mode !== 'delay') resolve();
        else setTimeout(check, 20).unref();
      };
      check();
    });
    if (control.mode === 'failure') return sse([{ type: 'response.failed', response: { error: { message: 'Synthetic native failure' } } }]);
    log('fixture-success', { count: compact });
    return response('Synthetic native summary.', false, !!body.messages);
  }
  normal++;
  log('normal-request', { count: normal, input: body.input, tools: body.tools?.map(tool => tool.name) });
  return response('Synthetic complete.', control.tools && normal === 1, !!body.messages, compact ? undefined : control.usageTokens);
};
log('preload', { pid: process.pid, version: process.version, network: 'fetch fixture.invalid only; sockets denied' });
globalThis[Symbol.for('pi-compact.fixture.fetch')] = globalThis.fetch;
