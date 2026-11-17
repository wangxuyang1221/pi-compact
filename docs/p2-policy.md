# Percentage compaction

pi-compact defaults to 90% of the active model's context window. The first triggering token is `ceil(contextWindow * thresholdPercent / 100)`. A 10,000-token model triggers at 9,000 tokens, including equality. A model change recalculates this boundary.

Run `/compact-config` to display the percentage, source, model window, and token boundary. Run `/compact-config threshold 80` to save a project override. The percentage must be finite, greater than 0, and less than 100. Invalid commands leave the previous file intact.

The extension reads `.pi/pi-compact.json` under the session's working directory. Its format is `{ "thresholdPercent": 80 }`. A missing file or missing property uses 90%. A malformed file reports an English error and stops normal requests until repaired. A valid threshold command explicitly replaces that dedicated settings file. Reads and atomic replacements are synchronous. Sessions in the same project intentionally share the latest setting; independent projects use independent files. No Pi global setting is changed.

The percentage controls when automatic compaction starts. Pi's `keepRecentTokens` still controls the retained history cut. Pi's original summarization output reserve remains in use during compaction. Normal requests independently reserve the active model's maximum output capacity. A strategy threshold cannot authorize a request that exceeds that capacity, and it is not a second capacity limit after successful compaction.

Checks include the current input and run only at complete tool-batch boundaries. Manual `/compact` starts the native path immediately and forwards its custom instructions. Automatic compaction respects Pi's enabled setting. Both paths retain the P1 cancellation, commit confirmation, explicit retry, session ownership, and failure barrier. Automatic threshold checks distinguish a native return before `compaction_start` from a failed summary. No eligible history leaves the session idle. Manual `/compact` retains Pi's "Nothing to compact" error. Failed summaries, cancellation, and failed persistence remain blocked until an explicit successful retry.

The final request check runs after public `context` hooks and Pi's forced system prompt projection. Hook output participates in the percentage budget. If compaction changes the history, the adapter replaces unchanged old messages with the native checkpoint and preserves hook additions and changes. It does not repeat public hooks. The final encoded request must still fit the input capacity. An oversized hook result pauses the session and leaves the original history in the session log.

Each input or complete tool batch opens a new policy boundary. One threshold attempt covers that boundary, including its post-run check. Successful summaries and no-work results do not cause repeated attempts at the same boundary. Context edits, model changes, and percentage changes reopen the check. Pre-input threshold checks defer until the current input and hook output are available. Native overflow recovery retains its own path.

There is no extension timeout. Escape cancels the active native operation. Every provider uses its currently selected native summarization model in P2, including DeepSeek when synthetic Codex authorization exists. Remote Codex checkpoints and migration belong to later stages.

Run `pnpm verify:live --pr P2` for the ten synthetic CLI/TUI lanes, `pnpm verify:perf --pr P2` for alternating 1,000/10,000-message samples, and `node scripts/p2/demo.mjs` after live verification to record the terminal demo. All runtime checks use isolated agent directories and the network-denying fixture preload. See `artifacts/P2/REPORT.md` for the measured result and limitations.

Run `node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-fixes.mjs` for the boundary regressions. Each run writes a new directory under `artifacts/P2-fixes`. The performance runner includes `transformContext` in its timed request boundary. It reports handler timing separately and applies the configuration limit to the visible TUI response.
