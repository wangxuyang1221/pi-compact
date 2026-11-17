import fs from 'node:fs';
import { decodedBody, durableWrite } from './guard.mjs';
const sse = events => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
export function fixtureTransport(mapPath) {
  const facts = new Map(fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : []);
  let sequence = facts.size;
  return async (_url, options) => {
    const { body, raw } = decodedBody(options);
    const recovered = [...new Set([raw.toString(), ...(body.input ?? []).map(item => facts.get(item.encrypted_content) ?? '')].join(' ').match(/(?:FACT_[A-Z_0-9]+|database|retry|file|timezone)=[A-Za-z0-9_./:-]+/g) ?? [])].join(' ');
    const remote = body.input?.some(item => item.type === 'compaction_trigger');
    if (body.messages) return sse([
      { id: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: recovered }, finish_reason: null }] },
      { id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } },
    ]);
    const output = remote
      ? [{ type: 'compaction', id: 'cmp_' + ++sequence, encrypted_content: 'SYNTHETIC_OPAQUE_' + sequence + '_'.repeat(256) }]
      : [{ type: 'message', id: 'msg_' + ++sequence, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: recovered, annotations: [] }] }];
    if (remote) { facts.set(output[0].encrypted_content, recovered); durableWrite(mapPath, [...facts]); }
    return sse([
      ...output.flatMap((item, output_index) => item.type === 'compaction' ? [{ type: 'response.output_item.done', output_index, item }] : [
        { type: 'response.output_item.added', output_index, item: { ...item, content: [] } },
        { type: 'response.output_text.delta', output_index, content_index: 0, delta: recovered },
        { type: 'response.output_item.done', output_index, item },
      ]),
      { type: 'response.completed', response: { id: 'fixture', status: 'completed', output, usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } } },
    ]);
  };
}
export function writeFixtureCredentials(agentDir) {
  const token = 'fixture.' + Buffer.from(JSON.stringify({ exp: 4102444800, 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url') + '.fixture';
  durableWrite(agentDir + '/auth.json', { 'openai-codex': { type: 'oauth', access: token, refresh: 'synthetic-unused', expires: 4102444800000 }, deepseek: { type: 'api_key', key: 'synthetic-only' } });
  return agentDir + '/auth.json';
}
