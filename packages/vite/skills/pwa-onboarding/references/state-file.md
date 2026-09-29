# 接入状态文件

接入要跨好几次会话（本地 → 部署 → 环境验证 → 排障），新会话的你不知道上次走到哪一关、人确认过什么。状态文件就是这份记忆，也是最终的审计记录。

## 位置与名称

业务仓库根目录的 `PWA-ONBOARDING.md`。是否提交由业务方决定：**询问，默认建议提交**（团队共享，不含密钥）。

## 格式

文件头的 front matter 存机器可读字段，正文是人可读的记录。

```markdown
---
skillVersion: 0.2.3
packageVersion: 0.2.3
language: zh-CN
profile: shell-offline-update
existingPwa: false
gates:
  A: done
  "0": done
  "1": in-progress
  "2": skipped
  "3": pending
  "4": pending
  "5": skipped
  "6": pending
---

## 决策记录

- 2026-09-30 G2 身份字段：origin=https://example.com，scope=/，serviceWorkerUrl=/sw.js，manifestId=/，environment=production（人确认）

## 证据

- 关卡 1：vite build 通过，无诊断（2026-09-30）
```

字段取值：

| 字段 | 取值 |
| --- | --- |
| `skillVersion`、`packageVersion` | 记录时本 skill 的 `metadata.version` 与 `@pwa-platform/vite` 的版本 |
| `language` | `zh-CN` 或 `en` |
| `profile` | `shell-offline-update`（默认：应用壳、离线页、更新提示）或 `shell-offline-update-runtime-cache`（另开公共运行时缓存） |
| `existingPwa` | `true` 或 `false`：线上是否已经是 PWA |
| `gates` | 键固定为 `A`、`0`、`1`、`2`、`3`、`4`、`5`、`6`；值为 `pending`、`in-progress`、`done`、`skipped`、`blocked` |

## 什么时候更新

- 每个关卡开始时置为 `in-progress`，结束时置为 `done`、`skipped` 或 `blocked`。
- 人每确认一个闸门（G1–G5），立刻在"决策记录"追加一行：日期、闸门、**确认的具体内容**、"（人确认）"。
- 关卡 3 之前，人声明某个域名属于业务方时，记下域名、日期和"人声明"，没有这条记录不对外发请求。
- 每个关卡的观察结果与命令的结论追加到"证据"，写结论，不贴大段输出。

## 续做

启动时发现该文件：

1. 读取 front matter，核对记录的事实是否仍成立：包版本是否变了，关键文件是否还在。变了就告诉用户。
2. 从第一个不是 `done` 或 `skipped` 的关卡继续。
3. 先说明"上次到哪里、这次从哪里开始"，再动手。

## 绝不写入

- **令牌**、**Cookie**、密码、任何凭据。
- **响应体**和用户数据。
- **服务器配置**（nginx、CDN 的配置内容）。
- 公开域名以外的内部地址。

决策记录里只写"确认了什么"，不写敏感原文。
