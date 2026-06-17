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
├── server/          # NestJS 多租户后端 (141 源文件, 26 模块, 122 API)
├── miniprogram/     # uni-app 小程序模板 (12 页面, 4 组件)
├── admin-web/       # Vue 3 管理后台 (14 页面)
├── packager/        # 源码交付预处理工具 (14 测试通过)
├── specs/           # 规格说明书
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

- 需求规格说明书: `docs/PRD.md`
- 规格索引: `specs/SPEC.md`
