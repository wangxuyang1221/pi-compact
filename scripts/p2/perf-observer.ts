import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync } from 'node:fs';
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) {
  const result = await bind.apply(this, args);
  instrument(this);
  return result;
};
function instrument(session) {
  for (const extension of session._resourceLoader.getExtensions().extensions) {
    const command = extension.commands.get('compact-config');
    if (!command) continue;
    const handler = command.handler;
    command.handler = async (...args) => {
      const start = performance.now();
      try { return await handler(...args); }
      finally { note('config-duration', { ms: performance.now() - start }); }
    };
  }
  const prepare = session.agent.prepareRequest;
  session.agent.prepareRequest = async (...args) => {
    const start = performance.now();
    try { return await prepare.apply(session.agent, args); }
    finally { note('prepare-duration', { ms: performance.now() - start }); }
  };
  const transform = session.agent.transformContext;
  session.agent.transformContext = async (...args) => {
    const start = performance.now();
    try { return await transform.apply(session.agent, args); }
    finally { note('transform-duration', { ms: performance.now() - start }); }
  };
  const stream = session.agent.streamFunction;
  session.agent.streamFunction = (...args) => {
    const start = performance.now();
    try { return stream.apply(session.agent, args); }
    finally { note('stream-duration', { ms: performance.now() - start }); }
  };
}
export default function observer(pi) {
  pi.on('session_start', (_event, ctx) => {
    const size = Number(process.env.PI_P2_MESSAGES);
    const assistant = { role: 'assistant', content: [{ type: 'text', text: 'a' }], api: 'openai-responses', provider: 'fixture', model: 'fixture-model',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: 0 };
    for (let n = 0; n < size; n++) ctx.sessionManager.appendMessage(n % 2 ? assistant : { role: 'user', content: 'u', timestamp: 0 });
    const registry = globalThis[Symbol.for('pi-compact.adapter.v1')];
    const session = registry?.candidates.get(ctx.sessionManager);
    session?.refreshContext();
    note('perf-seed', { size, messages: ctx.sessionManager.buildSessionProjection().messages.length });
  });
  pi.on('before_provider_request', () => { note('payload-boundary'); });
}
