# campus-order — 点餐小程序 SaaS 模板

可售卖的微信点餐小程序模板产品。目标客户：写字楼周边餐饮商家。

## 完成度

| 层级 | 完成度 | 说明 |
|------|--------|------|
| Demo 可演示版 | **90-95%** | C端/商家后台/平台后台/packager 主体完整 |
| 试点可上线版 | **70-78%** | 需微信支付真实联调 + 源码交付包部署验证 |
| 正式可销售版 | **58-68%** | 需打印多品牌 + 订阅消息真实发送 + CSV 导入导出 |
| 源码交付版 | **65-72%** | Dockerfile/nginx/init.sql 已生成，待端到端部署验证 |

## 技术栈

| 层 | 技术 |
|---|---|
| 小程序 | uni-app (Vue 3) → 编译为微信原生代码 |
| 后端 | NestJS + TypeScript + Prisma 7 |
| 管理后台 | Vue 3 + Element Plus + Vite |
| 平台后台 | Vue 3 + Element Plus + Vite |
| 数据库 | MySQL 8.0 + Redis 8.8 (Docker) |
| 源码打包 | jscodeshift AST 预处理 |

## 项目结构

```
campus-order/
├── server/          # NestJS 多租户后端 (14 模块, 122 API, 155 单测)
│   ├── src/
│   │   ├── kitchen/          # NEW: 厨房模式批量操作
│   │   ├── reconciliation/   # NEW: 日对账 + 数据看板
│   │   ├── group-order/      # 团单（截单缓冲/条件A+B/预支付）
│   │   ├── payment/          # 微信支付（含 WechatPayClient 共享）
│   │   ├── prepaid/          # 预充值（含真实微信 JSAPI）
│   │   └── ...               # 26 个模块
│   └── prisma/
├── miniprogram/     # uni-app 小程序模板 (13 页面, 4 组件)
├── admin-web/       # Vue 3 管理后台 (15 页面, 含厨房/对账)
├── platform-admin/  # Vue 3 平台后台
├── packager/        # 源码交付预处理工具 (14 测试)
└── specs/           # 规格说明书 (10+ 份文档)
```

## Docker 环境

| 容器 | 端口 | 凭据 |
|------|------|------|
| mysql-dev | 3306 | root / root123456 |
| redis-dev | 6379 | 无密码 |

```bash
docker start mysql-dev redis-dev
```

## 快速启动

```bash
# 1. Docker 容器
docker start mysql-dev redis-dev

# 2. 数据库初始化
cd server && npx prisma migrate dev && npx ts-node prisma/seed.ts

# 3. 后端 (http://localhost:3000)
cd server && npm run start:dev

# 4. 管理后台 (http://localhost:5173)
cd admin-web && npm run dev

# 5. 小程序
cd miniprogram && node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin
# 微信开发者工具打开 dist/build/mp-weixin/
```

## 种子数据

| 服务 | 地址 | 账号 | 密码 |
|------|------|------|------|
| 管理后台 | http://localhost:5173 | admin | admin123 |
| 平台后台 | http://localhost:5174 | — | — |
| 后端 API | http://localhost:3000 | — | — |

## 环境变量

参考 `server/.env.example`，关键配置：

```env
DATABASE_URL=mysql://root:root123456@localhost:3306/campus_order?charset=utf8mb4&allowPublicKeyRetrieval=true
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-jwt-secret-change-in-production

# 微信支付（5项全配启用真实支付，否则 mock）
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY_PATH=
WECHAT_PAY_PLATFORM_CERT_PATH=
```

## 测试

| 项目 | 测试数 | 命令 |
|------|--------|------|
| server | **155 tests / 14 suites** | `cd server && npm test -- --runInBand --forceExit` |
| packager | 14 tests | `cd packager && npm test` |
| admin-web | build check | `cd admin-web && npm run build` |
| miniprogram | build check | `cd miniprogram && node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin` |

## 核心架构

- **多租户**: appId 识别租户，tenant_id 数据隔离
- **模块化**: 按模块拆分，packager 根据购买清单删除未购模块
- **品牌配置化**: `/api/brand/config` 运行时拉取（含充值选项/取餐时间/兑换规则）
- **响应格式**: `{ code: 0, message: 'success', data: ... }`
- **价格单位**: 后端所有金额以 **分** 为单位
- **安全**: Helmet + ValidationPipe whitelist + ThrottleGuard 全局限流 + JWT 守卫

## 本轮主要新增 (v2.0)

### 试点 P0 闭环
- **团单**: B1 支付流程、B3 截单缓冲、B5 自动截单 cron、B7 代表下单支付
- **厨房**: KitchenModule（4 端点 + 批量通知）、KitchenMode 批量端点对接
- **对账**: ReconciliationModule（日对账 + 数据看板 + 微信账单 API）
- **订阅消息**: 10 场景全覆盖（cooking/ready/picked/cancelled/urge_reply 新增）

### 安全加固
- Helmet 安全头注入
- ValidationPipe `whitelist` + `forbidNonWhitelisted`
- ThrottleGuard 全局限流 (60/min)
- 预充值 `confirmRecharge` 生产环境保护

### 架构优化
- `WechatPayClient` 共享服务（消除 prepaid/payment 85 行重复）
- 团单取消自动退款（`refundPaidOrdersOnCancel`）
- `generatePickupNo` 算法统一（max-based）

### 源码交付
- 完整 Dockerfile + init.sql + nginx 配置
- admin-web 构建产物自动打包

## 剩余工作

| 优先级 | 任务 | 状态 |
|--------|------|------|
| P0 | 微信支付真实联调（沙箱 → 正式） | 待验证 |
| P0 | 源码交付包 `docker compose up` 端到端验证 | 待验证 |
| P1 | 订阅消息真实模板配置 + 发送联调 | 待联调 |
| P1 | 飞鹅/商米打印机对接 | 按需 |
| P2 | 管理后台 mock fallback 清理 | 低优先级 |

## License

UNLICENSED — 私有源码，禁止未授权分发。
