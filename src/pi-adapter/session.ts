import { AsyncLocalStorage } from 'node:async_hooks';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type * as Pi from '@earendil-works/pi-coding-agent';
import { CompactionController, type Operation } from '../state.ts';
import { checkHost } from './compatibility.ts';
import { assertSessionFileAvailable, claimSessionFile, confirmEntry, readJournal, writeJournal } from './journal.ts';

type Model = NonNullable<Pi.AgentSession['model']>;
type Agent = Pi.AgentSession['agent'];
type Session = Pick<Pi.AgentSession, 'agent' | 'model' | 'sessionManager' | 'settingsManager' | 'compact' | 'abortCompaction' | 'dispose' | 'prompt'> & {
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
type Execution = { operation: Operation; settled: Promise<void>; finish(): void; committed?: string; compactEvent?: Pi.SessionCompactEvent; completionEvent?: Pi.AgentSessionEvent };
type Binding = { controller: CompactionController; lifecycle: 'active' | 'disposed'; execution?: Execution; ui?: Mode; restoreEvents?: () => void; publishCompact?: (event: Pi.SessionCompactEvent) => Promise<unknown> };
type FileOwner = { file: string; release(): void; session?: Session };
type Manager = { [K in keyof Pi.SessionManager]: Pi.SessionManager[K] } & { _appendEntry(entry: Pi.SessionEntry): void; _rewriteFile(): void };
type Registry = {
  entrypoints: Set<string>; candidates: Map<object, Session>; bindings: Map<Session, Binding>; files: Map<object, FileOwner>;
  execution: AsyncLocalStorage<Execution>; retry: AsyncLocalStorage<{ session: Session; consumed: boolean }>; summary: AsyncLocalStorage<Operation>; restore: (() => void)[];
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

function bindEvents(session: Session, binding: Binding, registryForEvent: AsyncLocalStorage<Execution>): void {
  binding.restoreEvents?.();
  const runner = session._extensionRunner;
  const emit = runner.emit;
  binding.publishCompact = event => emit.call(runner, event);
  binding.restoreEvents = replace(runner, 'emit', async event => {
    if (event.type === 'session_compact') {
      const execution = registryForEvent.getStore();
      if (!execution || binding.execution !== execution) throw new Error('Stale compaction event.');
      const entry = execution.committed && session.sessionManager.getEntry(execution.committed);
      if (!entry || entry.type !== 'compaction') throw new Error('Compaction event has no confirmed checkpoint.');
      execution.compactEvent = { ...event, compactionEntry: entry };
      return undefined;
    }
    return emit.call(runner, event);
  });
}

function ownFile(registry: Registry, manager: Pick<Pi.SessionManager, 'getSessionFile' | 'isPersisted'>): FileOwner {
  const file = manager.getSessionFile();
  if (!file || !manager.isPersisted()) throw new Error('pi-compact requires a persistent session.');
  const existing = registry.files.get(manager);
  if (existing) {
    if (existing.file !== file) throw new Error('Managed session file changed without releasing ownership.');
    return existing;
  }
  const owner = { file, release: claimSessionFile(file + '.pi-compact-state.json') };
  registry.files.set(manager, owner);
  return owner;
}

function bind(host: typeof Pi, registry: Registry, session: Session): void {
  const existing = registry.bindings.get(session);
  if (existing) { bindEvents(session, existing, registry.execution); return; }
  const manager = session.sessionManager;
  const file = manager.getSessionFile();
  const journal = file ? `${file}.pi-compact-state.json` : undefined;
  const owner = ownFile(registry, manager);
  if (owner.session && owner.session !== session) throw new Error('SessionManager is already managed by another session.');
  owner.session = session;
  let controller: CompactionController;
  try {
    controller = new CompactionController(state => {
      if (!journal) throw new Error('pi-compact does not own a persistent session.');
      writeJournal(journal, state);
    }, journal ? readJournal(journal) : undefined);
  } catch (error) {
    controller = new CompactionController(() => { throw error; });
    controller.block('persistence', `Cannot read recovery state: ${String(error)}`);
  }
  const binding: Binding = { controller, lifecycle: 'active' };
  registry.bindings.set(session, binding);
  bindEvents(session, binding, registry.execution);

  const agent = session.agent;
  const assertAlive = () => {
    if (binding.lifecycle === 'disposed') throw new Error('Session is disposed.');
  };
  const prompt = session.prompt;
  replace(session, 'prompt', (...args) => {
    assertAlive();
    return prompt.apply(session, args);
  });
  const agentPrompt = agent.prompt.bind(agent);
  replace(agent, 'prompt', (input, images?: Parameters<Agent['prompt']>[1]) => {
    assertAlive();
    return typeof input === 'string' ? agentPrompt(input, images) : agentPrompt(input);
  });
  const ownedManager = manager as unknown as Manager;
  for (const key of ['_appendEntry', '_rewriteFile'] as const) {
    const native = ownedManager[key];
    replace(ownedManager, key, function (entry: Pi.SessionEntry) {
      assertAlive();
      return native.call(ownedManager, entry);
    });
  }
  if (typeof agent.prepareRequest !== 'function' || typeof agent.streamFunction !== 'function') {
    process.stderr.write('pi-compact cannot install the request safety boundary.\n');
    process.exit(78);
  }
  const warmer = session._cacheWarmer;
  if (warmer) {
    warmer.cancel();
    replace(warmer, 'start', () => { warmer.cancel(); });
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
    return Math.max(raw, encoded) > session.model!.contextWindow - (settings.enabled ? settings.reserveTokens : session.model!.maxTokens);
  };
  const assertAdmission = () => {
    controller.assertIdle();
    if (binding.execution) throw new Error('Native compaction is still finishing.');
  };
  const prepare = agent.prepareRequest;
  replace(agent, 'prepareRequest', async (request, signal) => {
    assertAdmission();
    ensureModel();
    let prepared = await prepare.call(agent, request, signal);
    if (tooLarge()) {
      await session._runAutoCompaction('threshold', false);
      assertAdmission();
      prepared = await prepare.call(agent, request, signal);
    }
    assertAdmission();
    return prepared ?? undefined;
  });
  const stream = agent.streamFunction;
  replace(agent, 'streamFunction', (model, context, options) => {
    const operation = registry.summary.getStore();
    const generation = controller.state.kind === 'running' ? controller.state.operation.generation : controller.state.generation;
    const check = () => {
      options?.signal?.throwIfAborted();
      if (operation) controller.assertCurrent(operation);
      else {
        assertAdmission();
        if (controller.state.kind !== 'idle' || controller.state.generation !== generation) throw new Error('Request belongs to a stale compaction generation.');
        ensureModel();
        const tokens = context.messages.reduce((sum, message) => sum + host.estimateTokens(message), 0);
        if (tooLarge() || tokens > model.contextWindow - model.maxTokens) {
          controller.block('oversized', 'Pending input cannot fit safely after compaction.');
          assertAdmission();
        }
      }
    };
    check();
    const onPayload = options?.onPayload;
    return stream(model, context, { ...options, onPayload: async (payload, payloadModel) => {
      const before = JSON.stringify(payload);
      const transformed = await onPayload?.(payload, payloadModel);
      check();
      if (JSON.stringify(transformed ?? payload) !== before) unsafe(binding, 'Provider payload was modified after the safety check.');
      return transformed;
    } });
  });
  const continuation = agent.continue;
  replace(agent, 'continue', function (this: Agent) {
    assertAdmission();
    return continuation.call(this);
  });
  const append = manager.appendCompaction;
  replace(manager, 'appendCompaction', function (...args) {
    const execution = registry.execution.getStore();
    if (!execution || binding.execution !== execution) throw new Error('Compaction append has no active operation.');
    controller.assertCurrent(execution.operation);
    if (execution.committed) throw new Error('Compaction operation already committed.');
    if (!args[0]?.trim() || (args[1] !== null && !manager.getEntry(args[1]))) throw new Error('Invalid native compaction result.');
    const id = append.apply(manager, args);
    try {
      confirmEntry(file!, manager.getEntry(id)!);
    } catch (error) {
      controller.block('persistence', String(error));
      throw error;
    }
    execution.committed = id;
    return id;
  });
  const emit = session._emit;
  replace(session, '_emit', function (event) {
    if (event.type === 'compaction_end') {
      const execution = registry.execution.getStore();
      if (!execution || binding.execution !== execution || binding.lifecycle === 'disposed') return;
      const state = controller.state;
      if (event.result && execution.committed && state.kind === 'running' && state.operation === execution.operation) {
        try {
          controller.assertCurrent(execution.operation);
          if (tooLarge() || pendingTooLarge()) {
            controller.block('oversized', 'Pending input cannot be reduced enough to continue.');
          } else controller.succeed(execution.operation);
        } catch (error) {
          controller.block('persistence', String(error));
        }
      } else if (state.kind === 'running' && state.operation === execution.operation) {
        controller.block(event.aborted ? 'cancelled' : 'failed', event.errorMessage ?? 'Compaction cancelled or produced no checkpoint.');
      }
      if (controller.state.kind !== 'idle') event = { ...event, result: undefined, willRetry: false, errorMessage: controller.message() };
      else { execution.completionEvent = event; return; }
    }
    return emit.call(session, event);
  });
  const run = async <T>(native: () => Promise<T>, explicit: boolean): Promise<T> => {
    ensureModel();
    while (binding.execution) {
      if (!explicit || controller.state.kind !== 'blocked') throw new Error('Native compaction is still finishing.');
      await binding.execution.settled;
    }
    const operation = controller.begin(explicit);
    let finish!: () => void;
    const execution: Execution = { operation, settled: new Promise(resolve => { finish = resolve; }), finish: () => finish() };
    binding.execution = execution;
    try {
      const result = await registry.execution.run(execution, native);
      if (controller.state.kind === 'running' && controller.state.operation === operation) controller.block('failed', 'Native compaction produced no committed checkpoint.');
      controller.assertIdle();
      const compactEvent = execution.compactEvent;
      const completionEvent = execution.completionEvent;
      execution.compactEvent = undefined;
      execution.completionEvent = undefined;
      if (compactEvent) await binding.publishCompact?.(compactEvent);
      if (binding.execution === execution) binding.execution = undefined;
      execution.finish();
      if (completionEvent && controller.state.kind === 'idle' && controller.state.generation === operation.generation) emit.call(session, completionEvent);
      return result;
    } catch (error) {
      if (controller.state.kind === 'running' && controller.state.operation === operation) controller.block(operation.abort.signal.aborted ? 'cancelled' : 'failed', String(error));
      throw error;
    } finally {
      if (binding.execution === execution) binding.execution = undefined;
      execution.finish();
    }
  };
  const manual = session.compact;
  replace(session, 'compact', instructions => {
    const intent = registry.retry.getStore();
    const explicit = intent?.session === session && !intent.consumed;
    if (explicit) intent.consumed = true;
    return run(() => manual.call(session, instructions), explicit);
  });
  const auto = session._runAutoCompaction;
  replace(session, '_runAutoCompaction', (reason, retry) => run(() => auto.call(session, reason, retry), false));
  const summarize = session._runDefaultCompaction;
  replace(session, '_runDefaultCompaction', (...args) => {
    const state = controller.state;
    const execution = registry.execution.getStore();
    if (!execution || binding.execution !== execution || state.kind !== 'running') throw new Error('Summary has no active operation.');
    controller.assertCurrent(execution.operation);
    return registry.summary.run(state.operation, () => summarize.apply(session, args));
  });
  const abort = session.abortCompaction;
  replace(session, 'abortCompaction', () => {
    const execution = registry.execution.getStore();
    if (binding.lifecycle === 'disposed' || (execution && binding.execution !== execution)) return;
    if (controller.state.kind === 'running' && (session._compactionAbortController || session._autoCompactionAbortController)) controller.block('cancelled', 'Compaction was cancelled.');
    abort.call(session);
  });
  for (const key of ['_handlePostAgentRun', '_runBeforeSettleBoundary'] as const) {
    const native = session[key];
    replace(session, key, async () => binding.lifecycle === 'active' && !binding.execution && controller.state.kind === 'idle' && await native.call(session));
  }
  const dispose = session.dispose;
  replace(session, 'dispose', () => {
    if (binding.lifecycle === 'disposed') return;
    binding.lifecycle = 'disposed';
    controller.dispose();
    dispose.call(session);
    binding.restoreEvents?.();
    registry.bindings.delete(session);
    registry.candidates.delete(manager);
    owner.release();
    registry.files.delete(manager);
    if (!registry.bindings.size) {
      for (const reserved of registry.files.values()) reserved.release();
      registry.files.clear();
      for (const undo of registry.restore.reverse()) undo();
      delete (globalThis as Record<symbol, unknown>)[registryKey];
    }
  });
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
    registry = { entrypoints: new Set(), candidates: new Map(), bindings: new Map(), files: new Map(), execution: new AsyncLocalStorage(), retry: new AsyncLocalStorage(), summary: new AsyncLocalStorage(), restore: [] };
    globals[registryKey] = registry;
    const active = registry;
    const prototype = host.AgentSession.prototype as unknown as Session;
    const build = prototype._buildRuntime;
    active.restore.push(replace(prototype, '_buildRuntime', function (this: Session, options) {
      const managed = this._resourceLoader.getExtensions().extensions.some(extension =>
        active.entrypoints.has(realpathSync(extension.resolvedPath)));
      if (!managed) return build.call(this, options);
      const owner = ownFile(active, this.sessionManager);
      if (owner.session && owner.session !== this) throw new Error('SessionManager is already managed by another session.');
      owner.session = this;
      build.call(this, options);
      active.candidates.set(this.sessionManager, this);
      bind(host, active, this);
    }));
    const managerPrototype = host.SessionManager.prototype as unknown as Manager;
    for (const key of ['_appendEntry', '_rewriteFile'] as const) {
      const native = managerPrototype[key];
      active.restore.push(replace(managerPrototype, key, function (this: Manager, entry: Pi.SessionEntry) {
        if (active.files.has(this)) ownFile(active, this);
        else {
          const file = this.getSessionFile();
          if (file && this.isPersisted()) assertSessionFileAvailable(file + '.pi-compact-state.json');
        }
        return native.call(this, entry);
      }));
    }
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
        if (binding.execution || binding.controller.state.kind !== 'idle') return;
      }
      return flush.call(this, options);
    }));
  }
  const active = registry;
  active.entrypoints.add(realpathSync(fileURLToPath(new URL('../index.ts', import.meta.url))));
  const start = (_event: Pi.SessionStartEvent, ctx: Pi.ExtensionContext) => {
    const session = active.candidates.get(ctx.sessionManager);
    if (!session) {
      process.stderr.write('pi-compact could not bind the host session.\n');
      process.exit(78);
    }
    try { bind(host, active, session); } catch (error) {
      process.stderr.write(String(error));
      process.exit(78);
    }
  };
  pi.on('session_start', start);
}
