import * as host from '@earendil-works/pi-coding-agent';
import fs from 'node:fs';
const note = (event, data = {}) => fs.appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const sessions = new Map();
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) {
  sessions.set(this.sessionManager, this);
  return bind.apply(this, args);
};
export default function (pi) {
  pi.registerCommand('p4-reload-source', { description: 'Reload synthetic source at the same leaf', handler: async (args, ctx) => {
    const manager = ctx.sessionManager, session = sessions.get(manager), file = manager.getSessionFile(), leaf = manager.getLeafId();
    fs.copyFileSync(file, process.env.PI_FIXTURE_CONTROL + '.before-reload.jsonl');
    const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    const first = rows.find(entry => entry.type === 'message' && entry.message.role === 'user');
    if (args !== 'unchanged') first.message.content = 'FACT_RELOADED=corrected_value';
    fs.writeFileSync(file, rows.map(entry => JSON.stringify(entry)).join('\n') + '\n');
    manager.setSessionFile(file);
    session.refreshContext();
    fs.copyFileSync(file, process.env.PI_FIXTURE_CONTROL + '.after-reload.jsonl');
    note('source-reloaded', { beforeLeaf: leaf, afterLeaf: manager.getLeafId(), entry: first.id, content: first.message.content });
  } });
  pi.registerCommand('p4-split-tools', { description: 'Append a synthetic legal tool turn', handler: async (_args, ctx) => {
    const manager = ctx.sessionManager, session = sessions.get(manager);
    const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    manager.appendMessage({ role: 'user', content: 'FACT_TURN=unique_turn_begin ' + 'z'.repeat(1500), timestamp: 1 });
    for (let i = 0; i < 4; i++) {
      manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'p4tool' + i, name: 'alpha', arguments: {} }], api: session.model.api, provider: session.model.provider, model: session.model.id, usage, stopReason: 'toolUse', timestamp: 2 + i });
      manager.appendMessage({ role: 'toolResult', toolCallId: 'p4tool' + i, toolName: 'alpha', content: [{ type: 'text', text: 'FACT_T' + i + '=unique_result_' + i + ' ' + 'q'.repeat(800) }], isError: false, timestamp: 2 + i });
    }
    manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'FACT_LAST=retained_answer ' + 'r'.repeat(600) }], api: session.model.api, provider: session.model.provider, model: session.model.id, usage, stopReason: 'stop', timestamp: 9 });
    session.refreshContext();
    note('split-seeded');
  } });
  pi.on('session_before_compact', event => note('fix-preparation', { preparation: event.preparation }));
}
