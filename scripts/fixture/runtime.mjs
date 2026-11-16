import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const shim = execFileSync('/usr/bin/which', ['-a', 'pi'], { encoding: 'utf8' }).trim().split('\n').find(path => !path.includes('/node_modules/'));
const target = readFileSync(shim, 'utf8').match(/# cmd-shim-target=(.+)/)?.[1];
const installed = resolve(target, '../../..');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export const sourceHashes = () => Object.fromEntries(['src', 'scripts'].flatMap(dir => readdirSync(join(root, dir), { recursive: true }).filter(file => /\.(ts|mjs|py)$/.test(file)).map(file => [join(dir, file), hash(join(root, dir, file))])));
export const provenance = { shim, target, version: JSON.parse(readFileSync(resolve(target, '../../..', 'package.json'))).version,
  cliHash: createHash('sha256').update(readFileSync(target)).digest('hex'), node: process.version,
  packageHash: hash(join(installed, 'package.json')),
  installedSources: Object.fromEntries(['core/agent-session.js.map', 'core/session-manager.js.map', 'core/extensions/loader.js.map'].map(file => [file, hash(join(installed, 'dist', file))])),
  bundle: Object.fromEntries(readdirSync(join(installed, 'dist/bundle/chunks')).filter(file => file.endsWith('.js')).map(file => [file, hash(join(installed, 'dist/bundle/chunks', file))])),
  source: sourceHashes() };
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
export const events = dir => existsSync(join(dir, 'events.jsonl')) ? readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
export async function waitFor(predicate, label, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
export function setup(dir, { variant = 'head', seed = 0, mode = 'success', tools = false, unsupported = false, profile = false, sessionFile = join(dir, 'session.jsonl') } = {}) {
  mkdirSync(join(dir, 'agent'), { recursive: true });
  mkdirSync(join(dir, 'cwd'), { recursive: true });
  mkdirSync(join(dir, 'tmp'), { recursive: true });
  writeFileSync(join(dir, 'events.jsonl'), '');
  writeFileSync(join(dir, 'control.json'), JSON.stringify({ mode, tools }));
  writeFileSync(join(dir, 'agent/settings.json'), JSON.stringify({ compaction: { enabled: true, reserveTokens: 1001, keepRecentTokens: 40 }, retry: { enabled: false }, providerRetry: { maxRetries: 0 }, transport: 'sse', cacheWarming: 'off', theme: 'dark', quietStartup: true }));
  writeFileSync(join(dir, 'agent/models.json'), JSON.stringify({ providers: { fixture: { baseUrl: 'https://fixture.invalid/v1', api: 'openai-responses', apiKey: 'fixture-only', models: [{ id: 'fixture-model', name: 'Synthetic fixture', contextWindow: 10000, maxTokens: 1000, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, SHELL: '/bin/zsh', TERM: 'xterm-256color', LANG: 'en_US.UTF-8',
    PI_CODING_AGENT_DIR: join(dir, 'agent'), PI_OFFLINE: '1', TMPDIR: join(dir, 'tmp'), JITI_FS_CACHE: 'false',
    NODE_OPTIONS: `--import=${join(root, 'scripts/fixture/preload.mjs')} ${profile ? '--cpu-prof --cpu-prof-dir=' + dir : ''}`, PI_FIXTURE_LOG: join(dir, 'events.jsonl'), PI_FIXTURE_CONTROL: join(dir, 'control.json'),
    PI_FIXTURE_SEED: String(seed), PI_FIXTURE_UNSUPPORTED: unsupported ? '1' : '0' };
  const args = ['--approve','--provider', 'fixture', '--model', 'fixture-model', '--thinking', 'off', '--no-extensions', '-e', join(root, 'scripts/fixture/observer.ts'),
    ...(variant === 'head' ? ['-e', join(root, 'src/index.ts')] : []), '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
    '--system-prompt', 'Synthetic fixture only.', '--session', sessionFile, '--tools', tools ? 'alpha,beta,gamma' : ''];
  return { env, args };
}
export async function cli(dir, options = {}, prompt = 'CURRENT_INPUT_MARKER short prompt') {
  const { env, args } = setup(dir, options);
  const start = performance.now();
  const process = spawn(shim, [...args, '--print', '--mode', 'json', prompt], { env, cwd: join(dir, 'cwd'), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  process.stdout.on('data', data => { stdout += data; });
  process.stderr.on('data', data => { stderr += data; });
  const code = await new Promise(resolve => process.on('exit', resolve));
  writeFileSync(join(dir, 'stdout.jsonl'), stdout);
  writeFileSync(join(dir, 'stderr.txt'), stderr);
  const result = { code, pid: process.pid, duration: performance.now() - start, provenance, events: events(dir) };
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}
export async function tui(dir, options = {}) {
  const { env, args } = setup(dir, options);
  const socket = join(root, createHash('sha256').update(dir).digest('hex').slice(0, 8) + '.sock');
  const tmux = (...args) => execFileSync('tmux', ['-f', '/dev/null', '-S', socket, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const command = `${Object.entries(env).map(([key, value]) => `${key}=${quote(value)}`).join(' ')} ${quote(shim)} ${args.map(quote).join(' ')} --tui-mode regular`;
  writeFileSync(join(dir, 'run.sh'), `#!/bin/sh\ncd ${quote(join(dir, 'cwd'))}\n${command}\ncode=$?\nprintf '%s' "$code" > ${quote(join(dir, 'exit-code'))}\n`);
  const start = performance.now();
  tmux('new-session', '-d', '-x', '120', '-y', '40', '-s', 'fixture', '/bin/sh', join(dir, 'run.sh'));
  tmux('pipe-pane', '-o', '-t', 'fixture', `cat >> ${quote(join(dir, 'raw.ansi'))}`);
  const api = {
    dir, start, tmux,
    log: () => events(dir),
    control: value => writeFileSync(join(dir, 'control.json'), JSON.stringify(value)),
    async text(text) { writeFileSync(join(dir, 'input.txt'), text); tmux('load-buffer', '-b', 'input', join(dir, 'input.txt')); tmux('paste-buffer', '-p', '-b', 'input', '-t', 'fixture'); tmux('send-keys', '-t', 'fixture', 'Enter'); },
    key(key) { tmux('send-keys', '-t', 'fixture', key); },
    async capture(name) {
      const latest = events(dir).filter(event => ['compaction_start', 'compaction_end'].includes(event.event)).at(-1);
      if (latest?.event === 'compaction_end') await waitFor(() => !tmux('capture-pane', '-p', '-t', 'fixture').includes('Compacting context'), 'compaction screen updated');
      const screen = tmux('capture-pane', '-p', '-t', 'fixture');
      writeFileSync(join(dir, `${name}.txt`), screen);
      execFileSync('conda', ['run', '--no-capture-output', '-n', 'codex-py312', 'python', join(root, 'scripts/fixture/render-screen.py'), join(dir, `${name}.txt`), join(dir, `${name}.png`)]);
      return screen;
    },
    async stop() {
      const pids = tmux('list-panes', '-t', 'fixture', '-F', '#{pane_pid}').trim().split('\n').map(Number);
      try { await api.text('/quit'); await waitFor(() => existsSync(join(dir, 'exit-code')), 'CLI exit', 5000); }
      catch { try { tmux('send-keys', '-t', 'fixture', 'C-c', 'C-c'); } catch {} }
      try { tmux('kill-server'); } catch {}
      pids.push(...events(dir).filter(event => event.event === 'preload').map(event => event.pid));
      await waitFor(() => pids.every(pid => { try { process.kill(pid, 0); return false; } catch { return true; } }), 'owned processes stopped', 5000);
      if (existsSync(socket)) unlinkSync(socket);
      const listeners = spawnSync('lsof', ['-nP', '-a', '-p', pids.join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
      const cleanup = { panePids: pids, listenerCheck: { exitCode: listeners.status, stdout: listeners.stdout, stderr: listeners.stderr }, alive: pids.filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } }),
        exitCode: existsSync(join(dir, 'exit-code')) ? readFileSync(join(dir, 'exit-code'), 'utf8') : null, socketExists: existsSync(socket) };
      writeFileSync(join(dir, 'cleanup.json'), JSON.stringify(cleanup, null, 2));
      return cleanup;
    },
  };
  try { await waitFor(() => events(dir).some(event => event.event === 'ready'), 'TUI ready'); }
  catch (error) { await api.capture('startup-failure'); await api.stop(); throw error; }
  await waitFor(() => { const screen = tmux('capture-pane', '-p', '-t', 'fixture'); return screen.includes('fixture-model') && screen.includes('────'); }, 'editor ready');
  api.readyMs = performance.now() - start;
  if (options.captureReady !== false) await api.capture('ready');
  return api;
}
