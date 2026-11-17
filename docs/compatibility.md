# Compatibility reference

| Area | Supported boundary | Evidence scope |
| --- | --- | --- |
| Host | Pi 1.5.2; Node >=22.19 | Installed bundled CLI and ordinary resource loader, SDK and TUI fixtures |
| Packaging | Local tarball unpacked to directory, ordinary `pi install` | P6 isolated agent/cwd; host classes supplied by Pi |
| Remote checkpoint | openai-codex, openai-codex-responses, OAuth account claim, ChatGPT backend endpoint | 20 real Terra/Luna remote trials completed compaction, cold restart and default-tool business tasks |
| Opaque transport | SSE forced | Real SDK default fetch exercised; no general service reliability guarantee |
| WebSocket | Unsupported for opaque traffic | Not enabled or tested |
| Other providers | Active model's native summarizer | Synthetic DeepSeek through installed encoder |
| Model changes | Compatible encoder/account replay; incompatible capabilities require text conversion | P4 and P6 fixtures; service model acceptance pending |
| Account changes | Old source account cannot be substituted with new account | Synthetic account isolation and readable source reconstruction |
| Branches | Active branch and source revision validated | P3/P4 fixtures and package regressions |
| Persistence | Local persistent JSONL plus adjacent state/pending/lock records | Process interruption and filesystem faults tested; no hardware-failure guarantee |
| UI | English divider; Ctrl+O safe details; native card on isolated UI capability loss | P5 technical acceptance and user visual approval; real TUI captures retained |
| User plugins | Only locally discovered configured/autoloaded paths in P6 inventory | Empty discovered set is not a claim about arbitrary plugins |

Remote endpoint allowlist is `https://chatgpt.com/backend-api` and the non-routable `https://fixture.invalid/backend-api`. Custom encoders, virtual models and arbitrary proxy endpoints do not gain opaque support from a model name. Unknown schemas, inconsistent budgets and unsupported wire items reject before normal dispatch.

## Host integration limits

The adapter uses checked, version-specific in-process methods. Missing required safety capability exits with code 78. An incompatible UI adapter alone keeps native rendering and reports a visual downgrade. This differs from corrupt session data.

Pi can write `--name` session metadata and SDK bootstrap metadata before an ordinary extension loads. Ownership starts after loading. Use a separate manager and file per managed SDK session. Other processes that omit the extension are outside this lock protocol. Shared network filesystems and cross-machine ownership are unsupported. Managed sessions disable cache warming because that path bypasses normal admission.

Opaque budget `codex-ciphertext-bytes-v1` is a conservative local estimate based on complete wire bytes and positive reported usage. It is not a proved service-side token bound. Pi's native readable serializer truncates tool results beyond 2,000 characters and omits thinking. A reconstructed summary cannot promise the omitted content.

## Damaged checkpoints

P5 independent review confirmed that deliberately corrupting an active checkpoint's budget or provider can make the P4 footer context-usage read throw during startup. The process exits with code 1 and sends zero normal requests. This is a known startup failure, not friendly UI degradation. Keep original files and adjacent recovery records. See [recovery limits and safe operations](recovery.md). P6 does not rewrite this accepted core boundary.

The plugin cannot make native Pi parse opaque state after removal. Convert and verify a readable checkpoint while the extension remains installed. Never delete pending/opaque metadata to force a session open.

The empty-terminal-output compatibility path also passed two real controls, including an observed empty terminal and a nonempty control, with cold restart and exact opaque replay. These controls do not add quality-comparison samples. Offline fixtures verify that only an explicit empty output array can use completed stream items; missing or null output, unfinished items, conflicting nonempty output, and invalid usage still reject. Synthetic package reopen tests run in one process and do not establish service-side decryption.
