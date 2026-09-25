# ADR-0014：构建校验的职责边界与报告形态

## 状态

已接受（2026-09-16）。落实 [ADR-0004](0004-identity-is-immutable-after-production-registration.md) 的身份不可变、[ADR-0008](0008-cache-namespace-and-identity-baseline.md) 的不可变字段集合与 [ADR-0009](0009-identity-migration-bumps-cache-namespace-seed.md) 的迁移要求，在工具一侧予以执行。

## 背景

[发布门禁](../operations/release-and-incident-runbook.md#发布门禁)起初有三项检查，编译器答不上来：预缓存条目是否真的出现在发布产物里、部署返回的响应头是否符合基线、本次身份是否仍与该槽位上一次生产发布相同。后来运行手册又规定带指纹资源的 R/R-1/R-2 与七天兼容窗口；这项检查同样需要当前部署可用路径与历史发布记录。`compilePlan` 只消费调用方递来的文件清单，既读不到磁盘、也读不到 CDN，更不知道上一次发布用的是哪个身份或有哪些历史资源仍可用。

[身份发布基线规则](../operations/identity-release-baseline.md)把比较规则写全了，但把"基线存在哪个路径"留给"build-verifier 交付时确定"；在此之前，发布门禁中的这一项一直靠人工核对。

同时，`core` 已经承担了一大批校验：`compilePlan` 内部调用 contracts 的三个 `validate*`，并产出九个 `compile.*` 诊断。新模块若重做这些判断，平台就会有两份真相源。

## 决策

- **只做编译器看不到的发布事实。** 产物一致性、响应头基线、身份基线比较，以及发布保留窗口（[ADR-0024](0024-release-retention-verification.md)）。计划本身的合法性直接调用 `validatePlan`；`compile.*` 系列判断一律不在本模块重新实现，也不重新编译计划去比对。
- **零网络、零写盘。** 响应头由调用方采集后传入，本模块不发任何请求；基线只读不写——写入基线是生产发布成功之后的动作，属于发布流程。`readIdentityBaseline` 是包内唯一触碰文件系统的模块，由导入闭包测试钉死；其余全是纯函数，因而发布检查可以在 CI 中离线运行。
- **基线按约定目录存放**：`<directory>/<slot>.json`，目录可配置，槽位名为 kebab-case。读取只解析 JSON，校验交给比较函数——文件能解析但不是身份时产出诊断，而不是抛异常。
- **比较不做任何归一化。** 身份字段与产物路径都按字符串逐字比较：大小写、结尾斜杠、百分号编码的差异都改变浏览器实际看到的 origin、scope 或缓存命名空间，那正是一次身份迁移。归一化会把迁移藏起来。比较的字段以显式清单写死（八个不可变字段加 `environment`），而不是从候选身份的键推导——推导会把 contracts 将来新增的字段静默纳入，等于悄悄扩大 [ADR-0008](0008-cache-namespace-and-identity-baseline.md) 定义的集合。
- **报告是结构化对象，诊断复用 contracts 的 `PwaDiagnostic`。** 八个 `verify.*` 码追加进 `DIAGNOSTIC_CODES`（与 policy-compiler 当初追加 `compile.*` 的做法一致），于是校验结果能与校验、编译的诊断统一消费，而不是另起一套体系。包内不生成 Markdown，呈现方式由调用方决定。
- **不判断"是否首次发布"。** 找不到基线时只报告事实（`verify.baseline-missing`）。这究竟是该槽位的首次生产发布，还是门禁失败，取决于 [ADR-0004](0004-identity-is-immutable-after-production-registration.md) 要求的人工评审记录，工具推断不出来。

## 影响

- 发布门禁中的"身份基线比较"与"类生产环境核对"两项，从人工核对改为工具执行；[身份发布基线规则](../operations/identity-release-baseline.md)中的路径悬念随本模块消除。
- vite-adapter 负责构建产物清单；发布编排器负责采集响应头、完整发布记录与当前可用路径，再显式调用本模块。Vite 的单次构建不得把发布保留窗口误报为已验证；shared-origin-topology 在同一份报告之上扩展多槽位的登记与排除。
- **空报告为 `ok: true`，这是一个需要调用方配合的默认。** 输入中省略某项即跳过该检查，报告里不出现它，`ok` 只为跑过的部分背书；全部检查全省略时 `checks` 为空、`ok` 为真——没有执行任何检查也就无从失败。因此把 `ok` 当作发布门禁的唯一判据是不安全的：调用方必须确认 `checks` 覆盖了它要求的项。
- **省略 `baseline` 与显式传 `undefined` 语义不同**：前者表示没做比较，后者表示查过、没有基线。"没查"与"查了没有"是两个事实，门禁必须能区分，因此实现按属性是否存在判定，而非按值是否为 `undefined`。
- 本模块自带 `Cache-Control` 解析：[包边界](../architecture/package-boundaries.md)规定生产代码不得导入测试包，无法复用 harness 的解析器。两份实现由一致性测试守护——对照的是判定结果而非内部结构，因为 harness 只公开 `expectCacheControl`，而两份实现本也只需在结论上一致。
- 公开/私有 HTML 的响应头暂不判定：`PwaPlan` 不记录哪些路由是 HTML、哪些属于私有数据，判定所需的信息不在计划里。这两类继续按发布门禁人工核对。
- 追加 `verify.*` 码改变了 contracts 的公开诊断码枚举，属于已交付包的契约变更，随本模块交付并同步更新声明快照。
- 规格见 [spec/build-verifier.md](../../spec/build-verifier.md)，依赖边界见[包边界](../architecture/package-boundaries.md)。
