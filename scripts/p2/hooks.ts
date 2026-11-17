import { appendFileSync, readFileSync } from 'node:fs';
export default function hooks(pi) {
  const control = () => JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL, 'utf8'));
  const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
  for (const [index, name] of ['alpha', 'beta', 'gamma'].entries()) {
    pi.registerTool({ name, label: name, description: 'Synthetic batch result', parameters: { type: 'object', properties: {} },
      async execute() {
        await new Promise(resolve => setTimeout(resolve, (3 - index) * 80));
        note('public-tool-complete', { name });
        return { content: [{ type: 'text', text: name.repeat(400) }], details: {} };
      } });
  }
  pi.on('before_agent_start', () => {
    note('public-before-agent-start');
    const c = control();
    if (c.systemSize) return { systemPrompt: 'SYSTEM_CHANGE_MARKER ' + 's'.repeat(c.systemSize) };
  });
  pi.on('context', event => {
    note('public-context');
    const c = control();
    if (c.contextSize) return { messages: [...event.messages, { role: 'user', content: 'CONTEXT_CHANGE_MARKER ' + 'c'.repeat(c.contextSize), timestamp: 0 }] };
  });
}
