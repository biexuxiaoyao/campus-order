# API-SPEC — 接口规范

## 通用约定

- **Base URL**: SaaS `https://api.ourplatform.com` / 源码交付 `https://商家域名`
- **认证**: C端 `Authorization: Bearer <JWT>` / B端 `Authorization: Bearer <admin-JWT>`
- **租户识别**: C端 `x-app-id: <小程序AppID>` / B端 `x-tenant-id: <TenantID>`
- **Content-Type**: `application/json` (上传除外: `multipart/form-data`)
- **分页**: 请求 `?page=1&pageSize=20` → 响应 `{ data[], total, hasMore }`
- **错误格式**: `{ code: "ERROR_CODE", message: "中文描述" }`

## C端 API（小程序）

### 认证
| Method | Path | 说明 |
|---|---|---|
| POST | `/api/auth/wechat-login` | `{ code }` → `{ token, refreshToken, user }` |
| POST | `/api/auth/refresh` | `{ refreshToken }` → `{ token }` |

### 品牌 & 菜单
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/brand/config` | → `{ name, logo, themeColor, banners[], hours, phone }` |
| GET | `/api/dishes` | `?categoryId=&keyword=&page=&pageSize=` → 菜品列表(含SKU) |
| GET | `/api/dishes/:id` | → 菜品详情 + SKU列表 + 关联推荐 |

### 购物车
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/cart` | → `{ items[], totalAmount }` |
| POST | `/api/cart/items` | `{ skuId, quantity }` |
| PUT | `/api/cart/items/:id` | `{ quantity }` |
| DELETE | `/api/cart/items/:id` | — |
| DELETE | `/api/cart` | 清空购物车 |

### 订单
| Method | Path | 说明 |
|---|---|---|
| POST | `/api/orders` | `{ cartItemIds[], pickupTime, remark, paymentMethod }` → `{ order }` |
| GET | `/api/orders` | `?status=&page=&pageSize=` → 我的订单列表 |
| GET | `/api/orders/:id` | → 订单详情 + 时间轴 |
| POST | `/api/orders/:id/refund` | `{ items[], reason }` → 发起退款 |
| POST | `/api/orders/:id/reorder` | → 再来一单(返回购物车物品) |
| POST | `/api/orders/:id/urge` | → 催单 |

### 支付
| Method | Path | 说明 |
|---|---|---|
| POST | `/api/payment/prepay` | `{ orderId, channel }` → `{ wxJSAPIParams }` |
| POST | `/api/payment/notify` | 微信回调(无需Auth, 验签) |
| GET | `/api/payment/query/:orderId` | → `{ status }` 查询支付结果 |

### 团单
| Method | Path | 说明 |
|---|---|---|
| POST | `/api/group-orders` | `{ storeId, deadline, condition(A/B), minAmount }` → 创建团单 |
| GET | `/api/group-orders/:id` | → 团单详情 + 参与者列表 + 子订单 |
| POST | `/api/group-orders/:id/join` | `{ items[], paymentMethod }` → 加入团单 |
| PUT | `/api/group-orders/:id/close` | → 手动截单 |
| POST | `/api/group-orders/represent` | `{ items[] with recipientName, paymentMethod }` → 代表下单 |

### 预充值
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/prepaid/balance` | → `{ personalBalance, companyBalance }` |
| POST | `/api/prepaid/recharge` | `{ amount, type(personal/company) }` → `{ wxJSAPIParams }` |
| GET | `/api/prepaid/transactions` | `?page=&pageSize=` → 充值/消费记录 |

### 积分 & 签到
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/points/summary` | → `{ balance, totalEarned }` |
| GET | `/api/points/transactions` | `?page=&pageSize=` → 积分流水 |
| POST | `/api/points/sign-in` | → `{ points, consecutiveDays }` 每日签到 |
| POST | `/api/points/exchange` | `{ productId/couponTemplateId, type }` → 积分兑换 |

### 优惠券
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/coupons` | `?status=available/used/expired` → 我的优惠券 |
| POST | `/api/coupons/:id/claim` | → 领取优惠券 |
| GET | `/api/coupons/available` | → 当前订单可用券列表(结算页用) |

### 用户
| Method | Path | 说明 |
|---|---|---|
| PUT | `/api/user/notify-prefs` | `{ prefs: { pickRemind: true, ... } }` |
| POST | `/api/user/export-data` | → 申请导出个人数据 |
| POST | `/api/user/deactivate` | → 申请注销 |

### 上传
| Method | Path | 说明 |
|---|---|---|
| POST | `/api/upload` | `multipart, files(≤9张)` → `{ urls[] }` |

## B端 API（管理后台）

### 订单管理
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/merchant/orders` | `?status=&date=&page=&pageSize=` |
| GET | `/api/merchant/orders/:id` | 订单详情 |
| PUT | `/api/merchant/orders/:id/status` | `{ status, reason? }` 状态变更(乐观锁) |
| POST | `/api/merchant/orders/:id/refund/approve` | `{ approved, reason? }` 退款审批(需密码) |
| POST | `/api/merchant/orders/batch-confirm` | `{ orderIds[] }` 批量确认 |
| GET | `/api/merchant/group-orders` | 团单列表 |

### 菜品管理
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/merchant/dishes` | `?categoryId=&status=&page=` |
| POST | `/api/merchant/dishes` | 新增菜品(含SKU生成) |
| PUT | `/api/merchant/dishes/:id` | 编辑菜品 |
| DELETE | `/api/merchant/dishes/:id` | 软删除 |
| PUT | `/api/merchant/dishes/:id/estimated` | `{ estimated }` 手动估清 |
| POST | `/api/merchant/dishes/batch-status` | `{ ids[], status }` 批量上下架 |
| POST | `/api/merchant/dishes/import` | CSV导入 |
| GET | `/api/merchant/dishes/export` | CSV导出 |
| CRUD | `/api/merchant/categories` | 分类管理 |

### 营业设置
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/merchant/settings` | → 营业时间/暂停/打印机等 |
| PUT | `/api/merchant/settings` | 更新设置 |
| GET | `/api/merchant/dashboard` | → 今日营收/订单数/Top10等 |
| GET | `/api/merchant/reconciliation` | `?date=` → 日对账数据 |

### 折扣/积分/优惠券管理
| Method | Path | 说明 |
|---|---|---|
| CRUD | `/api/merchant/discounts` | 折扣规则管理 |
| CRUD | `/api/merchant/coupon-templates` | 优惠券模板管理 |
| GET | `/api/merchant/points/config` | 积分规则配置 |
| PUT | `/api/merchant/points/config` | 更新积分规则 |
| CRUD | `/api/merchant/points/products` | 积分兑换商品管理 |

### 员工 & 日志
| Method | Path | 说明 |
|---|---|---|
| CRUD | `/api/merchant/staff` | 员工账号管理(仅老板) |
| GET | `/api/merchant/audit-logs` | `?operator=&action=&date=` |

## P端 API（平台后台）

| Method | Path | 说明 |
|---|---|---|
| CRUD | `/api/admin/tenants` | 商家管理+审核 |
| PUT | `/api/admin/tenants/:id/modules` | 模块分配 |
| PUT | `/api/admin/tenants/:id/license` | License签发/吊销 |
| GET | `/api/admin/dashboard` | 大盘数据 |
| POST | `/api/admin/orders/correct` | 数据修正(需密码+理由+审计) |

## 错误码

| Code | 说明 |
|---|---|
| `AUTH_EXPIRED` | Token过期，前端自动refresh |
| `AUTH_INVALID` | Token无效，跳转登录 |
| `TENANT_NOT_FOUND` | AppID无效 |
| `TENANT_EXPIRED` | 商家已到期 |
| `TENANT_PAUSED` | 商家暂停服务 |
| `STOCK_INSUFFICIENT` | 库存不足 |
| `ORDER_STATUS_CONFLICT` | 订单状态冲突(乐观锁) |
| `PAYMENT_FAILED` | 支付失败 |
| `CART_EXPIRED` | 购物车已过期 |
| `GROUP_ORDER_CLOSED` | 团单已截单/取消 |
| `COUPON_EXPIRED` | 优惠券已过期 |
| `BALANCE_INSUFFICIENT` | 余额不足 |
| `RATE_LIMITED` | 请求频率超限 |
| `FORBIDDEN` | 权限不足 |
