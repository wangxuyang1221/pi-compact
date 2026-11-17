import { createHash } from 'node:crypto';
import type * as Pi from '@earendil-works/pi-coding-agent';
import type { Compatibility } from '../checkpoint.ts';
import { CompactResponse, object, validateRequestWire } from './wire.ts';

type Model = NonNullable<Pi.AgentSession['model']>;
export type Access = { compatibility: Compatibility; apiKey: string; headers?: Record<string, string | null>; env?: Record<string, string> };

export async function codexAccess(runtime: Pi.ModelRuntime, model: Model, signal?: AbortSignal): Promise<Access | undefined> {
  if (model.provider !== 'openai-codex' || model.api !== 'openai-codex-responses') return undefined;
  const resolved = await runtime.getAuth(model, { signal });
  if (!runtime.isUsingOAuth(model.provider) || !resolved?.auth.apiKey) return undefined;
  const endpoint = new URL(resolved.auth.baseUrl ?? model.baseUrl).href.replace(/\/$/, '');
  if (!['https://chatgpt.com/backend-api', 'https://fixture.invalid/backend-api'].includes(endpoint)) return undefined;
  let account: unknown;
  try {
    const claims = object(JSON.parse(Buffer.from(resolved.auth.apiKey.split('.')[1], 'base64url').toString('utf8')));
    account = object(claims['https://api.openai.com/auth']).chatgpt_account_id;
    if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) return undefined;
  } catch { return undefined; }
  if (typeof account !== 'string' || !account) return undefined;
  return { compatibility: { provider: 'openai-codex', endpoint, protocol: 'compaction_trigger', account: createHash('sha256').update(account).digest('hex'), model: model.id, capability: 'pi-1.5.2-codex-signature-v1' },
    apiKey: resolved.auth.apiKey, headers: resolved.auth.headers, env: resolved.env };
}

export async function remoteCompact(runtime: Pi.ModelRuntime, model: Model, messages: ReturnType<typeof Pi.convertToLlm>, access: Access, signal: AbortSignal, instructions?: string, assertCurrent?: () => void) {
  const response = new CompactResponse();
  const result = await runtime.streamSimple(model, { messages }, {
    apiKey: access.apiKey, headers: access.headers, env: access.env, signal, transport: 'sse', maxRetries: 0,
    async onPayload(payload, resolvedModel) {
      signal.throwIfAborted();
      assertCurrent?.();
      const current = await codexAccess(runtime, model, signal);
      if (!current || JSON.stringify(current.compatibility) !== JSON.stringify(access.compatibility) || resolvedModel.baseUrl.replace(/\/$/, '') !== access.compatibility.endpoint) throw new Error('Remote authorization changed before transport.');
      assertCurrent?.();
      const body = object(payload);
      validateRequestWire(body.input, false);
      return { ...body, ...(instructions ? { instructions: `${body.instructions}\n\nCompaction instructions:\n${instructions}` } : {}), input: [...body.input as unknown[], { type: 'compaction_trigger' }] };
    },
    onProviderStreamEvent(event) { response.accept(event); },
  }).result();
  signal.throwIfAborted();
  assertCurrent?.();
  const current = await codexAccess(runtime, model, signal);
  if (!current || JSON.stringify(current.compatibility) !== JSON.stringify(access.compatibility)) throw new Error('Remote authorization changed during compaction.');
  assertCurrent?.();
  if (result.stopReason === 'error' || result.stopReason === 'aborted') throw new Error('Codex remote compaction failed.');
  return { ...response.result(), usage: result.usage };
}
