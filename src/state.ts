import { randomUUID } from 'node:crypto';

export type BlockReason = 'failed' | 'cancelled' | 'interrupted' | 'oversized' | 'persistence' | 'unsupported' | 'disposed';
export type Operation = { id: string; generation: number; abort: AbortController };
export type CompactionState =
  | { kind: 'idle'; generation: number }
  | { kind: 'running'; operation: Operation }
  | { kind: 'blocked'; generation: number; reason: BlockReason; message: string };
export type StoredState = { kind: 'idle' | 'running' | 'blocked'; operationId?: string; message?: string };

export class CompactionController {
  state: CompactionState;
  constructor(private readonly save: (state: StoredState) => void, restored?: StoredState) {
    this.state = restored && restored.kind !== 'idle'
      ? { kind: 'blocked', generation: 0, reason: 'interrupted', message: restored.message ?? 'Previous compaction did not complete.' }
      : { kind: 'idle', generation: 0 };
  }

  assertIdle(): void {
    if (this.state.kind !== 'idle') throw new Error(this.message());
  }

  message(): string {
    return this.state.kind === 'blocked'
      ? `pi-compact paused: ${this.state.message} Use /compact to retry.`
      : 'pi-compact is compacting. Wait or cancel the current operation.';
  }

  begin(explicitRetry: boolean): Operation {
    if (this.state.kind === 'running' || (this.state.kind === 'blocked' && (!explicitRetry || this.state.reason === 'unsupported' || this.state.reason === 'disposed'))) {
      throw new Error(this.message());
    }
    const operation = { id: randomUUID(), generation: this.state.generation + 1, abort: new AbortController() };
    this.state = { kind: 'running', operation };
    try {
      this.save({ kind: 'running', operationId: operation.id });
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
    this.save({ kind: 'idle', operationId: operation.id });
    this.state = { kind: 'idle', generation: operation.generation };
  }

  block(reason: BlockReason, message: string): void {
    const generation = this.state.kind === 'running' ? this.state.operation.generation : this.state.generation;
    if (this.state.kind === 'running') this.state.operation.abort.abort();
    this.state = { kind: 'blocked', generation: generation + 1, reason, message };
    try {
      this.save({ kind: 'blocked', message });
    } catch {
      // The durable begin record keeps recovery blocked when the failure record cannot be written.
    }
  }
}
