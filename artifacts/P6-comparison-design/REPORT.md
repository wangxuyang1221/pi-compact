# P6 Data 对比实验设计

结论：目前没有真实测量能证明 Codex 远端压缩比 Pi native 更好。本交付提供可审阅的实验方案和已离线核对的合成候选数据，不能填充为真实 Data 结果。功能可用、相对优势、无可测差异、劣势和证据不足必须分别报告。没有优势证据也不等于证明远端无效。

本设计基于 `1c7d88be1104ee55b024620db7227e4fd89ae9b5`。只新增本目录；未改产品、执行器、旧证据，也未重复完整 P6 安全/正确性验收。没有真实网络/provider 请求、auth/history 读取、有效 grant、依赖更新、push/PR 或子代理。

交付入口：[机器计划](benchmark-plan.json)、[静态来源及 SHA](static-evidence.json)、[数据清单](dataset-manifest.json)、[候选验证](candidate-validation.json)。机器计划 `authorized=false`、`armed=false`，活动预算全部为 0，不能交给现有执行器直接执行。本文的请求数量都是预算设计，不是实测数据。

## 1. 最终报告应该回答什么

最终用户报告仍分三部分：完成情况；Prove It Works；Data。完成情况列清已交付、真实验收待办与已知边界。Prove It Works 用真实 Pi 的压缩、checkpoint 消费、文件修改和确定性测试证明业务路径。Data 用下面的 matched pair 回答质量、后续上下文、总开销与等待时间的差异。

现有 `ledger-recovery-v2` 将事实重复 12 次并添加大量 `x`，续接禁止工具和修改文件，`score` 主要使用 `includes`。四类回忆通过及未变化的文件 SHA 证明的是 fixture 控制/数据路径。P6 和 P6-executor 报告也明确未取得真实质量结果。现有 9 次正常 dispatch 含重复压缩、恢复和迁移，是功能覆盖流程；12 次上限不是多模型成对重复 benchmark 的预算。

## 2. Baseline、模型与可比性

baseline 是**无 pi-compact 绑定的 installed Pi 1.5.2 native 压缩**：本机编排一个模型摘要请求，服务端模型生成可读摘要；不是纯本地无模型算法。比较另一侧为相同 Pi、相同包版本下的 Codex opaque 压缩。禁止 native 用 Luna 而 remote 用 Terra，或把跨模型差异算成压缩方案差异。

静态读取 installed `pi-ai/dist/providers/data/openai-codex.json`，没有运行 model registry、登录或 catalog refresh：

| exact model ID | provider / API | catalog window | catalog max output |
| --- | --- | ---: | ---: |
| `gpt-6.1-terra` | `openai-codex` / `openai-codex-responses` | 500000 | 128000 |
| `gpt-6-luna` | 同上 | 272000 | 128000 |

共同 endpoint 为 `https://chatgpt.com/backend-api/codex/responses`。两者静态标记 reasoning=true；支持 off、minimal、low、medium、high、xhigh、max，off 映射 none，minimal 映射 low。静态存在不证明账号可用、服务支持 compaction_trigger、上述 window 可实际用满或输出 cap 被接受；这些全是未知。不可自动换 Sol、DeepSeek 或其他版本。

主实验使用下列控制：

- 保持 native 默认 `enabled=true, reserveTokens=16384, keepRecentTokens=20000`，无 custom compact instructions，无旧 checkpoint。当前执行器的 `1001/40` 和 FACT 专用提示不适用此比较。
- 同一模型、原始消息、文件、system prompt、工具 schema、continuation、保留尾部和 firstKeptEntryId；双方从独立干净工作区开始。session ID 仅用于隔离，不含 arm 标签，ID/时间戳等非语义差异须记录和规范化比较。
- 全部请求显式共同 reasoning=off，编码后必须是 none。`src/codex/compact.ts` 的 remote 请求当前不传会话 thinkingLevel，native 会传；直接以 xhigh 会话比较会造成不公平。选择共同 off 不需要改产品。其他 reasoning 实验需另行实现与授权，不静默调整一侧。
- 相同 SSE、service tier 未设置、temperature 未设置、请求上限 1000 output tokens（含 reasoning）、零 retry、关闭 cache warming。这些是有界实验的共同控制，**并非完全原封不动的 Pi 默认运行配置**。结论必须写“Pi 默认压缩策略，在共同 off/1000-token 请求约束下”；不能推广为不受输出限制的默认生产表现。

安装源码 `compaction.js:379–410, 513–541` 表明 native 使用结构化 Goal/Constraints/Progress/Decisions/Next Steps/Critical Context 提示，并序列化历史。`utils.js:108–141` 省略 thinking，把每条 tool result 截为 2000 字符；native 还追加读写文件列表。remote 发送同一切分点前的结构化消息，并追加 compaction_trigger。保持两者原生提示/序列化是比较实际产品策略的必要条件，不声称两种压缩算法拿到逐字相同的 wire 输入。

主数据不含 thinking/image，工具结果最长 1585 字符，关键事实不处于截断区；因此不借 native 已知截断机制制造优势。先离线运行真实 `prepareCompaction`/encoder（final send 一律拒绝），保存两侧 prefix/tail、firstKeptEntryId、isSplitTurn 和 encoded 请求摘要，确认事实位于压缩前缀且尾部相同。native 在 split turn 时可能发两次摘要；主实验要求 isSplitTurn=false，在看任何模型结果前完成这一 gate。若不满足，保持现有数据版本并另建版本，不临场只调整一侧。

不纳入近 window 版本：当前插件还以 `contextWindow-model.maxTokens` 检查容量，故 Luna 的静态空间约为 144000、Terra 约为 372000，不能直接按 catalog window 填满并把预检失败称为模型劣势。近 window、长工具结果、重复 compact 可作为后续独立冻结研究，不占本方案预算。

## 3. 两个合成开发场景与冻结

| 场景 | 历史中的关键变化 | 实际续做 | 确定性行为用例 |
| --- | --- | --- | ---: |
| [settlement-v1](datasets/settlement-v1/oracle/groundtruth.json) | event 全局去重/最后覆盖/丢弃零额 → tenant+event/首个有效记录/保留零额；早期唯一的整数分与状态筛选契约 | 实现 settle，保持已升级的 release.json 与审计文件 | 7 |
| [redirect-v1](datasets/redirect-v1/oracle/groundtruth.json) | 301/GET only/强制 en → 308/GET+HEAD/保留 en-fr；早期唯一的原样 query 与路径边界契约 | 实现 redirect，保持已升级的 release.json 与审计文件 | 8 |

每个场景的 history 有 412 条消息，含 read→edit→read 确认 schema 升级、随后 100 个独立批次的整数计算/路径检查。批次有不同输入和可核对输出，均有对应实际文件；不是重复目标答案或 `x`。这是人为构造的维护会话，结构仍比真实开发日志规整，不能宣称代表生产任务分布。关键契约更新在早段；尾部仅提示继续工作，不再给答案。历史与初始 workspace 均为手工合成候选，没有伪造为模型执行轨迹。

`workspace/` 是模型可访问的初始文件；`oracle/` 只供宿主评分，不能挂载或暴露给模型。history 供压缩输入，不能作为续做可读文件。原始历史的 read/edit 状态与最终 workspace 对应。oracle/reference 是作者写的可行实现，不是聊天代理或 Pi 的测试结果。

首次 continuation 要求调用 record_checkpoint，提供 facts/pending/state，然后才能用 read/edit/write/bash 实际续做。工具只返回“已记录”，不反馈对错；只接受第一次记录，在任何文件读或修改前固定。可同轮有多个调用时，先完成记录再执行其他工具，禁止通过读回旧历史补记。后续最多五轮模型输出，包括最终响应；工具调用数量和工具执行时间也记录。

本地已验证 reference 通过 7/7 与 8/8，初始 stub 仅通过 2/7 与 5/8；因此“没有实现也报告完成”不能过关。这里只证明 oracle 自洽，不是模型质量。复核命令为 `node artifacts/P6-comparison-design/verify-candidates.mjs`。生成器用于新候选，冻结后不得覆盖原版本。

正式冻结在任何 provider 请求前进行：锁定数据 manifest、评分代码、计划、工具 schema、安装包/host SHA、原始 workspace、边界预检和调度顺序。当前状态为 **candidate-await-offline-boundary-preflight**；还需实现真实 runner 与最终完整 scorer 后才能签署实验冻结。先冻结正式数据，再运行非计分 pilot；不能用 pilot 结果调优正式事实或评分。任何调整形成新版本，并保留失败尝试。

## 4. 评分与明确分母

不使用模型裁判，不调用额外评审模型，不比较两个摘要文本的文风。opaque 不必转文本；用同一真实后续任务测信息是否可用。

- facts：每 lane 6 个 typed key/value；TP 精确相等，错误值记 FP+FN，遗漏/null 记 FN，未知键记 FP。precision=TP/所有非 null 声明数，recall=TP/6；无声明 precision 为 null。拒绝重复 JSON key、多次冲突记录及不合 schema 的返回，不能靠 substring 或同时列新旧答案得分。评分核在 verify-candidates.mjs；完整 runner 还需严格参数 schema 校验。
- 过时信息：3 个被撤销值，adopted/3；缺失不能算采纳旧值，但同时损失 recall。行为测试还独立检查旧规则是否进入代码，不能只看自述。
- pending：2 个未完成任务；报告 TP/2 及额外/误称已完成项。metadata-upgrade 与 maintenance-review 是已完成干扰项，不应出现在 pending。
- 文件/工具状态：5 项，检查 schema=2、ready=false、函数仍是 stub、最近工具是 read（维护记录）、回归未运行。记录发生在续做前；不能拿续做后状态冒充压缩时状态。
- 续做：在真实修改后的模块上逐个执行 oracle 的 7 或 8 个输入，按深相等比较输出；必须模块 bytes 发生变化，102 个保护文件逐 hash 不变，无额外文件/路径修改。正确返回文本、测试命令 exit 0 或模型自称通过都不能代替宿主独立执行。隐藏测试仅向模型回传通过/失败数量，不暴露 expected values；评分/测试文件不可被修改。
- 严格任务成功：上述事实 6/6、state 5/5 且两者均无 FP、pending 精确、旧值 0/3、业务全部通过且文件约束通过。另列各维度，避免一项权重掩盖严重错误。

失败 lane 仍进入任务成功率分母；未执行的行为项计未完成，不能当成成功或静默删掉。事实没有返回时 recall=0、precision=null；工具记录缺失单列。每 model×task×arm 五重复时：任务成功分母 5，facts 30，旧值机会 15，pending 10，state 25，业务用例 settlement 35 / redirect 40。one-repeat 观察对应分母为 1、6、3、2、5、7/8。不得把 7 个用例或 6 个事实当成 7/6 个独立模型样本。

## 5. 压缩、成本与耗时口径

主要上下文指标是**压缩后的第一条真实 continuation 服务端 input_tokens**，双方同一提示/工具定义，避免后续不同工具行为混淆。保留原始 usage 数字与来源字段；不把 opaque body bytes、Pi 估计、`ceil(decodedBytes/4)` 或本地 summary 字数称为服务 token。该指标是服务计费/处理输入的可见代理，不等于解密后的有效语义容量；真正内部有效 context 若服务不提供，写 unknown。

当前 installed `openai-responses-shared.js:493–504` 将服务 input_tokens 拆为 `Pi.input = total - cacheRead - cacheWrite`。因此必须分别保存 total input、非缓存 input、cacheRead、cacheWrite、output、reasoning；output 已含 reasoning，不再相加。缓存字段缺失记 null，不能依 Pi 默认 0 断言 cache miss。检查分项和总数一致，不混用 native message.usage 与 remote SSE 原始口径。需补记 `input_tokens_details.cache_write_tokens` 与总 total_tokens。

每 lane 分别报告 summary 阶段（含 fallback 的全部实际请求）、第一条 continuation、所有 continuation 合计、总计的 token 向量。summaryCost 首先指这一独立向量；catalog cost 是静态估价，订阅实付金额未知，禁止把 0 写成免费。没有无压缩对照真实请求，本轮只可报告 remote/native 后续 input 比率，不能编造“相对原历史减少 X% 服务 tokens”。

耗时使用单调时钟，记录发起 compact→checkpoint 确实提交、dispatch send→headers/first event/terminal、continuation→工具完成与最后响应、端到端用户等待；setup/安装不进入压缩耗时，local tool/test 用时单列。summary 快但总续做慢只能报告 tradeoff。至少五对/模型/任务，报告每对差值、各臂中位数与 min/max；失败/超时的等待和失败率单列，不当作快速成功，也不从总开销删掉。脚本等待有统一预先冻结的单 lane 180 秒/整次实验 90 分钟上限，触发后取消且保留 reservation，不无限等待。

按 repeat、model、task 的固定轮转调度，arm 顺序采用计划中的奇偶公式，做到每个 cell AB/BA 交替、全局均衡；禁止先跑完所有 native。独立 session/工作区、相同网络条件、同样的 cache warming 控制。summary 原生使用 cacheRetention=none，remote 路径不同，不能假装能清除服务缓存；保存实际 cache routing 和命中率，按 cache strata 报告。不因缓存结果不好重新抽样。五对不足分层或缓存/顺序偏差无法解释时，速度结论 inconclusive。

使用同一机器记录 core/load、进程 CPU、bytes、请求各阶段和工具耗时作为瓶颈证据；不能从源码猜网络就是瓶颈。如需 profiler 只能离线或单独已授权非计分请求，不可偷偷增加 warmup/诊断调用。若不能解释限制因素，依 benchmark-checklist 不给速度优势结论。

## 6. 两阶段与预算

阶段一 compatibility pilot：每个模型 native summary→一次无工具 continuation，以及 remote summary→一次无工具 continuation；共 4/model，两个模型最多 8 dispatch。使用 settlement 的同一原始 history 与默认切分；只问是否准备好续做，不评分、不修改文件。pilot 与正式样本 session 完全隔离。确认实际编码 target、none reasoning、cap=1000、正常终态 usage、native 可读/remote opaque checkpoint 和真实后续消费。

cap 目前由执行器 payload hook 注入；installed Codex encoder 不发 maxTokens 对应字段。服务拒绝 cap、usage 缺失无法核对、返回超 cap、length/incomplete、模型不可用或无 opaque 时，停止该模型；cap/输出预算类错误停止整项实验，根判断后续方案，不移除 cap、换模型、自动扩额度或降级成可比较的“remote”。服务接受且本样本用量未超限只证明本次观察，不证明所有未来请求都能遵守。pilot 未通过不能进入该模型正式对比。

阶段二：每 lane 预计 1 次压缩，最多 5 次 continuation（记录状态、读文件、修改、运行测试、最终回复）。正常上界 6/lane；不够完成就保留失败。工具的本地执行本身不是 provider dispatch，但工具返回后的每次模型继续均是。fallback、分片或多摘要也计数：compact 最多 2，且 lane 总量仍最多 6，不额外再给 5 次 continuation。自动重试=0，无隐形评分/恢复/迁移/修复请求。额外流程需要新方案。

| 选择 | 模型×任务×重复×两臂 | 正式 lane | pilot | 正式 dispatch 上界 | 共享硬上限 |
| --- | --- | ---: | ---: | ---: | ---: |
| 仅兼容 pilot | 无正式评分 | 0 | 8 | 0 | 8 |
| 最小质量观察 | 2×2×1×2 | 8 | 8 | 48 | 56 |
| 最小五对比较 | 2×2×5×2 | 40 | 8 | 240 | 248 |

共同每 dispatch 1000 output reservation、64000 estimated-input ceiling；保守总上限依次为 output 8000/56000/248000，estimated input 512000/3584000/15872000。这些是最坏预约上限，不是预测消耗，更不是服务 token 额度。发送前按真实 encoded body 预约；离线预检若不满足 ceiling，停止而非把字段变大。两个模型共享同一本 durable ledger；pilot 消耗计入所选总额，只执行一次，不是把 8+56+248 累加。

若只获一个模型的范围，单模型 pilot=4；两任务一重复比较=24，总上限28；两任务五重复=120，总上限124。它只支持该模型结果，另一个明确写 not-run。最小一次 matched pair 只能作案例观察，不能声称速度优势。质量五重复仍只限定这两个合成任务，不能外推一般开发质量。

现有 grant 上限 12、input 120000、targets 固定 Sol+DeepSeek，即使 8 次 pilot 在 dispatch 数上看似放得下，也不代表目标和 input 获授权。**本交付没有扩大任何预算或创建 grant。** 根结合当前用户授权范围决定实际模型、阶段和共享硬上限，先完成 runner 变更审查。未获匹配范围就保持 disarmed，不拿旧 12 次配置静默执行新实验。

## 7. 预注册判定规则

判断按 model×task 分格，不把不同模型的绝对 token/时间混成单一胜率。

- 功能可用：真实 opaque checkpoint 被后续 Pi 请求消费且实际任务测试成功，只支持该样本业务功能。fallback 成功可记产品恢复可用，但 remote opaque 比较失败。
- 质量优势/劣势：五对中至少四对严格成功状态朝同一方向改变，零反向，旧信息采纳率不恶化，才给该 cell 的“观察到优势/劣势”；其余列原始计数及区间，不作一般性质量结论。该阈值是保守决策规则，不是显著性检验。不能只按通过子用例数投票。
- 上下文/速度优势：五对完整、可比较、质量不降；中位改善至少 10%，每对方向一致，改善大于两臂内最大的相对范围（range/median）。速度还需瓶颈证据及 cache/order 未构成替代解释。劣势为对称规则。成功对的统计同时展示全体失败率，不能以幸存者集合宣称总体胜利。
- 无可测差异：质量向量相同，中位相对差在 ±5% 内且每臂相对范围≤5%；仅写本样本/该精度下未见差异，不称统计等效。5–10% 或散布大、方向混合归 inconclusive。
- tradeoff：更省 input 但质量下降、更快但失败更多、summary 便宜而多轮续做更贵，都展示完整向量，不给无条件总赢家。无总体优势但确有某维度劣势时仍如实报告劣势。
- inconclusive：cap 不支持、未完整成对、usage 不可比、样本少、噪声或瓶颈不明、缓存偏差、数据/边界预检不满足。写明缺口；“未找到远端优势证据”不能偷换成“远端没有效果”。

## 8. 后续最小实现清单与清理

不用正在审查的执行器直接硬改测试任务。独立增加 comparison runner，复用已审查的安装/隔离、send boundary、预约/fsync/锁、redaction 和清理机制；旧 P6 功能流程继续保留。只在新 runner 跑 through installed AgentSession.compact/prompt，不使用聊天代理生成 benchmark 响应。

所需 schema 调整：新 design/experiment/grant 版本分离；绑定 planHash、datasetManifestHash、scorerHash、toolSchemaHash、packageHash、installedSourceHashes、scheduleHash 和两个 exact targets。授权预算不再硬编码旧 Sol/DeepSeek 的 12 次，改为根批准的明确 profile 与 per-model/phase/lane/shared ceilings；不是删上限。仍默认拒绝未知目标/缺 cap/未知 schema。

ledger row 新增 experiment/model/task/repeat/pair/arm/assignedMethod/effectiveMethod/phase/toolRound/attempt、history/workspace/tail/cut hashes、failureStage、reservation/sent/terminal 状态、原始与规范化 usage、cache 缺失标志、单调计时和 outcome。不可再按 body 子串猜 native/source 类型；由已绑定调度与实际 payload 特征双校验。reserve 未确认发送不退款；恢复只使用剩余额度，禁止新 ledger 重启同一试验。失败保留 assigned arm，不把 remote fallback 重标 native 提升成功率。

runner 还需：固定五轮上限；一次 record_checkpoint 工具与严格 JSON schema；隔离只读 oracle 的测试工具；源文件变更/保护文件 hash 校验；完整失败分母；raw 数值 allowlist；公共结果不导出 opaque/auth。结束记录本任务进程与监听端口清理。上述是实施建议，不是本轮已实现的新执行器。

本轮只有同步文件读取、生成和 Node oracle 校验；所有调用已退出，无后台进程或服务、无监听端口创建，未安装依赖。进程清理记录见 [cleanup.json](cleanup.json)。剩余未知：实际模型资格、cap 接受/执行、remote 协议可用性、真实 usage 完整性、真实质量/压缩/等待，以及候选的真实 Pi 切分与编码预检。没有可填入报告的真实 benchmark 数字。
