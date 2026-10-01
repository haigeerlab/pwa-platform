# 模块规格：portable-deployment

## 责任与边界

让 `@pwa-platform/vite` + `@pwa-platform/vue` 宿主只构建一次，所得相同字节的 `dist` 可部署到构建时未知的多个 HTTPS 域名。平台维持每个实际域名独立的 worker、安装、缓存和发布记录。本模块不提供部署器，也不扫描或改写任意宿主业务 URL。

## 公开契约

- `PwaViteOptions` 为判别联合：旧配置（省略 deployment）或显式 fixed 配 `PwaIdentity`（必有 HTTPS/loopback origin）；显式 portable 配 `PwaPortableIdentity`（无 origin）。运行时同样拒绝模式与身份不匹配、未知模式和显式 `origin: undefined`。
- `PwaPlanV4` 为可移植计划，`schemaVersion: 4`、`planVersion: 4`、`policyVersion: 3`、`deployment: { kind: "portable" }`，不含构建时 origin。旧 v1–v3 严格保留固定身份。`PwaOriginRegistryV2` 去掉 origin，且只能用于可移植计划；v1 保持原样。
- 可移植平台产物使用根绝对路径。构建拒绝完整 URL Vite base、HTML manifest 链接、`manifestId` 和其他平台配置 URL；v2 登记表中每个 `manifestId` 也须为根绝对路径。manifest、平台 worker、恢复 worker、离线页、虚拟模块及计划中均不得含宿主 origin。
- 发布验证调用方提交本次目标 HTTPS origin 和按目标域名采集的最终响应 URL、HTTP 状态码及响应头。缺路径、非 200 响应、重定向至其他源或路径、错误 origin 均失败。必需检查集合增加部署源检查；覆盖与检查结果分别判定。
- 首次发布缺基线必须显式审批。每个源的基线、历史和保留清单独立。可移植共享根/子在同一个目标源校验排除、登记表版本和发布顺序。

## 验收

1. 固定配置与 v1–v3 计划测试保持通过；缺 origin 不自动转 portable。
2. 一份 dist 在两个本地 origin 按字节相等部署，分别验证注册、控制、安装清单、离线和更新；两源缓存与注册不串用。
3. 可移植构建拒绝域名型 manifest 链接与跨源 base；发布验证拒绝缺证据及 A 的证据冒充 B。
4. 共享根 `/` 与子 `/m/` 的排除和发布顺序逐源通过与失败用例。
5. 类型检查、定向单元、构建、真实浏览器测试，以及运维和 onboarding 文档同步。
