import { appendFileSync, readFileSync } from 'node:fs';
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const mode = () => JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL, 'utf8')).probe;
const text = m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
export default function probe(pi) {
  pi.registerCommand('ind-seed', { description: 'Synthetic hook reconstruction fixture', handler: async (_args, ctx) => {
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const assistant = content => ({ role: 'assistant', content, api: 'openai-responses', provider: 'fixture', model: 'fixture-model', usage, stopReason: 'stop', timestamp: 0 });
    const multiple = ['multi-tool', 'tool-call-modify', 'tool-reorder', 'tool-capacity'].includes(mode());
    const old = { role: 'user', content: 'OLD_HOOK_MARKER ' + 'x'.repeat(mode() === 'cross-cut' ? 100 : 3600), timestamp: 0 };
    ctx.sessionManager.appendMessage(old);
    const ids = multiple ? ['call_independent', 'call_beta', 'call_gamma'] : ['call_independent'];
    ctx.sessionManager.appendMessage(assistant(ids.map((id, index) => ({ type: 'toolCall', id, name: ['alpha', 'beta', 'gamma'][index], arguments: {} }))));
    for (const id of [...ids].reverse()) ctx.sessionManager.appendMessage({ role: 'toolResult', toolCallId: id, toolName: id === 'call_independent' ? 'alpha' : id.slice(5), content: [{ type: 'text', text: 'OLD_TOOL_MARKER' }], isError: false, timestamp: 0 });
    ctx.sessionManager.appendMessage(assistant([{ type: 'text', text: mode() === 'cross-cut' ? 'FILLER ' + 'f'.repeat(3600) : 'Old complete.' }]));
    if (mode() === 'cross-cut') ctx.sessionManager.appendMessage(structuredClone(old));
    ctx.sessionManager.appendMessage({ role: 'user', content: 'RECENT_HOOK_MARKER ' + 'r'.repeat(mode() === 'retained-delete' ? 1400 : 250), timestamp: 1 });
    note('ind-seeded'); ctx.ui.notify('INDEPENDENT_SEEDED', 'info');
  } });
  pi.on('before_agent_start', () => { note('ind-before'); if (mode() === 'system') return { systemPrompt: 'INDEPENDENT_SYSTEM ' + 's'.repeat(22000) }; });
  pi.on('context', event => {
    const kind = mode(); let messages = event.messages;
    const old = () => messages.find(m => m.role === 'user' && text(m).includes('OLD_HOOK_MARKER'));
    if (kind === 'duplicate') messages = [...messages, structuredClone(old())];
    if (kind === 'same-reference') messages.push(old());
    if (kind === 'modify-and-copy') {
      const copy = structuredClone(old());
      old().content = 'MODIFIED_HOOK_MARKER';
      messages.push(copy);
    }
    if (kind === 'clone') messages = structuredClone(messages);
    if (kind === 'clone-duplicate') messages = structuredClone([...messages, old()]);
    if (kind === 'cross-cut') messages = structuredClone(messages);
    if (kind === 'modify') messages = messages.map(m => m === old() ? { ...m, content: 'MODIFIED_HOOK_MARKER' } : m);
    if (kind === 'in-place') old().content = 'MODIFIED_HOOK_MARKER';
    if (kind === 'in-place-array') {
      const index = messages.indexOf(old());
      messages.splice(index, 1, { ...messages[index], content: 'MODIFIED_HOOK_MARKER' });
    }
    if (['remove', 'retained-delete'].includes(kind)) messages = messages.filter(m => !text(m).includes('RECENT_HOOK_MARKER'));
    if (kind === 'reorder') {
      const batch = messages.filter(m => m.role === 'toolResult' || (m.role === 'assistant' && m.content.some(c => c.type === 'toolCall')));
      messages = [{ role: 'user', content: 'ADDED_FIRST', timestamp: 9 }, ...messages.filter(m => !batch.includes(m)).reverse(), ...batch, { role: 'user', content: 'ADDED_LAST', timestamp: 10 }];
    }
    if (['tool-modify', 'multi-tool', 'tool-reorder', 'tool-capacity'].includes(kind)) {
      messages = messages.map(m => m.role === 'toolResult' && m.toolCallId === 'call_independent' ? { ...m, content: [{ type: 'text', text: 'MODIFIED_TOOL_MARKER' + (kind === 'tool-capacity' ? 't'.repeat(38000) : '') }] } : m);
    }
    if (kind === 'tool-call-modify') messages = messages.map(m => m.role === 'assistant' ? { ...m, content: m.content.map(c => c.type === 'toolCall' ? { ...c, arguments: { marker: 'MODIFIED_ARGUMENT_MARKER' } } : c) } : m);
    if (kind === 'tool-reorder') {
      const outputs = messages.filter(m => m.role === 'toolResult').reverse();
      let index = 0;
      messages = messages.map(m => m.role === 'toolResult' ? outputs[index++] : m);
    }
    note('ind-hook', { kind, messages }); return { messages };
  });
  pi.on('before_provider_request', event => note('ind-payload', { payload: event.payload }));
}
