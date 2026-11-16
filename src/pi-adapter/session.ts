import { AsyncLocalStorage } from 'node:async_hooks';
import type * as Pi from '@earendil-works/pi-coding-agent';
import { CompactionController, type Operation } from '../state.ts';
import { checkHost } from './compatibility.ts';
import { claimSessionFile, confirmEntry, readJournal, writeJournal } from './journal.ts';

type Model = NonNullable<Pi.AgentSession['model']>;
type Agent = Pi.AgentSession['agent'];
type Session = Pick<Pi.AgentSession, 'agent' | 'model' | 'sessionManager' | 'settingsManager' | 'compact' | 'abortCompaction' | 'dispose'> & {
  _buildRuntime(options: unknown): void;
  _resourceLoader: { getExtensions(): { extensions: Pi.Extension[] } };
  _runAutoCompaction(reason: 'threshold' | 'overflow', willRetry: boolean): Promise<boolean>;
  _runDefaultCompaction(...args: unknown[]): Promise<unknown>;
  _exceedsCompactionThreshold(model: Model, projection: Pi.SessionProjection): boolean;
  _emit(event: Pi.AgentSessionEvent): void;
  _handlePostAgentRun(): Promise<boolean>;
  _runBeforeSettleBoundary(): Promise<boolean>;
  _extensionRunner: { emit(event: Pi.ExtensionEvent): Promise<unknown> };
  _compactionAbortController?: AbortController;
  _autoCompactionAbortController?: AbortController;
  _cacheWarmer?: { cancel(): void; start(...args: unknown[]): void };
};
type Mode = { session: Session; compactionQueuedMessages: { text: string; mode: string }[];
  bindCurrentSessionExtensions(): Promise<void>;
  handleCompactCommand(instructions?: string): Promise<void>; flushCompactionQueue(options?: unknown): Promise<void> };
type Binding = { controller: CompactionController; restore: (() => void)[]; committed?: string; ui?: Mode; restoreEvents?: () => void; publishCompact?: (event: Pi.SessionCompactEvent) => Promise<unknown>; compactEvent?: Pi.SessionCompactEvent; completionEvent?: Pi.AgentSessionEvent };
type Registry = {
  candidates: Map<object, Session>; bindings: Map<Session, Binding>; managers: WeakMap<object, Session>;
  retry: AsyncLocalStorage<{ session: Session; consumed: boolean }>; summary: AsyncLocalStorage<Operation>; restore: (() => void)[];
};
const registryKey = Symbol.for('pi-compact.adapter.v1');

function replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
  return () => {
    if (target[key] !== value) return;
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key];
  };
}

function unsafe(binding: Binding, message: string): never {
  binding.controller.block('unsupported', message);
  throw new Error(binding.controller.message());
}

function bindEvents(session: Session, binding: Binding): void {
  binding.restoreEvents?.();
  const runner = session._extensionRunner;
  const emit = runner.emit;
  binding.publishCompact = event => emit.call(runner, event);
  binding.restoreEvents = replace(runner, 'emit', async event => {
    if (event.type === 'session_compact') {
      const entry = binding.committed && session.sessionManager.getEntry(binding.committed);
      if (!entry || entry.type !== 'compaction') throw new Error('Compaction event has no confirmed checkpoint.');
      binding.compactEvent = { ...event, compactionEntry: entry };
      return undefined;
    }
    return emit.call(runner, event);
  });
}

function bind(host: typeof Pi, registry: Registry, session: Session): void {
  const existing = registry.bindings.get(session);
  if (existing) { bindEvents(session, existing); return; }
  const manager = session.sessionManager;
  const file = manager.getSessionFile();
  const journal = file ? `${file}.pi-compact-state.json` : undefined;
  let release: (() => void) | undefined;
  let claimError: unknown;
  if (journal) {
    try { release = claimSessionFile(journal); } catch (error) { claimError = error; }
  }
  let controller: CompactionController;
  try {
    controller = new CompactionController(state => {
      if (!journal || !release) throw new Error('pi-compact does not own a persistent session.');
      writeJournal(journal, state);
    }, journal ? readJournal(journal) : undefined);
  } catch (error) {
    controller = new CompactionController(() => { throw error; }, { kind: 'blocked', message: String(error) });
  }
  if (claimError) controller.block('unsupported', String(claimError));
  const binding: Binding = { controller, restore: [] };
  registry.bindings.set(session, binding);
  bindEvents(session, binding);
  if (registry.managers.has(manager)) controller.block('unsupported', 'SessionManager is already managed by another session.');
  else registry.managers.set(manager, session);
  if (!file || !manager.isPersisted()) controller.block('unsupported', 'pi-compact requires a persistent session.');
  const restore = binding.restore;
  const agent = session.agent;
  if (typeof agent.prepareRequest !== 'function' || typeof agent.streamFunction !== 'function') {
    process.stderr.write('pi-compact cannot install the request safety boundary.\n');
    process.exit(78);
  }
  const warmer = session._cacheWarmer;
  if (warmer) {
    warmer.cancel();
    restore.push(replace(warmer, 'start', () => { warmer.cancel(); }));
  }
  const ensureModel = () => {
    if (!session.model || String(session.model.api) === 'pi-virtual') unsafe(binding, 'Virtual or missing models are not supported.');
  };
  const tooLarge = () => {
    ensureModel();
    return session._exceedsCompactionThreshold(session.model!, manager.buildSessionProjection());
  };
  const pendingTooLarge = () => {
    const messages = [
      ...manager.buildSessionProjection().messages,
      ...agent.peekQueuedMessages(),
      ...(binding.ui?.compactionQueuedMessages ?? []).map(item => ({ role: 'user' as const, content: item.text, timestamp: 0 })),
    ];
    const settings = session.settingsManager.getCompactionSettings(session.model);
    const raw = messages.reduce((sum, message) => sum + host.estimateTokens(message), 0);
    const encoded = host.convertToLlm(messages).reduce((sum, message) => sum + host.estimateTokens(message), 0);
    return Math.max(raw, encoded) > session.model!.contextWindow - settings.reserveTokens;
  };
  const prepare = agent.prepareRequest;
  restore.push(replace(agent, 'prepareRequest', async (request, signal) => {
    controller.assertIdle();
    ensureModel();
    let prepared = await prepare.call(agent, request, signal);
    if (tooLarge()) {
      await session._runAutoCompaction('threshold', false);
      controller.assertIdle();
      prepared = await prepare.call(agent, request, signal);
    }
    controller.assertIdle();
    return prepared ?? undefined;
  }));
  const stream = agent.streamFunction;
  restore.push(replace(agent, 'streamFunction', (model, context, options) => {
    const operation = registry.summary.getStore();
    const generation = controller.state.kind === 'running' ? controller.state.operation.generation : controller.state.generation;
    const check = () => {
      options?.signal?.throwIfAborted();
      if (operation) controller.assertCurrent(operation);
      else {
        controller.assertIdle();
        if (controller.state.kind !== 'idle' || controller.state.generation !== generation) throw new Error('Request belongs to a stale compaction generation.');
        ensureModel();
        const settings = session.settingsManager.getCompactionSettings(model);
        const tokens = context.messages.reduce((sum, message) => sum + host.estimateTokens(message), 0);
        if (tooLarge() || tokens > model.contextWindow - settings.reserveTokens) {
          controller.block('oversized', 'Pending input cannot fit safely after compaction.');
          controller.assertIdle();
        }
      }
    };
    check();
    const onPayload = options?.onPayload;
    return stream(model, context, { ...options, onPayload: async (payload, payloadModel) => {
      const before = JSON.stringify(payload);
      const transformed = await onPayload?.(payload, payloadModel);
      if (JSON.stringify(transformed ?? payload) !== before) unsafe(binding, 'Provider payload was modified after the safety check.');
      check();
      return transformed;
    } });
  }));
  const continuation = agent.continue;
  restore.push(replace(agent, 'continue', function (this: Agent) {
    controller.assertIdle();
    return continuation.call(this);
  }));
  const append = manager.appendCompaction;
  if (release) restore.push(replace(manager, 'appendCompaction', function (...args) {
    const state = controller.state;
    if (state.kind !== 'running') throw new Error('Compaction append has no active operation.');
    controller.assertCurrent(state.operation);
    if (binding.committed) throw new Error('Compaction operation already committed.');
    if (!args[0]?.trim() || (args[1] !== null && !manager.getEntry(args[1]))) throw new Error('Invalid native compaction result.');
    const id = append.apply(manager, args);
    try {
      confirmEntry(file!, manager.getEntry(id)!);
    } catch (error) {
      controller.block('persistence', String(error));
      throw error;
    }
    binding.committed = id;
    return id;
  }));
  const emit = session._emit;
  restore.push(replace(session, '_emit', function (event) {
    if (event.type === 'compaction_end') {
      const state = controller.state;
      if (event.result && binding.committed && state.kind === 'running') {
        try {
          controller.assertCurrent(state.operation);
          if (tooLarge() || pendingTooLarge()) {
            controller.block('oversized', 'Pending input cannot be reduced enough to continue.');
          } else controller.succeed(state.operation);
        } catch (error) {
          controller.block('persistence', String(error));
        }
      } else if (state.kind === 'running') {
        controller.block(event.aborted ? 'cancelled' : 'failed', event.errorMessage ?? 'Compaction cancelled or produced no checkpoint.');
      }
      if (controller.state.kind !== 'idle') event = { ...event, result: undefined, willRetry: false, errorMessage: controller.message() };
      else { binding.completionEvent = event; return; }
    }
    return emit.call(session, event);
  }));
  const run = async <T>(native: () => Promise<T>, explicit: boolean): Promise<T> => {
    ensureModel();
    const operation = controller.begin(explicit);
    binding.committed = undefined;
    binding.compactEvent = undefined;
    binding.completionEvent = undefined;
    try {
      const result = await native();
      if (controller.state.kind === 'running') controller.block('failed', 'Native compaction produced no committed checkpoint.');
      controller.assertIdle();
      const compactEvent = binding.compactEvent;
      const completionEvent = binding.completionEvent;
      binding.compactEvent = undefined;
      binding.completionEvent = undefined;
      if (compactEvent) await binding.publishCompact?.(compactEvent);
      if (completionEvent && controller.state.kind === 'idle' && controller.state.generation === operation.generation) emit.call(session, completionEvent);
      return result;
    } catch (error) {
      if (controller.state.kind === 'running') controller.block(operation.abort.signal.aborted ? 'cancelled' : 'failed', String(error));
      throw error;
    }
  };
  const manual = session.compact;
  restore.push(replace(session, 'compact', instructions => {
    const intent = registry.retry.getStore();
    const explicit = intent?.session === session && !intent.consumed;
    if (explicit) intent.consumed = true;
    return run(() => manual.call(session, instructions), explicit);
  }));
  const auto = session._runAutoCompaction;
  restore.push(replace(session, '_runAutoCompaction', (reason, retry) => run(() => auto.call(session, reason, retry), false)));
  const summarize = session._runDefaultCompaction;
  restore.push(replace(session, '_runDefaultCompaction', (...args) => {
    const state = controller.state;
    if (state.kind !== 'running') throw new Error('Summary has no active operation.');
    return registry.summary.run(state.operation, () => summarize.apply(session, args));
  }));
  const abort = session.abortCompaction;
  restore.push(replace(session, 'abortCompaction', () => {
    if (controller.state.kind === 'running' && (session._compactionAbortController || session._autoCompactionAbortController)) controller.block('cancelled', 'Compaction was cancelled.');
    abort.call(session);
  }));
  for (const key of ['_handlePostAgentRun', '_runBeforeSettleBoundary'] as const) {
    const native = session[key];
    restore.push(replace(session, key, async () => controller.state.kind === 'idle' && await native.call(session)));
  }
  const dispose = session.dispose;
  restore.push(replace(session, 'dispose', () => {
    controller.dispose();
    dispose.call(session);
    binding.restoreEvents?.();
    for (const undo of restore.reverse()) undo();
    registry.bindings.delete(session);
    registry.candidates.delete(manager);
    if (registry.managers.get(manager) === session) registry.managers.delete(manager);
    release?.();
    if (!registry.bindings.size) {
      for (const undo of registry.restore.reverse()) undo();
      delete (globalThis as Record<symbol, unknown>)[registryKey];
    }
  }));
}

export function install(host: typeof Pi, pi: Pi.ExtensionAPI): void {
  try { checkHost(host); } catch (error) {
    process.stderr.write(`pi-compact safety adapter unavailable: ${String(error)}\n`);
    // Loader errors are swallowed by Pi, so an unusable safety adapter must terminate startup.
    process.exit(78);
  }
  const globals = globalThis as Record<symbol, unknown>;
  let registry = globals[registryKey] as Registry | undefined;
  if (!registry) {
    registry = { candidates: new Map(), bindings: new Map(), managers: new WeakMap(), retry: new AsyncLocalStorage(), summary: new AsyncLocalStorage(), restore: [] };
    globals[registryKey] = registry;
    const active = registry;
    const prototype = host.AgentSession.prototype as unknown as Session;
    const build = prototype._buildRuntime;
    active.restore.push(replace(prototype, '_buildRuntime', function (this: Session, options) {
      build.call(this, options);
      active.candidates.set(this.sessionManager, this);
    }));
    const mode = host.InteractiveMode.prototype as unknown as Mode;
    const bindMode = mode.bindCurrentSessionExtensions;
    active.restore.push(replace(mode, 'bindCurrentSessionExtensions', async function (this: Mode) {
      await bindMode.call(this);
      const binding = active.bindings.get(this.session);
      if (binding) binding.ui = this;
    }));
    const compact = mode.handleCompactCommand;
    active.restore.push(replace(mode, 'handleCompactCommand', function (this: Mode, instructions) {
      const binding = active.bindings.get(this.session);
      if (binding) binding.ui = this;
      return active.retry.run({ session: this.session, consumed: false }, () => compact.call(this, instructions));
    }));
    const flush = mode.flushCompactionQueue;
    active.restore.push(replace(mode, 'flushCompactionQueue', async function (this: Mode, options) {
      const binding = active.bindings.get(this.session);
      if (binding) {
        binding.ui = this;
        if (binding.controller.state.kind !== 'idle') return;
      }
      return flush.call(this, options);
    }));
  }
  const active = registry;
  pi.on('session_start', (_event, ctx) => {
    const session = active.candidates.get(ctx.sessionManager);
    if (!session) {
      process.stderr.write('pi-compact could not bind the host session.\n');
      process.exit(78);
    }
    try { bind(host, active, session); } catch (error) {
      process.stderr.write(String(error));
      process.exit(78);
    }
  });
}
