# Product design

pi-compact is a Pi extension for controlling when and how conversation history is compacted. Users keep their existing Pi launcher, provider selection, and authorization setup.

## Triggering compaction

The default threshold is 90% of the active model's context window. Changing models recalculates the token threshold. The `/compact-config` command displays settings, and `/compact-config threshold 80` changes the percentage.

The extension checks the pending context before a model request, including newly supplied input. When a model response requests multiple tools, all results must return before compaction begins. Tool calls and their results remain paired.

Manual `/compact` runs immediately, regardless of the automatic threshold, and preserves custom compaction instructions.

## Selecting the compaction method

Remote compaction requires both a compatible active Codex model and usable authorization. Authorizing Codex does not route another provider's conversation through Codex automatically. A DeepSeek session uses Pi's native summarization with the active model.

Successful remote compaction stores an opaque checkpoint for compatible continuation. It does not also generate a text summary on every success.

An explicit remote failure falls back to Pi's native compaction flow. Native compaction may call a remote model; it does not mean offline processing. If existing opaque history needs a readable representation for fallback, that conversion must finish before native summarization proceeds.

## Waiting, cancellation, and failure

The extension adds no compaction timeout. A slow response alone does not trigger fallback. An explicit transport or provider error is a failure and can trigger fallback.

Cancellation stops the current compaction without starting fallback. If compaction cannot succeed, the task pauses and retains its history. No normal model request may bypass the failure state. A successful explicit retry can resume the task.

A checkpoint becomes active only after its result is validated and persisted. Failed or interrupted operations leave the previous valid state available.

## Switching providers and restoring sessions

Before an incompatible model receives a normal request, the extension converts the active remote checkpoint into a readable summary. If conversion cannot complete, it pauses instead of sending opaque data to that model.

Checkpoint compatibility includes the provider, endpoint, protocol, account, model capabilities, and schema version. Restored sessions and branches use their own valid checkpoints. Credentials are not stored in checkpoints.

History reconstruction must respect the active branch and context edits. Large histories may require multiple summarization steps, with explicit coverage of the history being replaced.

## Completion display

The collapsed display is a centered `↗↙ Context compacted` label between thin, low-contrast rules. It has no colored background block, token count, or duration. It replaces the native completion card rather than adding another notification.

`Ctrl+O` expands available details. Text checkpoints can show their summary. Remote checkpoints show readable metadata without exposing encrypted contents or making another model request just to display details.

Failures and cancellations do not show a success divider.

## Integration constraints

The initial target is Pi 1.5.2. Stages P1 through P5 have independent technical acceptance. P6 verifies ordinary package installation and isolated lifecycle behavior. Real-provider acceptance and user visual approval remain pending.

Public extension hooks alone do not establish every required behavior. Version-specific adapters must check their capabilities, affect only the intended sessions, and leave installed Pi files unchanged.

If the UI adapter is incompatible, native rendering remains available with a clear notice. If a required request-safety capability is unavailable, the extension must stop before an unsafe request rather than silently continue.
