import type * as Pi from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderCompactionDivider, type DividerPalette } from '../ui/compaction-divider.ts';
import { supportedVersion } from './compatibility.ts';
import { checkpoint } from '../checkpoint.ts';

type Component = { render(width: number): string[]; expanded: boolean };
type Manager = Pi.ExtensionContext['sessionManager'];
type Session = { sessionManager: Pi.SessionManager; _resourceLoader: Pi.ResourceLoader; dispose(): void };
type Mode = { session: Session; chatContainer: { children: unknown[] }; ui: { requestRender(): void };
  addMessageToChat(message: { role: string; summary?: string; tokensBefore?: number }, options?: { messageId?: string }): void; bindCurrentSessionExtensions(): Promise<void> };
type Binding = { enabled: boolean; components: Map<Component, () => void>; mode?: Mode; ui?: Pi.ExtensionUIContext; warning?: string };
type Registry = { entrypoints: Set<string>; bindings: Map<Manager, Binding>; restore: (() => void)[] };
const registryKey = Symbol.for('pi-compact.renderer.v1');
const statusKey = 'pi-compact-renderer';
const globals = globalThis as Record<symbol, unknown>;

function canReplace(target: object, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  return descriptor ? descriptor.configurable === true : Object.isExtensible(target);
}

function replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
  return () => {
    if (target[key] !== value) return;
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  };
}

function release(registry: Registry, manager: Manager): void {
  const binding = registry.bindings.get(manager);
  if (!binding) return;
  binding.enabled = false;
  if (binding.warning) binding.ui?.setStatus(statusKey, undefined);
  for (const undo of binding.components.values()) undo();
  registry.bindings.delete(manager);
  if (registry.bindings.size) return;
  for (const undo of registry.restore.toReversed()) undo();
  if (globals[registryKey] === registry) delete globals[registryKey];
}

function warn(binding: Binding, reason: string): void {
  if (binding.warning) return;
  binding.warning = `pi-compact visual downgrade: ${reason}. Native compaction display retained.`;
  process.stderr.write(binding.warning + '\n');
  if (binding.ui) {
    binding.ui.setStatus(statusKey, 'pi-compact visual downgrade (native UI)');
    binding.ui.notify(binding.warning, 'warning');
  }
}

export function installRenderer(host: typeof Pi, pi: Pi.ExtensionAPI): void {
  const modePrototype = host.InteractiveMode?.prototype as unknown as Mode;
  const componentPrototype = host.CompactionSummaryMessageComponent?.prototype;
  const missing = host.VERSION !== supportedVersion || !componentPrototype ||
    typeof host.getMarkdownTheme !== 'function' ||
    !['render', 'setExpanded'].every(key => typeof Reflect.get(componentPrototype, key) === 'function') ||
    !['addMessageToChat', 'bindCurrentSessionExtensions'].every(key =>
      typeof Reflect.get(modePrototype ?? {}, key) === 'function' && canReplace(modePrototype, key)) ||
    !canReplace(host.AgentSession.prototype, 'dispose');
  if (missing) {
    const reason = 'unsupported Pi renderer capabilities';
    let ui: Pi.ExtensionUIContext | undefined;
    process.stderr.write(`pi-compact visual downgrade: ${reason}. Native compaction display retained.\n`);
    pi.on('session_start', (_event, ctx) => {
      if (!ctx.hasUI) return;
      ui = ctx.ui;
      ui.setStatus(statusKey, 'pi-compact visual downgrade (native UI)');
      ui.notify(`pi-compact visual downgrade: ${reason}`, 'warning');
    });
    pi.on('session_shutdown', () => { ui?.setStatus(statusKey, undefined); ui = undefined; });
    return;
  }
  let registry = globals[registryKey] as Registry | undefined;
  if (!registry) {
    registry = { entrypoints: new Set(), bindings: new Map(), restore: [] };
    globals[registryKey] = registry;
    const active = registry;
    const managed = (session: Session) => session._resourceLoader.getExtensions().extensions.some(extension => active.entrypoints.has(realpathSync(extension.resolvedPath)));
    const bindingFor = (session: Session) => {
      let binding = active.bindings.get(session.sessionManager);
      if (!binding) { binding = { enabled: true, components: new Map() }; active.bindings.set(session.sessionManager, binding); }
      return binding;
    };
    const add = modePrototype.addMessageToChat;
    active.restore.push(replace(modePrototype, 'addMessageToChat', function (this: Mode, message, options) {
      const offset = this.chatContainer.children.length;
      add.call(this, message, options);
      if (globals[registryKey] !== active || message.role !== 'compactionSummary' || !managed(this.session)) return;
      const binding = bindingFor(this.session);
      binding.mode = this;
      for (const [component, undo] of binding.components) {
        if (!this.chatContainer.children.includes(component)) { undo(); binding.components.delete(component); }
      }
      const components = this.chatContainer.children.slice(offset).filter(child => child instanceof host.CompactionSummaryMessageComponent);
      if (components.length !== 1) { warn(binding, 'host component identity mismatch'); return; }
      const component = components[0] as unknown as Component;
      if (typeof component.expanded !== 'boolean') { warn(binding, 'host expansion state unavailable'); return; }
      if (!canReplace(component, 'render')) { warn(binding, 'host component render is immutable'); return; }
      if (binding.components.has(component)) return;
      const native = component.render;
      const entry = this.session.sessionManager.getBranch().findLast(entry => entry.type === 'compaction' &&
        (options?.messageId ? entry.id === options.messageId : entry.summary === message.summary && entry.tokensBefore === message.tokensBefore));
      let value;
      try { value = entry && checkpoint(entry); }
      catch { warn(binding, 'checkpoint details unavailable'); return; }
      const details = value?.kind === 'opaque' ? new Text([
        'Remote checkpoint (opaque)',
        'Provider: openai-codex',
        'Protocol: compaction_trigger',
        `Schema: ${value.schemaVersion}`,
        `Covered entries: ${value.source.entries.length}`,
        `Wire items: ${value.items.length}`,
        `Stored wire bytes: ${value.budget.bytes}`,
        'Encrypted contents are hidden. No readable summary is stored.',
      ].join('\n'), 0, 0) : undefined;
      const fallback = host.getMarkdownTheme();
      const palette: DividerPalette = {
        rule: text => binding.ui?.theme.fg('dim', text) ?? fallback.hr(text),
        caption: text => binding.ui?.theme.fg('muted', text) ?? fallback.quote(text),
      };
      binding.components.set(component, replace(component, 'render', function (this: Component, width) {
        if (!binding.enabled) return native.call(this, width);
        if (component.expanded) return details ? details.render(width) : native.call(this, width);
        return renderCompactionDivider(width, palette);
      }));
    }));
    const bind = modePrototype.bindCurrentSessionExtensions;
    active.restore.push(replace(modePrototype, 'bindCurrentSessionExtensions', async function (this: Mode) {
      await bind.call(this);
      if (globals[registryKey] !== active) return;
      if (managed(this.session)) bindingFor(this.session).mode = this;
      else release(active, this.session.sessionManager);
    }));
    const prototype = host.AgentSession.prototype as unknown as Session;
    const dispose = prototype.dispose;
    active.restore.push(replace(prototype, 'dispose', function (this: Session) {
      const current = globals[registryKey] as Registry | undefined;
      if (current) release(current, this.sessionManager);
      dispose.call(this);
    }));
  }
  const active = registry;
  active.entrypoints.add(realpathSync(fileURLToPath(new URL('../index.ts', import.meta.url))));
  let manager: Manager | undefined;
  pi.on('session_start', (_event, ctx) => {
    manager = ctx.sessionManager;
    let binding = active.bindings.get(ctx.sessionManager);
    if (!binding) { binding = { enabled: true, components: new Map() }; active.bindings.set(ctx.sessionManager, binding); }
    binding.ui = ctx.hasUI ? ctx.ui : undefined;
    if (binding.warning && binding.ui) binding.ui.setStatus(statusKey, 'pi-compact visual downgrade (native UI)');
    binding.mode?.ui.requestRender();
  });
  pi.on('session_shutdown', () => { if (manager) release(active, manager); manager = undefined; });
}
