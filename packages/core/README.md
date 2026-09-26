# @pwa-platform/core

把已声明的身份、安装信息、策略、部署拓扑和宿主构建文件编译成确定性的 `PwaPlan`。

## 谁会使用

本包主要供构建适配器使用。Vite 应用应配置 `@pwa-platform/vite`，不要自行拼装宿主文件清单后调用 core。只有在开发新的构建适配器、发布检查器或平台集成时，才需要直接依赖本包。

```sh
npm install @pwa-platform/core
```

要求 Node.js 22 或更高版本。包为 ESM。

## 公开 API

| 导出 | 作用 |
| --- | --- |
| `compilePlan(input)` | 校验输入并生成 `PwaValidationResult<PwaPlan>`；不抛出业务校验错误 |
| `PwaCompileInput` | identity、install、policy、topology 与 host build output 的组合 |
| `PwaCompileHostOutput` | 构建公共路径、worker／manifest 文件名和宿主文件清单 |
| `PwaHostBuildFile` | 相对路径、是否带内容指纹以及宿主计算的内容哈希 |

```ts
import { compilePlan, type PwaCompileInput } from "@pwa-platform/core";

const result = compilePlan(input satisfies PwaCompileInput);
if (!result.ok) {
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic.code, diagnostic.path);
  }
  throw new Error("PWA plan compilation failed");
}

const plan = result.value;
```

## 编译器完成的工作

- 再次校验所有公开契约，而不是信任 TypeScript 类型。
- 解析单 Origin 或共享 Origin 拓扑，阻止 scope 与子应用边界冲突。
- 按完整路径段编译资源规则和基础拒绝规则。
- 从最终构建文件中选择预缓存条目，并校验离线页确实存在。
- 把 PwaPolicy v2 离线写和 v3 公共读取缓存限制编译成 worker 可消费的配置。
- 从 identity 派生隔离的缓存命名空间。
- 输出确定顺序的诊断和计划，便于发布记录审计。

## 宿主适配器责任

调用方必须给出**最终**构建输出的真实路径和内容哈希。错误地把未发布文件列入清单、把会变化的文件标成 fingerprinted，或在计划生成后继续改写 JS／CSS，都会破坏预缓存完整性。`@pwa-platform/vite` 已负责收集、编译并复核这些事实。

## 安全边界

- core 不读取网络、不写文件、不生成 Service Worker，也不执行发布。
- 计划不会把私有、写入、流式或未分类请求自动升级为可缓存。
- `compilePlan` 成功只证明配置与构建事实内部一致，不证明生产响应头、旧资源保留或真实浏览器行为。

通常请从[Vite 接入](https://github.com/haigeerlab/pwa-platform/blob/main/website/start/choose.md)开始；适配器作者可结合 `@pwa-platform/contracts` 与 `@pwa-platform/build-verifier` 使用本包。

License: MIT.
