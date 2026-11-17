import * as host from '@earendil-works/pi-coding-agent';
const mark = (...args) => globalThis[Symbol.for('pi-compact.config-trace')](...args);
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) {
  const result = await bind.apply(this, args);
  for (const extension of this._resourceLoader.getExtensions().extensions) {
    const command = extension.commands.get('compact-config');
    if (!command) continue;
    const handler = command.handler;
    command.handler = async (args, ctx) => {
      mark('handler-entry', { args });
      const ui = { ...ctx.ui, notify: (...values) => {
        mark('notify', { args, message: values[0], type: values[1] });
        return ctx.ui.notify(...values);
      } };
      try { return await handler(args, { ...ctx, ui }); }
      finally { mark('handler-return', { args }); }
    };
  }
  return result;
};
export default function observer(pi) {
  pi.registerCommand('p2-perf-ready', { description: 'Confirm initialized fixture input and drawing', handler: async (_args, ctx) => {
    mark('ready-handler');
    ctx.ui.notify('P2_PERF_INITIALIZED', 'info');
  } });
}
