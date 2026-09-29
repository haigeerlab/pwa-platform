# 关卡 1：配置并检查

进入条件：关卡 0 通过，采访结果已写入状态文件。目的：接入插件与页面绑定，写身份与策略，挂载更新提示，然后用**生产构建**的诊断来检查。

## 步骤

1. **安装**。用项目已有的包管理器（看锁文件），版本与本 skill 的 `metadata.version` 一致：Vue 装 `@pwa-platform/vue`，React 装 `@pwa-platform/react`；`@pwa-platform/vite` 与 `@pwa-platform/contracts` 装为开发依赖。
2. **身份与策略（闸门 G2）**。状态文件里已有人确认的 G2 记录时只核对、不重问，有出入才重新确认。写 `pwa.config.ts` 之前，把 `origin`、`scope`、`serviceWorkerUrl`、`manifestId`、`mountPath`、`environment`、`cacheNamespaceSeed` 的具体取值逐项念给人，等明确肯定答复后再写，并把这些取值记入状态文件。**这些字段在首次生产注册后不可变**，写错的代价由线上用户承担。读取 [gate-1-config-file.md](gate-1-config-file.md) 获取模板与子路径部署的写法。
3. **图标**。必须是 `public/icons/` 下的**真实文件**，声明的 MIME 与尺寸要与文件一致，构建会读取文件头校验。没有真实图标就向人要，不要生成占位图。
4. **挂插件、注册、更新提示**。按框架读取 [gate-1-vue.md](gate-1-vue.md) 或 [gate-1-react.md](gate-1-react.md)，只追加、不替换原有插件与路由。语言按 Q1，定时检查按 Q7，未保存内容保护按 Q8。
5. **生产构建**。运行项目的生产构建，不是 `vite dev`：开发服务不生成平台 worker。

## 读诊断码

构建诊断只给**诊断码和契约路径**，不回显配置的值：读配置文件里对应路径的字段再判断。

| 前缀 | 含义 | 谁决定 |
| --- | --- | --- |
| `identity.*` | 身份字段不合法或彼此不一致，例如 origin 不是 https、worker 地址不在 scope 目录下 | 人（G2）：这些字段不可变，不要自行改动了事 |
| `install.*` | 安装信息：图标缺变体、启动地址超出 scope、描述过长、截图比例 | 图标文件与文案由人提供；结构性问题可以修 |
| `vite.manifest-icon*` | 图标缺失，或文件头的 MIME、尺寸与声明不符 | 人提供真实文件 |
| `vite.offline-page*` | 离线页选项不合法，例如没开离线回退、与已有文件冲突、locale 不是 `zh-CN` 或 `en` | 可以自动修 |
| `compile.*` | 策略与资源规则、产物不匹配 | 可以自动修；涉及运行时缓存的一律交给 G3 |
| `schema.*` | 字段类型、取值、未知字段 | 可以自动修 |
| `verify.*` | 产物核对，例如 `verify.manifest-asset-missing`（截图或快捷方式图标不在产物里） | 看具体码 |

manifest 链接冲突、`<base>` 标签属于构建失败，先回关卡 A 的冲突目录。

## 通过标准

生产构建通过，没有 `identity.*`、`install.*`、`vite.*`、`compile.*`、`schema.*` 诊断。

## 停止条件

诊断无法在不改动身份字段的情况下消除：停下，回到 G2 与人讨论，不要绕过。

## 结束时

更新状态文件：关卡 1 置为 `done`，"证据"里记"生产构建通过，无诊断"和日期。用 `通过` / `不通过` 等报告标签告诉用户结果。
