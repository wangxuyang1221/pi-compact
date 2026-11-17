import * as host from '@earendil-works/pi-coding-agent';
import fs from 'node:fs';
const note = (event, data = {}) => fs.appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const sessions = new Map();
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) { sessions.set(this.sessionManager, this); return bind.apply(this, args); };
export default function observer(pi) {
  pi.on('session_start', async (_event, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    let profiler;
    if (process.env.P4_PROFILE) {
      const { Session } = await import('node:inspector');
      profiler = new Session(); profiler.connect();
      await new Promise(resolve => profiler.post('Profiler.enable', resolve));
      await new Promise(resolve => profiler.post('Profiler.start', resolve));
    }
    const start = performance.now();
    ctx.sessionManager.setSessionFile(ctx.sessionManager.getSessionFile());
    session.refreshContext();
    note('restore-span', { ms: performance.now() - start, bytes: fs.statSync(ctx.sessionManager.getSessionFile()).size });
    const selectStart = performance.now();
    await session.setModel(session.modelRuntime.getModel(process.env.P4_MIGRATE ? 'deepseek' : 'openai-codex', process.env.P4_MIGRATE ? 'deepseek-chat' : 'gpt-6.1-sol'));
    note('select-span', { ms: performance.now() - selectStart });
    const prepare = session.agent.prepareRequest;
    session.agent.prepareRequest = async (...args) => { note('request-start'); return prepare.apply(session.agent, args); };
    session.subscribe(async event => {
      if (event.type !== 'agent_settled') return;
      note('request-settled', { rssKiB: process.resourceUsage().maxRSS });
      if (profiler) {
        const result = await new Promise((resolve, reject) => profiler.post('Profiler.stop', (error, result) => error ? reject(error) : resolve(result)));
        fs.writeFileSync(process.env.PI_FIXTURE_CONTROL + '.cpuprofile', JSON.stringify(result.profile)); profiler.disconnect(); profiler = undefined;
      }
    });
    note('perf-ready');
  });
}
