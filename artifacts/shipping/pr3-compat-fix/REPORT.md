# PR3 正式 SDK 兼容修复候选

目标是关闭 PR3 独立 shipping 审查的默认工具声明与空 terminal output 两项缺陷。产品提交 `04576b2c1ca0c6a8c6b1db0ddf7c785098fcde68`，基线为 `b3a4d6e7ba2f5569730fbc199b361d785d19e9e1`。当前仅本地候选，等待 fresh review，未 push 或 merge。

采用已验证最小产品候选的 PR3 核心拆分 patch。`validateRequestWire` 允许 SDK developer/function 工具声明；`validateWire` 对输出与持久 checkpoint 的严格边界保留。只有显式完成的空数组终态可以从连续完整 done 项恢复，缺失、null、冲突、未完成 advertised 项、无效 usage 仍拒绝。PR3 不包含 migration.ts，不混入 PR4 的代码。产品文档同步解释输入/输出区别及空终态要求。

根直接审查 diff，lint、typecheck、92 项单测通过。正式 Pi P3 runner 25 个场景与 P3 fixes 7 个场景通过，覆盖 remote/replay、native 回退、取消与失败阻断、局部写入/fsync/kill 恢复、小窗口等。`verification.json` 保存逐场景目录和 PID 清理核验，`manifest.json` 绑定新生成证据。所有请求均为隔离合成 fixture，不读取真实 auth/history，不恢复 benchmark。

完整默认工具用户路径和空终态反例须由 fresh reviewer 在本层精确代码上重跑。来源候选的全产品 loader 验证不能代替本层放行。原 FAIL 与 parent 对照保留在 `/Users/wangxuyang/.t3/worktrees/compact/t3-5d266a1e-2131b7da94485b5a/artifacts/shipping/pr3/REPORT.md`。产品候选来源与 SDK 实包探针位于 `/Users/wangxuyang/.t3/worktrees/compact/t3-f6fa5e52-d36c19a394bd7875/artifacts/shipping/product-fixes/`。

复跑使用 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p3.mjs` 及同前缀的 `scripts/verify-p3-fixes.mjs`。这些 runtime runner 自动建立新时间戳目录。日志保存在本目录。

Prove It Works 使检查覆盖实际 Pi 及落盘产物。Sequence Work into Verifiable Units 使修复停留在 PR3 自身边界。新增产品注释、抑制和依赖均为零。PR1 锁修复另行验收、按底层合并后继承，本候选不宣称父栈已放行。
