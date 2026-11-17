import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync } from 'node:fs';

const sessions = new Map();
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) {
  sessions.set(this.sessionManager, this);
  return bind.apply(this, args);
};
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');

export default function observer(pi) {
  pi.registerCommand('p3-write-check', { description: 'Probe recovery write admission', handler: async (_args, ctx) => {
    const manager = ctx.sessionManager;
    const session = sessions.get(manager);
    const attempts = [];
    for (const [name, write] of [
      ['message', () => manager.appendMessage({ role: 'user', content: 'FORBIDDEN_WRITE', timestamp: 0 })],
      ['custom', () => manager.appendCustomEntry('recovery-probe', { content: 'FORBIDDEN_WRITE' })],
      ['rewrite', () => manager._rewriteFile()],
      ['agent-prompt', () => session.agent.prompt('FORBIDDEN_WRITE')],
      ['session-prompt', () => session.prompt('FORBIDDEN_WRITE')],
    ]) {
      try { await write(); attempts.push({ name, rejected: false }); }
      catch (error) { attempts.push({ name, rejected: true, error: String(error) }); }
    }
    note('write-check', { attempts });
  } });
  pi.registerCommand('p3-small-model', { description: 'Select a smaller synthetic window', handler: async (_args, ctx) => {
    await pi.setModel({ ...ctx.model, contextWindow: 4096 });
    note('small-model');
  } });
}
