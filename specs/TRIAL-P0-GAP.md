# TRIAL-P0-GAP — 试点 P0 闭环差距审计

> 审计日期：2026-06-19  
> 审计范围：试点可上线版三条闭环（个人点餐、团餐拼单、商家高峰处理）  
> 审计依据：`PRODUCT-STRATEGY-SPEC.md`、`V1-SCOPE.md`、`BUSINESS-RULES.md`、`STATE-MACHINES.md`、`API-SPEC.md`

---

## 总览

| 闭环 | 完成度 | P0 阻断数 | 判定 |
|---|---|---|---|
| A. 个人点餐 | 70% | **6** | ❌ 不可试点 |
| B. 团餐拼单 | 50% | **7** | ❌ 不可试点 |
| C. 商家高峰处理 | 40% | **6** | ❌ 不可试点 |
| 资金安全 | — | **8** | ❌ 不可试点 |

**结论：当前代码处于 Demo 可演示版级别，未达到试点可上线版的 P0 闭环要求。共 27 个 P0 阻断项需修复。**

---

## 闭环 A：个人点餐闭环

> **定义**：菜单浏览 → SKU 选择 → 购物车 → 提交订单 → 微信支付 → 商家接单 → 厨房制作 → 用户取餐 → 完成

### ✅ 已完成能力

| 能力 | 文件 | 状态 |
|---|---|---|
| 菜品/SKU 浏览（分类、搜索、分页） | `dish.service.ts` | ✅ |
| 购物车 CRUD（服务端存储，24h 过期） | `cart.service.ts` | ✅ |
| 下单 + 乐观锁库存扣减 + 事务 | `order.service.ts:121-173` | ✅ |
| 订单状态机（9 种状态，状态转换校验） | `order.service.ts:14-21,284-399` | ✅ |
| 微信支付 JSAPI 预下单（RSA-SHA256 签名） | `payment.service.ts:49-168` | ✅ |
| 微信支付回调验签 + 幂等 + 状态更新事务 | `payment.service.ts:177-277` | ✅ |
| 支付超时 15 分钟自动取消 + 恢复库存 | `schedule.service.ts:19-125` | ✅ |
| 用户取消订单 + 恢复库存 | `order.service.ts:403-451` | ✅ |
| 退款申请 + 审批 + 恢复库存 | `order.service.ts:487-729` | ✅ |
| 取餐号自动生成 (A001~A999) | `order.service.ts:637-668` | ✅ |
| 再来一单 | `order.service.ts:454-483` | ✅ |
| 批量确认订单 | `order.service.ts:586-634` | ✅ |
| 催单标记 | `order.service.ts:550-583` | ✅ |

### ⚠️ 部分完成能力

| 能力 | 当前状态 | 差距描述 | 涉及文件 |
|---|---|---|---|
| 余额支付 | 直接抛异常 "余额支付暂未开放" | `payment.service.ts:101-104` — `channel === 'balance'` 时硬编码拒绝 | `payment/payment.service.ts` |
| 支付回调补偿 | 仅日志打印，未真正查询微信API | `schedule.service.ts:131-169` — 标注 `TODO` 未对接微信支付状态查询 | `schedule/schedule.service.ts` |
| 优惠券集成结算 | 未集成到下单流程 | `discount.service.ts` 有折扣计算引擎但未在 `order.service.create()` 中调用 | `order/order.service.ts`, `discount/discount.service.ts` |
| 优惠计算引擎 | 仅有折扣规则计算，缺少券/积分环节 | BUSINESS-RULES 规定的 4 阶段计算顺序（折扣→券→积分→补足）仅实现了第一步 | `discount/discount.service.ts` |

### 🔴 阻塞试点上线的问题

| ID | 问题 | 严重程度 | 涉及文件 | 验证命令 |
|---|---|---|---|---|
| A1 | **余额支付完全未实现** — 无法执行余额支付订单。`PrepaidService.consume()` 方法存在但未集成到 `PaymentService.prepay()` | P0 阻断 | `payment/payment.service.ts:101-104`, `prepaid/prepaid.service.ts:67-104` | `cd server && npm test -- --forceExit` |
| A2 | **退款审批未调用真实支付退款** — `OrderService.approveRefund()` 只恢复库存不调用 `PaymentService.refund()`，钱不会退给用户 | P0 阻断 | `order/order.service.ts:670-729` | 人工测试：审批退款 → 检查 PaymentRecord/RefundRecord 状态 |
| A3 | **Mock 支付回调无防护** — 微信支付未配置时，`notify` endpoint 跳过验签，任何人均可构造 POST 请求完成支付 | P0 阻断 | `payment/payment.service.ts:185-198` | POST `/api/payment/notify` 不携带签名 → 不触发403 |
| A4 | **支付成功后的库存未处理** — `handleNotify` 更新 order status 为 paid 后未二次确认库存有效（虽然下单时已扣减，但需处理极端并发） | P0 风险 | `payment/payment.service.ts:228-257` | 并发测试：支付回调与超时取消竞态 |
| A5 | **支付超时取消未查微信状态** — BUSINESS-RULES 第 6 条要求"取消前先查微信订单状态"，但 `handlePaymentTimeout` 直接取消 | P0 风险 | `schedule/schedule.service.ts:43-83` | 并发测试：支付回调与超时取消竞态 |
| A6 | **订单下单时声明 `paymentMethod` 但未使用** — 用户可选微信/余额，但后端未校验余额是否足够 | P0 阻断 | `order/order.service.ts:57` | POST `/api/orders` with `paymentMethod: "balance"` → 仍然返回成功 |

---

## 闭环 B：团餐拼单闭环

> **定义**：发起团单 → 分享 → 多人加入 → 截单 → 商家看到团单汇总 → 厨房按团单备餐 → 完成

### ✅ 已完成能力

| 能力 | 文件 | 状态 |
|---|---|---|
| 创建拼单团单 (pool 模式) | `group-order.service.ts:36-74` | ✅ |
| 加入团单 (upsert 子项) | `group-order.service.ts:123-200` | ✅ |
| 创建代表下单 (represent 模式) | `group-order.service.ts:283-347` | ✅ |
| 团单详情 + 参与者列表 + 商品汇总 | `group-order.service.ts:102-120` | ✅ |
| 截单 (Condition A 金额检查) | `group-order.service.ts:203-279` | ✅ |
| 取消团单 | `group-order.service.ts:350-381` | ✅ |
| 活跃团单列表 | `group-order.service.ts:77-98` | ✅ |
| 截单/取消失败通知 (fire-and-forget) | `group-order.service.ts:253-276` | ✅ |

### ⚠️ 部分完成能力

| 能力 | 当前状态 | 差距描述 | 涉及文件 |
|---|---|---|---|
| 截单库存检查 | 截单时无库存二次校验 | BUSINESS-RULES 要求"截单后的库存二次校验"，但 `closePool` 未检查 SKU availableStock | `group-order/group-order.service.ts:203-279` |
| Condition B | 未实现 | 代码仅实现 Condition A（金额达标），Condition B "全员支付失败→取消" 无对应逻辑 | `group-order/group-order.service.ts:223-238` |
| 代表下单 | 创建团单后不生成订单 | `representOrder` status 直接设为 `success`，但没有生成 Order 记录 | `group-order/group-order.service.ts:283-347` |

### 🔴 阻塞试点上线的问题

| ID | 问题 | 严重程度 | 涉及文件 | 验证命令 |
|---|---|---|---|---|
| B1 | **团单无支付流程** — 参与者无法为团单子项支付。`joinPool` 只创建 `GroupOrderItem`，不创建 `PaymentRecord` 或 `Order` | P0 阻断 | `group-order/group-order.service.ts:123-200` | E2E：创建团单 → 加入 → 尝试支付 → 无可用 API |
| B2 | **截单后不生成订单** — `closePool` 只改 `groupOrder.status`，未创建 Order 记录。商家看不到可处理的订单 | P0 阻断 | `group-order/group-order.service.ts:203-279` | E2E：截单 → 检查 Order 表 → 无新记录 |
| B3 | **30s 截单缓冲缺失** — BUSINESS-RULES 要求"缓冲 30s → 已支付合并，未支付取消+释放"，但 `closePool` 无任何缓冲逻辑 | P0 阻断 | `group-order/group-order.service.ts:203-279` | E2E：截单临界窗口仍可加入 → 应被拒绝 |
| B4 | **加入时不校验库存** — `joinPool` 的 SKU 验证仅检查 `status: 'active'`，不检查 `availableStock >= quantity` | P0 阻断 | `group-order/group-order.service.ts:140-153` | E2E：对库存为 0 的 SKU 加入团单 → 目前可以成功 |
| B5 | **截单截止时间无自动触发** — 团单 `deadline` 字段存在，但没有 cron job 自动截单。`schedule.service.ts` 无相关逻辑 | P0 阻断 | `group-order/group-order.service.ts`，`schedule/schedule.service.ts` | E2E：创建 deadline=5min 的团单 → 等待 → 不会被自动截单 |
| B6 | **团单分享链接跳转行为未定义** — PRODUCT-STRATEGY-SPEC §10.2 要求明确分享链接在未登录/已截单/已取消/已完成时的行为。小程序端 (`miniprogram/src/pages/group-detail/group-detail.vue`) 需确认 | P0 风险 | `miniprogram/src/pages/group-detail/group-detail.vue` | 小程序构建：`cd miniprogram && node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin` |
| B7 | **代表下单无支付集成** — 代表下单创建团单后，无法支付（没有生成 Order + PaymentRecord） | P0 阻断 | `group-order/group-order.service.ts:283-347` | E2E：创建代表下单 → 无后续支付支持 |

---

## 闭环 C：商家高峰处理闭环

> **定义**：新订单提醒 → 订单列表 → 厨房大屏 → 打印/补打 → 批量出餐 → 今日对账

### ✅ 已完成能力

| 能力 | 文件 | 状态 |
|---|---|---|
| 商家订单列表（筛选、分页） | `order.service.ts:241-282` | ✅ |
| 订单状态管理（乐观锁） | `order.service.ts:284-399` | ✅ |
| 批量接单 (transaction 内逐一处理) | `order.service.ts:586-634` | ✅ |
| 打印机 CRUD | `printer/printer.service.ts:43-87` | ✅ |
| 小票内容构建 (58mm 热敏格式) | `printer/printer.service.ts:199-285` | ✅ |
| 补打标识 | `printer/printer.service.ts:173-195` | ✅ |
| 支付超时自动取消 | `schedule.service.ts:19-125` | ✅ |
| 日终自动完成 (22:00 ready→picked) | `schedule.service.ts:309-329` | ✅ |
| 退款审批 | `order.service.ts:670-729` | ✅ |

### ⚠️ 部分完成能力

| 能力 | 当前状态 | 差距描述 | 涉及文件 |
|---|---|---|---|
| 云打印对接 | 三个品牌 (易联云/飞鹅/商米) 均只 `throw new Error('...API 尚未对接')` | 开发环境仅日志模拟打印内容，真实打印不可用 | `printer/printer.service.ts:324-370` |
| 商家看板 | 只有在 `admin.service.ts` 的平台大盘 `getDashboard()` | 没有商家端 `/api/merchant/dashboard` 端点，商家看不到今日营收/订单/Top10 | `admin/admin.service.ts:358-448` |
| 5s 自动刷新 | 无 WebSocket/SSE/polling 机制 | 厨房模式的前端 `admin-web/src/views/KitchenMode.vue` 需要轮询，但后端无对应高效查询 API | `admin-web/src/views/KitchenMode.vue` |

### 🔴 阻塞试点上线的问题

| ID | 问题 | 严重程度 | 涉及文件 | 验证命令 |
|---|---|---|---|---|
| C1 | **厨房模式后端 API 缺失** — `server/src/` 中完全不存在 kitchen 模块。前端 `KitchenMode.vue` 无后端 API 支持（无 `/api/merchant/kitchen/orders` 或类似端点） | P0 阻断 | 新增 `server/src/kitchen/` | E2E：打开厨房模式页面 → 无数据 |
| C2 | **商家今日看板缺失** — API-SPEC 定义的 `GET /api/merchant/dashboard`（今日营收/订单数/Top10）未实现 | P0 阻断 | 新增商家 dashboard 端点 | `curl GET /api/merchant/dashboard` → 404 |
| C3 | **日对账端点缺失** — API-SPEC 定义的 `GET /api/merchant/reconciliation?date=` 未实现 | P0 阻断 | 新增 reconciliation 端点 | `curl GET /api/merchant/reconciliation?date=2026-06-19` → 404 |
| C4 | **订单状态变更后无自动打印** — `OrderService.updateStatus()` 无触发 `PrinterService.printOrder()` | P0 阻断 | `order/order.service.ts:284-399`, `printer/printer.service.ts` | E2E：商家确认订单 → 打印机无输出 |
| C5 | **云打印 API 全部未对接** — 三个品牌 API 都是 throw Error。试点必须至少对接 1 个品牌（易联云使用最广） | P0 阻断 | `printer/printer.service.ts:324-370` | E2E：真实打印机测试 |
| C6 | **新订单无推送/声音提醒** — 商家接单页面无任何新订单主动提醒机制。`NotifyService` 存在但未在订单创建时调用 | P0 风险 | `order/order.service.ts:56-176`, `notify/notify.service.ts` | E2E：提交新订单 → 商家端无提醒 |

---

## 🔴 资金 / 库存 / 订单状态高风险问题

### 预充值账本风险（最严重）

| ID | 问题 | 严重程度 | 涉及文件 | 详细说明 |
|---|---|---|---|---|
| F1 | **充值直接入账，绕过支付回调** — `PrepaidService.recharge()` 在创建充值请求时直接在 Prisma transaction 中 `balance: { increment: amountInFen }` 增加余额。这违反 PRODUCT-STRATEGY-SPEC §10.1 "充值成功必须以支付回调为准，不得下单时直接入账" | 🔴 P0 阻断 | `prepaid/prepaid.service.ts:29-62` | `recharge()` 方法内：先 increment balance，再 create PrepaidTransaction 记录 purchase 流水，最后返回 mock 支付参数。全程无微信支付参与 |
| F2 | **Mock 充值导致余额凭空产生** — 开发环境下调用 `recharge` 可直接获得余额。余额可在 `consume()` 中正常使用，相当于无限免费资金 | 🔴 P0 阻断 | `prepaid/prepaid.service.ts:29-62,67-104` | 虽试点期预充值默认关闭 (§5.2)，但代码不经模块检查即可调用 |
| F3 | **PrepaidTransaction 未关联 PaymentRecord** — 充值流水表中 `channel` 字段为 `'wechat'`，但没有 `paymentRecordId` 外键。充值支付回调无法追溯到对应充值流水 | 🔴 P0 阻断 | `prisma/schema.prisma:421-431` | PrepaidTransaction 缺少 `paymentRecordId` 字段 |
| F4 | **余额消费无幂等保护** — `consume()` 方法根据 `orderId` 构建 `channel: 'order_${orderId}'`，但没有幂等检查。如果同一笔订单重复调用，会多次扣款 | 🔴 P0 阻断 | `prepaid/prepaid.service.ts:67-104` | 需在 consume 前检查是否已存在相同 orderId 的消费流水 |
| F5 | **余额退款无幂等保护** — `refund()` 方法无防止重复退款的机制 | 🔴 P0 阻断 | `prepaid/prepaid.service.ts:109-139` | 需检查是否已有相同 reason/orderId 的退款流水 |

### 支付流程风险

| ID | 问题 | 严重程度 | 涉及文件 | 详细说明 |
|---|---|---|---|---|
| F6 | **Mock 支付可被滥用完成订单** — `prepay()` 在微信未配置时创建 `status: 'pending'` 的 PaymentRecord 并返回 mock JSAPI 参数。然后 `notify` 的验签在未配置时直接跳过。攻击者只需：① POST prepay → ② POST notify（伪造 body）→ 订单变为 paid | 🔴 P0 阻断 | `payment/payment.service.ts:76-98,185-198` | 建议：mock 模式下 prepay 返回的状态标记应不同于真实支付，且 notify 在 mock 模式下应拒绝处理 |
| F7 | **支付回调与超时取消失败** — `handlePaymentTimeout` 取消订单时未先查微信订单状态（BUSINESS-RULES §6 要求），可能导致：用户已微信支付成功但订单被定时任务取消 | 🔴 P0 阻断 | `schedule/schedule.service.ts:43-83` | 需在取消前调用微信支付查询 API 确认支付状态 |
| F8 | **退款审批后余额退款未执行** — 如果用户用余额支付，`approveRefund` 不调用 `PrepaidService.refund()` | 🔴 P0 阻断 | `order/order.service.ts:670-729`, `prepaid/prepaid.service.ts:109-139` | 需要根据 PaymentRecord.channel 判断退款方式 |

### 库存并发风险

| 风险 | 当前状态 | 建议 |
|---|---|---|
| 下单时库存扣减用乐观锁 | ✅ 已实现 `version` + `gte` 检查 | — |
| 支付成功时库存二次确认 | ❌ 未实现 | `handleNotify` 需确认 SKU availableStock |
| 取消时库存恢复 | ✅ 已实现 | — |

---

## 建议修复顺序

按照 `PRODUCT-STRATEGY-SPEC.md` 的优先级排列：

### 第一阶段：资金安全（1-2 天）

| 序号 | 修复项 | 影响闭环 | 涉及文件 |
|---|---|---|---|
| 1 | **预充值改造**：recharge 不直接入账，先创建 pending 流水，支付回调成功后才增加余额 | A + 资金安全 | `prepaid/prepaid.service.ts`, `payment/payment.service.ts`, `prisma/schema.prisma` |
| 2 | **余额支付集成**：实现 `prepay` 中的 `channel=balance` 分支 | A | `payment/payment.service.ts`, `prepaid/prepaid.service.ts` |
| 3 | **余额消费幂等**：consume 前检查是否存在同订单流水 | A + 资金安全 | `prepaid/prepaid.service.ts` |
| 4 | **余额退款幂等**：refund 前检查是否重复退款 | A + 资金安全 | `prepaid/prepaid.service.ts` |
| 5 | **Mock 支付保护**：未配置微信时拒绝回调处理 | A + 资金安全 | `payment/payment.service.ts` |
| 6 | **PrepaidTransaction 关联 PaymentRecord** | 资金安全 | `prisma/schema.prisma`, `prepaid/prepaid.service.ts` |

### 第二阶段：支付完整闭环（1-2 天）

| 序号 | 修复项 | 影响闭环 | 涉及文件 |
|---|---|---|---|
| 7 | **支付超时取消前查询微信状态** | A | `schedule/schedule.service.ts` |
| 8 | **退款审批集成支付退款** | A | `order/order.service.ts`, `payment/payment.service.ts` |
| 9 | **支付回调补偿真正查询微信** | A | `schedule/schedule.service.ts`, `payment/payment.service.ts` |

### 第三阶段：团餐闭环补齐（2-3 天）

| 序号 | 修复项 | 影响闭环 | 涉及文件 |
|---|---|---|---|
| 10 | **团单支付流程**：参与者可以为其子订单支付 | B | `group-order/group-order.service.ts`, `payment/payment.service.ts` |
| 11 | **截单生成订单**：closePool 后生成 Order 记录 | B | `group-order/group-order.service.ts`, `order/order.service.ts` |
| 12 | **30s 截单缓冲**：缓冲窗口 + 状态锁 | B | `group-order/group-order.service.ts` |
| 13 | **加入团单时库存校验** | B | `group-order/group-order.service.ts` |
| 14 | **团单截止时间自动触发** | B | `group-order/group-order.service.ts`, `schedule/schedule.service.ts` |
| 15 | **截单库存二次校验** | B | `group-order/group-order.service.ts` |
| 16 | **代表下单支付集成** | B | `group-order/group-order.service.ts`, `payment/payment.service.ts` |

### 第四阶段：商家高峰处理补齐（1-2 天）

| 序号 | 修复项 | 影响闭环 | 涉及文件 |
|---|---|---|---|
| 17 | **厨房模式后端 API** | C | 新增 `server/src/kitchen/` |
| 18 | **商家今日看板** | C | `settings/settings.service.ts` 或新增 merchant controller |
| 19 | **日对账端点** | C | 同上 |
| 20 | **订单状态变更触发自动打印** | C | `order/order.service.ts`, `printer/printer.service.ts` |
| 21 | **对接至少 1 个云打印机品牌** | C | `printer/printer.service.ts` |

---

## 每个任务建议验证命令

| 任务 | 验证命令 |
|---|---|
| 预充值改造 | `cd server && npm test -- --forceExit --testPathPattern=prepaid` |
| 余额支付集成 | `cd server && npm test -- --forceExit` (新增 payment service 测试) |
| 余额幂等 | `cd server && npm test -- --forceExit --testPathPattern=prepaid` |
| Mock 保护 | `curl -X POST http://localhost:3000/api/payment/notify -H 'Content-Type: application/json' -d '{}'` → 应返回 400/403，不是 200 |
| 团单支付 | `cd server && npm test -- --forceExit --testPathPattern=group-order` |
| 厨房模式 | `cd admin-web && npm run build`（前端编译检查）+ 人工确认厨房页 |
| 商家看板 | `curl http://localhost:3000/api/merchant/dashboard -H 'Authorization: Bearer <admin-JWT>' -H 'x-tenant-id: <tenant-id>'` |
| 全部回归 | `cd server && npm run format && npm run lint && npm test -- --forceExit` |
| 小程序编译 | `cd miniprogram && node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin` |
| 管理后台编译 | `cd admin-web && npm run build` |

---

## 模块依赖注意事项

根据 `PRODUCT-STRATEGY-SPEC.md` §6.3 模块降级要求：

| 修复项 | 模块依赖 | 处理方式 |
|---|---|---|
| 预充值 | `prepaid` 模块 | 试点期默认关闭。但即使关闭，`PrepaidService` 仍然可被调用（无模块检查守卫）。需加 `ModuleGuard` |
| 余额支付 | `prepaid` 模块 | 同上 — 需要模块检查 |
| 团单 | `group-meal` 模块 | 试点核心模块，必须开启 |
| 打印 | `printer` 模块 | 试点核心模块，至少 1 品牌可用 |
| 积分/优惠券 | `points`/`coupon` 模块 | 试点期默认关闭，不阻塞上线 |

**尚未解决的关键架构问题**：目前后端 Service 层没有模块启用检查。如果 `prepaid` 模块未分配给租户，`PrepaidService.recharge()` 仍然可以被调用。需要在 Controller 层添加模块守卫或在 AppModule 中按模块状态条件加载路由。

---

## 附录：当前测试覆盖

| 模块 | 测试文件 | 覆盖范围 |
|---|---|---|
| Auth | `auth.service.spec.ts` | 登录/JWT/刷新 |
| Admin | `admin.service.spec.ts` | 平台后台 CRUD |
| Brand | `brand.service.spec.ts` | 品牌配置 |
| Cart | `cart.service.spec.ts` | 购物车 CRUD |
| Coupon | `coupon.service.spec.ts` | 优惠券 |
| Discount | `discount.service.spec.ts` | 折扣规则 |
| GroupOrder | `group-order.service.spec.ts` | 团单 (部分) |
| Order | `order.service.spec.ts` | 订单/库存 |
| Points | `points.service.spec.ts` | 积分 |
| Prepaid | `prepaid.service.spec.ts` | 预充值 (有问题 — recharge 测试期望余额直接增加) |
| Schedule | `schedule.service.spec.ts` | 定时任务 |

**缺失的关键测试**：
- ❌ `payment.service.spec.ts` — **完全不存在**
- ❌ `printer.service.spec.ts` — 不存在
- ⚠️ `group-order.service.spec.ts` — 存在但未覆盖支付/截单生成订单
- ⚠️ `prepaid.service.spec.ts` — 存在但测试了错误的充值行为（期望直接增加余额）
