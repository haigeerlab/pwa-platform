# Todo：browser-compat-baseline

当前状态：第一步缺陷修复已随 0.4.1、提示条定位回退已随 0.4.2 发布；本模块规格、ADR-0053、计划与能力图修订已获批准，开始实施。

- [x] BC0 盘点 27 项功能的浏览器 API 与超基线用法（[清单](feature-api-inventory.md)），并实测检测工具能力（规格“工具实测结论”）。
- [x] G0 项目所有者审阅并批准规格、ADR-0053、计划与能力图修订（2026-11-11）。
- [x] BC1 新增 `.browserslistrc` 与基线读取函数。
- [x] BC2 类型层：浏览器端源码 `lib: ES2020`，在真实编译程序中验证违规样例与实际 lib。 nuxt 运行时经 nuxt/app 带入 @types/node 引用的 esnext.disposable、es2025.float16，项目所有者 2026-11-11 同意仅为 nuxt 放行这两个 lib（违规样例仍须报错），待 BC7 写入兼容文档。
- [x] BC3 lint 层：eslint-plugin-compat 加禁用名单，带违规样例。
- [x] BC4 产物层（es-check 加网页 API 规则，含生成脚本与恢复页模块闭包，空输入失败）接入 CI；运行时陷阱与名单对齐，加缺失模拟辅助函数。
- [x] BC5 worker 构建目标显式设为基线，Vite 5／8 均验证。
- [x] BC6 提示条间距改为外边距、宽度补 `min()` 回退（定位回退已随 0.4.2 发布），截图回归覆盖全部情形。
- [x] BC7 更新兼容文档、贡献指南、README 与功能 × API 清单。
- [ ] BC8 本地门禁、候选消费、PR 正式 CI 通过；产物变化随下一个补丁版本发布。
