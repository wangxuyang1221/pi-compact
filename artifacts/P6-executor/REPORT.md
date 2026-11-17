# P6 授权执行器交付

目标是为根负责人提供新授权后可执行、可独立审查的真实 Pi 验收工具。本地准备和离线验收通过。真实 provider 请求、真实凭据与历史读取均为零。没有创建有效 real grant。真实质量、服务可靠性、用户视觉 gate 和根 fresh review 仍 pending。

实现代码冻结于 `92aab061d6c254fc385111edacef94f0ad16292c`。精确基线为 `7b2d8eac45e2d63f32943b5890c252a4579b16e0`。产品源码仍为 `713acbf87bfa87b3d6eb208fb55bdb3b6651fd49`，保留原 P6 的普通安装和 isAbsolute 修复。P5 accepted 为 `143b0b0e7abeb02f5211e2718c29d1c9af09a510`。后续提交只保存本报告和证据，完整交付 HEAD 见最终回复或 `git rev-parse HEAD`。

工作树为 `/Users/wangxuyang/.t3/worktrees/compact/t3-94dae7b7-15794223f5905ed2`，本地分支为 `p6-executor-guard`。初始 HEAD 匹配且 clean。没有修改 root、原 owner、其他 worktree 或 installed Pi，没有 push、PR、merge、publish、watch、全局安装或子代理。

## 可执行入口

[入口](../../scripts/live-acceptance.mjs) 默认只打印 [机器计划](../P6/live-plan.json)。`--help` 和 dry-run 不导入 SDK，不启动会话。`--execute` 要求 fresh grant。模板始终 [authorized=false](../P6/authorization-template.json)。缺失、过期、模式或任务/包/目录/目标不匹配的授权均在凭据读取和会话启动之前拒绝。CLI 审计通过，未触发 auth/host read、socket、fetch 或子进程探针。

Grant 绑定 grantId、expiry、精确 provider/model/API/baseUrl/endpoint/SSE、12 次请求上限、120000 estimated input、12000 reserved output、每次 1000 output cap、syntheticOnly、任务与 tarball SHA、证据目录和既有 authPath。Fixture grant 仅对 offline-fixture 有效，real 模式拒绝 fixture fault 配置。根在新用户授权后填写文件，不需要用户在聊天里输入口令。文件是技术配置和授权记录，不是密码学意义的用户同意证明。

执行器通过普通 `pi install` 登记 tarball 解包目录，再由 installed Pi 1.5.2 的 DefaultResourceLoader 自动发现产品。实际调用 AgentSession.compact、prompt、setModel 和 SessionManager.open。没有直接调用产品 helper 或替换 provider。worker 拒绝读取本 worktree 的 src/node_modules，安装包仍完成全部场景。native 先跑且 managed=false，remote managed=true 且入口来自隔离 package。

双方的 12 个完整工具 turn 和文件 bytes 相同。续接提示不给出未完成任务答案。完整任务的 source SHA 为 `3be46c62929a90e1a9907a86d38db666059313ec8a6d936c4c8d6e77d41fa280`。task SHA 为 `972e1704ca5d40d2ede42a6c0d2ab56ba5c9dfc2eb1be6c36e5b28c251d28e46`。

正常流程实际预约 9 次。先完成 native summary/continuation，再完成 remote summary/continuation 和 repeat remote。第 5 次之后 worker 真正退出。新 worker 重新打开 ledger、磁盘 session 和合成 opaque map，完成 restore continuation、source-to-text、target native summary 和 DeepSeek continuation。迁移的两次 summary 在一个产品 compact 调用中发生。三个 contingency 与所有场景共用 ledger，不自动扩额。

## 实际发送边界

[host-boundary.json](host-boundary.json) 保存 SDK 实际依赖路径和 SHA。SDK 来自 installed Pi，依赖的 pi-ai 同为 1.5.2。CLI SHA 为 `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774`，SDK SHA 为 `c43e4e1d49ac3ec4b9f48465bf2081bc5980b55f23d44040d02e9046dea45725`。运行 Node v22.22.2。

Codex 的实际 provider retry loop 在每次 attempt 调用 `options.fetch`。OpenAI completions 把同一个 fetch 交给 SDK，requestOptions.maxRetries 为 0，外层 retryProviderRequest 使用 options.maxRetries。执行器在 ModelRuntime.streamSimple 固定 SSE 和 maxRetries=0，但预算不放在那里。[guardedFetch](../../scripts/live/guard.mjs) 在实际编码完成后核对 URL、POST、Host、model、stream 和输出 cap，解码 zstd/JSON，记录真实 body bytes 与 SHA，再预约。每次重试、fallback、多 slice、source conversion 和 normal 都重新进入此处。

最后的私有 HTTPS sender 每次只创建一个 request，不处理 retry 或 redirect。其他全局 fetch、HTTP、HTTP2、TLS/socket、WebSocket 和 datagram 入口拒绝绕过。301/302 等响应不会跳转。未知 endpoint、query、model、非 SSE 和缺失 cap 在 send 前拒绝。离线模式继续加载现有拒绝 sockets 的 fixture preload，没有放宽它；只在 guard 之后生成合成 Response。

真实 worker 的 HOME、agent、cwd、环境和模型配置均隔离。仅在授权后由既有 ModelRuntime 读取 grant.authPath，不复制真实 auth，不读取真实 history。真实运行使用 built-in provider 定义。auth refresh、catalog network 和 proxy 都没有授权范围，默认拒绝。若已有凭据不可用，执行停止，不隐式 refresh，也不新增外部请求。

## 预约、崩溃与用量

[DurableLedger](../../scripts/live/guard.mjs) 的同一目录只允许一个 owner，以 `open(..., wx)` 排他持有 owner.lock。预约同步写临时文件、fsync、rename，再 fsync 目录，然后才 send。校验和与完整 grant hash 绑定恢复状态。并发预约同步完成，因此无法同时观察同一剩余额度。持久化失败会 poison 当前 owner，后续请求拒绝。

过期、取消、预算不足均在发送前拒绝。已预约但未完成的请求永不退款。崩溃保留 lock 和 reservation，自动重开失败。正常重启复用同一 ledger，不重置预算。外部重跑从 native 序列重新开始，只使用剩余额度，并保留 attempts。若需清理 stale lock，先确认记录的 PID 已死且没有 runner 持有目录，必须保留 ledger。它不是追加预算操作。

输入预约采用 `ceil(decodedBodyBytes / 4)`，不是服务器精确 token，尤其不能把 opaque 字节估计视作其真实上下文 token。server usage 单独保存。完整离线 smoke 的 estimated input 为 49439，reserved output 为 9000。四次 continuation 的四类得分全部通过，文件 SHA 均为 `92e85cfa04eb0188cddc41b1864191c20b0139efaf1bd9da8c89284a2d5bcda9`。这些是合成响应结果，不是质量或性能优势证据。订阅金额未知。

**Codex 输出限制仍有真实能力边界。** 实际 Pi 1.5.2 encoder 不会输出 maxTokens 对应字段。执行器在现有 payload hook 之后加入 max_output_tokens，再在最后 send 验证。该字段请求 reasoning 与 output 合计上限。DeepSeek non-reasoning chat 使用 max_tokens。真实 Codex endpoint 是否接受并遵守字段尚未验证。首次 native 请求若被拒绝，会计入预算并停止，绝不移除 cap 后重试。返回 usage 超出 cap 时拒绝后续发送。xhigh reasoning 在每次 1000 token 内也可能无法完成任务。此交付不声称真实九次调用必然覆盖全部质量目标。

## 验证与安装包

冻结代码上的 [20 项真实 host 故障矩阵](matrix-frozen-head.log) 全部通过。对应结果在 `verification/1794838913848/results.json`，也包含在公开归档中。正常流程为 9 次。故意启用宿主重试的流程为 12 次。retry-at-cap 和并发发送都只能预约 1 次。source 失败后触发真实多摘要切片，在第 12 次后拒绝后续 slice。其余覆盖 input/output 超额、expired、persist failure、send 前/预约后 abort、endpoint/model/cap 不匹配、HTTP failure、原始错误脱敏、auth-refresh 外网拒绝、断流和 send 前落盘后的进程 crash。

[测试](tests-release.log) 为 TS 62/62 与预算测试 12/12。[lint](lint-audit.log) 和 [typecheck](typecheck-release.log) 通过。预算测试还覆盖跨进程排他、重开 ledger、未发送 reservation 不退还、重定向拒绝和默认零副作用。完整 [release smoke](release-smoke.log) 再次验证两个 worker、普通安装和所有评分。未机械重跑 P1 至 P5 大矩阵，产品 src 无变更。

因为打包文档 docs/live-acceptance.md 已改变，已重新 pnpm pack。[新包](release/pi-compact-0.1.0.tgz) SHA-256 为 `91720c1241b23d8a434371d59b6be25ab316c7277834b7ceb62451555b3efbe0`。[manifest](release/manifest.json) 验证全部 26 个白名单成员与源码。package.json 按 pnpm 的 packageManager 移除和键顺序规则核验结构。没有 auth、tests、node_modules、raw 或 opaque 数据。产品源码与 713acbf 精确一致，普通安装 smoke 使用这个新包。

## 证据与失败保留

公开记录只含任务/source/body hash、长度、预约、model/transport/operation、数值 usage、stop/failure code、四类得分、文件 SHA 和 cleanup。不保存 headers、原始 exception、URL query、provider account 或 opaque 正文。worker stdout/stderr 只统计字节，不复制到公开报告。offline-only 异常留在私有 raw。

[公开归档](public-evidence.tar.gz) 包含 510 个逐 hash 验证的文件，SHA 为 `1d93fc6c750beec0324144041998cde1e46dedab7d5039d701f638e46ce46550`。[公开清单](public-manifest.json) 可复核。归档删除 macOS 扩展属性、owner 名称等附加元数据，只保留必要的长路径 PAX 字段。

私有 `private-offline-evidence.tar.gz` 留在本 worktree，未提交，也不进入公开包。它是 0600，1544 个成员，SHA 为 `2344f6401303814533382401e68ec26ab03287d16f4107a85e95908e512034c2`。内含合成 sessions/checkpoints、map、故障诊断和配置，不含 auth.json、package、tmp 或 home。[raw 清单](private-raw-manifest.json)、[归档 receipt](archive-receipt.json) 和 [实际归档验证](archive-frozen-head.log) 绑定这些本地文件。raw 目录 0700，session/checkpoint 文件 0600。

所有初始失败保留。probe-1/2 是 install 参数顺序，probe-3 是普通安装返回相对 source 路径，probe-4 是 OAuth snapshot 尚未刷新导致 native fallback。probe-5 以后验证修复。故障矩阵中的预期失败各有独立目录。package manifest 曾因 JSON 键顺序误报，已改结构比较。归档曾遇到 -T 路径解析、macOS 扩展属性及合法长路径 PAX 检查误报，失败归档留在本 worktree，没有覆盖成 PASS。

[决策记录](decisions.tsv) 是事后回填。前九行 ts 不是实测事件时间，其含义已用追加 audit 行撤回。实际时间只看各 run 的 started/finished 与 ledger.at，不用该表测时或推断严格先后顺序。

## 清理与复跑

[清理](cleanup.json) 直接检查 240 个登记 runtime PID，alive 为空，无 TCP listener，无遗留 socket。崩溃 fixture 的 owner.lock 作为证据保留，其 PID 全部已退出。同步的 pnpm、tar、conda 等短命构建 helper 已等待结束，没有把它们冒称为逐 PID 登记的服务。没有杀无关进程。

在本 worktree 根复跑。

```sh
pnpm lint
pnpm typecheck
pnpm test
node scripts/live/package.mjs
pnpm acceptance:plan
node scripts/live-acceptance.mjs --offline-fixture --evidence artifacts/P6-executor/runs/new-review-run
node scripts/verify-live-executor.mjs
node scripts/live/audit.mjs
```

新 run 使用新证据目录。已有目录复跑不会重置预算。公开归档可解压到一个新目录阅读。私有归档只在隔离目录以 umask 077 解压。`archive.py` 拒绝覆盖已有归档；新归档之前保留旧文件。

[四次吞吐检查点](WORKFLOW.md) 覆盖调查、实现、验证和交付。Model the Domain 使 grant、reservation 和结果结构固定。Boundary Discipline 将 endpoint/model/预算检查放到实际发送边界。Prove It Works 要求普通安装、真实 encoder、新进程恢复及完整评分。Sequence Work into Verifiable Units 使 guard、宿主集成、故障矩阵和包交付分别验证。对应 leaf 本会话已读取。how、control-cli、technical-writing、unslop、deslop 和 no-comments 直接应用，按用户指令不执行其委派部分。

Attention。实现者为 Astra high。尚无独立审查，也没有跨模型 trail review。根应先 fresh review 完整代码和证据，再决定新预算授权。真实输出 cap 接受性、凭据可用性、模型质量、服务可靠性以及更广 P6 和用户 visual gate 均 pending。
