import test from 'node:test';
import assert from 'node:assert/strict';
import * as host from '@earendil-works/pi-coding-agent';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import { visibleWidth } from '@earendil-works/pi-tui';
import { compactionLabel, renderCompactionDivider } from '../src/ui/compaction-divider.ts';
import { wireBudget } from '../src/codex/wire.ts';
import { installRenderer } from '../src/pi-adapter/renderer.ts';

const palette = { rule: (text: string) => `\x1b[90m${text}`, caption: (text: string) => `\x1b[37m${text}` };
for (const width of [0, 1, 2, 8, 18, 19, 20, 21, 23, 40, 90, 120]) {
  test(`divider uses terminal cells at ${width} columns and resets colors`, () => {
    const lines = renderCompactionDivider(width, palette);
    assert(lines.every(line => visibleWidth(line) <= width));
    assert(lines[1].endsWith('\x1b[0m'));
    assert(!/\x1b\[(?:4\d|48;)/.test(lines[1]));
    const plain = stripVTControlCharacters(lines[1]);
    if (width >= visibleWidth(compactionLabel)) assert(plain.includes(compactionLabel));
    if (width >= visibleWidth(compactionLabel) + 4) {
      assert.equal(visibleWidth(lines[1]), width);
      const start = plain.indexOf('↗');
      assert(Math.abs(start - (width - visibleWidth(compactionLabel)) / 2) <= 0.5);
    }
    assert.deepEqual(renderCompactionDivider(width, palette), lines);
  });
}

test('non-finite and negative widths cannot create unbounded lines', () => {
  for (const width of [-1, NaN, Infinity]) assert.equal(visibleWidth(renderCompactionDivider(width, palette)[1]), 0);
});

function harness() {
  host.initTheme('dark');
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const pi = { on(name: string, handler: (...args: unknown[]) => void) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); } } as unknown as host.ExtensionAPI;
  const manager = host.SessionManager.inMemory(process.cwd());
  const path = fileURLToPath(new URL('../src/index.ts', import.meta.url));
  const mode = Object.setPrototypeOf({
    session: { sessionManager: manager, _resourceLoader: { getExtensions: () => ({ extensions: [{ resolvedPath: path }] }) } },
    chatContainer: { children: [] as unknown[], addChild(child: unknown) { this.children.push(child); } },
    getMarkdownThemeWithSettings: host.getMarkdownTheme,
    getMarkdownTransformers: () => [], outputPad: 1, toolOutputExpanded: false,
    ui: { requestRender() {} },
  }, host.InteractiveMode.prototype);
  const ctx = { sessionManager: manager, hasUI: false, ui: { theme: { fg: (_color: string, text: string) => text } } };
  const emit = (name: string) => handlers.get(name)?.forEach(handler => handler({}, ctx));
  return { pi, mode, emit, add() {
    mode.addMessageToChat({ role: 'compactionSummary', summary: 'Real synthetic summary with 中文 and 👩‍💻.', tokensBefore: 4200 });
    return mode.chatContainer.children.at(-1) as host.CompactionSummaryMessageComponent;
  } };
}

test('actual native component expands true summary and restores after repeated installation', () => {
  const h = harness();
  const native = Reflect.get(host.InteractiveMode.prototype, 'addMessageToChat');
  installRenderer(host, h.pi);
  const installed = Reflect.get(host.InteractiveMode.prototype, 'addMessageToChat');
  installRenderer(host, h.pi);
  assert.equal(Reflect.get(host.InteractiveMode.prototype, 'addMessageToChat'), installed);
  h.emit('session_start');
  try {
    const component = h.add();
    assert(component instanceof host.CompactionSummaryMessageComponent);
    assert(component.render(90).join('\n').includes(compactionLabel));
    component.setExpanded(true);
    assert(stripVTControlCharacters(component.render(90).join('\n')).includes('Real synthetic summary'));
    component.setExpanded(false);
    assert(component.render(90).join('\n').includes(compactionLabel));
    h.emit('session_shutdown');
    assert(!component.render(90).join('\n').includes(compactionLabel));
    assert.equal(Reflect.get(host.InteractiveMode.prototype, 'addMessageToChat'), native);
  } finally { h.emit('session_shutdown'); }
});

test('unmanaged components keep native rendering and chained renderers survive disable', () => {
  const h = harness();
  installRenderer(host, h.pi);
  h.emit('session_start');
  try {
    const component = h.add();
    const wrapped = component.render;
    component.render = function (width) { return [...wrapped.call(this, width), 'third-party']; };
    h.emit('session_shutdown');
    assert(component.render(40).includes('third-party'));
    assert(!component.render(40).join('\n').includes(compactionLabel));
    h.mode.session._resourceLoader.getExtensions = () => ({ extensions: [] });
    assert(!h.add().render(40).join('\n').includes(compactionLabel));
  } finally { h.emit('session_shutdown'); }
});

test('missing UI capability keeps native display without terminating', () => {
  const h = harness();
  installRenderer({ ...host, CompactionSummaryMessageComponent: undefined } as unknown as typeof host, h.pi);
  h.emit('session_start');
  assert(!h.add().render(90).join('\n').includes(compactionLabel));
});

test('simultaneous unrelated session keeps its own native card', () => {
  const owner = harness();
  const other = harness();
  other.mode.session._resourceLoader.getExtensions = () => ({ extensions: [] });
  installRenderer(host, owner.pi);
  owner.emit('session_start');
  try {
    assert(owner.add().render(40).join('').includes(compactionLabel));
    const native = other.add();
    assert(!native.render(40).join('').includes(compactionLabel));
    native.setExpanded(true);
    assert(stripVTControlCharacters(native.render(40).join('')).includes('Real synthetic summary'));
  } finally { owner.emit('session_shutdown'); }
});

test('root class identity mismatch downgrades to actual native component', () => {
  const h = harness();
  class OtherClass extends host.CompactionSummaryMessageComponent {}
  installRenderer({ ...host, CompactionSummaryMessageComponent: OtherClass }, h.pi);
  h.emit('session_start');
  try { assert(!h.add().render(90).join('').includes(compactionLabel)); }
  finally { h.emit('session_shutdown'); }
});

test('expansion and repeated render never call model transport', () => {
  const h = harness();
  const fetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected model request'); };
  installRenderer(host, h.pi);
  h.emit('session_start');
  try {
    const component = h.add();
    for (const expanded of [false, true, false]) {
      component.setExpanded(expanded);
      for (const width of [20, 40, 90, 120]) assert(component.render(width).every(line => visibleWidth(line) <= width));
    }
    assert.equal(requests, 0);
  } finally { h.emit('session_shutdown'); globalThis.fetch = fetch; }
});


test('opaque expansion shows committed metadata and hides arbitrary wire and account material', () => {
  const h = harness();
  const manager = h.mode.session.sessionManager;
  const source = manager.appendMessage({ role: 'user', content: 'Synthetic source.', timestamp: 0 });
  const items = [{ type: 'compaction', encrypted_content: 'SECRET_OPAQUE' }, { type: 'message', role: 'assistant', content: 'SECRET_WIRE' }];
  const id = manager.appendCompaction('Opaque placeholder', source, 4200, { piCompact: { schemaVersion: 1, kind: 'opaque',
    source: { sourceLeaf: source, firstKept: source, entries: [source], hash: 'synthetic' },
    compatibility: { provider: 'openai-codex', endpoint: 'SECRET_ENDPOINT', account: 'SECRET_ACCOUNT', model: 'SECRET_MODEL', protocol: 'compaction_trigger', capability: 'pi-1.5.2-codex-signature-v1' },
    items, budget: wireBudget(items, 128) } });
  installRenderer(host, h.pi); h.emit('session_start');
  try {
    h.mode.addMessageToChat({ role: 'compactionSummary', summary: 'Opaque placeholder', tokensBefore: 4200 }, { messageId: id });
    const component = h.mode.chatContainer.children.at(-1) as host.CompactionSummaryMessageComponent;
    assert(component instanceof host.CompactionSummaryMessageComponent);
    component.setExpanded(true);
    const text = stripVTControlCharacters(component.render(90).join('\n'));
    for (const expected of ['Remote checkpoint (opaque)', 'Covered entries: 1', 'Wire items: 2', 'Schema: 1', 'No readable summary is stored.']) assert(text.includes(expected), expected);
    assert(!text.includes('SECRET')); assert(!text.includes('Opaque placeholder'));
    assert(!text.includes('encrypted_content'));
    component.setExpanded(false); assert(component.render(90).join('').includes(compactionLabel));
    h.emit('session_shutdown'); assert(!component.render(90).join('').includes(compactionLabel));
  } finally { h.emit('session_shutdown'); }
});
