# 源码交付 — 业务分析与设计

> 版本: v0.1 | 日期: 2026-06-18 | 状态: 评估阶段

## 1. 业务模型

### 1.1 两种交付形态的共存关系

```
SaaS 租用（按年付费）
  │
  ├── 纯SaaS客户：按时续费，永不买断
  │
  └── SaaS + 源码兜底：买了源码但继续用SaaS
        │
        ├── 源码是"保险" — 平台倒闭/涨价时的退路
        ├── SaaS是"便利" — 不用自己运维
        │
        └── 后续可能：
              ├── 加购模块 → SaaS即时生效 → 源码包过期(缺新模块)
              ├── 申请增量源码交付 → 补差价获取新包
              └── 最终离平台 → 独立部署

源码买断（一次性，离平台）
  │
  └── 买完就走：不再使用SaaS，不续费，不买新模块
```

**关键认知**: 源码交付不是"一次性商品"而是**有状态的订阅升级路径**。同一商家可以有多次源码交付，每次的模块范围不同。

### 1.2 商家生命周期示例

```
T0: 商家入驻，购买专业版SaaS (base + group-meal + discount + points + coupon)
    SaaS年费: ¥4,999/年

T1: 商家购买源码专业包 (含上述5模块)
    一次性支付: ¥39,800
    系统记录: "交付快照 v1 = {base, group-meal, discount, points, coupon}"

T2: 商家在SaaS上加购 printer 模块
    SaaS年费: ¥4,999 + ¥800 = ¥5,799/年
    商家持有模块: 6个
    源码包状态: 过期（缺printer）

T3: 商家在SaaS上再加购 prepaid 模块
    SaaS年费: ¥5,799 + ¥1,000 = ¥6,799/年
    商家持有模块: 7个
    源码包状态: 更过期（缺printer + prepaid）

T4: 商家申请增量源码交付
    上次交付: v1 = {base, group-meal, discount, points, coupon}
    当前持有: {base, group-meal, discount, points, coupon, printer, prepaid}
    新增模块: {printer, prepaid}
    计费: 基础升级费 + printer源码价 + prepaid源码价

T5: 商家离平台，用包含7模块的源码包独立部署
    SaaS合同终止，不再续费
```

---

## 2. 定价模型

### 2.1 PRD 已有定价

| 源码包 | 价格 | 模块数 |
|--------|------|--------|
| 基础包 | ¥19,800 | 2 (base + group-meal) |
| 专业包 | ¥39,800 | 5 (base + 5核心模块) |
| 全模块包 | ¥59,800 | 11 (全部) |
| 大版本升级 | ¥5,000-15,000 | 差分 |

Module 表已有 `priceSourceCode` 字段（Int，单位：分），但种子数据未填充。需定价：

| 模块 | 建议单模块源码价 |
|------|-----------------|
| base | ¥8,000 (必选，不可单独买) |
| group-meal | ¥11,800 (团餐是核心卖点) |
| discount | ¥5,000 |
| coupon | ¥5,000 |
| points | ¥4,000 |
| prepaid | ¥6,000 |
| printer | ¥3,000 |
| push-notify | ¥2,000 |
| delivery | ¥5,000 |
| dine-in | ¥3,000 |
| advanced-stats | ¥5,000 |

> 注：单模块源码价之和略高于打包价，体现套餐折扣。

### 2.2 增量交付计价公式

```
增量交付价格 = 基础升级费 + Σ(新增模块的 priceSourceCode)

基础升级费:
  - 距上次交付 ≤ 6个月:  ¥3,000
  - 距上次交付 ≤ 18个月: ¥5,000
  - 距上次交付 > 18个月: ¥8,000

价格上限:
  增量价格 ≤ (当前模块集全量源码价 × 0.9) - 历史已付源码费总额
  
  若增量价格 ≤ 0，则免费交付（仅收基础升级费）
```

### 2.3 示例计算

```
商家已付源码费: ¥39,800 (专业包)
当前持有7个模块的全量源码价 = 
  5模块打包价 ¥39,800 + printer ¥3,000 + prepaid ¥6,000 = ¥48,800

增量交付价 = ¥5,000(基础升级) + ¥3,000(printer) + ¥6,000(prepaid) = ¥14,000

价格上限 = ¥48,800 × 0.9 - ¥39,800 = ¥44,000 - ¥39,800 = ¥4,120

实际收费 = min(¥14,000, ¥4,120) = ¥4,120
```

### 2.4 特殊情况

| 场景 | 处理 |
|------|------|
| 商家从未交付过 | 按 PRD 全量包定价 |
| 商家降级了模块(SaaS不续某个模块) | 不退款，新交付包不含降级模块 |
| 商家离平台后又回来 | 视为新客户，按当前模块全量定价 |
| 同一模块版本升级(如 base v1→v2) | 含在基础升级费中，不另收 |

---

## 3. 数据模型变更

### 3.1 修改 SourceDelivery 表

```prisma
model SourceDelivery {
  id              String    @id @default(uuid())
  tenantId        String
  version         String              // 交付版本号: "delivery-v2"
  modules         Json                // 本次交付包含的模块详情
    // { "base": { "version": "1.0.0" }, "group-meal": { "version": "1.0.0" } }
  moduleSnapshot  Json?               // 🆕 交付时的完整模块清单
    // ["base", "group-meal", "discount", "points", "coupon"]
  watermarkId     String
  checksum        String?
  price           Int?                // 🆕 本次交付收费（分）
  baseUpgradeFee  Int?                // 🆕 基础升级费（分）
  newModuleFee    Int?                // 🆕 新增模块费（分）
  status          String  @default("completed") // 🆕 pending/processing/completed/failed
  downloadUrl     String?             // 🆕 交付包下载链接（7天有效）
  deliveredAt     DateTime?
  expiresAt       DateTime?
  createdAt       DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

### 3.2 已有字段利用

- `Module.priceSourceCode` — 已存在，填充真实值即可
- `ModulePurchase` — 已存在，记录每次交易
- `Tenant.modulePurchases` — 已关联

---

## 4. API 设计

### 4.1 询价（不创建交付）

```
POST /api/admin/tenants/:id/source-quote
→ 对比上次交付快照与当前持有模块
← {
    lastDelivery: { version, deliveredAt, moduleSnapshot, price },
    currentModules: ["base", "group-meal", ...],
    newModules: ["printer", "prepaid"],
    removedModules: [],
    breakdown: {
      baseUpgradeFee: 500000,        // 分
      newModuleFees: [
        { moduleId: "printer", price: 300000 },
        { moduleId: "prepaid", price: 600000 }
      ],
      subtotal: 1400000,
      cap: 412000,                   // 不超过上限
      finalPrice: 412000             // 分
    }
  }
```

### 4.2 执行交付

```
POST /api/admin/tenants/:id/source-delivery
Body: { confirmPrice: 412000 }
→ 创建 ModulePurchase 记录
→ 创建 SourceDelivery(status=pending)
→ 异步触发 packager 流水线
→ 完成后更新 downloadUrl + status=completed
← { deliveryId, status: "processing", estimatedMinutes: 5 }
```

### 4.3 查询交付历史

```
GET /api/admin/tenants/:id/source-deliveries
→ [{ id, version, moduleSnapshot, price, status, downloadUrl, createdAt }]
```

### 4.4 下载交付包

```
GET /api/admin/source-delivery/:id/download
→ 302 redirect to file URL (7天有效)
```

### 4.5 管理 Packager 流水线状态

```
GET /api/admin/source-delivery/:id/status
→ { status, progress, logs }
```

---

## 5. Packager 集成

### 5.1 当前状态

`packager/` 是独立 CLI 工具，有 `remove-module`、`inject-watermark`、`strip-imports` 三个 transform。不能通过 API 调用。

### 5.2 集成方案

```
admin.service.ts
  │
  ├── createSourceDelivery()
  │     ├── 1. 计算价格 + 创建记录
  │     ├── 2. 写入 job 到 Redis 队列
  │     └── 3. 返回 deliveryId
  │
  └── checkDeliveryStatus()
        └── 查询 Redis 队列状态

packager-worker (新进程或 server 内 worker thread)
  │
  ├── 监听 Redis 队列
  ├── 执行 packager 流水线
  │     ├── clone 模板代码
  │     ├── 物理删除未购模块目录
  │     ├── 删除平台相关代码
  │     ├── 品牌配置硬编码
  │     ├── 编译 uni-app → 微信原生
  │     ├── 编译 admin-web → 静态文件
  │     ├── 核心模块 → .node 编译 (V2)
  │     ├── 变量混淆 + 去注释
  │     ├── 注入水印
  │     └── 打包 zip
  ├── 上传到文件存储
  └── 更新 SourceDelivery.status + downloadUrl
```

---

## 6. 前端页面设计

### 6.1 TenantDetail — 「源码交付」Tab

```
┌──────────────────────────────────────────────┐
│  源码交付                                     │
│                                              │
│  ┌─── 上次交付 ──────────────────────────┐   │
│  │ 版本: delivery-v1                      │   │
│  │ 时间: 2026-03-15                       │   │
│  │ 模块: base, group-meal, discount,      │   │
│  │       points, coupon (5个)             │   │
│  │ 费用: ¥39,800                          │   │
│  │ 水印: wm-xxx-xxx                       │   │
│  │ [📥 下载交付包] (7天内有效)             │   │
│  └────────────────────────────────────────┘   │
│                                              │
│  ┌─── 当前状态 ──────────────────────────┐   │
│  │ 持有模块: 7个                           │   │
│  │ 🆕 新增(自上次交付): printer, prepaid   │   │
│  │ ❌ 移除(自上次交付): 无                 │   │
│  │                                        │   │
│  │ [💰 询价] 预估增量交付费用              │   │
│  └────────────────────────────────────────┘   │
│                                              │
│  ┌─── 交付历史 ──────────────────────────┐   │
│  │ #   版本         模块数  费用    时间   │   │
│  │ 1   delivery-v1  5       ¥39,800 03-15 │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 6.2 询价弹窗

```
┌─────────────────────────────────┐
│  增量源码交付 — 费用预估         │
│                                 │
│  基础升级费 (距上次交付3个月)     │
│    ¥3,000                       │
│                                 │
│  新增模块                       │
│    printer .................. ¥3,000
│    prepaid .................. ¥6,000
│                                 │
│  小计                     ¥12,000
│  价格上限               -¥7,880
│  ─────────────────────────────  │
│  应付                     ¥4,120
│                                 │
│  [取消]          [确认支付]     │
└─────────────────────────────────┘
```

---

## 7. 实施优先级

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| **P0** | 数据模型变更（SourceDelivery 加字段）+ 迁移 | 小 |
| **P0** | 询价 API (source-quote) | 中 |
| **P0** | 交付历史 API + 前端Tab | 中 |
| **P1** | 执行交付 API (source-delivery) | 中 |
| **P1** | Packager worker (Redis队列+打包流水线) | 大 |
| **P2** | .node 核心模块编译 | 大 |
| **P2** | AI 自动化处理流水线（PRD 3.13.7） | 大 |

---

## 8. 待决策问题

| # | 问题 | 选项 |
|---|------|------|
| 1 | 增量交付基费分档（3K/5K/8K）是否合理？ | 可调 |
| 2 | 源码交付后，商家能下载几次？（防止滥用） | 建议3次/7天内 |
| 3 | 交付包是否自动过期删除？（存储成本） | 建议90天 |
| 4 | 商家离平台后，其历史交付记录保留多久？ | 建议永久保留（审计需要） |
