# Todo：browser-compat-baseline

当前状态：规格、ADR-0053、计划与能力图修订草案已写，待项目所有者审阅；尚未改代码。

- [x] BC0 盘点 27 项功能的浏览器 API 与超基线用法（[清单](feature-api-inventory.md)），并告知 接入方。
- [ ] G0 项目所有者审阅规格、ADR-0053、计划与能力图修订；通过后切换 activeModule。
- [ ] BC1 新增 browserslist 基线与类型、lint、产物三层检测，各带违规样例，确认在现有代码上报出现状表各项。
- [ ] BC2 替换 `URL.canParse` 与 `Object.hasOwn`，补单元测试。
- [ ] BC3 替换 `AbortSignal.timeout`、`??=`、push 类字段与 CSS `inset`。
- [ ] BC4 worker 打包显式构建目标，盘点 Workbox 部分并核实 `resultingClientId`。
- [ ] BC5 更新兼容文档、浏览器矩阵、README 与文档站说明，定稿功能 × API 清单。
- [ ] BC6 本地门禁、候选消费、自审，PR 正式 CI 通过。
- [ ] BC7 发布 0.4.1 并集中读回，通知接入方。
- [ ] BC8 接入方 Safari 13.1 真机验证结果补记。
