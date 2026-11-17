# P2 请求重建独立验收

目标是确认普通 Pi 1.5.2 扩展能在实际请求边界压缩，同时保留公开 hook 语义和完整工具批次。结论为 **PASS，支持 P2 进入 P3**。R1、R2 和 modify-and-copy 在本次独立运行中关闭。没有发现新的产品阻塞。此结论绑定精确 HEAD，不代表已合并、完成用户视觉审阅或通过真实 provider 验收。

## 版本、来源与范围

- 被验 HEAD 为 `08b6b11973d8651ba51c5d4b83375de730182446`。
- 产品提交为 `50f0b8090c94074159fc9ce311774971ca00eb83`。它到交付 HEAD 只新增审计材料，src、scripts、tests、package 与锁文件无差异。
- 基线为 `05d5c9f7e90b2839a4c27a4e9b60ab12603801ac`。完整产品及 runner diff 已阅读，见 [冻结 diff](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/product.diff)。产品只新增 89 行 reconstruction.ts 并替换 session.ts 的重建段。NativeProgress、PolicyBoundary、lease、journal、容量 fence 和取消实现未改。
- reconstruction.ts SHA-256 为 `1f98066ed24c2eb82fd24bab0f03528750160c56a74166e6b46b9e894118b55f`。session.ts 为 `8c288cd442f24d461acf915194136bccb736329e20d42e74666f426cdb36d531`。
- 启动器为 `/Users/wangxuyang/Library/pnpm/bin/pi`，实际 Pi 1.5.2、Node v22.22.2。已核对 shim 指向的 bundled CLI、全部 bundle chunk 和安装 source map。[安装指纹](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/installed.json) 与 [实际 bundle 摘录](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/installed/bundled-excerpts.json) 记录了真实 emitContext 的 structuredClone 和 SDK transform 接线。未以 scratch reference 推断运行行为。
- 已读取指定 owner、前次独立报告、root notes、architecture synthesis、implementation-plan、公开 design/roadmap 和指定技能。适用指令要求中文、只读产品、独立完成，本次没有子代理。

全部新证据在本验收目录。checks 是冻结副本，不是另建 git worktree。真实 Pi 普通 loader 通过 `-e` 加载源码或解包入口。使用隔离 agentDir、synthetic 历史、fixture-only 授权及拒绝外网 preload。没有写 root、owner、Pi 安装、真实配置、历史或凭据。

## R1 与 R2 已在实际 transport 关闭

已重读旧 hooks、8 个 probe 和 2 个 native control 的 raw。旧 duplicate 的 hook 输出两份同字节消息，实际为零。旧 tool-modify 的 hook 本身配对，实际只剩 call_independent 的 function_call_output。旧全数组倒序 probe 的 hook 已把结果排在调用前，不纳入本产品造成的合法性回归。见 [旧 raw 独立审计](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/old-all-probes-audit.json) 和 [旧缺陷字段与哈希](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/external-audit.json)。

本次首先运行冻结的 18 案例，再使用另写的公开 hook 和 seed 独立运行 8 案例。后者仅在 ModelRuntime 注入 fixture fetch，通过订阅事件观测。没有包装或替换 agent.prepareRequest、agent.transformContext、agent.streamFunction、compaction、SessionManager 或 controller 方法。生产重建运行后，preload 读取实际发给 fixture 的请求体。

| 已关闭项 | 最小公开操作 | 本次实际结果 |
| --- | --- | --- |
| R1 | context hook 追加 structuredClone(oldUser) | 旧消息两份都保留，新增 occurrence 未丢失。一次 hook、一次 native summary、一次普通请求。 |
| R2 | 只改旧 toolResult 文本，保持 hook 的调用/结果 | 原 18 案例保留 call_independent 调用及结果。独立双批次探针保留两组调用/结果，顺序合法，改写内容在实际 payload 中。 |
| modify-and-copy | 原地修改 oldUser，并追加其修改前克隆 | 实际请求恰有一份原内容和一份修改内容。没有等量内容错配导致的丢失。 |

直接证据为 [18 案例实际传输审计](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/transport-audit.json)、[独立公开探针](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/public-probes.mjs)、[公开 hooks](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/public-hooks.ts) 和 [8 案例结果](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/public-1794819378051/result.json)。原始事件分别位于 [18 案例目录](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/checks/artifacts/P2-reconstruction/run-1794819225758) 和 [独立探针目录](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/public-1794819378051)。每个可发送重建案例均独立断言当前输入恰好一次、摘要恰好一次、调用先于对应结果、每个调用有且仅有一个结果。没有用合成响应成功替代这些断言。

## 映射与工具批次审查

[reconstruction.ts](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/src/pi-adapter/reconstruction.ts) 在 hook 前保存 occurrence 引用与当时字节，数组记录次数，同一对象只序列化一次。仅在确定需要压缩时读取 canonical projection。压缩前后 entry ID 决定 canonical 来源是否被摘要。跨截断点的同字节组不会全部标为可删除。

身份分支先认领来源。修改过的对象仍消耗对应来源，但不会删除改写后的内容。同引用的源与输出数量不等时保留。内容分支只处理未认领来源；若任何非 system 输出含无法匹配的新内容，就停止不确定的按内容删除。因此 modify-and-copy 不会错误使用旧内容克隆顶替已修改来源。完全克隆、等量同字节输出按已约定的等价来源处理。

重建始终遍历 hook 输出，不从 canonical projection 补回 recent 消息。只加入本轮新 compaction entry 的摘要，no-work 时直接返回 transform 输出。批次以 assistant 的全部 toolCall 和对应后续 toolResult 关联，任何成员保留则整批保留。18 案例覆盖同引用重复、完整 clone、额外 clone、内容及数组原地修改、跨截断重复、修改调用参数、多工具结果修改和合法结果重排。另写的双批次 probe 将完整 B 批次移到 A 之前，实际 transport 保留该顺序。摘要没有插在这些合法批次的调用和结果之间。

retained-delete 明确验证被 hook 删除的 recent 消息位于 canonical 保留区，实际请求仍不出现它。独立 clone-delete 再次通过。源码与运行证据均未发现删除消息回生、当前输入重复或 hook 重跑。直接消费身份的分支由 unit 以及源码追踪验证，不能将宿主 structuredClone 后的 CLI 案例宣称成保留原引用的运行证明。

可观察歧义会多保留历史。新增或修改内容可能使该请求未匹配部分全部保留，因此不会保证最大压缩率。38,000 字符工具结果案例在摘要成功后仍因容量不足 blocked，普通请求为零，旧历史字节前缀完整。这个代价符合本次明确约定，容量 fence 没有被放宽。接口没有 occurrence 标签，先删再等量替换完全相同字节的作者意图不可观察，不将其臆测为产品丢失。工具保证以 hook 输入输出本身合法为前提。

## 本次执行与沿用范围

| 本次运行 | 结果 |
| --- | --- |
| lint、typecheck、unit | 通过。unit 最终 27/27，见 [lint](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/lint.log)、[typecheck](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/typecheck.log)、[unit](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/test-retry.log)。 |
| reconstruction | 18/18。包含实际工具配对、克隆语义、删除和容量，见 [日志](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/p2-reconstruction.log)。 |
| 独立公开 hook | 8/8。新增双批次换序，另复查 public cancel、manual 空会话，见 [日志](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/public.log)。 |
| P2 fixes | 11/11。1% 与 0.1% 的下一输入不误阻断，完整三工具批次、system/context 预算、容量、失败与取消显式重试通过，见 [日志](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/p2-fixes.log)。 |
| 真实磁盘失败 | appendFileSync 的 compaction 行实际失败后 blocked。磁盘恢复不能自动续跑，显式 compact 恢复。两次 native、一个 checkpoint、一次普通续跑，见 [日志](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/p2-persistence.log)。 |
| P1 fixes 与 scope | 五组与四侧均通过。dispose、disabled capacity、retry finally、进程锁、共享 manager、无关 session 和 public reads 通过，见 [fixes](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/p1-fixes.log)、[scope](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/p1-scope.log)。 |
| 定向 P2 lanes | 2、3、7 通过。8,999 不触发，9,000 触发，manual 保留 custom instructions。见 [lane 2](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/lane-2.log)、[lane 3](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/lane-3.log)、[lane 7](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/lane-7.log)。 |
| context edit 与 overflow | projection 读取独立，scope 跨 await 保留 reserve 1001。overflow 摘要失败后后续输入不能新增普通请求，见 [日志](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/boundary.log)。 |
| 包与普通 loader | 解包 15 文件核对，配置及精确 9,000 边界通过，见 [日志](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/package.log)、[逐文件审计](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/package-audit.json)。 |

原生源码确认无 eligible preparation 在 compaction_start 前返回 false，公开取消和真正摘要失败发生于 started 后。manual 空会话与 public cancel 本次均零普通请求、blocked。11 案例的短下一输入覆盖 threshold no-work，保持 idle，未增加 checkpoint。NativeProgress、lease 与 PolicyBoundary 没有因新重建改变。

前次 I1/I2 的独立结论由本次对应回归补强。模型切换、DeepSeek 与 synthetic Codex 授权共存、超过 60 秒等待、早取消保留配置、原 fixed reserve 对照及配置拒绝细节沿用前次独立报告，未声称本次重新运行。P1 的 host --name 启动前写入和 SDK bootstrap metadata 边界继续按已接受限制处理。没有审查 P5 分支，也不提前要求 P3 opaque 事务。

## 性能证据只支持限定预算检查

本次审计并重算 owner 三个原始轮次，未新增性能测量。[性能审计](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/perf-audit.json) 从每个 events.jsonl 重新相加 prepare-duration、transform-duration、stream-duration，验证每个样本正确 seed 数、一次实际普通请求、零 native、零外网、当前输入和持久化合成回复。实际配置为相同 200,000-token 窗口，1,000 或 10,000 条短消息。计时包含 awaited prepareRequest、awaited transformContext 和同步 streamFunction，不包含后续异步 payload 构造或 provider 墙钟。

最终轮 `1794818528817` 每尺寸五对，baseline/head 交替运行。1,000 条增量 median 0.882ms、最大值 1.658ms，范围 0.846 至 1.658ms。10,000 条增量 median 4.715ms、最大值 6.013ms，范围 3.742 至 6.013ms。两组低于 10ms。n=5 的 nearest-rank p95 就是最大值，不能当作总体尾部保证，也不是相对旧 P2 的加速比例。最终 method 的 42 项源哈希与当前对应文件全部相符。

初轮 `1794817690488` 的 14.690ms 和扩大十对轮 `1794818011205` 的 12.263ms 仍是失败。两轮源码与最终产品不同，已分开保留，未混合计算最终统计。最终源码把多余 canonical projection 移到确定压缩之后，未触发路径仍承担 snapshot 和编码估算。已有 profile 的 snapshot、estimateTokens、estimateContextTokens 样本已从 cpuprofile 重算。该 profile 属于较早优化轮次，相关未触发路径与最终代码相同，但不能称为最终整版独立 profile；启动编译和 fixture 同步磁盘写也不能当作请求边界瓶颈。

共用 method 的 source 清单和当前字节匹配，仍不能证明每个样本运行途中绝无未记录修改。没有逐样本 sourcehash。短消息和复用 assistant 对象也是该 synthetic 工作负载的范围，不能外推任意大消息或全部真实会话。

配置逻辑未改，沿用前次独立各 30 次的 ready Enter 到唯一 stdout 结果，设置/查看 p95 为 43.704/46.067ms。未重测，未将 handler 时间替代终端响应。旧启动期约 0.6 秒未修，不声称加速。本轮新 snapshot 不在配置 handler 路径。

## 包、材料缺陷与失败尝试

包 SHA-256 为 `25d41b1e6315fc554558cc4b3dc3a84b06c180a7f19f27cf4447c42b626bee61`。15 个实际文件逐一匹配当前源码及文档，package.json 仅按 pnpm 规则省略 packageManager。已通过解包入口的普通 Pi loader。开发包验证不替代 P6 安装和真实 provider 验收。

发现一项非阻塞审计材料缺陷。owner evidence-manifest.json 将 audit.log 记录为零字节文件的哈希 `e3b0c442…`，实际文件是末尾 console.log 的清理摘要。audit.mjs 先读取重定向输出再输出最后一行，导致该自引用记录失效。其余 1,915 项均直接核对一致，缺失为零，产品、实际请求、journal、包和归档哈希没有不符。最小整理方向是排除正在生成的 stdout 文件，或在输出关闭后生成其哈希。本次不改 owner 材料。见 [失败审计原日志](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/external-audit.log) 和 [诊断](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/evidence-caveat.json)。

本次首次 unit 在私有副本缺少 artifacts/P1、artifacts/P2 父目录时出现 3 个 ENOENT，补建目录后原测试 27/27 通过。初次 boundary/package 搬运误用 checks cwd 的相对路径，在 Pi 启动前失败，修正私有准备后通过。所有失败日志保留，没有改产品或测试断言。owner 的旧红、modify-and-copy 红、失败性能和清单中的原始材料也保持原样。

## 清理与放行限制

[最终完整性与清理](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/cleanup-and-integrity.json) 直接确认 56 个 fixture 运行目录、46 份 TUI cleanup 记录和共 113 个登记 PID，包含 11 个批量 runner，全部退出。监听输出为空，56 个计算出的 socket 路径均不存在，实际外网尝试为零。没有停止其他任务进程。owner 已记录的 357 个运行、672 个 PID 和 357 个 socket 也逐个复核，全部退出或不存在，没有只接受汇总数字。

355 个原 tracked 文件、56 个冻结副本文件、1,923 个外部证据文件哈希未变，实际 Pi shim、bundle 和 source map 未变。Git tracked status 为空。所有新材料只在本目录，依赖安装只用于私有 checks。没有 commit、push、PR、merge、publish 或 watch。

Model the Domain 将审查重点限定在 occurrence、entry 来源和工具依赖。Prove It Works 决定检查实际 transport、journal、包字节和进程，而非 owner PASS。Explain the Number 与 benchmark-checklist 决定只接受原始配对重算的限定预算结论。how、no-comments、unslop 与文案检查由本人直接完成。产品 diff 无新增注释、suppression 或 any 逃逸，删除、恢复、编码均为零。throughput checkpoint: n/a, read-only investigation。[决策记录](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/decisions.tsv) 已按本次真实操作自查，没有另开代理或声称跨模型审阅。

**支持 P2 在此精确 HEAD 进入 P3。** 用户视觉审阅仍待完成，不是本轮代码缺陷，也不要求现在回复。全部 transport 是 synthetic fixture，不能证明真实 provider 接受、摘要质量、任意第三方组合或整体 P1 至 P6 已完成。歧义保留可能降低压缩效果甚至容量阻断，这一已知边界继续成立。

复跑先创建新的私有 checks 副本，避免固定 lane 覆盖本次材料。[批量回归入口](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/run-checks.mjs)、[公开 hook 入口](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/public-probes.mjs)、[传输审计](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/audit-runtime.mjs)、[性能审计](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/audit-perf.mjs) 和 [清理审计](/Users/wangxuyang/.t3/worktrees/compact/t3-caa833f4-c88341ddaac19837/artifacts/P2-reconstruction-independent/cleanup-audit.mjs) 保留了可检查的验证逻辑。audit-external.mjs 会如实报出 audit.log 自身哈希问题，未将失败改写为全匹配。
