# P6 执行器隔离独立复审：技术 PASS

R1、R2 在本次约定范围内已关闭；未发现新的阻塞回归。此结论仅适用于现有 P6 执行器的隔离技术复审，不放行真实服务，不将 P6 整体置为 complete。

本次真实 provider 请求、真实 auth/history 读取和有效 real grant 均为零。全部执行使用 synthetic-only offline fixture，未移除 cap、退款或扩大预算。

## 精确绑定与方法

- 审查 HEAD：`0e26b8552d3e0c20fd0da84851e4e2f60447aba3`，初始工作树干净。
- 修复实现：`44b9f33f89aef3cfa710172861d64b31e02b01d6`。
- 产品 src：与 `713acbf87bfa87b3d6eb208fb55bdb3b6651fd49` 无差异。
- 安装包：[pi-compact-0.1.0.tgz](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-fixes/release/pi-compact-0.1.0.tgz)，SHA256 `209888cd3f050ffe6d3a8932c15d25636d52d83919de0021cf9ce2c611d22c8d`，26 个成员。
- 实际安装宿主 Pi 1.5.2，Node v22.22.2；实际宿主代码路径来自已安装 `pi` shim，没有用开发依赖替代宿主。
- 独立工作目录：`/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d`。本次所有探针、复制的测试和新证据均在 `artifacts/P6-isolation-independent`。

已读取用户提供的 AGENTS、祖先目录适用规则、pstack 模型配置，以及 Prove It Works / Explain the Number 原则；未找到额外仓库 AGENTS。由独立审查者自行完成，没有委派。已阅读上一轮完整独立报告、原 auth/directory 反例、当前修复 diff、执行器、SDK 凭据包装层、包内文档与协调者证据。

运行前判据写入独立脚本：危险凭据不得执行命令；初始化拒绝时零预约；恢复拒绝时保留五条既有预约；目录外 sentinel 字节与成员不变；同 grant 重用不能重置账本；正常链路必须经过实际安装宿主并保留原生、远端、第二 worker 恢复及迁移。计数是确定性场景及断言数量，不是性能或真实质量测量。

## R1：凭据解析与子进程

独立探针在原执行器写入合成 auth 时注入反例，保持生产 `execute/runWorker`、安装路径与 SDK 不变。命令负载只写本次目录中的 sentinel，不访问网络。worker 额外预装 socket/DNS/UDP 拒绝器，在原生 socket/DNS 调用前拒绝；所有凭据反例的外层拒绝计数为零。实际安装仍使用现有 fixture 网络屏障。

| 独立反例 | 实际结果 | 预约数 |
| --- | --- | --- |
| 非目标 `openai` 命令凭据 | 初始及恢复 worker 均未执行；完整链路通过 | 9 |
| 非目标命令加非目标过期 OAuth | 不解析非目标凭据，完整链路通过 | 9 |
| 目标 DeepSeek 命令 key | `AUTH_FORMAT_DENIED`，sentinel 不存在 | 0 |
| 带前置空白的目标命令 key | `AUTH_FORMAT_DENIED` | 0 |
| 初始 Codex OAuth 过期 | `AUTH_EXPIRED`，没有刷新 | 0 |
| 目标凭据缺失 | `AUTH_FORMAT_DENIED` | 0 |
| 仅第二 worker 的 Codex OAuth 过期 | `AUTH_EXPIRED`，不继续请求，保留先前账本 | 5 |
| 安装完成后调用 child_process | 两个 worker 的七个导出及预先缓存的 `spawn` 全部 `SUBPROCESS_DENIED`，共 16 次拒绝；正常任务继续完成 | 9 |

证据：[逐项结果](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/integration/results.json)、[运行日志](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/integration.log)、[两个 worker 的子进程入口观察](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/integration/subprocess/independent-events.jsonl)、[集成探针](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/probes/independent-integration.mjs)、[注入与外层拒绝器](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/probes/independent-worker-preload.mjs)。

另外直接对实际已安装 SDK 调用 `ModelRuntime.create({credentials, authPath: 不存在的路径, modelsPath:null, allowModelNetwork:false, refreshOnCreate:true})`，以真实 `restrictedCredentials` 为存储，仅包装观察其调用。结果证明 `options.credentials` 真实生效，而非只存在于源码参数中：

- `listCredentials()` 仅返回 Codex、DeepSeek；SDK 虽会查询其他 provider ID，但这些 `read` 返回 undefined，没有暴露它们的配置。非目标 OpenAI 状态为未配置。
- 两个授权 provider 的实际 `getAuth` 正常返回；不存在的备用 authPath 未被读取，也没有执行非目标命令。
- 修改一次 `read` 返回的克隆对象不会修改存储；经 SDK `RuntimeCredentials.modify/delete` 调用均得到 `AUTH_MUTATION_DENIED`，modify 回调未执行，auth 文件 SHA 不变。
- 将时钟推进至合成 OAuth 过期后，再经 SDK `getAuth('openai-codex')` 得到 `AUTH_EXPIRED`，网络拒绝计数仍为零，说明在进入刷新请求前已停止。

证据：[SDK 行为与调用明细](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/sdk/result.json)、[SDK 探针](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/probes/independent-sdk.mjs)。源码对应 [restrictedCredentials](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/scripts/live/guard.mjs:35)、[实际注入点](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/scripts/live/executor.mjs:126)、[子进程拒绝](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/scripts/live/network.mjs:37)。

R1 结论：原来的“非目标凭据执行未经预约子进程”路径已关闭；目标命令、正常过期刷新及持久凭据 mutation 均被限制。该结论针对执行器真实使用的 SDK 链路，不声称任意恶意代码都无法改写 JavaScript 运行时。

## R2：预存路径、恢复与目录复用

下表每个列出的路径均实际单独运行；不是根据递归检查源码推断覆盖。

| 独立反例 | 复现方式及实际结果 |
| --- | --- |
| 预存目录/文件 symlink（9 项） | 分别在 `raw`、`raw/agent`、`raw/home`、`raw/native/sessions`、`raw/remote/sessions`、`raw/tmp`、`raw/grant.json.next`、`ledger.json.next` 放置指向独立 synthetic outside 目录或 sentinel 的链接，另测 `raw/dangling`。全部在产生 ledger/processes 前拒绝，零预约；outside 成员和 sentinel 字节不变。 |
| 硬链接 | `raw/data` 与 outside sentinel 为同一 inode；初始检查拒绝，零预约，outside 字节不变。 |
| 非私有文件/目录权限（2 项） | 分别设文件 0644、目录 0755；均 `EVIDENCE_PERMISSIONS_DENIED`，零预约。 |
| 特殊文件 | `raw/pipe` 为真实 FIFO；立即拒绝，零预约，没有阻塞读取。 |
| 父进程恢复检查（2 项） | 初始 worker 退出后、父进程继续前，将 `raw` 替换为 symlink，或将 `raw/home` 改为 0755；父进程拒绝启动下一阶段。原 ledger 逐字节不变，仍为 5 条。 |
| worker 恢复检查（6 项） | 在父进程检查后、第二 worker 启动前，分别对 `raw/agent`、`raw/home`、`raw/remote/sessions`、`raw/tmp`、`ledger.json.next` 注入 symlink，或给 `raw/agent/auth.json` 增加硬链接。第二 worker 拒绝，父进程返回 `WORKER_EXIT`，没有把旧 `restart-required` 结果当成功。六项均保持原 ledger 字节和 5 条预约，outside 无新增写入。 |
| 同目录同 grant 正常重用 | 首次完成 9 条；再次执行最多增加 3 条，总数 12，随后失败停止。前 9 条逐对象相同、grantHash 相同，没有重置、退款或扩额。 |
| 已存在的普通临时文件 | 预建 `state.next`；`durableWrite` 得到 `EEXIST`，原字节保留，不覆盖临时路径。 |

证据：[31 项独立集成结果](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/integration/results.json)、[集成日志](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/integration.log)。31 项分母为：8 项凭据/子进程 + 9 项预存 symlink + 4 项硬链接/权限/FIFO + 8 项恢复 + 1 项同 grant 重用 + 1 项排他临时文件。SDK 直接探针单独记录，不重复计入。

恢复注入发生在明确的 worker 生命周期边界，用于验证恢复检查；不以同用户恶意并发替换路径的竞态作为本次威胁模型。UID 检查分支经过源码核对，未通过改变文件属主动态实测。正常解包后的文件全部经过私有权限检查；37 份本次运行的 `installedManifest` 与已审包的 26 成员哈希一致，见 [安装内容核验](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/installed-manifests.json)。

R2 结论：原来的预存 `raw -> outside` 逃逸已关闭；受测子树、临时文件、硬链接、权限和恢复阶段同样拒绝，且账本不重置。源码对应 [privateTree](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/scripts/live/guard.mjs:11)、[排他落盘](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/scripts/live/guard.mjs:88)、[父进程边界](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/scripts/live/executor.mjs:10)、[worker 读取 grant 前检查](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/scripts/live/worker.mjs:6)。

## 受影响回归与交付物

- **原 20 项故障矩阵：20/20。** 使用明确的新 TGZ 参数。正常路径 9 预约，隐式重试 12，retry-cap/concurrent/budget 等保留原约束；持久化失败、刷新、abort、endpoint/model/cap、stream 与 crash 均按原断言通过。证据：[faults.log](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/faults.log)。这是原矩阵复跑，不计作独立设计的反例。
- **原生、远端、恢复与迁移：通过。** 完整普通安装与资源发现仍生效，初始 worker 在 5 条后退出，第二 worker 从磁盘恢复，最终 9 条，四类 fixture 评分通过。证据：[非目标凭据反例中的完整结果](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/integration/unused/result.json)、[账本](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/integration/unused/ledger.json)。这证明数据/控制路径，不是模型记忆质量。
- **单元与包合同：62 TS + 12 MJS = 74 项通过。** 复制到 independent 文件，只调整 import 和新证据目录，原 tests 不变。证据：[TS](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/tests-ts.log)、[MJS](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/tests-mjs.log)、[复制说明](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/copies.json)。第一次 MJS 复跑有一项因我迁移了 preflight 的虚拟 evidence 参数而先触发目录错误；修正独立副本，使该无副作用参数保留原 CLI 允许位置后，12/12 通过。初次失败保留在 [tests-mjs-initial.log](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/tests-mjs-initial.log)，不是产品缺陷；该路径没有实际写入。
- **静态检查：通过。** [pnpm lint](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/lint.log)、[pnpm typecheck](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/typecheck.log)。依赖通过 frozen-lockfile、offline 安装，见 [依赖日志](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/dependencies.log)。
- **包/文档/既有证据：通过。** 26 成员逐字节及 SHA 核验，src/docs 与 HEAD 相同，package.json 按 pnpm 去除 packageManager 后一致；独立重打包 SHA 完全相同。协调者 public-manifest 的 142 个文件重新核验通过。证据：[package-check](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/package-check.json)、[包核验脚本](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/probes/independent-package.mjs)。

普通安装完整十场景、TUI/视觉和性能没有机械重跑；产品 src 未变，既有完整本地验证仍是历史证据。本次不新增延迟、速度优势、真实 summary 质量或服务可靠性主张。Terra/Luna 比较工作及 `P6-comparison-design` 不在审查范围，未将设计当真实结果。

## 清理、限制与交接

100 个登记 PID 均已退出，按这些 PID 检查的网络描述符为零，任务证据树中的 socket 为零。同步包管理、tar、测试和 SDK helper 已等待结束；没有启动服务或长期 listener，没有停止他人进程。恢复反例的 symlink/FIFO、硬链接及故意崩溃的死 owner.lock 保留为证据，审计使用 lstat/Dirent 不跟随链接。见 [cleanup.json](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/cleanup.json)。

产品、既有 scripts/tests/docs 和旧证据均未修改；最终 tracked diff 为空。没有 commit、push、PR、merge 或发布。新文件均在本次 independent 目录；合成 auth/session/opaque 原始内容留在私有目录，不进入公开证据清单。可检查 [independent-manifest.json](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/independent-manifest.json) 与 [清理/清单脚本](/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/probes/independent-audit.mjs)。

本次仅在 fixture 下检验隔离技术。真实 Codex cap 接受性、服务端 reasoning/output 计量、真实质量、SSE 可靠性、真实长会话迁移和用户视觉 gate 仍待验证。目录检查是预存路径和恢复防护，不是防同 OS 用户恶意并发替换路径的操作系统沙箱。真实服务仍需另行明确授权并绑定最终方案与包；本报告不生成授权。

复跑入口见 `probes/independent-integration.mjs`、`independent-sdk.mjs`、`independent-faults.mjs`、`independent-package.mjs`。集成与 SDK 探针对已存在输出目录主动拒绝；应在新的独立目录/checkout 中重定向 evidence 路径再运行，不能覆盖本次结果。故障 runner 的独立 CLI 副本仅调整 import 与允许的 evidence 前缀，生产执行器保持原文件。

报告绝对路径：`/Users/wangxuyang/.t3/worktrees/compact/t3-44f60cc7-a4379b593028145d/artifacts/P6-isolation-independent/REPORT.md`。
