# 部署拓扑

## 独立 origin

常规拓扑是在每个 origin 与 scope 下对应一个 PWA 身份。这是默认方案，不需要中央登记表。

## 同源根路径与固定子路径

位于 `/` 的桌面应用与固定子路径下的移动应用可以拥有独立 manifest 和 worker。子 worker 具有更具体的 scope，但 origin 级权限和存储仍然共享。

根 worker 必须从平台治理中推导子路径排除规则：不得预缓存、运行时缓存、为子路径返回自己的离线降级，或删除子路径所属缓存。部署顺序为先根路径排除、后子应用部署；移除时反向执行。

由 `shared-origin-topology` 模块支持（[ADR-0019](../adr/0019-shared-origin-registry-and-exclude.md)，[规格](../../spec/shared-origin-topology.md)）；它不等同于跨 origin 隔离。

- **登记表**：同一源、同一环境上的全部应用写在一份受版本控制的登记表中（一个根应用、至少一个子应用），作为拓扑 `{ kind: "shared-origin", registry }` 传入每个应用的构建。子 scope 须严格位于根 scope 之内且互不重叠，身份字段与缓存前缀两两不同，由编译期检查。
- **根 worker 的排除**：编译器为根应用的每个子 scope 生成一条 `exclude` 规则，根 worker 对这些路径的任何请求都不接管，也不回退离线降级页；子 scope 内的文件永不进入根应用的预缓存。子应用的编译与独立源相同。
- **发布顺序**：发布子应用前，用线上根应用的计划运行发布校验的 `release-order` 检查（见[运维手册](../operations/release-and-incident-runbook.md#同源拓扑的发布与移除顺序)）。
- **当前只支持 Vite 接入**：`@pwa-platform/nuxt` 仍只支持独立源。
- **子 worker 安装之前**，断网访问子路径得到浏览器的网络错误，而不是任何离线页。
