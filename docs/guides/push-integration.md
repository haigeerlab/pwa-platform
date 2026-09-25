# Push 接入说明

`@pwa-platform/push` 提供订阅、取消订阅与平台 Push 格式契约；平台不会发送请求、保存订阅或替应用发送 Push。推送是渐进增强：先做特性检测，基础体验不能依赖它。平台 worker 的格式与点击规则见 [ADR-0021](../adr/0021-push-handling-in-the-platform-worker.md)。

## 订阅与登出

应用在**用户手势**中调用 `subscribePush`，并自行把返回的 `PushSubscriptionJSON` 发送给自己的后端。调用方必须传入已注册 worker 的精确 scope；本包不会注册 worker，也不会自行请求订阅以外的权限。

```ts
import { subscribePush, unsubscribePush } from "@pwa-platform/push";

const target = { scope: "/app/" };

subscribeButton.addEventListener("click", async () => {
  const subscription = await subscribePush(target, {
    applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  });
  await api.savePushSubscription(subscription);
});

async function signOut(): Promise<void> {
  const subscription = await unsubscribePush(target);
  if (subscription !== null) {
    await api.deletePushSubscription(subscription);
  }
  await pwa.logout();
}
```

登出前必须先取消订阅并通知后端。`logout()` 会注销 worker，使该注册的订阅失效；这不能替代删除后端存储的订阅。恢复 worker 发布后同样会取消订阅，因此后端还必须把发送时得到的订阅失效响应视为清理信号。

## 后端发送

后端可以自行选择 Web Push 库；下例以 `web-push` 为例，它只是业务服务的依赖，**不是**本仓库依赖。先用 `@pwa-platform/push/server` 构造并校验格式，再将字符串交给所选库发送。

```ts
import webpush from "web-push";
import { createPushPayload } from "@pwa-platform/push/server";

const payload = createPushPayload({
  title: "有一项待处理的审批",
  body: "打开应用查看详情",
  tag: "approval-42",
  url: "approvals/42",
  data: "approval:42",
});

await webpush.sendNotification(subscription, payload);
```

格式是封闭的 UTF-8 JSON，编码后最多 **3072 字节**。`title`、`body` 等显示内容不得放入令牌、凭据、订阅地址或授权信息；只传不透明事件标识，应用打开后重新向后端获取数据并重新校验权限。

不合格、为空或无法解析的 Push 不会由平台 worker 显示应用通知；Chrome 仍可能显示浏览器自己的通用提示，这是 `userVisibleOnly` 的浏览器行为。推送点击目标也只会落在当前应用的源与 scope 内，范围外地址会回退到 scope 根路径。

## 本地联调

业务后端就绪之前，可以用 React 示例和两个本地脚本在本机走通"订阅 → 发送 → 展示 → 点击"。这些都是**测试工具**，只存在于不发布的示例包中，不能用作生产后端：生产环境请使用上一节的 Web Push 库，并妥善保管 VAPID 私钥。

1. 先在仓库根目录执行 `pnpm build`（示例的构建与 `push:send` 都使用各平台包的构建产物），再构建并启动 React 示例：`pnpm --filter @pwa-platform/examples-browser-e2e exec vite build --config apps/react/vite.config.ts`，然后执行 `pnpm --filter @pwa-platform/examples-browser-e2e exec vite preview --config apps/react/vite.config.ts --port 4173`。
2. `pnpm --filter @pwa-platform/examples-browser-e2e push:keys` 生成 VAPID 密钥，写入被 git 忽略的 `packages/examples-browser-e2e/.push-demo/vapid.json`（权限 `0600`），终端只打印公钥。
3. 在 Chrome 中打开 `http://localhost:4173/app/`，把公钥粘贴到页面底部的 Push 面板，点击 Subscribe 并允许通知，再点击 "Copy subscription JSON"。页面不会显示订阅地址。
4. 把剪贴板保存到被 git 忽略、只有本人可读的 `.push-demo/` 目录中（在仓库根目录执行 `(umask 077; pbpaste > packages/examples-browser-e2e/.push-demo/sub.json)`），然后执行 `pnpm --filter @pwa-platform/examples-browser-e2e push:send --subscription .push-demo/sub.json --title "测试" --url /app/`（路径相对于示例包目录）。脚本只打印 HTTP 状态码：`201` 表示推送服务已接受；`404`/`410` 表示订阅已失效。用完删除订阅文件。订阅地址本身就是向该浏览器推送的凭据，不要放在共享目录里。

推送服务在公网上（Chrome 使用 FCM），因此本地联调需要联网。

**自动化测试注意事项**（`pnpm --filter @pwa-platform/examples-browser-e2e test:browser:network`，不在默认门禁中）：

- 必须用持久化的浏览器 profile（Playwright 的 `launchPersistentContext`）。Chrome 在无痕式的非持久化 context 中拒绝推送订阅，报 `AbortError: Registration failed - permission denied`。
- 不要在通知刚创建时紧密轮询 `registration.getNotifications()`（例如每 100 ms 一次），这会让 Chrome 丢掉这条通知；先等待片刻，再稀疏地查询。
- 在本机的自动化运行中，偶尔有刚创建的订阅在第一次发送时就被推送服务以 `410` 拒绝（2026-09-24 的 15 个新订阅中有 3 个，其中 1 个约 5 秒后恢复）。原因未知，与平台无关；联网套件会重试并在测试注解中记录。这是自动化环境中的观察，不改变"后端把失效响应视为清理信号"的要求。
