# P6 executor work

目标是为新授权后的真实验收提供完整执行器。本轮只运行离线合成响应。

1. how over the affected subsystem. 实际 host 与产品路径已读取。
2. architect for parallel design exploration. skip。用户禁止嵌套代理与面板。按实际 host 选单执行器加最后发送 guard。
3. Write the throughput checkpoint as four todo items.
   - Blocking first steps. 先核对基线、host encoder、授权与重试，再写 guard。
   - Independent workstreams. n/a。一个 worker，grant 与执行器必须共用不变量。
   - Shared mutable state. 一个 grant 对应一个目录、一个排他 owner、一个持久 ledger。场景串行。
   - Smallest safe decomposition. 先 guard 故障测试，再 SDK 普通安装场景，再包与交付。
4. Delegate code-writing to a subagent. skip。当前就是实现子代理，用户禁止继续委派。
5. Verify on the matching surface. 真实 installed SDK encoder 与 Session.compact/prompt，只有最终网络响应为 fixture。
6. Rebase into small, ordered commits. 精确基线不改，本地有序提交。
7. If the design is contested, interrogate before shipping. skip。根负责随后 fresh review。
8. Run Opening a PR. skip。用户禁止 PR。

## 调查检查点

Grant 包含模式、期限、预算、精确目标、任务与安装包 SHA、证据目录、真实授权路径。Fixture grant 只对 offline 模式有效。Reservation 在 send 前同步持久化。ScenarioResult 只公开结构化字段与评分。默认 dry-run 不导入 SDK。

SDK 方案可以在同一进程中串行运行 native、安装产品与磁盘恢复，并共用一个 ledger。CLI 多进程方案需要额外预算 broker 和 socket，本任务不采用。实际发送使用独占 HTTPS transport，无 retry/redirect，所有其他出网入口拒绝。离线保持现有 preload 的 socket 拒绝。

## 实现检查点

SDK 场景使用一个共享 ledger。调查时的同进程恢复已增强为顺序两个 worker。第 5 次预约后先完全退出，再由新进程恢复磁盘会话与 ledger。无需预算 broker、listener 或 socket。输出限制放在 Pi payload hook 之后，预约放在编码后的 fetch 之前。

## 验证检查点

先完成持久 guard 单测，再完成实际安装包九次请求和评分。随后跑 20 项真实 encoder 故障矩阵。故意打开宿主重试仍受共享 12 次 cap 限制。并发和多切片均实际到最终 guard，未绕过预算实现。源代码不改，文档改变导致新包，包的 26 个成员逐文件验证。

## 交付检查点

代码冻结于 92aab061d6c254fc385111edacef94f0ad16292c。lint、typecheck、62 项 TS 测试和 12 项预算测试通过。公开证据归档排除 raw。私有 raw 归档为 0600，留在本 worktree，不提交或发布。根随后 fresh review，真实新授权与服务质量继续 pending。
