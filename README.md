# pi-compact

Context compaction for [Pi](https://pi.dev/) with Codex remote compaction, percentage-based thresholds, and native fallback.

## Status

P1 and P2 implement the ordinary Pi 1.5.2 extension, percentage-based native compaction, project configuration, cancellation, persistent failure barriers, and explicit TUI retry. P3 adds isolated Codex checkpoint, replay, and readable fallback validation. Remote behavior remains disabled for ordinary users until P4 migration acceptance. The complete product described below remains in development.

Disposable prototypes have exercised Pi 1.5.2's compaction flow and TUI. A small synthetic conversation also completed real Codex remote compaction and continuation. These experiments do not establish production reliability or a quality advantage over native compaction.

## Planned behavior

- Compact at 90% context usage by default, with a configurable percentage.
- Check before the next model request, after all tools in the current batch finish.
- Prefer remote compaction when the active model and authorization support OpenAI Codex compaction.
- Use Pi's native summarization for other providers, including DeepSeek, even when Codex authorization is also available.
- Fall back to native compaction when remote compaction explicitly fails.
- Wait for completion without an extension-imposed timeout. Allow cancellation and pause the task if compaction cannot succeed.
- Convert a remote checkpoint to a readable summary before continuing with an incompatible provider.
- Show a compact completion divider, with details available through `Ctrl+O`.

```text
──────────────── ↗↙ Context compacted ────────────────
```

The extension will use Pi's existing session and provider setup. Some integration points require a version-specific, in-process adapter. The initial compatibility target is Pi 1.5.2.

## Design and development

- [Product design](docs/design.md)
- [Implementation roadmap](docs/roadmap.md)
- [Terminology in Chinese](GLOSSARY.md)

## Run the development package

Use Node 22.19 or later and Pi 1.5.2. Install development dependencies with `pnpm install --frozen-lockfile`. Load the ordinary extension with `pi -e ./src/index.ts`.

The default compaction threshold is 90% of the active model window. `/compact-config threshold 80` saves an override in the project's `.pi/pi-compact.json`. `/compact-config` displays the current threshold and source. Read [percentage compaction](docs/p2-policy.md) for boundaries and recovery behavior.

The ordinary extension uses native text summaries. Read [checkpoint development and recovery](docs/p3-checkpoints.md) for P3 isolation and its replay contract. It requires persistent sessions and pauses failed or cancelled work until a successful explicit `/compact` retry. It disables cache warming for managed sessions. Read the [adapter behavior and verification commands](docs/p1-adapter.md) before testing integrations.

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`. The real CLI and TUI fixture suite runs with `pnpm verify:live --pr P2`. It requires tmux and a Python `codex-py312` conda environment with Pillow for terminal captures. Performance verification uses `pnpm verify:perf --pr P2`.

`pnpm pack` creates a development tarball containing the extension source and README. The extension loader resolves Pi's host classes. Do not bundle a second Pi runtime into the package.
