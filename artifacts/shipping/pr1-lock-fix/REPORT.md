# PR1 锁恢复修复候选

目标是修复两个 Pi 进程并发恢复死 PID 锁时的双写问题，使 PR1 可以重新接受 shipping 验收。Owner 检查通过，等待 fresh 独立复验，尚未 push 或 merge。

产品提交为 `78ee8e49483e28531e010a615268336cde1a15ee`，基线为 `82c33d45ba7b351c9cefbfa2390d651953c80f31`。产品仅修改 `src/pi-adapter/journal.ts`，另增加三项所有权行为测试及恢复文档。数据结构与方案取舍见 [DESIGN.md](DESIGN.md)。

所有 claim 通过 `open('wx')` 取得短期 `.lock.claim`，将旧 owner 检查、死锁删除及新锁创建串行化。存量活锁的 PID 与 nonce 结构不变，正常 dispose 仍释放自身锁。进程在接管临界区内死亡时，残留 claim 阻断后续启动，避免对 claim 再进行有同样竞争窗口的自动回收。文档要求先停止全部写入者，再移除具体 claim。升级时也应先停旧版本 Pi 进程；旧协议不保证与新协议并发互操作。

## Prove It Works

- 先在旧代码运行独立报告提供的原双进程调度反例。两个真实 Pi owner 均产生正常请求并持久化输入，原 FAIL 保存在 `red.log` 与 `stale-lock-race/`。
- 新 `verify-race.mjs` 仍只暂停真实 unlink，不伪造锁操作。在首个进程接管暂停时，第二个真实 Pi CLI 被拒绝，session、旧锁及 claim 哈希均不变。接管完成后另一个 contender 同样被拒绝。唯一 owner 请求成功，正常退出释放锁，重启请求成功。见 `green.log` 和 `green/`。
- `verify-interruption.mjs` 在真实 Pi 取得 claim、尚未 unlink 时发送 SIGKILL。后续真实 Pi 启动被拒绝且三个文件字节保持。确认被杀 PID 已退出后移除 claim，再启动成功。见 `interruption.log` 和 `interruption/`。
- lint、typecheck、22 项单测通过。原五组 P1 fixes、scope 回归和全部十个 CLI/TUI lane 通过。日志分别为 `lint.log`、`typecheck.log`、`test.log`、`fixes.log`、`scope.log`、`live.log`。

首次十 lane 运行使用默认输出，覆盖了本隔离工作树的旧 P1 产物副本。新产物随后完整复制到 `live-run/`，全部受跟踪旧 P1 文件已从基线还原；根 benchmark 工作树与原审查证据从未修改。后续复跑应指定 `--output artifacts/shipping/pr1-lock-fix/live-rerun-<unique>`。

## 复跑

在本工作树执行 `node artifacts/shipping/pr1-lock-fix/verify-race.mjs` 和 `node artifacts/shipping/pr1-lock-fix/verify-interruption.mjs`，每次建立独立时间戳目录。`stale-lock-race.mjs` 是原缺陷复现脚本，仅用于旧基线，旧代码退出 0 表示复现 FAIL，不能作为修复后 PASS 脚本。

执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm verify:p1-fixes`、`pnpm verify:p1-scope`，以及带独立 `--output` 的 `pnpm verify:live --pr P1`。所有真实宿主验证均使用隔离合成 provider，不读取真实 auth/history，不恢复 benchmark。

## 证据边界与清理

`evidence-manifest.json` 绑定 2124 个实际产物；`cleanup.json` 核对 63 个已登记 PID 全部退出，21 份 cleanup 收据及当前 socket/监听均为空。短命包管理器和测试子进程已观察命令退出；该 PID 数不是所有派生进程的穷举。Redis/MySQL 未操作。

Fix Root Causes 将修复放在所有 claim 共用的临界区。Prove It Works 要求真实 Pi 的请求和落盘行为。新增产品注释与正确性抑制均为零，deslop 自审未引入额外依赖或控制器状态。独立审查仍需判断遗留 claim 的恢复边界及其它并发顺序。
