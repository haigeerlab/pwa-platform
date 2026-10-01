# @pwa-platform/build-verifier

校验 PWA 构建和发布事实：产物、响应头、身份基线、共享 Origin 发布顺序、旧指纹资源保留、HTML 缓存头与 worker 主脚本 MIME。

## 谁会使用

- `@pwa-platform/vite` 在构建末尾使用产物校验。
- 发布 CLI、CI 或部署系统可直接使用 `verifyRelease()` 组合发布检查。
- 普通页面运行时代码不应导入本包；它不会注册 worker，也不会在浏览器中运行。

```sh
npm install @pwa-platform/build-verifier
```

要求 Node.js 22 或更高版本。包为 ESM。

## 一次生成发布报告

```ts
import { verifyRelease } from "@pwa-platform/build-verifier";

const observed = {
  "/app/sw.js": { "cache-control": "no-cache", "content-type": "text/javascript" },
  "/app/assets/app-a1b2.js": { "cache-control": "public, max-age=31536000, immutable" },
};

const report = verifyRelease({
  plan,
  published: ["/app/index.html", "/app/assets/app-a1b2.js", "/app/sw.js"],
  observed,
  baseline: storedIdentityBaseline,
  retention: retentionSnapshot,
  htmlObserved: {
    "/app/": { "cache-control": "no-cache" },
  },
  workerMimeObserved: observed,
});

if (!report.ok) {
  for (const diagnostic of report.diagnostics) {
    console.error(diagnostic.code, diagnostic.path);
  }
  process.exitCode = 1;
}
```

`verifyRelease()` 只运行你提供了输入的检查。省略字段代表“未检查”；因此空报告也会是 `ok: true`。发布门禁必须同时核对 `report.checks` 是否覆盖预期检查，不能只看 `ok`。

## 公开 API

| 分组 | 导出 | 作用 |
| --- | --- | --- |
| 聚合 | `verifyRelease`, `PwaVerifyReleaseInput` | 按固定顺序生成一个 `PwaVerificationReport` |
| 产物 | `verifyArtifacts` | 检查计划引用的文件是否实际发布 |
| 响应头 | `verifyResponseHeaders`, `verifyHtmlHeaders`, `verifyWorkerScriptMime` | 判断 worker、manifest、指纹资源和 HTML 的缓存头，以及 worker 主脚本的 JavaScript MIME |
| 身份 | `readIdentityBaseline`, `compareIdentityBaseline`, `BASELINE_FIELDS` | 读取并比较生产 identity 基线 |
| 共享 Origin | `isSharedOriginChild`, `verifyReleaseOrder` | 确认根应用已排除子应用 scope，再发布子应用 |
| 保留 | `verifyReleaseRetention` | 检查当前和历史发布记录要求的指纹资源仍可取用 |
| 覆盖 | `verifyReleaseGateCoverage` | 检查门禁声明是否覆盖要求场景 |
| 必需集 | `requiredReleaseChecks` | 按计划拓扑返回发布协议规定的机器必需检查，直接传给 `verifyReleaseGateCoverage` |
| 工具 | `parseCacheControl`, `hasDirective` | 解析并判断 `Cache-Control` 指令 |
| 报告 | `VERIFICATION_CHECKS`, `PwaVerificationReport` | 标准检查名、逐项结果和诊断 |

## 数据由调用方采集

本包是**纯判断器**，不会请求生产 URL、读取对象存储清单或发现部署历史。调用方必须：

1. 从实际部署收集响应头和发布文件路径；
2. 从受控位置读取身份基线与上一版本记录；
3. 跟随同源 HTML 重定向后记录最终响应头；
4. 把完整事实传给对应检查，并保存报告作为发布证据。

## 不能证明的事情

报告通过不等于真实安装、更新、离线或恢复行为通过，也不包含性能、可访问性或安全扫描。浏览器和真机门禁仍需单独执行。发布流程见[部署与发布](https://github.com/haigeerlab/pwa-platform/blob/main/website/operations/release.md)。

License: MIT.
