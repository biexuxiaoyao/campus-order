# 点餐小程序 SaaS 模板

可售卖的微信点餐小程序模板产品。目标客户：写字楼周边餐饮商家。

## 技术栈

| 层 | 技术 |
|---|---|
| 小程序 | uni-app (Vue 3) |
| 后端 | NestJS + TypeScript + Prisma |
| 管理后台 | Vue 3 + Element Plus |
| 数据库 | MySQL 8 + Redis |
| 源码打包 | jscodeshift AST 预处理 |

## 项目结构

```
campus-order/
├── server/          # NestJS 多租户后端
├── miniprogram/     # uni-app 小程序模板
├── admin-web/       # Vue 3 管理后台模板
├── packager/        # 源码交付预处理工具
└── docs/            # 文档
    └── PRD.md       # 需求规格说明书
```

## 核心架构理念

- **多租户**: appId 识别租户，tenant_id 数据隔离
- **模块化**: 业务功能按模块拆分，商家按需购买，源码交付时物理删除未购模块
- **品牌配置化**: 商家品牌信息运行时从服务端拉取，不硬编码
- **模板 vs 交付**: 模板源码含完整配置系统；交付源码经过预处理，隐藏模板机制

## 开发环境

```bash
# 启动后端
cd server && npm run start:dev

# 启动管理后台
cd admin-web && npm run dev

# 启动小程序
cd miniprogram && npm run dev:mp-weixin
```

## 参考文档

- 需求规格说明书: `docs/PRD.md`
