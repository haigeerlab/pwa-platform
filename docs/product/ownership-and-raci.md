# 职责与 RACI

| 关注点 | 平台团队 | 产品团队 | 基础设施 / 后端 |
|---|---|---|---|
| Core runtime and adapters | accountable | consulted | consulted |
| PwaPolicy resource classification | consulted | accountable | consulted |
| Private-data and auth semantics | consulted | accountable | accountable |
| CDN headers and worker deployment | consulted | informed | accountable |
| Push preferences, VAPID, delivery controls | consulted | accountable | accountable |
| Browser E2E baseline | accountable | responsible for app fixtures | consulted |

产品团队可以决定哪些公共内容适合离线使用，但不得通过配置放宽平台安全拒绝规则。
