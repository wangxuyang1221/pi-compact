import assert from 'node:assert/strict';
import { join } from 'node:path';
import { root } from './fixture/runtime.mjs';
import { verifyConfig } from './p2/verify-config.mjs';
const result = await verifyConfig(join(root, 'artifacts/P2-fixes/config', String(Date.now())));
console.log(JSON.stringify(result.byKind));
assert(result.pass, 'Initialized Enter-to-terminal configuration response p95 <=100ms');
