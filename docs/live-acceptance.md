# Run bounded provider acceptance

This guide is for the coordinator running acceptance from the source checkout. Real service results, summary quality, SSE reliability and user visual acceptance remain pending. Complete an independent review and obtain fresh user authorization before creating a real grant. The previous five-request authorization cannot be reused.

## Run without credentials or network

Print the plan or CLI help. Neither command imports the Pi SDK, reads auth/history, or starts a session.

```sh
pnpm acceptance:plan
node scripts/live-acceptance.mjs --help
node scripts/live-acceptance.mjs --output artifacts/P6/live-plan.json
```

Build the package, then run all planned scenarios with synthetic responses. Use a new evidence directory for an independent run.

```sh
mkdir -p artifacts/P6-executor/release
pnpm pack --pack-destination artifacts/P6-executor/release
node scripts/live-acceptance.mjs --offline-fixture --evidence artifacts/P6-executor/runs/local-check
node scripts/verify-live-executor.mjs
node --test tests/live-plan.test.mjs
```

The executor runs the installed Pi 1.5.2 SDK. It invokes ordinary `pi install`, loads the package through `DefaultResourceLoader`, and calls `AgentSession.compact`, `prompt` and `setModel`. It does not call pi-compact helpers directly or register a replacement provider. Offline mode uses the existing provider encoders with synthetic credentials and replaces only the final HTTP response. The existing fixture preload continues to deny sockets. Development source and dependency reads are rejected in the worker.

Native runs first without a pi-compact binding. Native and remote start with identical twelve complete tool turns, 7,000 filler characters per turn, task facts, unfinished work and `ledger.csv` bytes. The continuation is scored for facts, unfinished work, file state and tool results. Fixture responses recover markers from the actual encoded input or their persisted synthetic opaque map. Passing proves the control/data path, not model memory quality.

The normal schedule uses nine reservations. After reservation five, the first worker exits and releases its owner lock. A second worker reopens the same ledger, session and synthetic opaque map from disk. It runs native summary and continuation, remote summary and continuation, repeat remote, continuation in a new worker process restored from disk, source-to-text, target native summary and DeepSeek continuation. Migration executes the last two summary operations within one product compact call. Three reservations remain shared contingency. Any retry, fallback, extra slice or normal continuation consumes that same budget. A failed scenario stops the sequence and preserves the completed side. No advantage percentage is calculated.

## Prepare a real grant after authorization

The invalid template is `artifacts/P6/authorization-template.json`. The coordinator fills it only after fresh user authorization and independent review. No chat passphrase is required. CLI flags are technical configuration, not authorization.

A grant contains these fields.

- `schema`, `authorized` and `mode` distinguish real authorization from an offline fixture.
- `grantId`, `expiresAt` and `explicitUserAuthorization` record the new grant and its scope reference.
- `targets` names exact provider, model, API, base URL, POST endpoint and SSE transport. The supported real targets are Codex `gpt-6.1-sol` at `https://chatgpt.com/backend-api/codex/responses` and DeepSeek `deepseek-chat` at `https://api.deepseek.com/chat/completions`. A different runtime endpoint is rejected and requires a reviewed plan change.
- `maxDispatches`, `maxEstimatedInputTokens`, `maxReservedOutputTokens` and `perRequestOutputTokens` cannot exceed 12, 120,000, 12,000 and 1,000 respectively.
- `syntheticOnly`, `taskHash`, `packageHash` and the absolute `evidenceDir` bind the task, tarball and shared ledger location. Use the hashes from the final plan and package receipt.
- `authPath` identifies the existing Pi auth file. `allowAuthRefresh` must be false. The executor reads this file as JSON into a read-only in-memory credential store for only the authorized providers. It never invokes the SDK command/environment credential resolver or copies real credentials to the isolated agent. Only literal DeepSeek keys and unexpired Codex access credentials are accepted; command keys, missing credentials, expiry within 60 seconds, refresh and mutation are rejected. Other providers are not exposed to the SDK.

Missing, expired, malformed or mismatched grants fail before credential access, session startup or external actions. Test grants are valid only in `offline-fixture` mode. The file records authorization; it is not a cryptographic attestation of user consent. The coordinator remains responsible for creating it only within the user's actual grant.

After authorization, run the prepared adapter with the grant and the reviewed package.

```sh
node scripts/live-acceptance.mjs --execute \
  --grant /absolute/path/to/new-grant.json \
  --package artifacts/P6-executor/release/pi-compact-0.1.0.tgz \
  --evidence artifacts/P6-executor/runs/new-grant-id
```

The worker starts with an isolated HOME, agent directory, working directories and a small environment. After the local installation finishes, child-process entry points are disabled before the SDK is loaded. It uses built-in real provider definitions and no copied user model configuration. Catalog refresh, auth-refresh HTTP, proxy configuration, websocket and all unguarded network entry points are denied. If existing credentials or model capabilities are unavailable, the run stops. The coordinator handles any needed authorization or refresh separately. The tool does not silently add external actions.

## Interpret the budget

`runtime.streamSimple` enforces SSE, zero retries and output settings, while `guardedFetch` is the accounting boundary after the real encoder. Codex's retry loop and the OpenAI SDK's final fetch both pass through that boundary. The latter SDK also uses zero automatic retries. The private HTTPS sender opens one request with no retry or redirect handling. Global fetch, HTTP, websocket and sockets outside that sender are denied. An unexpected target, model, non-SSE body or missing cap fails before reservation and sending.

Each reservation records the actual compressed body size and SHA, decoded size, model, phase and output limit. Estimated input is `ceil(decodedBodyBytes / 4)`. This is a reproducible local estimate, not server token accounting. It can differ substantially for opaque context. Returned server usage is recorded separately. Subscription cost is unknown.

Pi 1.5.2's Codex encoder does not emit an output limit for `maxTokens`. The executor adds `max_output_tokens` after the existing payload hooks and checks it at final send. This field requests a combined reasoning/output limit. DeepSeek uses `max_tokens` on the non-reasoning chat model. **Codex endpoint acceptance and enforcement of that field are unverified.** A future rejection consumes a reservation and stops the baseline. The tool never retries with the cap removed. A reported output overrun stops subsequent requests. A 1,000-token cap with xhigh reasoning may be insufficient for this task. Real completion within nine calls is not promised, and the tool does not expand the cap.

One exclusive owner lock protects each grant directory. Reservations are written to a temporary file, fsynced, atomically renamed and followed by a directory fsync before send. Write failure poisons the owner. Abort, expiry and budget checks run before send. A reservation is never refunded, including an interrupted or uncertain send. Therefore reservation count is a conservative dispatch bound, not a claim that every reserved request reached the server.

A normal restart with the same grant reopens the existing ledger. The runner starts the scenario sequence again using the remaining budget; it does not infer which unfinished request reached the server. Prior attempts remain under `attempts/`. A different grant cannot reuse the ledger. A crash leaves `owner.lock` and reservations intact, and reopening fails closed. Before administrative removal of a stale lock, verify that the recorded PID is dead and no runner owns the directory. Preserve `ledger.json` and all evidence. This is crash recovery, not a new budget or an extra approval ceremony.

## Review the evidence

Each run writes `ledger.json`, an allowlisted `result.json`, per-attempt result files, process registration and cleanup. Public records contain task/source/body hashes, byte counts, budget reservations, numeric usage, stop/failure codes, four scores and file SHA. They contain no request headers, raw exceptions, URL queries, account identifiers, auth tokens or opaque contents.

Before any evidence writes and before each worker opens its grant, the complete existing evidence tree is checked for symlinks, hard-linked files, special files, ownership and private permissions. Existing unsafe trees are rejected without following their links. Extracted package files are checked and made private before use. Atomic writes exclusively create their temporary files; pre-existing temporary paths are never truncated or followed. These checks cover pre-existing paths and worker recovery, not a hostile concurrent process with the same OS user replacing paths during execution.

`raw/` is private mode 0700. Session logs, synthetic auth and checkpoint files are mode 0600. Raw evidence is excluded from the release package and public report archive. The offline opaque map is synthetic and cannot authenticate a real transport. Child stdout/stderr is discarded rather than copied into public reports. Offline-only diagnostics remain private. The public results do not render or quote opaque bodies.

`verify-live-executor.mjs` runs the same installed host chain through the final guard with complete, retry, retry-at-cap, concurrent sends, multiple summary slices, budget, input/output limit, expired, persistence, abort before and after reservation, endpoint, model, missing-cap, HTTP failure, redaction, auth-refresh denial, stream-failure and crash cases. Unit tests also exercise simultaneous sends, process ownership, restart, unrefunded reservations and audited zero-side-effect preflight. Failure injections are rejected in real mode.

The parent waits for its worker and records process liveness and listener cleanup. It does not start a network listener. The executor is ready for independent review; real service and visual acceptance remain separate pending gates.
