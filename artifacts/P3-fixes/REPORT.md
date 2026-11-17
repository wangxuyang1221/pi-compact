# P3 recovery admission and native window fixes

The goal is to keep an interrupted checkpoint recoverable and preserve ordinary native compaction on supported small windows. Both independent findings were reproduced through the installed Pi CLI before editing. This candidate passes coordinator checks and requires fresh independent verification before P4.

Product commit is `c5deb375352c4dedac3c1b894e78d637141b4d42`, based on `05dfe3870131a89df72c3021f6c38a0f49c7690f`. Branch is `fix/p3-recovery-admission`. The worktree is `/Users/wangxuyang/Code/codex/pstack/compact`. The final delivery commit adds this report and evidence only.

## Changes

Pending append state now belongs to the managed session, so it survives the end of a failed operation. Before beginning a compaction append, the adapter enters pending state. Agent prompts and manager append/rewrite calls cannot write while that state remains pending. Read-only extension commands still run through the ordinary session prompt dispatcher. Successful durable completion clears the state.

Explicit retry first attempts exact suffix recovery and reloads the manager and agent context. A failed recovery leaves writes frozen and sends no new summary request. A successful recovery permits one new compaction attempt. The existing exact-prefix and unrelated-suffix checks in transaction.ts are unchanged.

The 4096-token segmentation reserve now applies only when rebuilding opaque history. Ordinary native compaction retains its original preparation and summary path. Opaque recovery with insufficient capacity still stops.

## Reproduction and checks

The copied independent probes in this directory retain the old failures. `small-red.log` records native baseline 1 summary / 1 normal request against product 0 / 0. `crash-red.log` records ordinary input corrupting the pending suffix and direct retry requiring two attempts. The initial repaired run also remains in `crash-green.log`: guarding the entire session prompt dispatcher blocked read-only extension commands. The final guard moved to agent admission and actual manager writes. `crash-green2.log` then passes all three original cases with one successful retry each.

The permanent runner is `scripts/verify-p3-fixes.mjs`. Its final run is `artifacts/P3-fixes/runs/1794825734547`, with seven passing cases:

- Recovery failure rejects a retry before any new model request. It rejects direct message/custom appends, rewrite, agent prompt, and session prompt. Actual session bytes remain unchanged.
- Ordinary input during the fault and after filesystem restoration cannot change the pending suffix. The first explicit retry succeeds with one remote request.
- Restart after pending recovery failure restores the exact prior bytes and checkpoint, remains blocked, then accepts explicit retry.
- SIGKILL after idle journal rename but before pending deletion recovers the previous checkpoint and permits explicit retry.
- Native baseline and head both compact a 4096-token window with 1000 max output tokens and continue normally.
- An existing opaque checkpoint in that small window remains blocked when readable recovery cannot fit. No native or normal request is sent.

The new runner's write probes observe and exercise the real manager and agent methods. They do not replace the production guards. The fault preload injects actual partial append and failed ftruncate. Remote traffic remains synthetic and network access is blocked.

Additional checks passed on the final product bytes:

| Check | Result |
| --- | --- |
| lint, typecheck, unit | All passed, 35 unit tests. |
| Prior P3 persistence faults | Five passed, including partial write, fsync, idle rename, pending unlink failure, and append-time SIGKILL. |
| P1 fixes and scope | Five regression groups and four scope cases passed. |
| P2 fixes | All 11 cases passed. |
| Native split-turn | Baseline/head each completed two compactions, four native requests, and one normal request. Custom instructions and previous summary remained available. |
| Package loader | All 20 package files matched. Default native and isolated remote each compacted and continued through the unpacked ordinary loader. |

Logs are named `regressions.log`, `lint.log`, `typecheck.log`, `unit.log`, `prior-faults.log`, `p1-fixes.log`, `p1-scope.log`, `p2-fixes.log`, `split.log`, and `package.log`.

The remaining P3 protocol and coverage matrix uses the preceding independent review, which passed 25 original scenarios and additional stream, source, and split-turn checks. The current change does not modify protocol parsing, checkpoint representation, source reconstruction, or token estimation. No claim is made that those entire matrices were rerun here.

The preceding independent performance check passed 20 pairs per workload, with 10,000-message overhead p95 7.463ms against the unchanged 10ms budget. P3's 60 original samples were independently recalculated there. This repair does not add disk checks to the normal request path; its new write admission reads session-local state. No new performance result is claimed.

## Evidence and cleanup

`source.json` records the repaired product and runner hashes. `evidence.tar.gz` contains the red and green raw events, session bytes, pending records, source provenance, cleanup records, and affected regression logs. `manifest.json` records archive and per-file hashes. The manifest and archive do not include their own bytes. Synthetic auth files, compile caches, and extracted package duplicates are omitted.

The development package is `package/pi-compact-0.1.0.tgz`, SHA-256 `c2acaed907cc07bcb663602d97d4e286574e4a302584c310cbebdb662e1044f2`. This does not replace P6 installation or real-provider acceptance.

`cleanup.json` confirms 58 recorded runtime logs, 152 registered PIDs, and 42 recorded sockets. All recorded processes exited, sockets are absent, and listener output is empty. Both failures and successful runs are included. The package smoke processes were separately added to the final cleanup audit. No unrelated process was stopped.

No real provider requests, credentials, user history, global installation changes, push, PR, merge, or publication occurred. Existing evidence and reviewer worktrees were read only. The old damaged red fixture remains as evidence; the repair does not loosen recovery checks to truncate unrelated appended data.

Model the Domain moved pending append state to the session lifetime. Fix Root Causes placed rejection before writes and recovery before a retry request. Prove It Works required exact bytes and real request counts. The coordinator applied deslop and no-comments directly; no new explanatory product comments or suppressions were added.

## Reproduce

```sh
node scripts/verify-p3-fixes.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/p3/faults.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p1-fixes.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p1-scope.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-fixes.mjs
pnpm lint
pnpm typecheck
pnpm test
```

Timestamped runners preserve prior runs. The copied split/package scripts in this directory use fixed output paths; use a private copy before rerunning those evidence checks.
