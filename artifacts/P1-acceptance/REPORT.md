目标是独立判断 pi-compact 普通 Pi 1.5.2 扩展的 P1 小修复是否消除了 S1、S2，并保留已有失败屏障和会话隔离。本轮结论为 **PASS，P1 可进入 P2**。未发现本次改动在已约定支持范围内引入的可复现缺陷。本结论不等于 P2 至 P6 完成，也不授权发布。

精确被验 HEAD 为 `aff503792cb9359ab7787cc267c7c080e8557ac3`。产品修复提交为 `6e9ceca779b3e6e6130095babdd203556b1eaf52`，前次复验头为 `6c96971274da7aab2e2fa838485de30e18acaa0f`。`6c96971..6e9ceca` 只涉及两个产品模块、范围文档、新 scope runner 与探针、一个 package script。`6e9ceca..HEAD` 只增加本轮原报告和清理记录，产品、脚本、测试和锁文件相同。

工作目录为 `/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba`。以下相对路径均相对于此目录。已读取模型配置、poteto-mode、Prove It Works、no-comments、前独立报告、当前范围报告、完整 adapter 模块、架构 synthesis 及 implementation-plan 的 P1 合同。审查没有启动子代理，没有实现 P2，没有修改产品、原测试、旧报告、root checkout 或安装的 Pi。没有 commit、push、PR、watch、发布或真实模型请求。

**所有权与冲突检查。**

[session.ts:339](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/src/pi-adapter/session.ts:339) 先匹配实际加载的扩展路径，再在 managed `_buildRuntime` 中取得文件所有权，并拒绝已有不同 `owner.session` 的 manager。未受管理的 AgentSession 直接走原生 runtime。登记后的 manager 写入仍验证文件身份；未登记 manager 的 append/rewrite 只调用 [journal.ts:39](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/src/pi-adapter/journal.ts:39) 检查既有锁，不登记到 `Registry.files`，不创建锁。读取入口的原型包装已删除。这个分离符合目标会话隔离，也保留了扩展加载后 R2 的写入拒绝。

S1 已通过独立真实 SDK 对照。baseline 和 head 各完成两次正常请求，分别来自无扩展的内存子会话和独立持久子会话。每侧八项操作通过，两个子会话的扩展列表均为 `[]`。head 无关持久 manager 在活动期和 dispose 后均没有插件锁，dispose 后可以重新打开并读取。内存读取、append、SDK 创建和 prompt 均恢复原生行为。原始事件与磁盘内容另由独立审计脚本断言，没有仅采用 runner 的 pass 字段。

S2 已通过合法 idle SDK owner 的公开读取验证。baseline/head 各一次正常请求，context 与 projection 都返回 3 条消息，读取前后文件字节不变。head 子会话只加载正式产品扩展，controller 为 idle。已有历史的共享 manager 回归仍在 runtime attachment 拒绝第二个 managed owner，错误为 `SessionManager is already managed by another session`，文件未变，原 owner 随后正常请求一次。该结果不扩大为任意 SDK bootstrap 前写入的保证。

证据为 [scope 原始结果](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope/runs/1794809845735/result.json)、[managed SDK 读取事件](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope/runs/1794809845735/managed-read/head/events.jsonl)、[共享 manager 事件](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-fixes/runs/1794809846884/shared-manager/events.jsonl) 和 [独立事件审计](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/evidence-audit.json)。scope runner 中的 baseline 指不加载产品的原生 Pi，不是旧缺陷提交。

**锁与 R2 的独立实证。**

新增 [locks.ts](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/locks.ts) 经实际普通 loader 加载。它使用真实 SessionManager，不替换 append、读取、dispose 或 bootstrap。六种锁状态加同文件未登记 manager，共七项通过。

- 无锁时，无关 manager 可以写入，但不取得锁。随后显式 claim 创建当前 PID 的锁，release 删除它。
- 存活 PID 的锁同时拒绝无关 manager 写入、availability check 和新 claim，锁与 JSONL 字节不变。
- 死亡 PID 来自本轮创建且已退出的真实 Node 子进程，实际 `kill(pid, 0)` 返回 ESRCH。无关写入获准且保留原死锁字节，没有隐式接管。后续 claim 成功替换为当前 PID，再正常释放。
- 损坏 JSON、零 PID、小数 PID 均拒绝写入与 claim，保留原锁与文件。公开 context/projection 仍可读取。
- 同进程另一个未登记 manager 打开合法 owner 的文件，可以读取，写入被拒绝，owner 的文件和锁不变。

[锁原始事件](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/locks/events.jsonl) 与 `artifacts/P1-scope-recheck/locks/cwd/*-before.jsonl`、`*-after.jsonl` 保存了实际结果。该 probe 没有正常请求或摘要请求。未注入 EPERM；源码对非 ESRCH 的进程探测失败保持拒绝，不能把这项源码判断写作实测。

另外独立重复一次真实 TUI owner 与普通 CLI contender 的 R2 场景，并保存竞争前后原始文件。竞争者退出 1，正常请求和摘要请求均为 0。两份 JSONL 都为 19,987 字节，SHA-256 均为 `f27188d5b7dd24b1beefa197a766ce28018eb0378bbb94de54d82385a0ad312a`。锁 SHA-256 均为 `96257c45a9f629d1f13a504ac7dece15f31d006d2c5b277d9962415c05ef7b4b`。合法 owner 随后正常请求一次。

证据为 [字节结果](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/ownership-bytes/result.json)、[竞争前 JSONL](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/ownership-bytes/before.jsonl)、[竞争后 JSONL](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/ownership-bytes/after.jsonl) 和同目录 contender 的 stderr、events、result。未发现本次提取 availability check 导致的具体存活、死亡或损坏锁处理错误。

**旧合同与开发包。**

`pnpm verify:p1-fixes` 五组原样通过。独立审计确认 F1 的迟到 continue 被拒绝、队列未消费、目标没有发请求；活跃 peer 发一次正常请求，最后实例退出后 registry、dispatcher、锁均释放。R1 事件顺序为第一摘要失败、failure hook 进入、第二命令已分派、hook 释放、第二摘要请求、唯一 checkpoint 对应的 extension-success、成功 compaction_end、一次正常续跑。磁盘 checkpoint 为 `6d977ad0`，恢复 sidecar 为 idle，真实终端捕获已无 Compacting context。R3 两侧安全输入各一次正常请求、零摘要；超大输入零请求且 blocked。19 项测试包含原 C1 持久失败合同，全部通过。

证据为 [五组结果](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-fixes/runs/1794809846884/result.json)、[retry 原始事件](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-fixes/runs/1794809846884/retry/events.jsonl)、同目录 `retry.txt`、`raw.ansi`、`session.jsonl` 和 [测试日志](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/test.log)。本轮未重复全部十 lane 或性能计时。未变路径沿用前独立报告适用的验证，没有宣称新的性能改善或一般尾延迟保证。

当前 HEAD 重新打包得到 11 个预期文件。包内 5 个产品源码与 5 个文档逐字节匹配工作树。pnpm 重排 package.json 并删除 packageManager 字段，其他字段语义完全一致。首次审计把 manifest 也要求逐字节相同而失败，尚未启动 Pi；保留 [首次审计失败日志](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/artifact-probes-first.log)。仅修正本审查脚本的 manifest 比较方式后重跑，没有修改包或产品，没有放宽源码字节检查。

[开发包](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/package/pi-compact-0.1.0.tgz) 的 SHA-256 为 `0119086a3d37806452d50ce4565b491295379945e9eebe89f8b88865c3503503`。使用 installed Pi 1.5.2 shim、干净 agentDir、普通 `-e` loader 加载解包入口，禁用源码入口的自动加入，只另加 transport/event observer。实际 managed=true、正常请求 1 次、摘要请求 0 次、进程退出 0。包中没有测试、fixture、凭据或 node_modules。此为 P1 解包加载 smoke，并非 P6 的最终安装验收。

见 [包逐文件审计](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/package/audit.json) 与 [实际 loader smoke](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/package/smoke/result.json)。16 份含 provenance 的运行记录中，Pi 版本、CLI、package、source map 和 bundle 指纹一致，见 [provenance 审计](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/provenance-audit.json)。

**可复跑命令和写入范围。**

已执行 `pnpm install --frozen-lockfile`，必要依赖位于本工作树的 node_modules。常规 lint/typecheck 在工作树运行。原测试会在 cwd 下创建临时文件，因此将 src、tests、scripts、package.json、tsconfig.json 原样复制到 `artifacts/P1-scope-recheck/checks`，以本工作树 node_modules 的 symlink 提供依赖，预建其 `artifacts/P1`，在该副本执行原 `pnpm test`。独立审计证明副本逐字节相同，未修改测试。

| 命令 | 退出码 | 实际输出 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 0 | `artifacts/P1-scope-recheck/install.log` |
| `pnpm lint` | 0 | `artifacts/P1-scope-recheck/lint.log` |
| `pnpm typecheck` | 0 | `artifacts/P1-scope-recheck/typecheck.log` |
| `cd artifacts/P1-scope-recheck/checks && pnpm test` | 0 | `artifacts/P1-scope-recheck/test.log`，19/19 |
| `pnpm verify:p1-scope` | 0 | `artifacts/P1-scope/runs/1794809845735/` |
| `pnpm verify:p1-fixes` | 0 | `artifacts/P1-fixes/runs/1794809846884/` |
| `pnpm pack --pack-destination artifacts/P1-scope-recheck/package` | 0 | 当前 HEAD 的 tgz |
| `node artifacts/P1-scope-recheck/artifact-probes.mjs` | 0 | 包 smoke、七项锁探针、双进程字节快照 |
| `node artifacts/P1-scope-recheck/audit-evidence.mjs` | 0 | 请求、事件、字节、文件冻结、清理断言 |
| `git diff --check` | 0 | 无输出 |

[artifact-probes.mjs](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/artifact-probes.mjs) 依赖当前目录的 tgz；重跑前可重新打包。scope 和 fixes 的原 runner 自动创建新的时间戳目录。审计脚本从本目录 scope.log、fixes.log 的最后一行读取实际 run 路径，复跑时应将两条 runner 的 stdout 重定向回对应日志。独立 probe 的输出为其审查专用目录，若需保留本轮原证据，先复制整个审查目录再运行。

[freeze-before.json](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/freeze-before.json) 与 [freeze-after.json](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/freeze-after.json) 核对 203 个原 tracked 文件，全部未变。新增证据只在批准的本审查目录和两个 runner 的新 runs 目录。最终 git status 无 tracked 修改。

no-comments 简查为 PASS。本次 src/scripts diff 新增注释和 lint/TypeScript suppressions 均为 0。未删除或恢复注释，未做产品修改，未运行 Comment Sicko 子代理。保留的既有 loader 约束注释不在本次新增范围。[检查记录](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/no-comments.json) 可复查。

**限制与清理。**

Pi `--name` 在扩展加载前写入，以及 embedded SDK bootstrap 可能早于 runtime attachment 写元数据，均为已明确的宿主边界。调用者必须为不同 session 使用独立 manager 和文件。恢复 public reads 不表示禁止任意 bootstrap 写入，也不协调未加载扩展的其他进程。已有历史的共享 manager 场景已经实测安全拒绝，不能用它推导空会话或任意模型切换元数据也不变。锁仅覆盖本机本地文件，未验证跨机器、网络文件系统或任意人为锁替换。

全部模型请求仅使用合成 OpenAI Responses SSE fixture。preload 拒绝真实 sockets、HTTP/HTTPS 和 WebSocket，仅允许 fixture.invalid 合成 fetch，所有事件中 network-blocked 为 0。agentDir、cwd、会话和凭据均为 fixture，没有读取真实用户历史或凭据。未验证真实服务、其他 provider、全部第三方扩展组合，也未提前要求 P3 的 partial-write 事务。

[cleanup.json](/Users/wangxuyang/.t3/worktrees/compact/t3-2348152c-86fd991d806623ba/artifacts/P1-scope-recheck/cleanup.json) 直接检查 16 个 Pi PID、3 个 pane shell 和1个死亡 PID 探针，共20个唯一 PID，全部退出。3份 TUI cleanup 均退出0，监听为空，tmux socket 不存在。最终 lsof 无这些 PID 的 TCP listener，工作树根目录无 .sock，ps 扫描无本工作树的 Pi、tmux 或 runner 残留。没有停止无关进程。故障锁作为合成证据保留，其 PID 已退出。短命 pnpm、conda、renderer 辅助进程未逐一登记，但主命令已完成，不将其混称为逐 PID 全量记录。

Prove It Works 原则使本轮直接验证真实 Pi loader、SDK、事件顺序、JSONL 字节和当前包，而不以编译成功或协调者自测代替实证。no-comments 按用户限定由本审查者直接完成。throughput checkpoint 为不适用，本轮是已有目标下的独立验证，不重启架构或代理流程。S1、S2 已关闭，R2 和原失败合同保持通过，支持以当前 HEAD 开始 P2。
