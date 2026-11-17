# P6 执行器隔离修复候选

结论：协调者本地验证 PASS，等待 fresh 独立复审。完整 P6、真实服务和用户视觉仍未通过。本轮没有真实请求、真实 auth/history 读取或有效 real grant。

实现提交：44b9f33f89aef3cfa710172861d64b31e02b01d6。产品 src 仍对应 713acbf87bfa87b3d6eb208fb55bdb3b6651fd49，没有修改。新包因验收文档更新重打，26 成员逐文件核验，SHA256 209888cd3f050ffe6d3a8932c15d25636d52d83919de0021cf9ce2c611d22c8d。包见 release/pi-compact-0.1.0.tgz，manifest 同目录。旧包与旧证据保留。

## 缺陷与修复

R1 已先复现：原执行器正常完成 9 个预约，却在两个 worker 中各执行一次非目标 provider 的凭据命令。独立外层 socket 拒绝器阻止实际网络。本轮保留该原始失败的公共观察。修复后授权凭据作为原始 JSON 读取，只暴露授权目标的字面值，目标命令型 key、缺失/过期 OAuth 在 SDK 解析前拒绝；读写凭据接口拒绝 refresh/mutation。安装完成后禁用 child_process 导出和 ChildProcess.spawn，覆盖缓存 spawn。无关 provider 命令不会解析；恢复 worker 使用相同边界。真实凭据仅在未来有效授权下读取，绝不落入隔离 agent。

R2 已先复现：raw 符号链接导致 grant 外的合成目录被写入，且发生 1 个预约。修复在首次写入和每个 worker 读取 grant 前递归检查证据树，拒绝符号链接、硬链接文件、特殊文件、非本用户和非私有权限。解包文件独立核查并收紧权限。durableWrite 以 O_EXCL/O_NOFOLLOW 排他创建临时文件，保留已存在的临时路径，不截断。恢复期变更 raw/agent 为符号链接会在第二 worker 停止，旧账本 5 条预约不重置。父进程不再把旧 restart-required 结果返回为最终完成状态。

这些是预存路径和恢复检查，不是防御同一 OS 用户恶意并发替换路径的操作系统沙箱。文档明确这个范围。

## 验证

- 14 项隔离回归：无关/目标命令凭据、过期 OAuth、恢复 worker 路径变更、raw/agent/home/native-sessions/tmp 与临时文件 symlink、排他临时文件、目录权限、subprocess 导出及缓存 spawn。原生→远端→重启恢复→跨模型流程保持 9 次预约、四类 fixture 评分通过。
- 原 20 场景真实安装宿主故障矩阵全部通过：retry/concurrent/budget/fallback-slices/persist/abort/endpoint/model/cap/redaction/refresh/stream/crash。保留故障和未发送预约，不退款、不增额。
- lint、typecheck、62 TS + 12 MJS 测试通过。测试、静态日志位于本目录。最终 14 项复跑日志 isolation-final.log；故障矩阵 faults.log。最初 13 项回归及之后增加的恢复攻击记录均保留。
- 产品代码没有改动；完整普通安装十场景、范围/生命周期回归和性能沿用前次独立审查。此次没有测真实质量或新的速度优势，不将旧性能计为新测量。
- 88 个登记 PID 全部退出；listener/socket 均为零，见 cleanup.json。包含复现时的凭据子进程。公开结果逐文件 hash 见 public-manifest.json，合成 raw 与 auth 不加入公开归档。

复跑：

```sh
node scripts/verify-p6-isolation.mjs artifacts/P6-isolation-fixes/release/pi-compact-0.1.0.tgz
node scripts/verify-live-executor.mjs artifacts/P6-isolation-fixes/release/pi-compact-0.1.0.tgz
pnpm lint
pnpm typecheck
pnpm test
```

下一步：fresh reviewer 对精确交付 HEAD 做 R1/R2 定向复审，包括凭据/provider 范围、实际安装后的 subprocess 拒绝、恢复和临时文件边界。真实服务执行保持关闭。用户新增要求的 Terra/Luna 同模型质量比较为另一个待实现、待审查、待明确预算的流程；artifacts/P6-comparison-design 只有冻结候选设计，不是 benchmark 结果。
