# 手机端运行时缓存探针

手动验证辅助，**不是自动化测试**，不进入任何门禁。用真机或模拟器跑 `runtime-cache.spec.ts` 里与浏览器行为相关的场景，
补充自动化只覆盖桌面 Chrome 的缺口（见 `tasks/public-read-cache/verification.md`）。

## 用法

```sh
pnpm --filter @pwa-platform/sw-runtime exec playwright test browser-tests/runtime-cache.spec.ts -g "online read writes"   # 只为重建 browser-build/site-v3
node packages/sw-runtime/browser-tests/phone-probe/serve.mjs --port 8080     # 日志默认写到 phone-probe/server.log
```

1. Android 真机或模拟器：`adb reverse tcp:8080 tcp:8080`；iOS 模拟器直接访问本机 `localhost`。
2. 在手机浏览器打开 `http://localhost:8080/app/probe.html`（首次访问不受 worker 控制），再打开一次
   `http://localhost:8080/app/probe.html?auto=1`：页面被接管后自动跑完全部场景。也可以手动点 **Run all scenarios**。
3. 在 Mac 上读 `server.log` 里的 `PASS` / `FAIL` / `RESULT` 行，同一轮的行带同一个方括号里的轮次 ID。
4. 测完打开 `?cleanup=1` 注销 worker 并删除缓存，再关掉服务、`adb reverse --remove tcp:8080`。

## 覆盖与局限

覆盖：`network-first` 在线写入、断网命中、恢复后取新；七类被拒响应不入缓存；`Set-Cookie` 不带 `private` 会被缓存；
SWR 旧值与后台更新；动态 HTML 的在线写入、断网渲染与未访问路径回退离线页。

局限（记录证据时必须如实写明）：

- 页面在本机 `localhost`，不是真实 HTTPS 部署；响应头由 `serve.mjs` 模拟，不是业务接口的真实响应。
- "断网"是服务器重置连接，不是手机的飞行模式；`navigator.onLine` 不会变。
- 不覆盖重新发版后的 worker 更新、带 `Authorization` 的页面导航、配额耗尽；这些只有桌面自动化覆盖。
- 页面用 iframe 触发导航请求，不是顶层导航。
- 部分手机系统（如 MIUI）会拦截 adb 注入的点击，因此提供 `?auto=1`，不需要改手机的安全设置。
