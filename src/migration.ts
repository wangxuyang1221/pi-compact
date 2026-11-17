import type * as Pi from '@earendil-works/pi-coding-agent';
import { assertSource, checkpoint, digest, replayMessage, type Checkpoint, type Compatibility } from './checkpoint.ts';
import { codexAccess, type Access } from './codex/compact.ts';
import { object, validateRequestWire } from './codex/wire.ts';

export type Model = NonNullable<Pi.AgentSession['model']>;
export type Selection = { epoch: number; model: Model; key: string };
export type OpaqueCheckpoint = Extract<Checkpoint, { kind: 'opaque' }>;
export type MigrationIntent = { checkpointId: string; checkpoint: OpaqueCheckpoint; target: Selection; sourceValid: boolean };
export type SourceReader = { model: Model; access: Access };
export class MigrationInvalidated extends Error {}

export const selectionKey = (model: Model): string => digest(model);

export function sameCapability(source: Compatibility, target: Compatibility): boolean {
  return source.provider === target.provider && source.endpoint === target.endpoint && source.protocol === target.protocol &&
    source.account === target.account && source.capability === target.capability;
}

export function inspectMigration(host: typeof Pi, branch: Pi.SessionEntry[], target: Selection): MigrationIntent | undefined {
  const entry = branch.findLast(entry => entry.type === 'compaction');
  const value = entry && checkpoint(entry);
  if (!entry || entry.type !== 'compaction' || value?.kind !== 'opaque') return;
  let sourceValid = true;
  try { assertSource(host, branch, entry, value); } catch { sourceValid = false; }
  return { checkpointId: entry.id, checkpoint: value, target, sourceValid };
}

export async function sourceReader(runtime: Pi.ModelRuntime, intent: MigrationIntent, signal: AbortSignal): Promise<SourceReader | undefined> {
  if (!intent.sourceValid) return;
  const source = intent.checkpoint.compatibility;
  const model = runtime.getModel(source.provider, source.model);
  if (!model) return;
  try {
    const access = await codexAccess(runtime, model, signal);
    if (access && sameCapability(source, access.compatibility)) return { model, access };
  } catch { signal.throwIfAborted(); }
}

export function assertSelection(selected: Selection, epoch: number, model: Model): void {
  if (selected.epoch !== epoch || selected.key !== selectionKey(model)) throw new Error('Model selection changed. Retry compaction with the selected model.');
}

export async function readOpaque(runtime: Pi.ModelRuntime, reader: SourceReader, intent: MigrationIntent, signal: AbortSignal,
  assertCurrent: () => void): Promise<{ text: string; usage: Pi.CompactionResult['usage'] }> {
  const { model, access } = reader;
  const value = intent.checkpoint;
  if (value.budget.tokens + 1024 > model.contextWindow - model.maxTokens) throw new Error('Source model cannot fit the opaque checkpoint.');
  const messages = [replayMessage(value, 0, intent.checkpointId), { role: 'user' as const, timestamp: 0,
    content: 'Convert this checkpoint to a complete readable continuation summary. Preserve all task facts, constraints, decisions, file states, tool results and unfinished work. Return only the summary, without tools or encrypted data.' }];
  const result = await runtime.streamSimple(model, { messages }, {
    apiKey: access.apiKey, headers: access.headers, env: access.env, signal, transport: 'sse', maxRetries: 0,
    async onPayload(payload, resolvedModel) {
      assertCurrent();
      const current = await codexAccess(runtime, model, signal);
      if (!current || !sameCapability(value.compatibility, current.compatibility) || resolvedModel.baseUrl.replace(/\/$/, '') !== access.compatibility.endpoint) throw new MigrationInvalidated('Source authorization changed before migration transport.');
      const input = validateRequestWire(object(payload).input);
      const start = input.findIndex(item => JSON.stringify(item) === JSON.stringify(value.items[0]));
      if (start < 0 || value.items.some((item, i) => JSON.stringify(input[start + i]) !== JSON.stringify(item))) throw new Error('Source encoder did not preserve the checkpoint.');
      assertCurrent();
    },
  }).result();
  signal.throwIfAborted();
  assertCurrent();
  const current = await codexAccess(runtime, model, signal);
  if (!current || !sameCapability(value.compatibility, current.compatibility)) throw new MigrationInvalidated('Source authorization changed during migration.');
  assertCurrent();
  const text = result.content.filter(part => part.type === 'text').map(part => part.text).join('\n').trim();
  if (result.stopReason !== 'stop' || !text || result.content.some(part => part.type === 'toolCall')) throw new Error('Source model did not produce a complete readable summary.');
  return { text, usage: result.usage };
}
