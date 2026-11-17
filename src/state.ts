import { randomUUID } from 'node:crypto';

export type BlockReason = 'failed' | 'cancelled' | 'interrupted' | 'oversized' | 'persistence' | 'unsupported' | 'disposed';
export type Operation = { id: string; generation: number; abort: AbortController };
export type BlockPersistence = { kind: 'saved' } | { kind: 'failed'; error: string; recoveryBlocked: boolean };
export type CompactionState =
  | { kind: 'idle'; generation: number }
  | { kind: 'running'; operation: Operation }
  | { kind: 'blocked'; generation: number; reason: BlockReason; message: string; persistence?: BlockPersistence };
export type StoredState = { kind: 'idle' | 'running' | 'blocked'; operationId?: string; message?: string };

export class CompactionController {
  state: CompactionState;
  private durable: StoredState | undefined;
  constructor(private readonly save: (state: StoredState) => void, restored?: StoredState) {
    this.durable = restored;
    this.state = restored && restored.kind !== 'idle'
      ? { kind: 'blocked', generation: 0, reason: 'interrupted', message: restored.message ?? 'Previous compaction did not complete.' }
      : { kind: 'idle', generation: 0 };
  }

  private persist(state: StoredState): void {
    if (state.kind === 'idle') this.durable = undefined;
    this.save(state);
    this.durable = state;
  }

  assertIdle(): void {
    if (this.state.kind !== 'idle') throw new Error(this.message());
  }

  message(): string {
    if (this.state.kind !== 'blocked') return 'pi-compact is compacting. Wait or cancel the current operation.';
    const persistence = this.state.persistence;
    const warning = persistence?.kind === 'failed'
      ? ` Block persistence failed (${persistence.error}); ${persistence.recoveryBlocked ? 'a previous durable record blocks recovery.' : 'this pause is not durable across restart.'}`
      : '';
    return `pi-compact paused: ${this.state.message}${warning} Use /compact to retry.`;
  }

  begin(explicitRetry: boolean): Operation {
    if (this.state.kind === 'running' || (this.state.kind === 'blocked' && (!explicitRetry || this.state.reason === 'unsupported' || this.state.reason === 'disposed'))) {
      throw new Error(this.message());
    }
    const operation = { id: randomUUID(), generation: this.state.generation + 1, abort: new AbortController() };
    this.state = { kind: 'running', operation };
    try {
      this.persist({ kind: 'running', operationId: operation.id });
    } catch (error) {
      this.block('persistence', `Cannot record compaction start: ${String(error)}`);
      throw error;
    }
    return operation;
  }

  assertCurrent(operation: Operation): void {
    if (this.state.kind !== 'running' || this.state.operation !== operation || operation.abort.signal.aborted) {
      throw new Error('Compaction operation is cancelled or stale.');
    }
  }

  succeed(operation: Operation): void {
    this.assertCurrent(operation);
    this.persist({ kind: 'idle', operationId: operation.id });
    this.state = { kind: 'idle', generation: operation.generation };
  }

  dispose(): void {
    if (this.state.kind === 'running') this.block('interrupted', 'Session closed during compaction.');
    const generation = this.state.kind === 'running' ? this.state.operation.generation : this.state.generation;
    this.state = { kind: 'blocked', generation: generation + 1, reason: 'disposed', message: 'Session is disposed.' };
  }

  block(reason: BlockReason, message: string): BlockPersistence {
    const generation = this.state.kind === 'running' ? this.state.operation.generation : this.state.generation;
    if (this.state.kind === 'running') this.state.operation.abort.abort();
    this.state = { kind: 'blocked', generation: generation + 1, reason, message };
    try {
      this.persist({ kind: 'blocked', message });
    } catch (error) {
      const persistence: BlockPersistence = { kind: 'failed', error: String(error), recoveryBlocked: this.durable?.kind === 'running' || this.durable?.kind === 'blocked' };
      this.state.persistence = persistence;
      return persistence;
    }
    const persistence: BlockPersistence = { kind: 'saved' };
    this.state.persistence = persistence;
    return persistence;
  }
}
