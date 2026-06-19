# 点餐小程序 SaaS 模板 — 开发规格说明书 (SPEC)

> 从 PRD v1.0 封板版本提取，供 AI Agent 开发时高效读取。

## 快速导航

| 文档 | 内容 | 何时读取 |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系统架构、技术栈、多租户设计、部署拓扑 | 项目初始化时必读 |
| [DATA-MODEL.md](DATA-MODEL.md) | 全部数据库表、字段、关系、索引策略 | 编写 Migration 时必读 |
| [API-SPEC.md](API-SPEC.md) | 全部 REST API 端点、请求/响应格式、错误码 | 编写后端接口时必读 |
| [STATE-MACHINES.md](STATE-MACHINES.md) | 订单/团单/桌号状态机 | 编写订单/团单逻辑时必读 |
| [BUSINESS-RULES.md](BUSINESS-RULES.md) | 库存扣减、优惠计算、退款规则、并发控制 | 编写核心业务逻辑时必读 |
| [MODULES.md](MODULES.md) | 模块系统、依赖关系、权限矩阵 | 搭建模块框架时必读 |
| [V1-SCOPE.md](V1-SCOPE.md) | V1.0 范围清单、in/out 明细 | 排期和裁剪时必读 |

### 测试文档

| 文档 | 内容 | 读者 |
|---|---|---|
| [QA-TEST-SPEC.md](QA-TEST-SPEC.md) | QA 测试说明书 (~198 用例) | 人类 QA |
| [E2E-TEST-SPEC.md](E2E-TEST-SPEC.md) | 端到端场景用例 (P→B→C 时序, 68 用例) | 人类 QA |
| [AGENTIC-TEST-SPEC.md](AGENTIC-TEST-SPEC.md) | Agent 可执行测试规格 (curl + 断言) | Claude Code Agent |
| [SPEC-RESEARCH-PROMPT.md](SPEC-RESEARCH-PROMPT.md) | Spec 分层与生命周期研究提示词 | 外部大模型 |

## 技术栈速查

| 层 | 技术 |
|---|---|
| 小程序 | uni-app (Vue3) → 编译为微信原生代码 |
| 后端 | NestJS + TypeScript + Prisma ORM |
| 管理后台 | Vue 3 + Element Plus |
| 数据库 | MySQL 8.0+ (utf8mb4) + Redis |
| 文件存储 | SaaS: OSS+CDN / 源码交付: 本地存储 |
| 部署 | Docker Compose / 微信云托管 |

## 核心架构决策

- **多租户**: 每商家独立 AppID，共享后端通过 `appId`→`tenant_id` 隔离
- **库存**: 预占→支付确认→超时释放，乐观锁防超卖
- **支付**: 不支持组合支付，原路退回，储值卡无有效期
- **时区**: 服务端 UTC+8，商家可在 BrandConfig 中设置时区
- **主包**: ≤1.5MB，分包加载
- **订单状态更新**: 10秒轮询（微信不支持 WebSocket）

## 参考文档

- 完整 PRD: `docs/PRD.md`
