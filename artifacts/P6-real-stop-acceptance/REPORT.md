# P6 停止修复与真实报告独立验收

用户目标是完成普通 pi-compact 开发，以业务证据交付，并如实比较 Codex 远端与 Pi 原生压缩。本次独立验收针对首次异常后的停止条件、持久恢复以及真实报告的证据边界。

**PASS。仅放行本地停止修复和报告技术表述，不代表 P6 真实验收通过，不授权任何真实请求。未发现需要修改候选的阻塞问题。**

候选 HEAD 为 `27d84826414b5a6f7d994ee31db2d457d25ab97e`。基线为 `f5123d566d815b1f9e9e881ab913c8fedb18555b`。原真实运行所用、曾独立审查的 runner HEAD 为 `22217359fb879a581a2c5f787d67786af0dd36b9`。审查角色为 Astra high，已读取指定模型映射、poteto-mode、Prove It Works 和 Fix Root Causes 叶子。独立执行，没有子代理。

## 完成情况

最小运行时 diff 是 `scripts/comparison/budget.mjs` 和 `worker.mjs` 各一处判断，统一接受 `r.auditFailure || r.state === 'failed'` 为全局停止依据。另有停止验证脚本和旧验证脚本 13 个无用导入清理。正常已完成行不满足停止条件。

原缺陷位于停止决策。传输层已正确将非 SSE 写为 `failed`，但账本只识别固定审计码，worker 只识别 `auditFailure`，因而遗漏合法失败状态。两处修正覆盖发送边界及剩余 lane 调度，且不删除失败或返还预算。Prove It Works 使本审查实际运行安装包与宿主；Fix Root Causes 使审查追踪账本失败状态，而非仅检查新增错误码。

`audit.json` 证明产品 `src` 与 `package.json` 相对提供的两个基线以及产品基点 `713acbf87bfa87b3d6eb208fb55bdb3b6651fd49` 均无差异。安装包相对两个验收基线未变，实算 SHA-256 为 `209888cd3f050ffe6d3a8932c15d25636d52d83919de0021cf9ce2c611d22c8d`。

本次只新增本目录文件，没有修改产品、scripts、tests、旧证据或冻结文件，没有 commit、push、PR、merge 或发布。

## Prove It Works

全部新增运行使用离线 fixture，没有真实 provider 请求，没有真实 auth/history 读取。

- `transport/results.json` 保存 14 类场景的前后共 28 条观测。非 SSE、缺 Content-Type、损坏 SSE、发送抛错、读取抛错、取消流均复现旧停止判断允许第二次 send。当前候选在全部 13 类异常后只发送一次，关闭并重开账本后继续拒绝；正常场景发送两次。其他异常覆盖空 body、缺 terminal、HTTP 400/429、incomplete、usage 不一致和输出超 cap。
- “before”通过探针子类恢复原 `ComparisonLedger.check` 判断，复用当前未变的共享传输层；不是旧完整 runner 或旧实际宿主的重跑。当前 “after”直接调用候选代码。
- `crash/result.json` 验证独立子进程在 NON_SSE_RESPONSE 持久化后以 23 退出，故意不关闭账本。新进程回收死亡 owner lock，恢复同一离线账本，失败行和预约不变，额外 send 为 0。该退出是测试设计，不是产品故障。
- `host-results.json` 保存实际安装包、Pi 1.5.2、ModelRuntime/SDK、worker 和真实请求编码路径的结果。非 SSE、损坏 SSE、HTTP 400、缺 usage 四组各 1 次 fixture dispatch，剩余三个 pilot lane 全部 `ineligible/GLOBAL_AUDIT_STOP`。正常组四个 pilot lane 全部通过，共 8 次 fixture dispatch，包含两模型、两臂的压缩与续接。
- 五组宿主均执行 `--resume`，没有新增 dispatch，没有退款或补抽。宿主总计 12 次模拟 dispatch；该数字不是模型质量样本数。
- 候选原有七组停止脚本和三组比较修复回归在本目录新输出中通过，分别见 `existing-stop/results.json` 和 `existing-fixes/probe-results.json`。

所有上述行为测试绑定候选 HEAD。历史 195/248 次矩阵、全产品单测、视觉和性能结果未作为本轮重跑证据。本次没有重跑 lint/typecheck；根报告的通过状态来自其 `artifacts/P6-stop-fix/validation.json`，不能冒称本审查执行。前次独立报告明确绑定旧 runner，本审查补足的是停止修复覆盖范围。

## 真实 Data 与报告真实性

只读访问了获准根目录下的 `ledger.json`、`result.json`、`cleanup.json` 三个文件。三个 SHA-256 全部匹配公开 `raw-evidence-hashes.json`，没有读取该目录 raw/config、grant、真实凭据或历史，也没有复制原始三文件。

公开 `requests.json` 每个字段逐项对应真实 ledger；公开 lane 摘要逐项对应真实 result；公开 cleanup 与原 cleanup 完全一致。真实记录为 Terra 两次 compact dispatch，先 NON_SSE_RESPONSE，后 HTTP 400/HTTP_REJECTED，两次均失败。首行没有 auditFailure，直接支持报告所述停止偏差。其余 42 个 lane 均未执行，其中含 Luna 两个 pilot 和 40 个正式比较 lane。Sol/DeepSeek 功能验收未执行沿用本任务提供的根事实，不从比较账本推导其他执行器的活动记录。

两次请求 cap 均为 1000、reasoning none、stream true。输入预约为 30210 + 33527 = 63737，逐项等于解码请求体字节数除以 4 后向上取整；输出预约为 2000。它们不是服务端实际 token 或费用。260 上限减去已用 2 次为 258，报告明确剩余额度不再执行。

续接和有效质量对均为 0，实际用量、费用和质量差值未知。第一响应正文和精确状态、第二响应错误正文未保留，不能据此定位服务拒绝原因。报告没有把模拟质量计作真实质量，没有把协议失败推出远端无效，也没有声称远端占优。“没有优势证据”与“远端无优势”的区分准确。

三部分报告保留了真实未通过、首次停止偏差、历史测试范围及独立审查待完成的状态。候选中的“fresh 独立核验待完成”是提交时事实；本文件提供该核验结果，未回写旧报告。

## 冻结、隐私与清理

三个 profile 的 `verifyFrozen` 均实测拒绝 `EXECUTION_FREEZE_MISMATCH`，绑定差异仅为 runner。冻结文件仍为 SHA-256 `5354ad1dcb046321413c6bb0c76b6c0c76d21f0ace741c2eb5eae0019b3adf41`。从 `launchReal` 调用顺序确认冻结验证位于安装和 worker 启动之前。没有读取或执行老 grant；这里证明的是老冻结绑定在当前代码被拒绝，不是对真实 grant 的重新授权。未重新 freeze、生成有效 real grant、扩大 cap 或重置真实预算。

候选相对基线的 17 个受版本控制文件已作路径、JSON 授权状态和敏感字段检查，没有新增私密 raw、有效 real grant、凭据或 opaque 正文；`artifacts/P6-real/` 没有受版本控制文件。该结论限定于本地候选内容，没有查询或证明远端仓库全部历史的发布状态。

网络边界叠加独立预加载拒绝器及现有 fixture/networkBoundary。独立边界日志没有网络调用或身份读取拒绝事件；未启动监听服务。`cleanup.json` 记录 41 个可登记 PID 全部退出，相关网络/Unix socket 描述符为 0，目录 socket 为 0。早期同步 shell/discovery 等辅助命令已等待退出，但并未逐一插桩登记 PID。没有终止他人进程。所有最终目录为 0700、文件为 0600，源码及旧证据无工作区修改。

## 证据入口与复跑

本目录位于 `/Users/wangxuyang/.t3/worktrees/compact/t3-56eef483-c353b1d5c8a8fc7d/artifacts/P6-real-stop-independent`。

- `audit.json` 绑定 HEAD、包、旧 freeze、真实三文件哈希和公开摘要。
- `transport-probes.mjs`、`crash-recovery.mjs`、`run-host.mjs` 为可复跑探针。`outer-deny.mjs` 提供外层网络/身份边界，`inject.mjs` 提供实际宿主故障注入。
- `manifest.json` 为本目录文件哈希清单，排除自身。宿主 raw 子目录全是模拟数据，未包含真实 raw。
- `cleanup.mjs` 检查已登记进程及 socket，并生成 cleanup 与 manifest。

从 checkout 根目录执行以下命令，输出目录必须尚不存在。宿主脚本新增的输出目录参数仅用于安全复跑，本次实际结果位于默认根目录。保持离线命令与预加载器，不运行 real 或 freeze。

```sh
node --import=./artifacts/P6-real-stop-independent/outer-deny.mjs artifacts/P6-real-stop-independent/transport-probes.mjs artifacts/P6-real-stop-independent/replay-transport-01
node --import=./artifacts/P6-real-stop-independent/outer-deny.mjs artifacts/P6-real-stop-independent/crash-recovery.mjs artifacts/P6-real-stop-independent/replay-crash-01
node artifacts/P6-real-stop-independent/run-host.mjs artifacts/P6-real-stop-independent/replay-host-01
```

本 PASS 不证明真实响应兼容性、真实压缩质量或成本优势，不代表 P6 complete。全部真实工作继续停止。
