PASS。目标是独立判断 pi-compact 的 P4 修复能否安全进入 P5。对交付 HEAD `42a1663efde146867b1e95d7b7736be7d0d252e8` 的审查结论为通过。原 R1 与 R2 均关闭，未发现本次范围内的新阻塞。支持 P4 进入 P5，但本结论不替代用户视觉审阅，也不替代 P6 真实服务和摘要质量验收。

产品提交为 `1ea8cf4f4cf492872f9c8bb5594daa6a5aa531db`，旧候选为 `6d9022479587b14bc53f0e2f3bd368362ecde2ca`，P3 接受基线为 `b3a4d6e7ba2f5569730fbc199b361d785d19e9e1`。初始 HEAD 精确匹配且工作树干净。514 个 tracked 文件逐项匹配 HEAD，冻结副本的 92 个 src/scripts/tests 文件逐字节匹配。产品到交付仅增加 15 个 P4-fixes 证据文件。相对旧候选，产品源码只改 session.ts 四行。见 [完整性](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/integrity.json)、[产品差异](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/product.diff) 和 [交付范围](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/delivery-scope.txt)。

本人完成全部审查，没有子代理。所有新增文件都在本目录及其子目录。没有修改产品或现有测试，没有推进 P5、提交、push、PR、merge 或 publish。普通安装版 Pi 1.5.2 CLI/TUI、SessionManager、AgentSession、loader 和 provider encoder 为运行事实来源。CLI、package、source maps 和 bundle 指纹与交付来源记录一致。所有运行使用 synthetic agentDir、合成 history/auth 和拒绝外网的 preload，没有读取真实凭据或历史，没有修改全局 Pi。

R1 已关闭，原优先级 high。

本次重新运行 source 等待、native merge 等待及两个 unchanged reload 对照。改变内容的两侧均保持全部 entry ID、parent 和 leaf 不变，实际文件由 12,204 bytes 变为 4,233 bytes。来源 user 内容确实改为 `FACT_RELOADED=corrected_value`。两个窗口均先进入 blocked，没有过期 checkpoint，也没有 normal transport。重载后的字节前缀完整保留。runner 在显式 retry 之前另行验证后缀只能是 Pi 的零 token assistant error diagnostic，不能将这种正常诊断误判为 stale summary。见 [本次十项日志](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/fixes.log) 和 [独立请求及字节审计](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/fixes-audit.json)。

首次显式 `/compact` 使用当前有效原始历史成功恢复，方法为 history，不再 replay 已失效 opaque。新 checkpoint 的 coverage IDs、sourceLeaf、firstKept 和 hash 与磁盘 ancestry 的有效投影一致。两个 changed reload 的最终 normal body 均为 744 bytes，包含新事实且不含旧 `database=sqlite`。source 窗口在 retry 前没有 native 请求，native 窗口原有 2,367-byte 请求的结果未提交，retry 重新发出 1,930-byte native body。unchanged reload 也被保守拒绝，但首次显式 retry 成功。每个实际 body 的 SHA-256 保存在上述审计 JSON。

另写 14 项独立 runner，其中七项扩展 execution 生命周期验证。覆盖初次 remote 响应等待、remote/source 初始异步授权、remote/source 响应返回后的异步授权、source 授权等待中真实 context_edit 持久化失败，以及默认 native 等待中的同 leaf reload。它们均拒绝旧 operation，首次显式 retry 成功，新 coverage/hash 正确且之后能够正常发送。失败写入确实触发原生 persist 错误，manager 回到原 leaf，保守 revision 失效没有造成永久阻断。见 [独立 runner](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/ind-runner.mjs)、[观察扩展](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/ind-observer.ts)、[14 项运行结果](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/ind-runs/1794831456313/result.json) 和 [额外实际 payload 审计](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/extra-payload-audit.json)。

源码审查与运行结果一致。run 在显式 pending recovery 与 manager/context reload 完成之后，同步捕获 branch 和 sourceRevision。reload、append、rewrite 在调用原生方法前递增 revision。执行期 guard 同时检查 operation、signal、selection、revision 和 leaf，并覆盖 source/remote 的 payload 与响应授权边界、native transport、最终 proposal 和 append。失败写入可以保守失效，但下一次 execution 捕获当前 revision。成功 append 自身也递增 revision，提交后的 completion 路径使用 operation/selection 与持久化状态确认，没有拿旧 revision 再拒绝自己刚提交的 checkpoint。成功后普通请求重新验证来源缓存。P3 pending 协议、事务、凭据和原生 cut 未改。

R2 已关闭，原优先级 medium。

复跑 source success、missing auth、source failure，各含单 opaque 与连续两个 opaque checkpoint。原生 preparation 的完整 prefix 为 5,032 个 UTF-16 单元，包含四组有序 toolCall/toolResult。source 成功时，该 prefix 仅出现于一个 7,419-byte native body。missing auth 与 source failure 的 raw fallback 仍分为 history 与 prefix 两个原生请求，prefix 仅出现在后一个 6,268-byte body。每个实际 conversation 区域与有效 history/remainder 的原生序列化字符串逐字节相同，source wire 也按完整顺序及账户 hash 校验。没有只依赖会去重的 findFacts 或最后摘要判定。见 [20 项当前与交付 raw 审计](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/fixes-audit.json)。

source covered IDs、new remainder IDs、retained tail IDs 经独立分区后互不重叠，合起来等于有效投影。source 成功时，previous-summary 精确等于 source fixture 返回的可读文本，旧 covered raw 不再混入 remainder。retained answer 未进入任何摘要输入，在 actual normal body 中只有一次。四个工具结果及 turn 事实最终各出现一次，历史工具没有重新执行。

其余七项独立场景进一步覆盖每个 assistant 同时调用 read/write、保留尾部含完整工具组、remainder 内 context edit、source failure 保留工具尾部、普通 native split、单及多 checkpoint 的大 remainder。保留工具场景的 source/remainder/tail 分别为 2/8/4 个有效 entry。actual normal body 中两条保留 tool call 的 ID、name、arguments 与两条 tool result 的全文和顺序均精确匹配，摘要区域不含这些保留结果。context edit 的新内容进入摘要，旧工具结果未复活。见 [补充字节核验](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/extra-payload-audit.json)。

两个大 remainder 场景各含 20 组双工具调用，共 40 个工具结果。每个结果低于 Pi 原生 2,000 字符截断阈值，因此本次确实验证了这些结果的全文。77,821 个 UTF-16 单元分为三个连续 slice，实际 native bodies 分别为 31,933、33,090、22,027 bytes。每段 offsets/hash 与实际 conversation 精确匹配，串接后没有重复或遗漏。后续每段 previous-summary 逐字节等于前一段实际 fixture 摘要加原生 fileops 后缀。source wire 与原始来源 coverage 独立核验，没有把 previous-summary 的正常累积当成重复覆盖。

`firstKeptEntryId` 始终等于原生 preparation 的 cut。所有补充摘要请求包含 `Additional focus: INDEPENDENT_FOCUS_MARKER`。fileOps 保留原生 read/edited/written 集合，落盘 readFiles、modifiedFiles 和 summary 后缀均匹配。普通 native split 仍发送两个摘要区域，并保留原来的 previous-summary。安装版源码说明 isSplitTurn 只决定摘要区域及拼接格式，cut 与 fileOps 已预先计算，因此 source 成功时清空额外 prefix 不会移动切点。已保存 [安装 compaction 源码](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/installed/compaction.ts)。

实际运行与沿用范围如下。

| 检查 | 本轮结果 |
| --- | --- |
| lint、typecheck、unit | 全部通过，40/40 unit。[lint](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/lint.log)、[typecheck](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/typecheck.log)、[unit](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/unit.log)。 |
| 正式修复 runner | 10/10，另对本次及交付 final run 共 20 例作独立字节审计。 |
| 新独立 runner | 最终 14/14，初版 12 例中三次观察器设置失败单独保留。 |
| P4 选定 lanes | 3、6、10 通过，覆盖 compatible 零额外摘要、大 raw fallback 四段、磁盘恢复首请求。[lane 3](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/lane3.log)、[lane 6](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/lane6.log)、[lane 10](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/lane10.log)。 |
| P4 edges | 13/13，含 late model/auth/source、edit/delete、source failure、双失败、schema、缺祖先和真实工具。[edges](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/edges.log)。 |
| P1–P3 风险回归 | P3 recovery 7、faults 5，P1 fixes 5、scope/read 4，P2 fixes 11、reconstruction 18，六个 runner 全部退出 0。[回归索引](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/regressions.log)。 |
| 额外矩阵字节审计 | 本次三 lanes 加 edges 共 16 侧通过。交付完整十 lane 的 11 侧加 13 edges，共 24 侧亦独立审计通过。[本次结果](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/matrix-audit.json)、[交付 raw 结果](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/owner-matrix-audit.json)。 |
| 解包普通 loader | 默认 native、Codex remote、compatible 继续、DeepSeek 迁移全部通过。[package smoke](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/package-smoke.log)。 |

没有机械重跑完整十 lane 或 490 条配置矩阵。完整矩阵的其余 lanes 沿用本修复 HEAD 对应的交付 raw，并以独立 auditor 核对 ancestry/hash、ordered wire/account、正常目标无 opaque、原始字节前缀和分段内容。刻意污染 schema/删除祖先的场景按其 restart 拒发结果单独审计，没有把早期成功 checkpoint 当作仍应匹配后期故意污染文件。旧 auditor 的失败仍原样保留，不将它宣称为通过。本轮的完整 raw 核验是另一份 [可复跑审计程序](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/matrix-auditor.mjs)，其来源与路径适配见 [生成记录](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/derive-matrix-auditor.mjs)。

性能沿用前次独立已核验的 220 样本，本次没有新测性能或宣称提速。已读 benchmark-checklist 与 Explain the Number。四行修复只向 execution guard 增加已有整数 revision 比较，并去掉重复摘要区域，普通 hotpath、来源 hash 缓存、恢复算法和事务字节未变，故没有证据要求重跑性能矩阵。旧 awaited prepare/transform 加同步 stream 调用的指标不涵盖 opaque 异步授权，P4 prepare 到 actual fetch 才覆盖该路径。相关边界和原始样本审计见 [前次独立报告](/Users/wangxuyang/.t3/worktrees/compact/t3-991d98c2-12a8e639fbce53a6/artifacts/P4-independent/REPORT.md)。不将本轮功能测试墙钟混入性能结果。

包与证据一致。

开发包的 22 个白名单文件与本 HEAD 匹配，package.json 只按 pnpm 去掉 packageManager 字段的规则比较。冻结副本重新 pnpm pack 得到完全相同 SHA-256 `fd8cffab14e4a59b132abd5ddf0ca5d24a559f8ccd580bb129d7417c48a15b0b`。见 [包逐文件审计](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/checks/artifacts/P4-fixes/package-final/audit.json)。没有全局安装。

交付 evidence.tar.gz 的 2,299 个文件逐项通过 size 和 SHA-256 校验，全部只解压至本目录 owner-archive。归档为 4,652,230 bytes，SHA-256 为 `4a6e6879dd3e7db6055ed9269f90237c23f26b79b421f61ac1d6f8d40f586e33`。manifest 的 standalone 包 hash 亦匹配。见 [归档核验](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/archive-audit.json) 和 [可复跑程序](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/archive-audit.py)。

失败证据全部保留。

交付的原 R1/R2 红复现、错误 .mjs observer、全文件相等断言误报，以及旧 matrix auditor 的 schema 失败均保留在 owner-archive。它们的已知原因与实际代码、日志相符。没有将 owner 自述当作最终证据。

本人初版探针的 remote-reload 没设置 `control.remote=delay`，日志证明 remote-fixture-success 和 checkpoint completion 在 reload 之前，故初次“应拒绝”断言不成立。两条 retained-tools 探针在初始 seed 时即用 700 keepRecentTokens，原生没有生成首个 checkpoint，随后审计访问 undefined。v2 使用真实 remote delay，并在首个 checkpoint 成功后通过 SettingsManager.applyOverrides 调整保留预算。三项重新执行通过。初版脚本、扩展、12 个结果与所有 raw 均保留，见 [初版失败日志](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/ind-runner.log)、[初版 runner](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/ind-runner-v1.mjs)、[最终日志](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/ind-runner-v2.log)。首版完整性工具误读未导出的 target，改为 provenance.target 后通过，见 [该次失败](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/integrity-first.log)。没有为这些问题改产品或正式测试。

清理通过。520 个登记 PID 均退出，97 个 socket 均不存在，101 份 session cleanup 无残留，lsof 监听输出为空。110 份本轮 events 日志没有 network-blocked。父工具调用、pnpm/conda/render 和短命 Node 驱动均已等待结束，另作当前进程扫描，未发现本目录残留 runtime。没有终止无关进程。交付记录的 640 PID、121 sockets 和 125 cleanups 只作为历史证据核对，没有算成本人启动数量。见 [清理明细](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/cleanup.json)。

限制仍明确。Pi 原生 serializer 会截断超过 2,000 字符的工具结果并省略 thinking，这不是此次修复新增的语义。本文的完整覆盖指有效来源分区与原生序列化结果，新增大样本另保证工具结果低于截断阈值。合成 fixture 的事实回忆和 zero tool reexecution 证明传输与控制边界，不证明真实模型摘要质量。真实 provider 预算未使用，SSE 真实服务、WebSocket、真实模型 xhigh、费用与语义质量仍归 P6。P1 loader 前 metadata、独立 manager/file、P2 等字节 occurrence 的已接受范围保持原状。没有新开用户视觉验收。

审查方法直接应用 how/no-comments，没有删注释或新增 suppressions。Model the Domain 使检查围绕 execution snapshot 与 sourceRevision，以及 source/remainder/tail 的显式分区。Prove It Works 使结论依赖实际 transport body、磁盘 bytes 和解包 loader。Explain the Number 使性能只沿用既有口径，不把同步指标扩展为异步承诺。所读原则分别为 [Model the Domain](/Users/wangxuyang/plugins/pstack/pstack/skills/principle-model-the-domain/SKILL.md)、[Prove It Works](/Users/wangxuyang/plugins/pstack/pstack/skills/principle-prove-it-works/SKILL.md)、[Explain the Number](/Users/wangxuyang/plugins/pstack/pstack/skills/principle-explain-the-number/SKILL.md)。吞吐检查点为 `n/a, read-only investigation`。

复跑入口以当前 worktree 根为工作目录。

`node --import=./artifacts/P4-fixes-independent/checks/node_modules/tsx/dist/loader.mjs artifacts/P4-fixes-independent/ind-runner.mjs` 运行新增十四项。`node artifacts/P4-fixes-independent/fixes-audit.mjs`、`node artifacts/P4-fixes-independent/extra-payload-audit.mjs`、`node artifacts/P4-fixes-independent/matrix-auditor.mjs`、`AUDIT_OWNER=1 node artifacts/P4-fixes-independent/matrix-auditor.mjs` 复核保留 raw。运行正式 runner 应进入本目录 checks，并使用 `node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p4-fixes.mjs`，避免覆写外部旧证据。

Attention。本报告由 Astra high 独立完成。[决策记录](/Users/wangxuyang/.t3/worktrees/compact/t3-48dcb7cf-836b9736359d918c/artifacts/P4-fixes-independent/decisions.tsv) 已按实际命令和证据自审，没有另开跨模型 trail review，遵守禁止子代理的限定。需由后续负责人保留的门槛只有用户视觉审阅与 P6 真实服务验收。本报告未替任何人勾选这些门槛。
