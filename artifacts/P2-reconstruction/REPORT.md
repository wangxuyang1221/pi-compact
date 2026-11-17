# P2 请求重建修复候选

目标是让普通 Pi 1.5.2 扩展可靠压缩实际请求，同时保留公开 hook 内容和完整工具批次。R1、R2 及“修改旧消息再添加其原内容克隆”的同类边界已修复，并完成真实普通 CLI、synthetic transport 自验证。这里只交付候选，由根协调者安排 fresh 独立复验，不放行 P3。

## 版本与范围

- 基线核对为 `05d5c9f7e90b2839a4c27a4e9b60ab12603801ac`，开始时工作树干净。
- 分支为 `t3/fix-p2-reconstruction`，worktree 为 `/Users/wangxuyang/.t3/worktrees/compact/t3-1ffed212-e1dc3a2046f48779`。
- 最终产品提交和报告编写前 HEAD 为 `50f0b8090c94074159fc9ce311774971ca00eb83`。后续提交只追加审计和报告，最终交付 HEAD 在交付回复中列出。
- 红测试提交为 `9b5cad6`。初版产品为 `f351f60`；`cab5d04` 把 canonical projection 移到实际压缩路径；`50f0b80` 补齐修改与复制共存的保守映射。完整 SHA 和源码哈希见 final-source.json、audit-result.json。
- 只改 session 请求重建及其纯逻辑模块。native owner、operation lease、NativeProgress、PolicyBoundary、失败 journal、物理容量 fence 和取消规则不变。没有 P3、P5 或 UI 改动。
- 使用真实安装 shim、bundle 和 source map，Pi 1.5.2、Node v22.22.2。runtime 的 provenance 保存安装和源码哈希。所有模型数据、授权和历史均为 synthetic fixture，preload 拒绝真实网络。

## 根因与具体映射

原代码在 hook 后才取源消息 JSON，用 Set 判断旧内容是否被摘要。字节是否相同无法表达一次出现的来源，逐消息筛选也不表达工具依赖。因此新增克隆被一起删掉，改写工具结果则因字节不同独自留下。

真实安装的 ExtensionRunner.emitContext 会先 structuredClone。不能假设公开 hook 仍返回原输入对象。设计和映射规则详见 DESIGN.md，产品实现是 src/pi-adapter/reconstruction.ts。

1. hook 前保存输入 occurrence 的引用及原字节。数组保留出现次数，同一对象在单次快照中只序列化一次。即使 transform 原地改数组或内容，也不会改掉快照。
2. 确定需要压缩后才读取 canonical projection。压缩前后 entry ID 决定哪些 canonical 来源被摘要。同字节来源跨越截断点时，整组保守保留。未触发压缩的请求不多建一次 projection。
3. 身份仍可辨认时先匹配身份。已修改对象消耗来源但保留内容，额外重复引用保守保留。
4. 其余项仅在无新内容的不确定输出、字节组出现次数相等、所有 canonical 来源均被摘要时，视为未改内容的克隆表示并移除。如果存在无法匹配的新内容，可能发生修改与复制错配，整个未匹配区保留。不是把 Set 简单换成计数。
5. 顺序以 hook 输出为准，不从新 projection 恢复 recent 消息。只插入本轮新 compaction entry 的摘要，保留 hook system。native no-work 不插入摘要，hook 不重跑。
6. assistant 的全部 toolCall 及其后关联的 toolResult 构成批次。任何成员保留，批次在 hook 输出中的所有调用及结果都保留，保持原顺序。最终编码 context 继续经过原物理容量 fence。

等量、同字节、完全克隆的数组被定义为原消息的等价表示。公开接口没有 occurrence 标签，无法观察“先删除再创建同字节同数量替身”的作者意图。额外克隆、修改与复制共存、跨截断重复等可观察歧义均保守保留。这可能减少可压缩量，甚至因容量不足暂停；不能靠删除 hook 内容或放宽容量解决。

## 红绿证据

原始旧目录只读。old-evidence-audit.json 独立读取了指定旧 probes/controls，核对 R1 两份 hook 消息变零份，R2 原生对照配对而旧产品仅剩结果。original 下保留移植的源码与探针，未覆盖旧证据。

修改产品前，真实 CLI 运行正式 runner，red-assert.log 原文包含：

```text
AssertionError [ERR_ASSERTION]: preserve added or ambiguous occurrence
AssertionError [ERR_ASSERTION]: actual transport result must have call call_independent
```

对应 `run-1794817431592`。每侧一次 hook、一次摘要、一次普通请求，一个 checkpoint。原生对照 `original/controls-1794817396221` 保留 duplicate 两份及完整工具对。

自查中，`cab5d04` 的等量匹配仍不能处理“修改旧内容并新增原内容克隆”。`run-1794818480474` 和 mixed-red.log 保存真实失败：

```text
AssertionError [ERR_ASSERTION]: preserve modified source and added clone together
```

最终绿运行是 `run-1794818499100`，18/18 PASS。transport-audit.json 直接读 actual normal-request.input，并核对每个可发送案例当前输入恰好一次。其 R1/R2 结果为：

```text
duplicate       hookOld=2 actualOld=2 hookRuns=1 normal=1
tool-modify     calls=[call_independent] outputs=[call_independent] hookRuns=1 normal=1
modify-and-copy actualOld=1 modified content retained hookRuns=1 normal=1
multi-tool      calls=[call_independent,call_beta,call_gamma]
                outputs=[call_gamma,call_beta,call_independent]
```

duplicate 的两份因宿主预先克隆而不可唯一映射，保守都保留。完全未改内容的 clone 数组仍会移除旧历史。多工具用例分别修改一个结果、修改调用参数、重排结果，实际调用结果数相等，调用均先于结果。38,000 字符结果保留后阻断，普通请求为零，journal blocked，历史文件旧前缀完整。

其他用例覆盖同引用重复、额外全克隆、内容和数组原地修改、旧 user 改写、recent 删除、system 替换、合法批次整体重排，以及相同字节的源消息确实处于截断点两侧。retained-delete 断言被 hook 删除的 recent 消息本来仍在 canonical 保留区。重排用例以完整工具批次为单位；旧独立 probe 的全数组倒序本身会倒置工具依赖，不把修复第三方自造非法输入列为本次保证。

runtime-evidence.tar.gz 保存初始红、原生对照、最终绿及 mixed 红的关键 JSONL、journal、control、cleanup，以及各计时轮 method/samples/result。archive-files.txt 是精确清单。所有大 raw 保留在本 worktree 原路径，evidence-manifest.json 记录哈希，没有把所有 raw 逐个提交。

## 本轮验证与沿用

最终产品字节的复跑日志均以 delivery 命名。

| 检查 | 结果 |
| --- | --- |
| lint、typecheck、unit | 全通过，27/27 tests。lint-delivery.log、typecheck-delivery.log、test-delivery.log。 |
| 定向重建 runner | 18/18，green-delivery.log、transport-audit.json。 |
| verify-p2-fixes | 11/11，fixes-delivery.log。1%/0.1% 下一输入不误阻断，三工具批次、system/context 预算、不可缩减容量、失败与取消显式重试均通过。 |
| 真正磁盘失败 | persistence-delivery.log。实际 appendFileSync 的 compaction 行失败后 blocked；恢复磁盘不能自动绕过，仅 explicit compact 恢复。两次 native、一个 checkpoint、一次正常续跑。 |
| P1 fixes / scope | 五组和四侧全部通过，p1-fixes-delivery.log、p1-scope-delivery.log。覆盖 dispose、disabled capacity、retry 等 finally、进程锁、共享 manager、无关会话和 public reads。 |
| context edit / overflow | boundary-delivery.log。投影读取隔离及 reserve scope 通过；overflow 摘要失败仍阻断后续输入。 |
| 受影响 P2 lanes | 2、3、7 通过，lane-2-delivery.log、lane-3-delivery.log、lane-7-delivery.log。覆盖 8,999/9,000 边界及 manual custom instructions。 |
| 开发包 loader | package-delivery.log，15 个文件逐字节审计，配置及精确阈值 ordinary-loader smoke 通过。 |

原 public cancel 和 manual-empty 的真实红基线探针仍验证零普通请求和 blocked。最终 11 项覆盖取消与 retry，最终 manual lane 覆盖正常手动路径。started failure 与 pre-start no-work 的既有实现未改。没有机械重跑全部旧矩阵。模型切换、DeepSeek 与 Codex fixture 授权共存、60 秒等待、早取消保留配置、启动前 ownership 限制和原固定 reserve 对照沿用已读独立报告。它们不是最终字节的新测量。

配置逻辑未改，沿用 fresh reviewer 已就绪 Enter 到唯一 stdout 的各 30 次结果，p95 为 43.704/46.067ms。旧启动约 0.6 秒未解决，不声称加速。没有 UI 改动，不重录演示。

## 局部预算与失败迭代

benchmark-checklist 在测量前已读。每侧相同真实 Pi fixture，1,000/10,000 条交替短 user/零 usage assistant，200,000-token 窗口、无摘要。计时包含 awaited prepareRequest、awaited transformContext 和同步 streamFunction，排除后续异步 payload 构造及 provider 墙钟。每个样本验证正确 seed 数、恰好一次真实普通请求、零 native、零外网、当前输入和持久合成回复。method 保存机器负载、安装版本及准确源码哈希；没有逐样本单独源码哈希，不声称逐样本 provenance。

- 首轮 `1794817690488` 的 10,000 条增量 p95 14.690ms，失败，保留原始数据。
- 单次快照复用同一对象序列化后，两轮各五对通过。但第二轮 p95 8.767ms 接近预算，扩大到十对，`1794818011205` 出现 12.263ms 尾部，仍判失败。
- 把 canonical projection 移到确定压缩之后，保留 hook 前输入快照，避免未触发路径重复 projection。`1794818124548` 的独立 profile 有 snapshot、estimateTokens 和 estimateContextTokens CPU 样本。整个进程 profile 主要是 fixture 同步磁盘写和启动编译，不将它们算为本地请求边界 limiter。
- 最终产品 `1794818528817` 各五对通过。1,000 条增量 median/p95/范围为 0.882/1.658/0.846–1.658ms。10,000 条为 4.715/6.013/3.742–6.013ms。对应 head 总区间 median 为 1.985/10.749ms，原生为 1.072/6.181ms。这是总扩展开销对原生基线的预算检查，不是相对旧 P2 的加速比例。

n=5 的 nearest-rank p95 就是最大值。最终结果远离 10ms，停止扩大，不外推总体尾部保证。先前失败不被通过轮次覆盖。未重新测配置或整套旧恢复计时。

## 包、原则与清理

最终开发包为 `package-delivery/pi-compact-0.1.0.tgz`，SHA-256 为 `25d41b1e6315fc554558cc4b3dc3a84b06c180a7f19f27cf4447c42b626bee61`。包内 15 文件匹配正式源码，manifest 仅按 pnpm 规则省略 packageManager。包是本地候选，不替代 P6 安装验收。

Model the Domain 使数据结构表达 occurrence、entry 来源与批次。Attack the Premise 和 Fix Root Causes 使修复先反证字节集合及等量错配，再修决策位置。Prove It Works 使绿结论绑定实际 transport，而不以 fixture 成功替代配对证明。按限定直接完成 how、deslop 和 no-comments 自检，无子代理或独立审查冒充。新增注释、suppression、any 逃逸均为零；注释删除、恢复、编码均为零。

最终 cleanup 见 audit-result.json。登记 Pi/pane PID 均直接检查退出，监听输出为空，所有登记 socket 不存在。没有停止其他任务进程。详细计数以该文件为准，包含失败及性能迭代，不只最终成功轮。

根目录、旧 owner/reviewer、Pi 安装、真实配置/凭据/历史均未写入。仅写本 worktree 与获准的依赖安装位置。没有 push、PR、merge、publish、watch、真实请求或开启下一阶段。保留了最初 exact-one duplicate 的过强断言失败、retained-delete fixture 初次无 eligible preparation、包 smoke 相对路径错误，以及一次本地脚本 const 赋值错误；最终证据和日志没有覆盖这些早期尝试。

## 复跑入口

在本 worktree 根运行，时间戳 runner 会创建新目录。旧固定输出 lane 复跑会将本次 lane 移到 attempts，先阅读 manifest 或准备新的隔离检查副本。

```sh
pnpm lint
pnpm typecheck
pnpm test
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-reconstruction.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-fixes.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-persistence.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p1-fixes.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p1-scope.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-reconstruction-perf.mjs --pairs 5
node --import=./scripts/fixture/relative-socket.mjs artifacts/P2-reconstruction/package-smoke.mjs
node artifacts/P2-reconstruction/audit.mjs
```

最终不确定映射可能保留更多历史，容量不足就暂停。没有稳定来源标签时无法同时保证任意克隆编辑的唯一来源和最大压缩率。工具配对保证以 hook 输出自身合法为前提，不修复其主动删调用、伪造 ID 或倒置工具依赖的情况。全部 synthetic transport 只证明本地编排与编码行为，不能证明真实 provider 的接受、摘要质量或所有扩展组合。根协调者应对最终 SHA 独立复验，再判断 P2 状态。
