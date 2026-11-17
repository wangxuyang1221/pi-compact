import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../../scripts/fixture/runtime.mjs';
export const base=join(root,'artifacts/P4-fixes');
const candidates=readdirSync(join(root,'artifacts'),{recursive:true,withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>join(entry.parentPath,entry.name)).filter(path=>!path.startsWith(base+'/')&&Number(path.match(/(?:^|\/)(?:run-|regression-)?(\d{13})$/)?.[1])>=1794830623478);
export const evidenceRoots=[base,...candidates.filter(path=>!candidates.some(other=>other!==path&&path.startsWith(other+'/')))];
