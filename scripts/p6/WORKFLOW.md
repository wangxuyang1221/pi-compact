# P6 local workflow

目标是给用户交付可以普通安装和审阅的扩展。本轮只使用合成数据和拒绝外网的运行环境。P6 整体仍等待独立审查、真实 provider 新授权及用户视觉 gate。

1. 核对精确 P5 acceptance，读取宿主安装和资源解析实现。已确认本地 tgz 必须先解包，再用 pi install 登记目录。
2. 定义 PackageReceipt、AcceptancePlan、DispatchLedger 和 LaneResult。每次打包验证全部成员与当前 commit 及工作区一致，package.json 只允许 pnpm 的 packageManager 字段移除。用表驱动 lane 和单一预算账本组织验证。
3. 先完成 dry-run 与包 contract，再冻结文档和交付源码。分别运行可验证提交。
4. 从最终 tarball 普通安装到独立 agent/cwd/package。用同一任务先跑 native 再跑 head。重复 remote/native、磁盘恢复、迁移、错误、取消、reload、disable 与卸载均在网络 fixture 下运行。
5. 独立记录 alternating 整包样本，复用源码精确匹配的阶段微预算证据时注明历史来源。未知性能不推导提升。
6. 从同一包录制 ANSI cells 截图和 30 至 60 秒视频。逐成员归档/hash，清理本任务进程和 socket，形成最终报告。

吞吐调查检查点。安装命令是本轮最高不确定性，先读实际宿主源码，不猜 npm tarball 语法。实现由单 worker 执行，无子代理。

架构选择。两种工具结构可选。一个覆盖所有工作的巨型 runner 会混合冻结包、运行时和账本。选择 package、local acceptance、live plan 三个工具，分别持有自己的 receipt。它们通过最终 package manifest 连接。how 和 architect 的委派步骤按用户明确禁止子代理跳过，由 owner 直接比较，不能算独立设计审查。

复跑 `pnpm verify:p6` 会创建独立 release 目录及时间戳 local 目录，不覆盖历史收据。最后输出 local 路径；运行 `node scripts/p6/audit.mjs <local 路径>` 审计该次 results.json 引用的安装包。audit 目录必须尚不存在。
