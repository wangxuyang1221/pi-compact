# pi-compact

Context compaction for [Pi](https://pi.dev/) with Codex remote compaction, percentage-based thresholds, and native fallback.

## Status

The design is approved. The installable extension has not been implemented yet. This repository contains the product design and implementation roadmap.

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

Installation instructions will be added when an installable version passes acceptance testing.
