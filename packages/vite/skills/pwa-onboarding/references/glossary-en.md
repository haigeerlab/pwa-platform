# English glossary

Read this when the user writes in English or asks for English. The documentation site is Chinese only, so when a reference is in Chinese, relay its content faithfully in English and keep the terms below consistent.

Keep diagnostic codes, package names, field names and commands **exactly as they are**; do not translate them.

## Report labels

| 中文 | English |
| --- | --- |
| 通过 | pass |
| 不通过 | fail |
| 警告 | warning |
| 无法判定 | undetermined |
| 实际 | observed |
| 后果 | consequence |
| 怎么改 | how to fix |
| 回到哪一关 | gate to return to |

`undetermined` is **never** a pass. Always say why it could not be determined.

## Terms

| 中文 | English |
| --- | --- |
| 关卡 | gate |
| 人工确认闸门 | human confirmation gate |
| 冲突目录 | conflict catalog |
| 存量 PWA | existing PWA |
| 接入状态文件 | onboarding state file |
| 应用壳 | app shell |
| 离线页 | offline page |
| 更新提示 | update prompt |
| 公共运行时缓存 | public runtime cache |
| 预缓存 | precache |
| 指纹资源 | fingerprinted asset |
| 服务端核对 | server check |
| 浏览器验证 | browser verification |
| 发布门禁 | release gate |
| 排障 | troubleshooting |

## Report sentence shape

For each item: `<label>` — observed: … — consequence: … — how to fix: … — gate to return to: …

When a gate ends, say which gates are done, which is next, and what needs a human decision.
