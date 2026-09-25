# Proposal: PWA 访问入口灾备与域名迁移
<!-- spec-guard-proposal:v1 id=pwa-entry-resilience -->

## Summary

新增一个独立治理的 PWA 访问入口恢复能力，用于当前 Origin 正在迁移或不可用的场景。它为已安装应用提供最小化、经用户确认的已验证备用入口引导；不承诺 Service Worker、会话、缓存或安装身份可以跨 Origin 延续。

已安装的 PWA 绑定其原始协议、主机和端口，因此需要该能力：当当前入口失效而缓存应用壳仍可启动时，产品能够展示可信恢复页、提供预验证的备用入口，并由用户主动打开新 Origin。新 Origin 拥有自己的 manifest、Service Worker、存储与登录状态。

预期行为必须受到以下约束：

- 正常时期，客户端可从独立发现源刷新已签名的恢复入口清单，完成校验后只保留最新、未过期的最后已知可信版本；构建期恢复种子是后备信任根。
- 事故期间，客户端只能使用内置种子、仍有效的最后已知可信清单，或可独立访问且经内置公钥验证的发现源。不得因为主入口失效而接受任意 URL。
- 恢复必须是清晰的用户体验，而非静默重定向。用户在看到目标主机、迁移原因和有效期后，显式选择一个展示的 HTTPS 入口。
- 只有通过校验的相对返回路径、迁移标识或服务端签发的一次性交接码可以跨 URL 边界；访问令牌、刷新令牌、Cookie、个人数据和可重放凭据绝不能进入 URL、浏览器历史或客户端日志。
- 新 Origin 通过受支持的 SSO/OIDC 授权码加 PKCE，或服务端一次性交接流程重新建立会话；不得读取或复制旧 Origin 的 Cookie、Cache Storage、IndexedDB 或 Service Worker 状态。

实现必须覆盖签名清单校验、过期处理与密钥轮换、恢复界面、用户确认导航、返回路径校验、可安全审计的诊断、撤回和故障演练。Vite 适配器负责打包并发布恢复产物，浏览器测试 harness 为已缓存恢复页提供真实浏览器证据。实现必须拒绝无效签名、未知密钥、过期清单、未批准 Origin、开放重定向形式和编码绕过的返回路径；对于原应用壳无法启动的浏览器或故障形态，必须如实记录。

本 Proposal 不包含绕过浏览器同源保护、单次网络失败后的自动切域、通过 URL 传输令牌、Push 投递、域名注册自动化或生产级 SSO 服务端实现。这些仍属于本 Proposal 之外的产品、安全和运维决策。

## Capability map baseline

| Field | Value |
| --- | --- |
| Remote | origin |
| Default branch | main |
| Commit | e4f8c1e1a3c53aeeac49713f75e99dffd5539abe |
| Capability map | spec/CAPABILITY-MAP.md |
| Goal digest | 93b7d9b1c463 |
| Build order | contracts-foundation → policy-compiler, platform-governance, browser-test-harness → workbox-engine → sw-runtime → client-runtime, build-verifier → vite-adapter → vue-react-adapters → examples-browser-e2e → ssr-adapters, shared-origin-topology, push-module, offline-write-extension |

### Module digests

| Module id | Row digest |
| --- | --- |
| contracts-foundation | 2db83d2b0b48 |
| policy-compiler | 908b7bb27c18 |
| platform-governance | 11995952727a |
| browser-test-harness | 80c8d3dc3f12 |
| workbox-engine | aadb84708f8b |
| sw-runtime | 2d96266076e9 |
| client-runtime | 3de5ca551219 |
| build-verifier | 3b729b456e18 |
| vite-adapter | 865d8066d65c |
| vue-react-adapters | 2517367fe6f9 |
| examples-browser-e2e | 4e2fafe8b8c1 |
| ssr-adapters | 40785e8bba83 |
| shared-origin-topology | 8f58409776a6 |
| push-module | 74877b7e1c88 |
| offline-write-extension | 51e9adf19c84 |

## Change

| Field | Value |
| --- | --- |
| Type | new-module |
| Module id | pwa-entry-resilience |
| Responsibility | 在不突破 Origin 隔离的前提下，提供已签名恢复入口清单、由 Vite 发布的恢复引导、用户确认的跨 Origin 迁移、安全路径续接和恢复演练验证。 |
| Depends on | contracts-foundation, policy-compiler, platform-governance, browser-test-harness, sw-runtime, client-runtime, build-verifier, vite-adapter |
| Build-order anchor | end |

## Tracker contract

| Field | Value |
| --- | --- |
| Proposal id | pwa-entry-resilience |
| Identity label | proposal |
| Stage label namespace | proposal-stage: |
