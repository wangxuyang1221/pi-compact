import test, { after } from 'node:test';
import strictAssert from 'node:assert/strict';
let assertionCalls = 0;
const assert: typeof strictAssert = new Proxy(strictAssert, {
  get(target, key, receiver) {
    const method = Reflect.get(target, key, receiver);
    if (typeof method !== 'function') return method;
    return (...args: unknown[]) => { assertionCalls++; return Reflect.apply(method, target, args); };
  },
});
after(() => console.log('assertion_calls=' + assertionCalls));
import * as host from '@earendil-works/pi-coding-agent';
import { CompactionController, type StoredState } from '../src/state.ts';
import { checkHost } from '../src/pi-adapter/compatibility.ts';
import { readJournal, writeJournal, confirmEntry } from '../src/pi-adapter/journal.ts';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

for (const reason of ['failed', 'cancelled', 'oversized', 'persistence'] as const) {
  test(`${reason} remains blocked until a successful explicit retry`, () => {
    const saved: StoredState[] = [];
    const controller = new CompactionController(state => saved.push(state));
    const stale = controller.begin(false);
    controller.block(reason, reason);
    assert.throws(() => controller.assertIdle());
    assert.throws(() => controller.begin(false));
    assert.throws(() => controller.succeed(stale));
    const retry = controller.begin(true);
    controller.succeed(retry);
    controller.assertIdle();
    assert.equal(saved.at(-1)?.kind, 'idle');
  });
}
test('reentrant operations and duplicate completions are rejected', () => {
  const controller = new CompactionController(() => {});
  const operation = controller.begin(false);
  assert.throws(() => controller.begin(true));
  controller.succeed(operation);
  assert.throws(() => controller.succeed(operation));
});
test('a failed durable start prevents the operation', () => {
  const controller = new CompactionController(() => { throw new Error('disk full'); });
  assert.throws(() => controller.begin(false), /disk full/);
  assert.equal(controller.state.kind, 'blocked');
});
test('a failed durable completion cannot become idle', () => {
  const controller = new CompactionController(state => { if (state.kind === 'idle') throw new Error('disk full'); });
  const operation = controller.begin(false);
  assert.throws(() => controller.succeed(operation), /disk full/);
  assert.throws(() => controller.assertIdle());
});
test('restoring an interrupted operation blocks only that session', () => {
  const one = new CompactionController(() => {}, { kind: 'running' });
  const two = new CompactionController(() => {});
  assert.throws(() => one.assertIdle());
  two.assertIdle();
});
test('version and safety capability checks reject unknown hosts', () => {
  checkHost(host);
  assert.throws(() => checkHost({ ...host, VERSION: '1.5.3' }), /Unsupported Pi/);
  assert.throws(() => checkHost({ ...host, AgentSession: { prototype: {} } } as unknown as typeof host), /capability/);
});
test('journal and native entry confirmation reject corrupt persistence', () => {
  const dir = mkdtempSync(join(process.cwd(), 'artifacts/P1/journal-test-'));
  try {
    const file = join(dir, 'state.json');
    writeJournal(file, { kind: 'running', operationId: 'test' });
    assert.equal(readJournal(file)?.kind, 'running');
    writeFileSync(file, '{"kind":"unknown"}');
    assert.throws(() => readJournal(file), /Invalid/);
    writeFileSync(file, '{"id":"entry"}\n');
    confirmEntry(file, { id: 'entry' });
    assert.throws(() => confirmEntry(file, { id: 'missing' }), /readback/);
    writeFileSync(file, '{"id":');
    assert.throws(() => confirmEntry(file, { id: 'entry' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unsupported sessions cannot use retry to bypass capability checks', () => {
  const controller = new CompactionController(() => {});
  controller.block('unsupported', 'unsupported capability');
  assert.throws(() => controller.begin(true), /unsupported capability/);
});

test('duplicate installation keeps one dispatcher and restores its descriptors', async () => {
  const { install } = await import('../src/pi-adapter/session.ts');
  const prototype = host.AgentSession.prototype as unknown as Record<string, unknown>;
  const original = prototype._buildRuntime;
  const api = { on() {} } as unknown as host.ExtensionAPI;
  install(host, api);
  const first = prototype._buildRuntime;
  install(host, api);
  assert.equal(prototype._buildRuntime, first);
  assert.notEqual(first, original);
  const key = Symbol.for('pi-compact.adapter.v1');
  const globals = globalThis as Record<symbol, unknown>;
  const registry = globals[key] as { restore: (() => void)[] };
  for (const undo of registry.restore.reverse()) undo();
  delete globals[key];
  assert.equal(prototype._buildRuntime, original);
});

test('the session file has a single owner and releases on disposal', async () => {
  const { claimSessionFile } = await import('../src/pi-adapter/journal.ts');
  const dir = mkdtempSync(join(process.cwd(), 'artifacts/P1/ownership-test-'));
  try {
    const journal = join(dir, 'state.json');
    const release = claimSessionFile(journal);
    assert.throws(() => claimSessionFile(journal), /already owns/);
    release();
    claimSessionFile(journal)();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('disposal rejects late requests without blocking a clean restart', () => {
  const stored: StoredState[] = [];
  const controller = new CompactionController(state => stored.push(state));
  const operation = controller.begin(false);
  controller.succeed(operation);
  controller.dispose();
  assert.throws(() => controller.assertIdle(), /disposed/);
  assert.throws(() => controller.begin(true), /disposed/);
  new CompactionController(() => {}, stored.at(-1)).assertIdle();
});
