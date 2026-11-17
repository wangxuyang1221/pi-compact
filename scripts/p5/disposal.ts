import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync, existsSync } from 'node:fs';
export default function disposal(pi) {
  const add = host.InteractiveMode.prototype.addMessageToChat;
  const dispose = host.AgentSession.prototype.dispose;
  pi.on('session_shutdown', (_event, ctx) => {
    const registry = globalThis[Symbol.for('pi-compact.adapter.v1')];
    const session = registry.candidates.get(ctx.sessionManager);
    const file = ctx.sessionManager.getSessionFile();
    session.dispose();
    session.dispose();
    appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event: 'p5-disposed',
      uiRegistryReleased: !globalThis[Symbol.for('pi-compact.renderer.v1')],
      safetyRegistryReleased: !globalThis[Symbol.for('pi-compact.adapter.v1')],
      addRestored: host.InteractiveMode.prototype.addMessageToChat === add,
      disposeRestored: host.AgentSession.prototype.dispose === dispose,
      lockReleased: !existsSync(file + '.pi-compact-state.json.lock'),
    }) + '\n');
  });
}
