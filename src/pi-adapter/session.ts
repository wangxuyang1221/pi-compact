import { AsyncLocalStorage } from 'node:async_hooks';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type * as Pi from '@earendil-works/pi-coding-agent';
import { CompactionController, type Operation } from '../state.ts';
import { checkHost } from './compatibility.ts';
import { assertSessionFileAvailable, claimSessionFile, confirmEntry, readJournal, writeJournal } from './journal.ts';
import { nativeThresholdReserve, parseThreshold, thresholdTokens } from '../policy.ts';
import { readSettings, saveThreshold } from '../settings.ts';
import { snapshotContext, reconstructContext } from './reconstruction.ts';
import { beginAppend, finishAppend, recoverAppend, type Pending } from './transaction.ts';
import { activeCheckpoint, assertSource, checkpoint, coverage, digest, marker, markProjection, readableBranch, replayMessage, replayReference, type Checkpoint, type Message } from '../checkpoint.ts';
import { codexAccess, remoteCompact } from '../codex/compact.ts';
import { object, validateRequestWire } from '../codex/wire.ts';

type Model = NonNullable<Pi.AgentSession['model']>;
type Agent = Pi.AgentSession['agent'];
type Session = Pick<Pi.AgentSession, 'agent' | 'model' | 'sessionManager' | 'settingsManager' | 'compact' | 'abortCompaction' | 'dispose' | 'prompt' | 'modelRuntime'> & {
  _cwd: string;
  _checkCompaction(...args: unknown[]): Promise<boolean>;
  _buildRuntime(options: unknown): void;
  _resourceLoader: { getExtensions(): { extensions: Pi.Extension[] } };
  _runAutoCompaction(reason: 'threshold' | 'overflow', willRetry: boolean): Promise<boolean>;
  _runDefaultCompaction(preparation: Parameters<typeof Pi.compact>[0], model: Model, instructions: string | undefined, signal: AbortSignal, reason: 'manual' | 'threshold' | 'overflow'): Promise<Pi.CompactionResult>;
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
type NativeProgress = { kind: 'preparing' } | { kind: 'started' } | { kind: 'committed'; id: string };
type PolicyBoundary = { entry: string | undefined; model: Model; percent: number };
type Execution = { branch: Pi.SessionEntry[]; proposal?: Checkpoint; remoteAttempted?: true; progress: NativeProgress; operation: Operation; settled: Promise<void>; finish(): void; compactEvent?: Pi.SessionCompactEvent; completionEvent?: Pi.AgentSessionEvent };
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
      const entry = execution.progress.kind === 'committed' && session.sessionManager.getEntry(execution.progress.id);
      if (!entry || entry.type !== 'compaction') throw new Error('Compaction event has no confirmed checkpoint.');
      execution.compactEvent = { ...event, compactionEntry: entry };
      return undefined;
    }
    return emit.call(runner, event);
  });
}

function ownFile(registry: Registry, manager: Pick<Pi.SessionManager, 'getSessionFile' | 'isPersisted' | 'setSessionFile'>): FileOwner {
  const file = manager.getSessionFile();
  if (!file || !manager.isPersisted()) throw new Error('pi-compact requires a persistent session.');
  const existing = registry.files.get(manager);
  if (existing) {
    if (existing.file !== file) throw new Error('Managed session file changed without releasing ownership.');
    return existing;
  }
  const owner = { file, release: claimSessionFile(file + '.pi-compact-state.json') };
  try { if (recoverAppend(file)) manager.setSessionFile(file); } catch (error) { owner.release(); throw error; }
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

  const nativeBranch = manager.getBranch.bind(manager);
  replace(manager, 'getBranch', (...args) => {
    const branch = nativeBranch(...args);
    const execution = registry.execution.getStore();
    return execution && binding.execution === execution && activeCheckpoint(branch)?.kind === 'opaque' ? readableBranch(branch) : branch;
  });
  const projection = manager.buildSessionProjection;
  replace(manager, 'buildSessionProjection', () => markProjection(projection.call(manager)));
  const opaque = (id: string) => {
    const entry = manager.getEntry(id);
    const value = entry && checkpoint(entry);
    if (!entry || entry.type !== 'compaction' || value?.kind !== 'opaque') throw new Error('Checkpoint reference is unavailable.');
    if (nativeBranch().findLast(entry => entry.type === 'compaction')?.id !== id) throw new Error('Checkpoint reference is not active.');
    assertSource(host, nativeBranch(), entry, value);
    return value;
  };
  const estimate = (messages: Message[]) => {
    if (!messages.some(message => marker(message))) return host.convertToLlm(messages).reduce((tokens, item) => tokens + host.estimateTokens(item), 0);
    return messages.reduce((sum, message) => {
      const id = marker(message);
      return sum + (id ? opaque(id).budget.tokens : host.convertToLlm([message]).reduce((tokens, item) => tokens + host.estimateTokens(item), 0));
    }, 0);
  };
  const convert = (messages: Message[]) => messages.flatMap(message => {
    const id = marker(message);
    return id ? [replayMessage(opaque(id), message.timestamp, id)] : host.convertToLlm([message]);
  });
  const compatible = async (messages: Message[], model: Model, signal?: AbortSignal) => {
    if (!messages.some(message => marker(message))) return;
    const ids = messages.map(marker).filter((id): id is string => !!id);
    const access = await codexAccess(session.modelRuntime, model, signal);
    if (!access || ids.some(id => JSON.stringify(opaque(id).compatibility) !== JSON.stringify(access.compatibility))) throw new Error('Opaque checkpoint is incompatible. Run /compact to rebuild readable history.');
  };

  let policyBoundary: PolicyBoundary | undefined;
  const boundary = (): PolicyBoundary => {
    const config = readSettings(session._cwd);
    if (config.kind === 'invalid') throw new Error(config.error);
    const entry = manager.getBranch().findLast(entry => entry.type === 'context_edit' ||
      (entry.type === 'message' && (entry.message.role === 'user' || entry.message.role === 'toolResult')))?.id;
    return { entry, model: session.model!, percent: config.percent };
  };
  const sameBoundary = (current: PolicyBoundary) => policyBoundary !== undefined && policyBoundary.entry === current.entry &&
    policyBoundary.model === current.model && policyBoundary.percent === current.percent;
  const thresholdScope = new AsyncLocalStorage<boolean>();
  const nativeSettings = session.settingsManager;
  replace(session, 'settingsManager', new Proxy(nativeSettings, {
    get(target, key) {
      if (key === 'getCompactionSettings') return (model: Model) => {
        const settings = target.getCompactionSettings(model);
        if (!thresholdScope.getStore() || !model) return settings;
        const config = readSettings(session._cwd);
        if (config.kind === 'invalid') throw new Error(config.error);
        return { ...settings, reserveTokens: nativeThresholdReserve(model.contextWindow, config.percent) };
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }));
  const exceeds = session._exceedsCompactionThreshold;
  replace(session, '_exceedsCompactionThreshold', (model, projection) =>
    thresholdScope.getStore() === false || sameBoundary(boundary()) ? false : thresholdScope.run(true, () => exceeds.call(session, model, projection)));
  const checkScope = new AsyncLocalStorage<'pre-input' | 'post-run'>();
  const checkCompaction = session._checkCompaction;
  replace(session, '_checkCompaction', (...args) => checkScope.run(args[1] === false ? 'pre-input' : 'post-run', () => thresholdScope.run(true, () => checkCompaction.apply(session, args))));

  const agent = session.agent;
  const toLlm = agent.convertToLlm;
  replace(agent, 'convertToLlm', messages => {
    if (!messages.some(message => marker(message))) return toLlm.call(agent, messages);
    return compatible(messages, session.model!).then(() => convert(messages));
  });
  const assertAlive = () => {
    if (binding.lifecycle === 'disposed') throw new Error('Session is disposed.');
  };
  let appendState: { kind: 'ready' } | { kind: 'pending'; record?: Pending } = { kind: 'ready' };
  const assertWritable = () => {
    assertAlive();
    if (appendState.kind === 'pending') throw new Error('Checkpoint recovery must finish before writing session history. Use /compact to retry.');
  };
  const recoverCheckpoint = () => {
    if (appendState.kind === 'ready') return true;
    try {
      if (recoverAppend(file!, appendState.record)) {
        manager.setSessionFile(file!);
        agent.state.messages = manager.buildSessionContext().messages;
      }
      appendState = { kind: 'ready' };
      return true;
    } catch {
      controller.block('persistence', 'Checkpoint rollback requires recovery before retry.');
      return false;
    }
  };
  const prompt = session.prompt;
  replace(session, 'prompt', (...args) => {
    assertAlive();
    return prompt.apply(session, args);
  });
  const agentPrompt = agent.prompt.bind(agent);
  replace(agent, 'prompt', (input, images?: Parameters<Agent['prompt']>[1]) => {
    assertWritable();
    return typeof input === 'string' ? agentPrompt(input, images) : agentPrompt(input);
  });
  const ownedManager = manager as unknown as Manager;
  for (const key of ['_appendEntry', '_rewriteFile'] as const) {
    const native = ownedManager[key];
    replace(ownedManager, key, function (entry: Pi.SessionEntry) {
      assertWritable();
      if (entry?.type === 'compaction') {
        const execution = registry.execution.getStore();
        if (!execution || binding.execution !== execution) throw new Error('Checkpoint write has no operation.');
        appendState = { kind: 'pending' };
        appendState.record = beginAppend(file!, execution.operation.id, entry);
      }
      return native.call(ownedManager, entry);
    });
  }
  if (typeof agent.prepareRequest !== 'function' || typeof agent.transformContext !== 'function' || typeof agent.streamFunction !== 'function' || typeof toLlm !== 'function') {
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
  const pendingTooLarge = () => {
    const messages = [
      ...manager.buildSessionProjection().messages,
      ...agent.peekQueuedMessages(),
      ...(binding.ui?.compactionQueuedMessages ?? []).map(item => ({ role: 'user' as const, content: item.text, timestamp: 0 })),
    ];
    const raw = messages.reduce((sum, message) => sum + host.estimateTokens(message), 0);
    const encoded = host.convertToLlm(messages).reduce((sum, message) => sum + host.estimateTokens(message), 0);
    return Math.max(raw, encoded, estimate(messages)) > session.model!.contextWindow - session.model!.maxTokens;
  };
  const assertAdmission = () => {
    controller.assertIdle();
    if (binding.execution) throw new Error('Native compaction is still finishing.');
  };
  const prepare = agent.prepareRequest;
  replace(agent, 'prepareRequest', async (request, signal) => {
    assertAdmission();
    ensureModel();
    const config = readSettings(session._cwd);
    if (config.kind === 'invalid') throw new Error(config.error);
    const prepared = await prepare.call(agent, request, signal);
    assertAdmission();
    return prepared ?? undefined;
  });
  const transform = agent.transformContext;
  replace(agent, 'transformContext', async (messages, signal) => {
    assertAdmission();
    signal?.throwIfAborted();
    const before = snapshotContext(messages);
    let transformed = await transform.call(agent, messages, signal);
    assertAdmission();
    signal?.throwIfAborted();
    if (before.some(source => marker(source.message)) && transformed.some(message => message.role === 'compactionSummary' && !marker(message))) throw new Error('Opaque checkpoint lost its source reference.');
    const current = boundary();
    const tokens = estimate(transformed);
    if (nativeSettings.getCompactionSettings(current.model).enabled && !sameBoundary(current) && (tokens >= thresholdTokens(current.model.contextWindow, current.percent) ||
      tokens > current.model.contextWindow - current.model.maxTokens)) {
      const original = manager.buildSessionProjection();
      await session._runAutoCompaction('threshold', false);
      assertAdmission();
      signal?.throwIfAborted();
      transformed = reconstructContext(before, transformed, original, manager.buildSessionProjection());
    }
    await compatible(transformed, session.model!, signal);
    return transformed;
  });
  const stream = agent.streamFunction;
  replace(agent, 'streamFunction', (model, context, options) => {
    const operation = registry.summary.getStore();
    const generation = controller.state.kind === 'running' ? controller.state.operation.generation : controller.state.generation;
    const check = () => {
      options?.signal?.throwIfAborted();
      if (operation) {
        controller.assertCurrent(operation);
        if (binding.execution && activeCheckpoint(binding.execution.branch)?.kind === 'opaque' && context.messages.reduce((sum, message) => sum + host.estimateTokens(message), 0) > model.contextWindow - model.maxTokens) throw new Error('Readable summary input exceeds model capacity.');
      }
      else {
        assertAdmission();
        if (controller.state.kind !== 'idle' || controller.state.generation !== generation) throw new Error('Request belongs to a stale compaction generation.');
        ensureModel();
        const tokens = context.messages.reduce((sum, message) => {
          const id = replayReference(message);
          if (!id) return sum + host.estimateTokens(message);
          const items = message.role === 'assistant' ? message.content.flatMap(part => part.type === 'thinking' && part.thinkingSignature ? [object(JSON.parse(part.thinkingSignature))] : []) : [];
          const value = opaque(id);
          if (JSON.stringify(items) !== JSON.stringify(value.items)) throw new Error('Opaque replay has no verified token budget.');
          return sum + value.budget.tokens;
        }, 0);
        if (tokens > model.contextWindow - model.maxTokens) {
          controller.block('oversized', 'Prepared request exceeds the model input capacity.');
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
      if (!operation && context.messages.some(message => replayReference(message))) {
        const access = await codexAccess(session.modelRuntime, model, options?.signal);
        const active = nativeBranch().findLast(entry => checkpoint(entry)?.kind === 'opaque');
        const value = active && checkpoint(active);
        if (!access || value?.kind !== 'opaque' || JSON.stringify(access.compatibility) !== JSON.stringify(value.compatibility)) throw new Error('Opaque authorization changed before transport.');
        const items = validateRequestWire(object(payload).input);
        const expected = value.items;
        const start = items.findIndex(item => JSON.stringify(item) === JSON.stringify(expected[0]));
        if (start < 0 || expected.some((item, i) => JSON.stringify(items[start + i]) !== JSON.stringify(item))) throw new Error('Provider did not preserve the ordered checkpoint.');
        if (Buffer.byteLength(JSON.stringify(items)) > 8 * 1024 * 1024) throw new Error('Prepared payload exceeds transport capacity.');
        check();
      }
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
    if (execution.progress.kind === 'committed') throw new Error('Compaction operation already committed.');
    if (!args[0]?.trim() || (args[1] !== null && !manager.getEntry(args[1]))) throw new Error('Invalid native compaction result.');
    if (!execution.proposal && activeCheckpoint(execution.branch)?.kind === 'opaque') throw new Error('Opaque history requires readable native preparation.');
    const details = execution.proposal ? { ...(args[3] && typeof args[3] === 'object' ? args[3] : {}), piCompact: execution.proposal } : args[3];
    let id: string;
    try {
      id = append.call(manager, args[0], args[1], args[2], details, args[4], args[5]);
      confirmEntry(file!, manager.getEntry(id)!);
    } catch (error) {
      controller.block('persistence', String(error));
      throw error;
    }
    execution.progress = { kind: 'committed', id };
    return id;
  });
  const emit = session._emit;
  replace(session, '_emit', function (event) {
    if (event.type === 'compaction_start') {
      const execution = registry.execution.getStore();
      if (!execution || binding.execution !== execution) throw new Error('Compaction start has no active operation.');
      controller.assertCurrent(execution.operation);
      execution.progress = { kind: 'started' };
    }
    if (event.type === 'compaction_end') {
      const execution = registry.execution.getStore();
      if (!execution || binding.execution !== execution || binding.lifecycle === 'disposed') return;
      const state = controller.state;
      if (event.result && execution.progress.kind === 'committed' && state.kind === 'running' && state.operation === execution.operation) {
        try {
          controller.assertCurrent(execution.operation);
          if (pendingTooLarge()) {
            controller.block('oversized', 'Pending input cannot be reduced enough to continue.');
          } else {
            controller.succeed(execution.operation);
            finishAppend(file!);
            appendState = { kind: 'ready' };
          }
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
  const run = async <T>(native: () => Promise<T>, explicit: boolean, allowNoWork = false): Promise<T> => {
    ensureModel();
    while (binding.execution) {
      if (!explicit || controller.state.kind !== 'blocked') throw new Error('Native compaction is still finishing.');
      await binding.execution.settled;
    }
    if (explicit && !recoverCheckpoint()) throw new Error(controller.message());
    const operation = controller.begin(explicit);
    let finish!: () => void;
    const execution: Execution = { branch: nativeBranch(), progress: { kind: 'preparing' }, operation, settled: new Promise(resolve => { finish = resolve; }), finish: () => finish() };
    binding.execution = execution;
    try {
      const result = await thresholdScope.run(false, () => registry.execution.run(execution, native));
      if (controller.state.kind === 'running' && controller.state.operation === operation) {
        if (allowNoWork && result === false && execution.progress.kind === 'preparing') controller.succeed(operation);
        else controller.block('failed', 'Native compaction produced no committed checkpoint.');
      }
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
      if (controller.state.kind !== 'idle') recoverCheckpoint();
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
  replace(session, '_runAutoCompaction', async (reason, retry) => {
    assertAdmission();
    const current = boundary();
    if (reason === 'threshold' && (checkScope.getStore() === 'pre-input' || sameBoundary(current))) return false;
    const result = await run(() => auto.call(session, reason, retry), false, reason === 'threshold' && !retry);
    policyBoundary = current;
    return result;
  });
  const summarize = session._runDefaultCompaction;
  replace(session, '_runDefaultCompaction', async (preparation, model, instructions, nativeSignal, reason) => {
    const state = controller.state;
    const execution = registry.execution.getStore();
    if (!execution || binding.execution !== execution || state.kind !== 'running') throw new Error('Summary has no active operation.');
    controller.assertCurrent(execution.operation);
    const signal = AbortSignal.any([nativeSignal, state.operation.abort.signal]);
    const source = coverage(host, execution.branch, preparation.firstKeptEntryId);
    try {
      const access = await codexAccess(session.modelRuntime, model, signal);
      if (access) {
        const projected = markProjection(host.buildSessionProjection(execution.branch));
        const cut = execution.branch.findIndex(entry => entry.id === preparation.firstKeptEntryId);
        const prefixIds = new Set(execution.branch.slice(0, cut).map(entry => entry.id));
        const messages = projected.entries.filter(entry => prefixIds.has(entry.sourceEntry.id)).flatMap(entry => entry.messages);
        await compatible(messages, model, signal);
        if (estimate(messages) > model.contextWindow - model.maxTokens) throw new Error('Remote input exceeds capacity.');
        execution.remoteAttempted = true;
        const remote = await remoteCompact(session.modelRuntime, model, convert(messages), access, signal, instructions);
        if (remote.budget.tokens > model.contextWindow - model.maxTokens) throw new Error('Remote checkpoint exceeds capacity.');
        controller.assertCurrent(execution.operation);
        execution.proposal = { schemaVersion: 1, kind: 'opaque', source, compatibility: access.compatibility, items: remote.items, budget: remote.budget };
        return { summary: 'Codex remote checkpoint. Readable history remains in the session log.', firstKeptEntryId: preparation.firstKeptEntryId, tokensBefore: preparation.tokensBefore, usage: remote.usage,
          details: { piCompact: execution.proposal, method: 'remote' } };
      }
    } catch {
      signal.throwIfAborted();
      controller.assertCurrent(execution.operation);
    }
    return registry.summary.run(state.operation, async () => {
      const serialized = host.serializeConversation(host.convertToLlm([...preparation.messagesToSummarize, ...preparation.turnPrefixMessages]));
      const recoveringOpaque = activeCheckpoint(execution.branch)?.kind === 'opaque';
      const chunkChars = recoveringOpaque ? Math.floor((model.contextWindow - model.maxTokens - 4096) / 2) * 4 : Infinity;
      if (recoveringOpaque && chunkChars <= 0) throw new Error('Model has insufficient capacity for readable compaction.');
      const segments: { entries: string[]; hash: string; start: number; end: number }[] = [];
      let result: Pi.CompactionResult;
      if (serialized.length <= chunkChars) {
        result = await summarize.call(session, preparation, model, instructions, signal, reason);
        segments.push({ entries: source.entries, hash: digest(serialized), start: 0, end: serialized.length });
      } else {
        let previousSummary = preparation.previousSummary;
        for (let offset = 0; offset < serialized.length;) {
          let end = Math.min(serialized.length, offset + chunkChars);
          const last = serialized.charCodeAt(end - 1);
          if (end < serialized.length && last >= 0xd800 && last <= 0xdbff) end--;
          const content = serialized.slice(offset, end);
          result = await summarize.call(session, { ...preparation, messagesToSummarize: [{ role: 'user', content, timestamp: 0 }], turnPrefixMessages: [], isSplitTurn: false, previousSummary }, model, instructions, signal, reason);
          previousSummary = result.summary;
          segments.push({ entries: source.entries, hash: digest(content), start: offset, end });
          offset = end;
        }
      }
      execution.proposal = { schemaVersion: 1, kind: 'text', source, text: result!.summary, segments };
      return { ...result!, details: { ...(result!.details && typeof result!.details === 'object' ? result!.details : {}), piCompact: execution.proposal, method: execution.remoteAttempted ? 'fallback' : 'native', ...(execution.remoteAttempted ? { fallbackReason: 'remote-error' } : {}) } };
    });
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
  pi.registerCommand('compact-config', {
    description: 'View or set the project compaction threshold',
    handler: async (args, ctx) => {
      try {
        const parts = args.trim().split(/\s+/);
        if (args.trim()) {
          if (parts.length !== 2 || parts[0] !== 'threshold' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(parts[1])) {
            throw new Error('Usage: /compact-config [threshold <percent>]');
          }
          saveThreshold(ctx.cwd, parseThreshold(Number(parts[1])));
        }
        const config = readSettings(ctx.cwd);
        if (config.kind === 'invalid') throw new Error(config.error);
        const window = ctx.model?.contextWindow;
        ctx.ui.notify(`Compaction threshold: ${config.percent}%\nSource: ${config.source} (${config.path})\nModel window: ${window ?? 'unavailable'} tokens\nTrigger: ${window ? thresholdTokens(window, config.percent) : 'unavailable'} tokens`, 'info');
      } catch (error) { ctx.ui.notify(String(error), 'error'); }
    },
  });
}
