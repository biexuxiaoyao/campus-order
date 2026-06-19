# 点餐小程序 SaaS 模板

可售卖的微信点餐小程序模板产品。目标客户：写字楼周边餐饮商家。

## 技术栈

| 层 | 技术 |
|---|---|
| 小程序 | uni-app (Vue 3) → 编译为微信原生代码 |
| 后端 | NestJS + TypeScript + Prisma 7 |
| 管理后台 | Vue 3 + Element Plus + Vite |
| 数据库 | MySQL 8.0 + Redis 8.8 (Docker) |
| 源码打包 | jscodeshift AST 预处理 |

## 项目结构

```
campus-order/
├── server/          # NestJS 多租户后端 (141 源文件, 26 模块, 122 API, 131 单测)
├── miniprogram/     # uni-app 小程序模板 (12 页面, 4 组件)
├── admin-web/       # Vue 3 管理后台 (14 页面)
├── packager/        # 源码交付预处理工具 (14 测试通过)
├── .github/         # CI/CD (GitHub Actions)
├── specs/           # 规格说明书 (10+ 份文档)
└── docs/            # 需求文档 (PRD.md)
```

## Docker 环境

| 容器 | 端口 | 凭据 |
|------|------|------|
| mysql-dev | 3306 | root / root123456 |
| redis-dev | 6379 | 无密码 |

```bash
# 启动容器
docker start mysql-dev redis-dev
```

## 数据库

- **数据库名**: `campus_order`
- **Prisma 7 适配器**: `@prisma/adapter-mariadb` (Prisma 7 要求必须传入 adapter 或 accelerateUrl)
- **迁移**: `npx prisma migrate dev`
- **种子数据**: `npx ts-node prisma/seed.ts` (创建 demo 租户、admin 账号、10 道菜品等)

## 快速启动

```bash
# 1. 确保 Docker 容器运行
docker start mysql-dev redis-dev

# 2. 启动后端 (http://localhost:3000)
cd server && npm run start:dev

# 3. 启动管理后台 (http://localhost:5173)
cd admin-web && npm run dev

# 4. 编译并打开小程序
cd miniprogram && node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin
# 用微信开发者工具打开 dist/build/mp-weixin/
```

## 种子数据登录信息

| 服务 | 地址 | 账号 | 密码 |
|------|------|------|------|
| 管理后台 | http://localhost:5173 | admin | admin123 |
| 后端 API | http://localhost:3000 | — | — |

## 环境变量 (server/.env)

```env
DATABASE_URL=mysql://root:root123456@localhost:3306/campus_order?charset=utf8mb4
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-jwt-secret-change-in-production
WECHAT_APP_ID=wx8ebfaf4a045bf7c3
WECHAT_APP_SECRET=41d98e0d591d651f91edc09a1e660082
PORT=3000
```
> 注意：`.env` 不应提交到 git（已在 .gitignore 中）。使用 `.env.example` 作为模板。

## 已知注意事项

- **Prisma 7**: 构造函数必须传入 `adapter`（本项目用 `PrismaMariaDb`）
- **Admin Login**: 登录时不需要 `x-tenant-id` header（后端自动查找 admin 所属租户）
- **uni-app 构建**: 需用 `node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin`，不能用 npx
- **小程序开发**: 微信开发者工具需要开启 设置 → 安全设置 → 服务端口

## 核心架构理念

- **多租户**: appId 识别租户，tenant_id 数据隔离
- **模块化**: 业务功能按模块拆分，packager 根据购买清单物理删除未购模块
- **品牌配置化**: 品牌信息运行时从 `/api/brand/config` 拉取
- **响应格式**: 统一 `{ code: 0, message: 'success', data: ... }`
- **价格单位**: 后端所有金额以 分 为单位

## API 路由概览

| 模块 | 路由组 | 端点数 |
|------|--------|--------|
| Auth | /api/auth | 3 |
| Brand | /api/brand | 2 |
| Store/Category | /api/merchant/stores, /api/merchant/categories | 10 |
| Dish | /api/dishes, /api/merchant/dishes | 17 |
| SKU/Spec | /api/merchant/skus, /api/merchant/spec-templates | 9 |
| Cart | /api/cart | 5 |
| Order | /api/orders, /api/merchant/orders | 11 |
| Payment | /api/payment | 4 |
| User | /api/user | 6 |
| GroupOrder | /api/group-orders | 6 |
| Settings/Staff | /api/merchant/settings, /api/merchant/staff | 10 |
| Prepaid/Discount/Points/Coupon | mixed | 16 |
| Printer | /api/merchant/printers | 7 |
| Audit | /api/merchant/audit-logs | 1 |
| Admin | /api/admin | 13 |
| Upload | /api/upload | 2 |
| **总计** | | **122** |

## 参考文档

| 类型 | 文档 | 内容 |
|------|------|------|
| 需求 | `docs/PRD.md` | 产品需求规格说明书 (v1.0 封板, 18轮审查) |
| 索引 | `specs/SPEC.md` | 规格文档导航 |
| 架构 | `specs/ARCHITECTURE.md` | 系统架构、多租户设计 |
| 数据 | `specs/DATA-MODEL.md` | 数据库表、字段、索引 |
| API | `specs/API-SPEC.md` | 全部 REST 端点、错误码 |
| 逻辑 | `specs/STATE-MACHINES.md` | 订单/团单/支付状态机 |
| 逻辑 | `specs/BUSINESS-RULES.md` | 库存、优惠、退款、并发规则 |
| 架构 | `specs/MODULES.md` | 模块系统、权限矩阵 |
| 规划 | `specs/V1-SCOPE.md` | V1.0 范围清单 |
| 测试 | `specs/QA-TEST-SPEC.md` | QA 测试说明书 (~198 用例) |
| 测试 | `specs/E2E-TEST-SPEC.md` | 端到端场景用例 (P→B→C 时序, 68 用例) |
| 测试 | `specs/AGENTIC-TEST-SPEC.md` | Agent 可执行测试规格 (curl + 断言) |

## Agent 配置

> 本项目通过 ccswitch + DeepSeek V4 Pro 运行 Codex（当前版本 2.1.172，已验证子 Agent 正常）。
> 如遇兼容性问题，可回退至 2.1.165（`npm install -g @anthropic-ai/Codex@2.1.165`）。

### 模型限制（Agent 必须遵守）

- **纯文本模型**：不识别图片/截图。遇到视觉需求时告知用户手动切换模型
- **工具调用稳定性**：如工具调用未执行（无响应/跳过），请原样重试，不要用纯文本描述意图
- **退出码检查**：每个 Bash 命令执行后确认退出码，非 0 视为失败

### 规划与验证（强制）

- **多文件修改**（≥ 2 个文件 / 跨模块）：必须先用 EnterPlanMode 出计划
- **复杂任务**（≥ 3 步）：用 TaskCreate 拆分，追踪完成状态
- **每次 Edit/Write 后**：Read 确认变更内容正确
- **声明任务完成前**：逐条回顾用户需求，确认全部满足

### 长任务与上下文

- 每完成 3–5 个步骤后运行 `/compact` 压缩上下文
- 子 Agent 任务自动路由至 deepseek-v4-flash（速度快 3–5x）
- 涉及订单/支付/库存等核心业务逻辑时，先读取 `specs/BUSINESS-RULES.md`

### 代码修改后的验证链

```
Edit/Write → Read 确认 → 按修改位置执行验证
```

| 修改位置 | 验证命令 |
|---------|---------|
| `server/` | `cd server && npm run format && npm run lint && npm test` |
| `admin-web/` | `cd admin-web && npm run build` |
| `miniprogram/` | `cd miniprogram && node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin` |
| `packager/` | `cd packager && npm test` |

### Specs 参考文档

| 任务类型 | 必读文档 |
|---------|---------|
| 新建 API / 修改路由 | `specs/API-SPEC.md` |
| 数据库变更 / Migration | `specs/DATA-MODEL.md` |
| 订单 / 团单 / 支付逻辑 | `specs/STATE-MACHINES.md` + `specs/BUSINESS-RULES.md` |
| 模块增删 / 依赖调整 | `specs/MODULES.md` |
| 功能范围裁剪 | `specs/V1-SCOPE.md` |
| 架构决策 | `specs/ARCHITECTURE.md` |
| E2E 测试执行 | `specs/E2E-TEST-SPEC.md` (Human版) / `specs/AGENTIC-TEST-SPEC.md` (Agent版) |

### 测试现状

| 项目 | 测试数 | 命令 |
|------|--------|------|
| server | **131 tests / 11 suites** | `cd server && npm test -- --forceExit` |
| packager | 14 tests | `cd packager && npm test` |
| admin-web | build check (vue-tsc) | `cd admin-web && npm run build` |
| miniprogram | build check | `cd miniprogram && node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin` |

覆盖率: 24% overall, 核心 Service 42-68%。

### CI/CD

GitHub Actions (`.github/workflows/ci.yml`): 每次 push/PR 自动运行全部测试 + 构建。

### 关键命令

```bash
# === 后端 (server/) ===
cd server && npm run format && npm run lint && npm test -- --forceExit   # 完整验证链
cd server && npm test -- --forceExit                                      # 仅单元测试 (131 cases)
cd server && npm run test:cov                                             # 覆盖率报告
cd server && npm run start:dev                                            # 启动开发服务器

# === 数据库重置 ===
cd server && npx prisma migrate reset --force && npx ts-node prisma/seed.ts

# === 管理后台 (admin-web/) ===
cd admin-web && npm run build                                # 构建检查（含 vue-tsc 类型检查）
cd admin-web && npm run dev                                  # 启动开发服务器

# === 小程序 (miniprogram/) ===
cd miniprogram && node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin

# === 打包工具 (packager/) ===
cd packager && npm test                                      # 14 个测试用例

# === 上下文管理 ===
/compact                                                      # 压缩上下文（长任务中每 3-5 步执行）
```
