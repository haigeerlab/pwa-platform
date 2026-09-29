# 关卡 0：采访

进入条件：关卡 A 通过。目的：在动手配置之前，问清楚会决定配置的事实，并把答案记下来。

## 怎么问

- 一次问 1–3 题，先说出你探测到的默认值，再问是否接受。用户说"不清楚"就如实记下，不要替用户回答。
- 没有默认值的题（Q4、Q5）必须问，不能跳过。Q5 回答了不止生产环境时，写法见 [gate-1-config-file.md](gate-1-config-file.md) 的"多个环境"，在关卡 1 才读取。
- 每问完一批，立刻把答案写进 `PWA-ONBOARDING.md`（格式见状态文件参考），再问下一批。

## 题库

| 编号 | 问题 | 默认 | 影响 |
| --- | --- | --- | --- |
| Q1 | 界面语言 | 中文，可选英文 | 三处各自设置：`PwaUpdateNotice` 的 `locale`（运行时，默认 `zh-CN`）、`offlinePage.locale`（构建时）、安装信息里 `name`、`description` 的书写语言（由业务在安装信息里写，不是开关）；同时决定你之后对话与报告的语言 |
| Q2 | 框架、版本与构建（先自动探测再确认） | 探测结果 | Vite ^5 或 ^8，Vue ^3.4 或 React ^19.2，Node.js 22.12 及以上；不满足应已在关卡 A 停下 |
| Q3 | 线上是否已经是 PWA | 否 | 是则走存量 PWA 分支（关卡 A），记入 `existingPwa` |
| Q4 | 最终 origin、`base`、同域是否还有别的应用、PC 与 H5 是否同域不同路径、服务器类型（nginx / CDN / Cloudflare / 不清楚） | 无（必须回答） | 决定 `mountPath`、`scope`、`serviceWorkerUrl`；同域多应用要共享 origin 登记表，`topology` 不再是 `standalone-origin`；服务器类型只用于关卡 3 的注意事项 |
| Q5 | 有哪些环境（开发、测试、生产） | 无（必须回答） | 每个环境独立的 `environment` 与 `cacheNamespaceSeed`，不复用生产身份 |
| Q6 | 是否需要安装能力（manifest、图标、安装提示） | 是 | 是则准备安装信息与真实图标；否则 `install: null` 且策略里 `install: { enabled: false }` |
| Q7 | 是否有长期不刷新的独立窗口用户 | 是 | 是则保留 `updateCheck.intervalMs`（默认 1_800_000，即 30 分钟，最小 60 秒）；否则可去掉。这是页面可见时调用 `registration.update()` 的定时器，不是 Periodic Background Sync |
| Q8 | 是否有未保存内容的场景（表单、编辑器） | 无（问了才知道） | 有则要求传入 `reloadPage` 做保护；默认不自动刷新页面 |
| Q9 | 是否需要公共运行时缓存 | 否 | 是则 `profile` 记为 `shell-offline-update-runtime-cache` 并进入关卡 2；否则关卡 2 记为 `skipped` |
| Q10 | 是否需要 Push 或离线写入 | 否 | 是则说明：这两项的相关包目前仍是工作区私有包，业务应用还不能使用；这一部分停下，其余继续 |

## 产出

写入 `PWA-ONBOARDING.md`：`language`、`profile`、`existingPwa`，以及 Q4、Q5 的具体答案（写"决策记录"，不含密钥）。关卡 0 置为 `done`。

## 通过标准

Q1–Q10 都已回答或明确采用默认。

## 停止条件

- Q10 答"需要"：在该部分停下并说明原因，不要用别的方案硬做。
- Q4 显示同域还有别的 PWA：先与人确认登记表与"先发根应用、后发子应用"的顺序，再继续。
- 用户对 Q2 探测到的版本有异议：以 `package.json` 与锁文件为准，把分歧告诉用户。
