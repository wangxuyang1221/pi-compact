本轮修复 P1 的会话作用范围，让未启用插件的 SDK 会话和已绑定 owner 的公开读取恢复 Pi 原生行为，同时保留已有失败、生命周期和写入竞争屏障。

产品与回归代码提交：`6e9ceca779b3e6e6130095babdd203556b1eaf52`。基线：`6c96971274da7aab2e2fa838485de30e18acaa0f`。分支：`fix/p1-session-scope`。协调者直接处理这两项小修复，无其他实现者同时修改此分支。

`Registry.files` 仅保存实际受管理会话的所有权。全局 append/rewrite 包装对未登记 manager 只检查已有锁冲突，不取得锁；内存 manager 保持原生行为。删除 `buildSessionContext` 包装，第二个受管理 owner 仍在 `_buildRuntime` 接入时被拒绝。只读调用不再充当隐式 bootstrap 标记。

嵌入式 SDK 调用者仍须每个会话使用独立 manager 和文件。Pi 的 bootstrap 元数据写入可能早于 runtime attach；本修复不承诺阻止任意复用 manager 的预接入元数据写入，也不修改 launcher。已有带历史的共享 manager 回归仍逐字节不变，普通双进程竞争回归也保持逐字节不变。此范围在 docs/p1-adapter.md 中说明。

验证使用安装的 Pi 1.5.2 shim、普通扩展 loader 和真实 SDK。新探针来自上一轮独立审查，已纳入 scripts/regressions；只注入合成 ModelRuntime fetch，不替换持久化、会话创建、dispose 或压缩流程。未读取真实用户历史或调用真实模型。

| 检查 | 结果 |
| --- | --- |
| 修改产品前执行新 scope runner | baseline 两组通过，head 两组失败，退出 1 |
| 修改产品后执行新 scope runner | baseline/head 四组全部通过，退出 0 |
| pnpm verify:p1-fixes | dispose、disabled、retry、ownership、shared 五组通过 |
| pnpm lint | 通过 |
| pnpm typecheck | 通过 |
| pnpm test | 19 项通过 |
| git diff --check | 通过 |
| pnpm pack | 成功生成开发包，11 个预期文件 |

新 runner 最后一次运行增加实际请求计数断言并整理 SDK 探针格式：无关会话每侧恰好 2 次正常请求，managed read 每侧恰好 1 次正常请求；head 的 managed SDK 为 idle，context/projection 消息数一致且读取不改文件。此调整后已再次执行 lint 和 scope runner。产品代码未再修改。五组旧回归与 19 项测试无需因此重复。

证据位置均相对于仓库：

- 失败前对照：`artifacts/P1-scope/runs/1794809434901/result.json`。
- 修复后首次运行：`artifacts/P1-scope/runs/1794809470103/result.json`。
- 最终 scope 运行：`artifacts/P1-scope/runs/1794809570075/result.json`。
- 原五组回归：`artifacts/P1-fixes/runs/1794809471685/result.json`。
- 每个 run 的子目录保留 stdout、stderr、实际请求事件和来源哈希。
- 清理检查：`artifacts/P1-scope/cleanup.json`。20 个记录的 Pi PID 均已退出，lsof 无监听；两个 TUI lane 的 cleanup 均无存活进程和 socket。
- 当前开发包：`artifacts/P1-scope/package/pi-compact-0.1.0.tgz`。本轮完成打包，尚未重跑解包加载；交由独立复验验证。

未重复全部十 lane 或性能计时，没有声称本轮提升性能。本轮新增全局检查只读取既有锁；精确改动需要独立核验是否保持 R2 和目标会话隔离。原审查报告：`/Users/wangxuyang/.t3/worktrees/compact/t3-51c65a42-60ae8ebe1fe981ab/artifacts/P1-recheck/REPORT.md`。

自检 PASS，P1 放行等待新 HEAD 的独立复验。Prove It Works 原则要求先在旧代码上复现，再用相同真实 SDK 行为验证修复。尚未 push、创建 PR、合并或发布。
