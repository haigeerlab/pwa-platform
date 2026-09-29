# 分层架构与构建链路

平台将**业务声明、策略编译、构建输出和浏览器运行时**分开。这样一套缓存安全基线可以服务不同框架，业务应用不需要持有 Service Worker 实现。

~~~text
业务应用（界面和业务逻辑）
  │  PwaIdentity + PwaInstallMetadata + PwaPolicy
  ▼
页面侧（运行时依赖链，箭头表示“依赖”）
  Vue / React 绑定 ──▶ client-runtime ──▶ sw-runtime ──▶ engine-workbox
                                                          （封装 Workbox）

构建侧
  Vite 适配器 ──▶ core             编译 PwaPlan
              ├─▶ build-verifier   核对最终产物
              ├─▶ client-runtime · sw-runtime · engine-workbox
              │                    （把运行时代码与配置注入产物）
              └─▶ contracts

可选
  entry-resilience ──▶ vite

底层
  contracts：类型、schema、诊断。上面每个包都直接或间接依赖它，它不依赖任何平台包（仅依赖 zod）。
~~~

Vue / React 绑定只依赖 <code>client-runtime</code>；<code>client-runtime</code> 依赖 <code>sw-runtime</code>（共享消息格式），<code>sw-runtime</code> 依赖 <code>engine-workbox</code>。Vite 适配器直接依赖 <code>core</code>、<code>build-verifier</code>、<code>client-runtime</code>、<code>sw-runtime</code>、<code>engine-workbox</code> 和 <code>contracts</code>，但不依赖任何框架绑定。

平台 worker 自己**从不调用 <code>skipWaiting()</code> 或 <code>clients.claim()</code>**：新版本安装后进入等待，只有页面确认（<code>applyUpdate()</code> 发出的消息）之后才接管。只有恢复 worker 例外，它是事故处置手段，见[运行时生命周期](/architecture/lifecycle#异常恢复)。

## 从声明到产物

1. 应用提供身份、安装信息、策略和宿主构建产物。
2. <code>contracts</code> 校验输入；<code>core</code> 合并平台基线并生成可审计的 <code>PwaPlan</code>。
3. Vite 适配器根据计划生成 manifest、平台 worker、恢复 worker、离线页和预缓存清单，并向页面交付 <code>virtual:pwa-config</code>。
4. 构建末尾的校验器核对声明的资源与实际产物；上线后仍要额外核查响应头、保留期和浏览器证据。

依赖只向下流动。契约层不知道 Vue、React 或浏览器；worker 不引入框架及应用服务端代码。Workbox 是内部引擎，业务应用通过 <code>PwaPolicy</code> 声明意图，而不是配置 Workbox。

## 公开入口与内部实现

业务项目通常直接用 <code>@pwa-platform/vite</code> 和一个框架绑定。内部包虽然随公开包分发为传递依赖，却不是业务配置入口。完整选择见[包与公开入口](/reference/packages)。

## 关键设计理由

- **身份与策略分开**：身份决定浏览器和 URL 所有权，策略允许业务逐次发布调整缓存意图。
- **编译计划而非直接执行策略**：构建和运行时消费同一份规则结果，便于检查和审计。
- **默认拒绝缓存**：新增或未分类请求不会因为一条宽泛允许规则而悄悄进入缓存。
- **等待确认更新**：避免旧页面仍运行时新 worker 自动接管，减少混合版本风险。

继续阅读[缓存安全模型](/architecture/security)与[运行时生命周期](/architecture/lifecycle)。
