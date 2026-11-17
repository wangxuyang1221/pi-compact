import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { ARTIFACT, hashJSON, fileManifest, plan, profiles, schedule, readJSON } from './spec.mjs';
import { digest, refuse } from '../live/guard.mjs';
import { toolSchema } from './tools.mjs';
import { invalidTemplate } from './budget.mjs';
export const packageFile = resolve('artifacts/P6-isolation-fixes/release/pi-compact-0.1.0.tgz');
export function bindingFor(hostInfo, profile) {
  const datasets = fileManifest(join(ARTIFACT, 'datasets'));
  if (hashJSON(datasets) !== hashJSON(readJSON(join(ARTIFACT, 'dataset-manifest.json')).files)) refuse('DATASET_FREEZE_MISMATCH');
  const preflight = join(ARTIFACT, 'preflight.json');
  return { plan: hashJSON(plan(profile)), dataset: hashJSON(datasets), scorer: digest(fs.readFileSync(resolve('scripts/comparison/scorer.mjs'))), toolSchema: hashJSON(toolSchema), package: digest(fs.readFileSync(packageFile)), host: hostInfo.sourceHash, schedule: hashJSON(schedule(profile)), runner: hashJSON({ modules: fileManifest(resolve('scripts/comparison')), shared: fileManifest(resolve('scripts/live')), fixturePreload: digest(fs.readFileSync(resolve('scripts/fixture/preload.mjs'))), cli: digest(fs.readFileSync(resolve('scripts/comparison.mjs'))) }), boundaryPreflight: fs.existsSync(preflight) ? digest(fs.readFileSync(preflight)) : null };
}
export function freeze(hostInfo) {
  if (!fs.existsSync(join(ARTIFACT, 'preflight.json'))) refuse('PREFLIGHT_REQUIRED');
  const files = { 'plan.json': plan(), 'tool-schema.json': toolSchema, 'installed-source-manifest.json': { version: hostInfo.version, node: hostInfo.node, platform: hostInfo.platform, arch: hostInfo.arch, osRelease: hostInfo.osRelease, osVersion: hostInfo.osVersion, compilerHash: hostInfo.compilerHash, sourceHash: hostInfo.sourceHash, sources: hostInfo.sources }, 'proposed-budget.json': plan().profiles };
  for (const profile of profiles) {
    const binding = bindingFor(hostInfo, profile.id);
    files[`schedule-${profile.id}.json`] = schedule(profile.id);
    files[`invalid-auth-template-${profile.id}.json`] = invalidTemplate(binding, profile.id);
  }
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(join(ARTIFACT, name), JSON.stringify(content, null, 2) + '\n');
  const manifest = { schema: 'comparison-freeze/v1', authorized: false, armed: false, activeBudget: 0, packageFile, packageSHA256: digest(fs.readFileSync(packageFile)), profiles: Object.fromEntries(profiles.map(p => [p.id, bindingFor(hostInfo, p.id)])), files: Object.fromEntries(Object.keys(files).map(name => [name, digest(fs.readFileSync(join(ARTIFACT, name)))])), preflight: digest(fs.readFileSync(join(ARTIFACT, 'preflight.json'))), source: fileManifest(resolve('scripts/comparison')) };
  fs.writeFileSync(join(ARTIFACT, 'freeze-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function verifyFrozen(hostInfo, profile) {
  const frozen = readJSON(join(ARTIFACT, 'freeze-manifest.json'));
  const binding = bindingFor(hostInfo, profile);
  if (hashJSON(frozen.profiles[profile]) !== hashJSON(binding)) refuse('EXECUTION_FREEZE_MISMATCH');
  for (const [name, hash] of Object.entries(frozen.files)) if (digest(fs.readFileSync(join(ARTIFACT, name))) !== hash) refuse('FROZEN_ARTIFACT_CHANGED');
  return binding;
}
