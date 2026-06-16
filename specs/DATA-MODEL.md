# DATA-MODEL — 数据库模型

> 所有表均含 `tenant_id` 字段（多租户隔离），以下省略。所有表含 `id`(PK)、`created_at`、`updated_at`。

## 核心实体关系

```
Tenant (1)──(N) Store
Tenant (1)──(1) BrandConfig
Tenant (1)──(N) TenantModule
Tenant (1)──(N) User
Tenant (1)──(N) Company
User    (N)──(N) Company (via CompanyMember)
Store   (1)──(N) Category
Store   (1)──(N) Dish
Dish    (1)──(N) SKU
User    (1)──(N) CartItem
User    (1)──(N) Order
Order   (1)──(N) OrderItem
OrderItem (N)──(1) SKU
User    (1)──(N) GroupOrder (as leader)
GroupOrder (1)──(N) GroupOrderItem
GroupOrderItem (N)──(1) User
User    (1)──(1) PrepaidAccount
User    (1)──(1) PointsAccount
User    (1)──(N) UserCoupon
```

## 表清单

### 租户与品牌

| 表 | 关键字段 | 说明 |
|---|---|---|
| `tenants` | `app_id*`, `name`, `status`, `expire_at`, `license_key` | 一个租户=一个商家 |
| `stores` | `tenant_id`, `name`, `address`, `phone`, `status` | 租户下可有多个门店 |
| `brand_configs` | `tenant_id`, `config JSON` | 品牌名称/Logo/主题色/Banner等 |
| `modules` | `id*`, `name`, `version`, `prices JSON` | 模块定义 |
| `tenant_modules` | `tenant_id`, `module_id`, `status`, `expire_at` | 商家已购模块 |

### 用户与公司

| 表 | 关键字段 | 说明 |
|---|---|---|
| `users` | `openid*`, `nickname`, `avatar`, `phone`, `role` | C端用户 |
| `admin_users` | `username*`, `password_hash`, `role`, `store_id`, `status` | B端管理后台用户 |
| `companies` | `name`, `building`, `address`, `admin_user_id` | 写字楼企业 |
| `company_members` | `company_id`, `user_id`, `role` | 员工归属 |
| `buildings` | `name`, `address` | 写字楼 |

### 菜品

| 表 | 关键字段 | 说明 |
|---|---|---|
| `categories` | `store_id`, `name`, `sort_order` | 菜品分类，≤30个 |
| `dishes` | `store_id`, `category_id`, `name`, `image_url`, `unit`, `status`, `scheduled_publish_at`, `scheduled_unpublish_at`, `estimated_today` | 菜品，≤500道 |
| `skus` | `dish_id`, `specs JSON`, `price`, `stock`, `available_stock`, `version` | 规格SKU，笛卡尔积生成 |
| `spec_templates` | `store_id`, `name`, `options JSON` | 规格模板，修改不影响已创建菜品 |

### 购物车

| 表 | 关键字段 | 说明 |
|---|---|---|
| `cart_items` | `user_id`, `sku_id`, `quantity`, `expires_at` | 服务端购物车，24h自动清 |

### 订单

| 表 | 关键字段 | 说明 |
|---|---|---|
| `orders` | `order_no* UNIQUE`, `user_id`, `store_id`, `type ENUM(individual,group_represent,group_pool)`, `status ENUM(pending,paid,confirmed,cooking,ready,completed,cancelled,refunding,refunded)`, `total_amount`, `pickup_no`, `pickup_time`, `remark`, `tags JSON`, `version` | 订单主表，`version`用于乐观锁 |
| `order_items` | `order_id`, `sku_id`, `dish_name`, `spec_name`, `price`, `quantity`, `image_base64` | 订单快照 |
| `order_timeline` | `order_id`, `status`, `timestamp` | 订单状态时间轴 |

### 团单

| 表 | 关键字段 | 说明 |
|---|---|---|
| `group_orders` | `group_no*`, `leader_id`, `store_id`, `mode ENUM(pool,represent)`, `status ENUM(pooling,closed,merged,submitted,cancelled)`, `deadline`, `min_amount`, `condition ENUM(A,B)` | 团单主表 |
| `group_order_items` | `group_order_id`, `user_id`, `order_id FK(NULLABLE)`, `sku_id`, `dish_name`, `spec_name`, `price`, `quantity`, `recipient_name` | 团单子项 |

### 支付

| 表 | 关键字段 | 说明 |
|---|---|---|
| `payment_records` | `order_id`, `transaction_id`, `amount`, `channel`, `status` | 支付流水 |
| `refund_records` | `order_id`, `payment_id`, `amount`, `reason`, `status`, `approved_by` | 退款记录 |

### 预充值

| 表 | 关键字段 | 说明 |
|---|---|---|
| `prepaid_accounts` | `user_id`, `type ENUM(personal,company)`, `balance`, `frozen_balance` | 储值卡账户 |
| `prepaid_transactions` | `account_id`, `type ENUM(purchase,consume,refund)`, `amount`, `balance_after` | 储值卡流水 |

### 折扣/积分/优惠券

| 表 | 关键字段 | 说明 |
|---|---|---|
| `discount_rules` | `store_id`, `name`, `conditions JSON`, `actions JSON`, `priority`, `is_stackable`, `start_at`, `end_at` | 折扣规则 |
| `points_accounts` | `user_id`, `balance`, `total_earned` | 积分账户 |
| `points_transactions` | `account_id`, `type`, `points`, `expires_at`, `rule_id` | 积分流水 |
| `coupon_templates` | `store_id`, `name`, `type`, `threshold`, `value`, `total_qty`, `valid_days` | 券模板 |
| `user_coupons` | `user_id`, `template_id`, `status`, `used_at` | 用户持有的券 |

### 其他

| 表 | 关键字段 | 说明 |
|---|---|---|
| `printers` | `store_id`, `brand`, `device_id`, `api_key`, `status` | 打印机配置 |
| `audit_logs` | `operator_id`, `action`, `target_type`, `target_id`, `detail JSON`, `ip` | 操作日志 |
| `source_deliveries` | `tenant_id`, `version`, `modules JSON`, `watermark_id`, `checksum` | 源码交付记录 |
| `sign_in_records` | `user_id`, `sign_date`, `consecutive_days` | 签到记录 |
| `notification_prefs` | `user_id`, `prefs JSON` | 通知偏好 |

## 索引策略（热点查询）

| 查询 | 索引 |
|---|---|
| 菜品列表 | `(store_id, category_id, status)` |
| 用户订单列表 | `(user_id, status, created_at DESC)` |
| 商家订单列表 | `(store_id, status, created_at DESC)` |
| 库存扣减 | `(sku_id)` + `version` 乐观锁 |
| 支付回调查询 | `(order_no)` UNIQUE |
| 拼单参与者 | `(group_order_id, user_id)` |
| 过期积分扫描 | `(expires_at, status)` |
| 购物车清理 | `(expires_at)` |
