import type * as Pi from '@earendil-works/pi-coding-agent';

export const supportedVersion = '1.5.2';
const required = ['_buildRuntime', '_runAutoCompaction', '_runDefaultCompaction', '_exceedsCompactionThreshold', '_checkCompaction',
  '_emit', '_handlePostAgentRun', '_runBeforeSettleBoundary', 'compact', 'abortCompaction', 'dispose', 'prompt'];

export function checkHost(host: typeof Pi): void {
  if (host.VERSION !== supportedVersion) throw new Error(`Unsupported Pi ${host.VERSION}; pi-compact requires ${supportedVersion}.`);
  const prototype = host.AgentSession?.prototype as unknown as Record<string, unknown>;
  for (const method of required) {
    if (typeof prototype?.[method] !== 'function') throw new Error(`Unsupported Pi capability: AgentSession.${method}`);
  }
  const manager = host.SessionManager?.prototype as unknown as Record<string, unknown>;
  for (const method of ['buildSessionContext', 'buildSessionProjection', 'getBranch', 'setSessionFile', '_appendEntry', '_rewriteFile']) {
    if (typeof manager?.[method] !== 'function') throw new Error(`Unsupported Pi capability: SessionManager.${method}`);
  }
  const runtime = host.ModelRuntime?.prototype as unknown as Record<string, unknown>;
  for (const method of ['getAuth', 'isUsingOAuth', 'streamSimple']) {
    if (typeof runtime?.[method] !== 'function') throw new Error(`Unsupported Pi capability: ModelRuntime.${method}`);
  }
  const mode = host.InteractiveMode?.prototype as unknown as Record<string, unknown>;
  for (const method of ['handleCompactCommand', 'bindCurrentSessionExtensions', 'flushCompactionQueue']) {
    if (typeof mode?.[method] !== 'function') throw new Error(`Unsupported Pi capability: InteractiveMode.${method}`);
  }
}
