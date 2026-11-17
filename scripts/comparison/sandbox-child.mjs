import fs from 'node:fs';
import { createRequire } from 'node:module';
const request = JSON.parse(fs.readFileSync(0, 'utf8'));
const enter = createRequire(import.meta.url)(process.argv[2]).enter;
const emit = process.stdout.write.bind(process.stdout);
const stringify = JSON.stringify;
const exit = process.exit.bind(process);
const profile = '(version 1)(allow default)(deny file-read*)(deny file-write*)(deny network*)(deny process-fork)(deny process-exec)(deny mach-lookup)(deny signal)(deny system-socket)(deny ipc-posix-shm)(deny ipc-posix-sem)';
enter(profile);
try {
  const module = await import('data:text/javascript;base64,' + Buffer.from(request.source).toString('base64'));
  const outputs = [];
  for (const input of request.inputs) outputs.push(await module[request.exportName](input));
  emit(stringify({ outputs }) + '\n'); exit(0);
} catch { emit(stringify({ error: 'MODULE_EXECUTION_DENIED_OR_FAILED' }) + '\n'); exit(1); }
