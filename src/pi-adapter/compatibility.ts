import type * as Pi from '@earendil-works/pi-coding-agent';

export const supportedVersion = '1.5.2';
const required = ['_buildRuntime', '_runAutoCompaction', '_runDefaultCompaction', '_exceedsCompactionThreshold',
  '_emit', '_handlePostAgentRun', '_runBeforeSettleBoundary', 'compact', 'abortCompaction', 'dispose'];

export function checkHost(host: typeof Pi): void {
  if (host.VERSION !== supportedVersion) throw new Error(`Unsupported Pi ${host.VERSION}; pi-compact requires ${supportedVersion}.`);
  const prototype = host.AgentSession?.prototype as unknown as Record<string, unknown>;
  for (const method of required) {
    if (typeof prototype?.[method] !== 'function') throw new Error(`Unsupported Pi capability: AgentSession.${method}`);
  }
  const mode = host.InteractiveMode?.prototype as unknown as Record<string, unknown>;
  for (const method of ['handleCompactCommand', 'bindCurrentSessionExtensions', 'flushCompactionQueue']) {
    if (typeof mode?.[method] !== 'function') throw new Error(`Unsupported Pi capability: InteractiveMode.${method}`);
  }
}
