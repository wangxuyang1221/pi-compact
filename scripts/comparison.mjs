import { plan } from './comparison/spec.mjs';
import { refuse, safeFailure } from './live/guard.mjs';
const args = process.argv.slice(2), command = args.shift() ?? 'plan';
const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
try {
  if (command === 'help' || command === '--help') console.log('comparison: plan [--profile NAME] | offline --profile NAME --out PRIVATE_DIR [--resume] | freeze | real --grant FILE [--resume]. Real execution requires fresh explicit authorization and a validated frozen binding. No default network, auth, SDK import or worker. Offline results are fixtures only.');
  else if (command === 'plan') console.log(JSON.stringify(plan(value('--profile')), null, 2));
  else if (command === 'real') {
    const { launchReal } = await import('./comparison/launch.mjs');
    const { result } = await launchReal({ grantFile: value('--grant'), resume: args.includes('--resume') });
    console.log(JSON.stringify({ status: result.status, mode: 'real' }));
    if (result.status !== 'passed') process.exitCode = 1;
  }
  else if (command === 'freeze') {
    const { discoverHost } = await import('./comparison/host.mjs'); const { freeze } = await import('./comparison/freeze.mjs');
    console.log(JSON.stringify({ frozen: true, armed: false, manifest: freeze(discoverHost()).schema }));
  } else if (command === 'offline') {
    if (!value('--profile') || !value('--out')) refuse('EXPLICIT_OFFLINE_PROFILE_AND_OUTPUT_REQUIRED');
    const { launchOffline } = await import('./comparison/launch.mjs');
    const { result, cleanup, evidenceDir } = await launchOffline({ profile: value('--profile'), out: value('--out'), resume: args.includes('--resume'), fault: value('--fixture-fault') });
    console.log(JSON.stringify({ status: result.status, fixture: true, dispatches: result.dispatches, lanes: result.lanes?.length, cleanup, evidenceDir }));
    if (result.status !== 'passed') process.exitCode = 1;
  } else refuse('COMMAND_INVALID');
} catch (error) { console.error(safeFailure(error)); process.exitCode = 1; }
