# P4 source revision and split-turn repair

The goal is to prevent a migration from committing stale source facts and to summarize each covered tool turn exactly once. The coordinator reproduced both independent findings in the installed Pi CLI before changing the product. This candidate passes coordinator verification and requires a fresh independent review before P4 acceptance or P5 integration.

Product commit is `1ea8cf4f4cf492872f9c8bb5594daa6a5aa531db`, based on `6d9022479587b14bc53f0e2f3bd368362ecde2ca`. Branch is `fix/p4-source-revision`. The final delivery commit adds evidence only. No real provider calls were made.

## Changes

Execution now captures the existing manager source revision. Its summary, transport and append guards reject a revision change even when the active leaf ID is unchanged. Public reload increments that revision before loading. Explicit retry creates a new execution from the current manager history. The pending append and rollback protocol is unchanged.

After a successful source read, the reconstructed remainder already contains every newly covered message before the native retained cut, including any turn prefix. The replacement preparation now treats this remainder as one history region and clears the separate turn-prefix region. Native summarization merges it with the source summary once. The retained cut, ordering, file operations and source coverage remain native. Source failure and missing-account fallback retain native split-turn preparation.

The product repair changes four existing lines in `src/pi-adapter/session.ts`. The regression runner and observer exercise public manager/session methods, real provider encoders, and actual request bodies. The observer uses the ordinary `.ts` extension loader so its host classes match the live bundled Pi session.

## Reproduction and verification

`red.log` and `probes/1794830623478` retain coordinator reproductions on the original product. Source and native waits both committed stale summaries and sent a normal DeepSeek request after a same-leaf source reload. The split-source case put the same full prefix into two native requests and persisted duplicate tool facts.

`green-probes.log` repeats both stale-source cases and five split variants after the product change. The permanent runner is `scripts/verify-p4-fixes.mjs`. Its final audited run is `artifacts/P4-fixes/runs/1794830888680`, with ten passing cases:

- Source and native waits reject same-leaf reloads, with both changed and unchanged source bytes. No stale checkpoint or normal request is emitted. The reloaded byte prefix remains intact; only Pi's zero-token local assistant error diagnostic may follow it. The persistent state becomes blocked.
- The first explicit retry succeeds. Changed source uses current raw history without replaying the invalid old opaque source. Its checkpoint and subsequent actual target request contain the corrected fact.
- Source success, absent source authorization and source failure each run after one and two opaque checkpoints. The native preparation is a genuine split-turn with four complete tool pairs. The complete ordered prefix appears in exactly one actual summary input. Each fact occurs once in the persisted summary and target request. The retained final answer is outside summary inputs and remains once in the target. Historical tools are not re-executed.
- Every new final checkpoint's coverage IDs and source hash are recomputed from its current disk ancestry and Pi projection.

Additional checks on the repaired product passed:

| Check | Evidence |
| --- | --- |
| lint, typecheck, 40 unit tests | `lint-final.log`, `typecheck.log`, `unit.log` |
| P4 ten lanes, 11 sides | `matrix.log`, `artifacts/P4/runs/1794830753155` |
| P4 thirteen edge cases | `edges.log`, `artifacts/P4/edges/1794830775986` |
| P3 recovery 7 and persistence faults 5 | `regressions.log`, `artifacts/P4/regressions/1794830799546` |
| P1 fixes 5 and scope/read 4 | Same regression index; all child exit codes zero |
| P2 fixes 11 and reconstruction 18 | Same regression index; all child exit codes zero |
| Final package whitelist and ordinary loader | `package-final.log`, `package-final/audit.json`; all 22 files match |

The final unpacked package exercised default native, Codex remote, compatible continuation and DeepSeek migration. Its SHA-256 is `fd8cffab14e4a59b132abd5ddf0ca5d24a559f8ccd580bb129d7417c48a15b0b`.

The prior independent review recalculated all 220 P4 performance samples. This repair adds an integer comparison to the existing compaction execution guard and removes a duplicate summary request. It does not change ordinary hotpath work, cache hashing or restore behavior. Those earlier bounded performance results are reused, not claimed as new measurements or a measured speedup. No new performance matrix was necessary for this local repair.

## Retained verification failures

The initial permanent observer used `.mjs`, which imported different host classes and therefore could not find the live session. Its ten failed cases and cleanup remain in `regression.log` and `runs/1794830730771`; `failed-observer.mjs` preserves that observer. Switching the fixture to the actual `.ts` extension loader fixed the observer. No product behavior was changed for it.

The next four reload assertions wrongly required exact total file equality. Pi appends its local zero-token error diagnostic after a rejected automatic compaction. `regression-ts.log` preserves those failures. The corrected assertion requires the exact original reloaded prefix, permits only zero-token assistant error diagnostics after it, and separately forbids stale checkpoints and normal transport. `regression-final.log` and `regression-audited.log` pass.

The generic old `scripts/p4/audit.mjs` was also attempted. It compares earlier success events against intentionally corrupted final schema fixtures and throws `Invalid pi-compact checkpoint schema`. `matrix-audit.log` preserves that failure. The generic auditor and its old result were not changed, and no new full-matrix byte audit is claimed from that failed command. The ten repair cases include their own actual payload, complete prefix, coverage and disk-hash audits. The main matrix and edges retain their existing assertions. The preceding independent review's broader byte audit remains prior evidence, not a new result at this product commit.

## Evidence and cleanup

`evidence.tar.gz` retains 2,299 files covering the red cases, repaired cases, failed fixture iterations, raw requests, JSONL, journals, regression outputs and cleanup records. All archive members were streamed and hash-checked against `manifest.json`; `archive-verification.json` records the result. Temporary caches, generated synthetic auth and extracted package duplicates are excluded. Archive/manifest/report and active archive stdout are excluded from self-hashing.

`cleanup.json` checks 640 registered PIDs, 121 sockets and 125 session cleanup records. All recorded task processes exited, sockets are absent and listener output is empty. No unrelated process was stopped. All tests used synthetic history/auth and a network-denial preload. No user credentials or history, global Pi changes, push, PR, merge or publication occurred.

Model the Domain tied the operation to a source revision. Fix Root Causes removed overlap in the preparation rather than deduplicating fixture output. Prove It Works required actual transport, disk facts and explicit retry. The coordinator applied deslop and no-comments directly; no product comments or suppressions were added.

## Reproduce

```sh
node scripts/verify-p4-fixes.mjs
node scripts/verify-p4.mjs
node scripts/p4/edges.mjs
node scripts/p4/regressions.mjs
pnpm lint
pnpm typecheck
pnpm test
```

Use a private copy with a new artifact destination before rerunning the package smoke helper, because its package path is fixed. All ten repair scenarios and the main matrix use timestamped output directories. P4 remains unaccepted until a fresh reviewer verifies this delivery. P5 integration, user visual review and separately authorized P6 real-provider acceptance remain outstanding.
