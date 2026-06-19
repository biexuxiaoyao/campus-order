# Agentic Verification Spec — 端到端可执行测试规格

> **版本**: v1.0
> **创建日期**: 2026-06-17
> **读者**: Claude Code Agent（非人类）
> **配套文档**: `specs/E2E-TEST-SPEC.md`（Human 版）、`specs/QA-TEST-SPEC.md`（QA 测试清单）
>
> ## Agent 使用说明
>
> 读取本文件后，按以下规则执行：
> 1. 从阶段 1 开始，**严格按 `depends_on` 拓扑排序**
> 2. 每个 step 执行前检查前置变量是否已就绪
> 3. 每个 step 执行后运行断言块，任一断言失败 → 标记 `FAIL`
> 4. `{{变量}}` 的值从前面 step 的 `export` 块提取
> 5. 阶段内可并行执行没有相互依赖的 step
> 6. 阶段之间串行（下一阶段依赖上一阶段的产出变量）

---

## 全局配置

```yaml
base_url: http://localhost:3000
app_id: wx_test_001
tenant_name: 老张私房菜
store_id: "1"                    # 种子数据中的默认门店
p_admin_user: platform_admin
p_admin_pass: admin123           # 种子数据
```

---

## 阶段时序依赖（Agent 必须遵守）

```
原因：数据创建依赖链是单向的。跳过前面阶段必然失败——不是 Bug，是前置数据不存在。

阶段 1 (P端入驻)      ← 无依赖，可直接执行
  │  产出: {{tenant_id}}
  │
阶段 2 (P端配置)      ← 依赖阶段 1 的 {{tenant_id}}
  │  产出: License 状态 = active
  │
阶段 3 (B端登录)      ← 依赖阶段 2: License 必须 active
  │  产出: {{b_admin_token}}, {{category_id}}
  │  否则: B端登录直接 403 TENANT_EXPIRED
  │
阶段 4 (B端菜品)      ← 依赖阶段 3: 分类已创建
  │  产出: {{dish_id_1}}, {{dish_id_2}}, {{dish_id_3}}
  │  否则: 无法创建菜品（缺少 categoryId）
  │
阶段 5 (B端运营)      ← 依赖阶段 4: 菜品已上架
  │  产出: {{discount_id}}, {{coupon_template_id}}, 多角色 token
  │  否则: 折扣/券无菜品可应用
  │
阶段 6 (C端启动)      ← 依赖阶段 1: 租户已存在
  │  产出: {{c_token_a}}, {{c_token_b}}, {{user_id_a}}, {{user_id_b}}
  │  否则: 微信登录找不到租户
  │
阶段 7 (C端点餐)      ← 依赖阶段 4 + 阶段 6: 菜品可见 + C端已登录
  │  产出: {{order_id}}, {{pickup_no}}, {{sku_id_1}}, {{sku_id_2}}
  │  否则: 菜单为空或未登录
  │
阶段 8 (高级场景)     ← 依赖阶段 7: 订单已存在
     产出: {{group_order_id}}
     否则: 退款/催单/再来一单无订单可操作
```

### Agent 执行顺序强制规则

```
1. 阶段之间必须串行：阶段 N 的所有 must-pass 用例通过后，才能启动阶段 N+1
2. 阶段内部：无 depends_on 冲突的用例可并行
3. 跨阶段变量校验：启动新阶段前，检查该阶段依赖的所有 export 变量是否已就绪
4. 变量缺失 → 不执行该阶段 → 报告 "BLOCKED: 前置变量 {{xxx}} 未就绪"
5. 断点续跑：如果阶段 1-4 已通过，可直接从阶段 5 开始（变量需从上次运行的结果文件加载）
```

### 阶段入口守卫

| 阶段 | 守卫条件 | 不满足时的行为 |
|------|---------|--------------|
| 阶段 2 | `{{tenant_id}}` 非空 | BLOCKED |
| 阶段 3 | `{{tenant_id}}` 的 License = active（调用 API 验证） | BLOCKED: TENANT_EXPIRED |
| 阶段 4 | `{{category_id}}` 非空 | BLOCKED |
| 阶段 5 | `{{dish_id_1}}` 的 status = published | BLOCKED |
| 阶段 6 | `{{app_id}}` 对应的租户存在 | BLOCKED: TENANT_NOT_FOUND |
| 阶段 7 | `{{sku_id_1}}` 非空 AND `{{c_token_a}}` 非空 | BLOCKED |
| 阶段 8 | `{{order_id}}` 非空 | BLOCKED |

---

## 阶段 1 — P 端：商家入驻与审核

### E2E-1.1 创建 Tenant

```yaml
id: E2E-1.1
name: 创建Tenant-正常流程
phase: 1
depends_on: []
role: P端管理员
```

**Step 1.1.1 — P端登录获取 token**

```bash
curl -s -X POST {{base_url}}/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"username":"{{p_admin_user}}","password":"{{p_admin_pass}}"}'
```
断言:
- HTTP status = 200 或 201
- `$.code` = 0
- `$.data.token` 存在且非空 → export `{{p_token}}`

**Step 1.1.2 — 创建新租户**

```bash
curl -s -X POST {{base_url}}/api/admin/tenants \
  -H "Authorization: Bearer {{p_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"appId":"{{app_id}}","name":"{{tenant_name}}"}'
```
断言:
- HTTP status = 200 或 201
- `$.data.id` 存在 → export `{{tenant_id}}`
- `$.data.status` = "active"
- `$.data.licenseKey` 长度 >= 32
- `$.data.name` = "{{tenant_name}}"

**Step 1.1.3 — 验证默认 BrandConfig**

```bash
curl -s -X GET {{base_url}}/api/brand/config \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.name` = "{{tenant_name}}"
- `$.data.themeColor` = "#07C160" 或 "#1A6EFF"
- `$.data.hours` 存在

**Step 1.1.4 — 验证菜单为空**

```bash
curl -s -X GET "{{base_url}}/api/dishes?storeId={{store_id}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.items` 数组长度 = 0 或 `$.data.total` = 0

**Step 1.1.5 — 验证 admin 账号已自动创建**

```bash
curl -s -X GET "{{base_url}}/api/merchant/staff" \
  -H "Authorization: Bearer {{p_token}}" \
  -H "x-tenant-id: {{tenant_id}}"
```
断言:
- HTTP status = 200
- `$.data` 中存在 username="admin" 且 role="admin" 的记录


### E2E-1.2 appId 唯一性校验

```yaml
id: E2E-1.2
name: 创建重复appId
phase: 1
depends_on: [E2E-1.1]
```

```bash
curl -s -X POST {{base_url}}/api/admin/tenants \
  -H "Authorization: Bearer {{p_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"appId":"{{app_id}}","name":"重复商家"}'
```
断言:
- HTTP status = 409
- `$.code` = "DATA_CONFLICT"


### E2E-1.3 入驻审核

```yaml
id: E2E-1.3
name: 入驻审核流程
phase: 1
depends_on: [E2E-1.1]
```

**Step 1.3.1 — 审核通过**

```bash
curl -s -X POST {{base_url}}/api/admin/tenants/{{tenant_id}}/review \
  -H "Authorization: Bearer {{p_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"approved":true}'
```
断言:
- HTTP status = 200
- `$.data.status` = "active"

**Step 1.3.2 — 验证审计日志已记录**

```bash
curl -s -X GET "{{base_url}}/api/merchant/audit-logs?action=create&pageSize=5" \
  -H "Authorization: Bearer {{p_token}}" \
  -H "x-tenant-id: demo"
```
断言:
- HTTP status = 200
- `$.data.items` 中至少一条 targetType 含 "tenant"


---

## 阶段 2 — P 端：模块分配与 License

### E2E-2.1 模块分配

```yaml
id: E2E-2.1
name: 模块分配
phase: 2
depends_on: [E2E-1.1]
```

**Step 2.1.1 — 为租户分配模块**

```bash
curl -s -X PUT {{base_url}}/api/admin/tenants/{{tenant_id}}/modules \
  -H "Authorization: Bearer {{p_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"moduleIds":["base","group-meal","discount","coupon","points","prepaid","printer","push-notify"]}'
```
断言:
- HTTP status = 200
- `$.data.modules` 数组长度 = 8

**Step 2.1.2 — 验证无效模块 ID 被拒绝**

```bash
curl -s -X PUT {{base_url}}/api/admin/tenants/{{tenant_id}}/modules \
  -H "Authorization: Bearer {{p_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"moduleIds":["base","nonexistent"]}'
```
断言:
- HTTP status = 400


### E2E-2.2 License 管理

```yaml
id: E2E-2.2
name: License签发与吊销
phase: 2
depends_on: [E2E-1.1]
```

**Step 2.2.1 — 签发 License**

```bash
curl -s -X PUT {{base_url}}/api/admin/tenants/{{tenant_id}}/license \
  -H "Authorization: Bearer {{p_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"action":"issue"}'
```
断言:
- HTTP status = 200
- `$.data.licenseKey` 非 null，长度 >= 32

**Step 2.2.2 — 吊销 License**

```bash
curl -s -X PUT {{base_url}}/api/admin/tenants/{{tenant_id}}/license \
  -H "Authorization: Bearer {{p_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"action":"revoke"}'
```
断言:
- HTTP status = 200
- `$.data.status` = "expired" 或 `$.data.licenseKey` = null

**Step 2.2.3 — 验证吊销后 B 端不可登录**

```bash
curl -s -X POST {{base_url}}/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"username":"admin","password":"admin123"}'
```
断言:
- HTTP status = 403
- `$.code` 含 "TENANT_EXPIRED" 或 "FORBIDDEN"

**Step 2.2.4 — 重新签发恢复**

```bash
curl -s -X PUT {{base_url}}/api/admin/tenants/{{tenant_id}}/license \
  -H "Authorization: Bearer {{p_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"action":"issue"}'
```
断言:
- HTTP status = 200
- `$.data.status` = "active"


---

## 阶段 3 — B 端：首次登录与初始化

### E2E-3.1 获取 admin 初始密码并登录

```yaml
id: E2E-3.1
name: B端首次登录
phase: 3
depends_on: [E2E-2.2]  # License 需为 active
```

**Step 3.1.1 — admin 登录管理后台**

```bash
curl -s -X POST {{base_url}}/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"username":"admin","password":"admin123"}'
```
断言:
- HTTP status = 200
- `$.data.token` 存在 → export `{{b_admin_token}}`
- `$.data.user.role` = "admin"
- `$.data.user.tenantId` = "{{tenant_id}}"


### E2E-3.2 引导初始化

```yaml
id: E2E-3.2
name: 四步引导流程
phase: 3
depends_on: [E2E-3.1]
```

**Step 3.2.1 — 上传 Logo（准备图片文件）**

> Agent 注意：此步骤需要本地有测试图片。如无 `test-logo.png`，跳过图片上传步骤，直接使用 URL 配置。

**Step 3.2.2 — 更新品牌配置**

```bash
curl -s -X PUT {{base_url}}/api/brand/config \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"name":"{{tenant_name}}","logo":"https://example.com/logo.png","themeColor":"#FF6B35","phone":"13800138000"}'
```
断言:
- HTTP status = 200
- `$.code` = 0

**Step 3.2.3 — 设置营业时间**

```bash
curl -s -X PUT {{base_url}}/api/merchant/settings \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"openTime":"07:00","closeTime":"21:00","paused":false}'
```
断言:
- HTTP status = 200

**Step 3.2.4 — 创建第一个菜品分类**

```bash
curl -s -X POST {{base_url}}/api/merchant/stores/{{store_id}}/categories \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"name":"午餐套餐","sortOrder":1}'
```
断言:
- HTTP status = 200 或 201
- `$.data.id` 存在 → export `{{category_id}}`

**Step 3.2.5 — 验证 C 端品牌配置已更新**

```bash
curl -s -X GET {{base_url}}/api/brand/config \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.name` = "{{tenant_name}}"
- `$.data.hours` = "07:00-21:00"


### E2E-3.3 登录异常

```yaml
id: E2E-3.3
name: 暴力破解锁定
phase: 3
depends_on: [E2E-3.1]
```

**Step 3.3.1 — 连续 5 次错误密码**

> Agent: 循环执行 5 次，每次间隔 100ms

```bash
curl -s -X POST {{base_url}}/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"username":"admin","password":"wrongpassword"}'
```
断言（第 1-4 次）:
- HTTP status = 401

断言（第 5 次及之后）:
- HTTP status = 401 或 403
- `$.message` 含 "锁定" 或 "locked"

---

## 阶段 4 — B 端：菜品搭建

### E2E-4.1 创建菜品（含 SKU）

```yaml
id: E2E-4.1
name: 创建带规格的菜品
phase: 4
depends_on: [E2E-3.2]
```

**Step 4.1.1 — 创建菜品**

```bash
curl -s -X POST {{base_url}}/api/merchant/stores/{{store_id}}/dishes \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{
    "name":"红烧肉套餐",
    "categoryId":"{{category_id}}",
    "imageUrl":"https://example.com/dish1.jpg",
    "unit":"份",
    "price":2800,
    "description":"五花肉慢炖2小时，配时蔬米饭"
  }'
```
断言:
- HTTP status = 200 或 201
- `$.data.id` 存在 → export `{{dish_id_1}}`
- `$.data.status` = "draft"
- `$.data.price` = 2800

**Step 4.1.2 — 创建第二个菜品**

```bash
curl -s -X POST {{base_url}}/api/merchant/stores/{{store_id}}/dishes \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{
    "name":"番茄炒蛋饭",
    "categoryId":"{{category_id}}",
    "imageUrl":"https://example.com/dish2.jpg",
    "unit":"份",
    "price":1500,
    "description":"经典家常菜"
  }'
```
断言:
- HTTP status = 200 或 201
- `$.data.id` 存在 → export `{{dish_id_2}}`

**Step 4.1.3 — 创建第三个菜品**

```bash
curl -s -X POST {{base_url}}/api/merchant/stores/{{store_id}}/dishes \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{
    "name":"青椒肉丝面",
    "categoryId":"{{category_id}}",
    "imageUrl":"https://example.com/dish3.jpg",
    "unit":"碗",
    "price":1200,
    "description":"手擀面配青椒肉丝"
  }'
```
断言:
- HTTP status = 200 或 201
- `$.data.id` 存在 → export `{{dish_id_3}}`


### E2E-4.2 上架菜品

```yaml
id: E2E-4.2
name: 上架菜品
phase: 4
depends_on: [E2E-4.1]
```

**Step 4.2.1 — 上架菜品1**

```bash
curl -s -X PUT {{base_url}}/api/merchant/dishes/{{dish_id_1}}/publish \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "x-tenant-id: {{tenant_id}}"
```
断言:
- HTTP status = 200
- `$.data.status` = "published"

**Step 4.2.2 — 上架菜品2和3（批量）**

```bash
curl -s -X POST {{base_url}}/api/merchant/dishes/batch-status \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"ids":["{{dish_id_2}}","{{dish_id_3}}"],"status":"published"}'
```
断言:
- HTTP status = 200

**Step 4.2.3 — C 端验证菜品可见**

```bash
curl -s -X GET "{{base_url}}/api/dishes?storeId={{store_id}}&pageSize=20" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.items` 数组长度 >= 3
- 所有 item 的 status 不含 "draft"


### E2E-4.3 边界值校验

```yaml
id: E2E-4.3
name: 菜品数量上限
phase: 4
depends_on: [E2E-4.1]
```

```bash
curl -s -X GET "{{base_url}}/api/merchant/dishes?storeId={{store_id}}&pageSize=200" \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "x-tenant-id: {{tenant_id}}"
```
断言:
- HTTP status = 200
- `$.data.total` <= 500


---

## 阶段 5 — B 端：运营配置

### E2E-5.1 折扣规则

```yaml
id: E2E-5.1
name: 创建并验证折扣规则
phase: 5
depends_on: [E2E-4.2]
```

**Step 5.1.1 — 创建满减规则**

```bash
curl -s -X POST {{base_url}}/api/merchant/stores/{{store_id}}/discounts \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{
    "name":"满50减10",
    "conditions":{"min_amount":5000},
    "actions":{"type":"amount_off","value":1000},
    "priority":10,
    "isStackable":false
  }'
```
断言:
- HTTP status = 200 或 201
- `$.data.id` 存在 → export `{{discount_id}}`

**Step 5.1.2 — 创建折扣规则**

```bash
curl -s -X POST {{base_url}}/api/merchant/stores/{{store_id}}/discounts \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{
    "name":"午餐9折",
    "conditions":{"min_amount":3000},
    "actions":{"type":"percent_off","value":10},
    "priority":5,
    "isStackable":false
  }'
```
断言:
- HTTP status = 200 或 201


### E2E-5.2 优惠券模板

```yaml
id: E2E-5.2
name: 创建优惠券模板
phase: 5
depends_on: [E2E-4.2]
```

**Step 5.2.1 — 创建满减券模板**

```bash
curl -s -X POST {{base_url}}/api/merchant/stores/{{store_id}}/coupon-templates \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{
    "name":"新人满20减5",
    "type":"full_reduction",
    "threshold":2000,
    "value":500,
    "totalQty":100,
    "validDays":7
  }'
```
断言:
- HTTP status = 200 或 201
- `$.data.id` 存在 → export `{{coupon_template_id}}`
- `$.data.totalQty` = 100


### E2E-5.4 员工账号与权限矩阵

```yaml
id: E2E-5.4
name: 创建员工并验证权限
phase: 5
depends_on: [E2E-3.2]
```

**Step 5.4.1 — 创建店长**

```bash
curl -s -X POST {{base_url}}/api/merchant/staff \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"username":"manager1","password":"P@ssw0rd","role":"manager"}'
```
断言:
- HTTP status = 200 或 201

**Step 5.4.2 — 创建厨师**

```bash
curl -s -X POST {{base_url}}/api/merchant/staff \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"username":"chef1","password":"P@ssw0rd","role":"chef"}'
```
断言:
- HTTP status = 200 或 201

**Step 5.4.3 — 店长登录**

```bash
curl -s -X POST {{base_url}}/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"username":"manager1","password":"P@ssw0rd"}'
```
断言:
- HTTP status = 200
- `$.data.user.role` = "manager"
- `$.data.token` 存在 → export `{{b_manager_token}}`

**Step 5.4.4 — 厨师登录**

```bash
curl -s -X POST {{base_url}}/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"username":"chef1","password":"P@ssw0rd"}'
```
断言:
- HTTP status = 200
- `$.data.user.role` = "chef"
- `$.data.token` 存在 → export `{{b_chef_token}}`

**Step 5.4.5 — 店长尝试创建员工（应被拒绝）**

```bash
curl -s -X POST {{base_url}}/api/merchant/staff \
  -H "Authorization: Bearer {{b_manager_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"username":"illegal","password":"P@ssw0rd","role":"staff"}'
```
断言:
- HTTP status = 403

**Step 5.4.6 — 店长尝试退款审批（应被拒绝）**

```bash
curl -s -X POST {{base_url}}/api/merchant/orders/999/refund/approve \
  -H "Authorization: Bearer {{b_manager_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"approved":true}'
```
断言:
- HTTP status = 403 或 404（先被权限拦截）


---

## 阶段 6 — C 端：启动与登录

### E2E-6.1 微信登录获取 C 端 Token

```yaml
id: E2E-6.1
name: C端微信登录
phase: 6
depends_on: [E2E-1.1]  # 租户必须已存在
note: 微信 code 在测试环境使用 mock。如果后端支持测试 code，请使用 "test_code_user_a"
```

**Step 6.1.1 — C 端用户 A 登录**

```bash
curl -s -X POST {{base_url}}/api/auth/wechat-login \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"code":"test_code_user_a"}'
```
断言:
- HTTP status = 200
- `$.code` = 0
- `$.data.token` 存在 → export `{{c_token_a}}`
- `$.data.user.id` 存在 → export `{{user_id_a}}`

> Agent: 如果微信登录需要真实 code，则从种子数据的已有用户获取 token，或使用 admin token 模拟。

**Step 6.1.2 — C 端用户 B 登录**

```bash
curl -s -X POST {{base_url}}/api/auth/wechat-login \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"code":"test_code_user_b"}'
```
断言:
- HTTP status = 200
- `$.data.token` 存在 → export `{{c_token_b}}`
- `$.data.user.id` 存在 → export `{{user_id_b}}`

**Step 6.1.3 — 验证 Token 过期处理**

```bash
curl -s -X GET {{base_url}}/api/cart \
  -H "Authorization: Bearer expired_token_xxx" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 401

**Step 6.1.4 — Token 刷新**

```bash
curl -s -X POST {{base_url}}/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"{{c_token_a}}"}'
```
断言:
- HTTP status = 200 或 401（取决于 refresh token 是否有效）
- 若 200: `$.data.token` 非空且与 `{{c_token_a}}` 不同


---

## 阶段 7 — C 端：点餐核心闭环

### E2E-7.1 完整点餐链路

```yaml
id: E2E-7.1
name: 完整点餐→支付→接单→取餐
phase: 7
depends_on: [E2E-4.2, E2E-6.1]
timeout: 300s
```

#### 7.1 段：浏览与加购

**Step 7.1.1 — 获取菜品列表**

```bash
curl -s -X GET "{{base_url}}/api/dishes?storeId={{store_id}}&pageSize=20" \
  -H "x-app-id: {{app_id}}" \
  -H "Authorization: Bearer {{c_token_a}}"
```
断言:
- HTTP status = 200
- `$.data.items` 数组长度 >= 3
- `$.data.items[0].id` 存在
- `$.data.items[0].skus[0].id` 存在 → export `{{sku_id_1}}`

**Step 7.1.2 — 获取第二个 SKU**

```bash
curl -s -X GET "{{base_url}}/api/dishes/{{dish_id_2}}" \
  -H "x-app-id: {{app_id}}" \
  -H "Authorization: Bearer {{c_token_a}}"
```
断言:
- HTTP status = 200
- `$.data.skus[0].id` 存在 → export `{{sku_id_2}}`

**Step 7.1.3 — 添加第一个商品到购物车**

```bash
curl -s -X POST {{base_url}}/api/cart/items \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"skuId":"{{sku_id_1}}","quantity":2}'
```
断言:
- HTTP status = 201
- `$.data.id` 存在 → export `{{cart_item_id_1}}`

**Step 7.1.4 — 添加第二个商品**

```bash
curl -s -X POST {{base_url}}/api/cart/items \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"skuId":"{{sku_id_2}}","quantity":1}'
```
断言:
- HTTP status = 201
- `$.data.id` 存在 → export `{{cart_item_id_2}}`

**Step 7.1.5 — 获取购物车**

```bash
curl -s -X GET {{base_url}}/api/cart \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.items` 长度 >= 2
- `$.data.totalAmount` > 0

#### 7.2 段：下单

**Step 7.1.6 — 提交订单**

```bash
curl -s -X POST {{base_url}}/api/orders \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{
    "cartItemIds":["{{cart_item_id_1}}","{{cart_item_id_2}}"],
    "remark":"测试订单-自动化",
    "paymentMethod":"wechat"
  }'
```
断言:
- HTTP status = 201
- `$.data.id` 存在 → export `{{order_id}}`
- `$.data.status` = "pending"
- `$.data.orderNo` 匹配正则 `^\d{14}[A-Za-z0-9]{6}$`
- `$.data.totalAmount` > 0
- `$.data.items` 数组长度 = 2

**Step 7.1.7 — 验证购物车已清空**

```bash
curl -s -X GET {{base_url}}/api/cart \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.items` 不包含 id="{{cart_item_id_1}}"

#### 7.3 段：支付

**Step 7.1.8 — 发起预支付**

```bash
curl -s -X POST {{base_url}}/api/payment/prepay \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"orderId":"{{order_id}}","channel":"wechat"}'
```
断言:
- HTTP status = 200 或 201
- `$.data.wxJSAPIParams` 存在 或 `$.data` 存在
- 若 mock 模式: `$.data.wxJSAPIParams.package` 含 "mock"

**Step 7.1.9 — 模拟支付回调**

```bash
curl -s -X POST {{base_url}}/api/payment/notify \
  -H "Content-Type: application/json" \
  -d '{
    "id":"test_notify_{{order_id}}",
    "create_time":"2026-06-17T12:00:00+08:00",
    "resource_type":"encrypt-resource",
    "event_type":"TRANSACTION.SUCCESS",
    "summary":"支付成功",
    "resource":{
      "original_type":"transaction",
      "algorithm":"AEAD_AES_256_GCM",
      "ciphertext":"mock_ciphertext_for_{{order_id}}",
      "associated_data":"mock_ad",
      "nonce":"mock_nonce"
    }
  }'
```
断言:
- HTTP status = 200 或 400（取决于 mock 模式实现）
- 若 200: `$.code` = 0

> Agent: 如果 notify 验证签名失败（预期），改为直接查询支付状态接口验证。

**Step 7.1.10 — 查询支付状态**

```bash
curl -s -X GET {{base_url}}/api/payment/query/{{order_id}} \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- 记录支付状态（pending/success）

#### 7.4 段：B 端接单处理

**Step 7.1.11 — B 端查看订单**

```bash
curl -s -X GET {{base_url}}/api/merchant/orders/{{order_id}} \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "x-tenant-id: {{tenant_id}}"
```
断言:
- HTTP status = 200
- `$.data.orderNo` = 与 Step 7.1.6 相同

**Step 7.1.12 — 确认接单**

```bash
curl -s -X PUT {{base_url}}/api/merchant/orders/{{order_id}}/status \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"status":"confirmed"}'
```
断言:
- HTTP status = 200
- `$.data.status` = "confirmed"

**Step 7.1.13 — 验证不可越级跳状态**

```bash
curl -s -X PUT {{base_url}}/api/merchant/orders/{{order_id}}/status \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"status":"ready"}'
```
断言:
- HTTP status = 409
- `$.code` = "ORDER_STATUS_CONFLICT" 或 `$.message` 含 "不允许"

**Step 7.1.14 — 开始制作**

```bash
curl -s -X PUT {{base_url}}/api/merchant/orders/{{order_id}}/status \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"status":"cooking"}'
```
断言:
- HTTP status = 200
- `$.data.status` = "cooking"

**Step 7.1.15 — 完成备餐（生成取餐号）**

```bash
curl -s -X PUT {{base_url}}/api/merchant/orders/{{order_id}}/status \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"status":"ready"}'
```
断言:
- HTTP status = 200
- `$.data.status` = "ready"
- `$.data.pickupNo` 匹配正则 `^A\d{3}$` → export `{{pickup_no}}`

#### 7.5 段：验证完整时间轴

**Step 7.1.16 — C 端查看订单时间轴**

```bash
curl -s -X GET {{base_url}}/api/orders/{{order_id}} \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.status` = "ready"
- `$.data.pickupNo` = "{{pickup_no}}"
- `$.data.timeline` 数组长度 >= 5
- timeline 包含 pending / paid / confirmed / cooking / ready 节点

**Step 7.1.17 — 厨师完成出餐（取餐后）**

```bash
curl -s -X PUT {{base_url}}/api/merchant/orders/{{order_id}}/status \
  -H "Authorization: Bearer {{b_chef_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"status":"completed"}'
```
断言:
- HTTP status = 200
- `$.data.status` = "completed"


---

## 阶段 8 — C 端：高级场景

### E2E-8.1 拼单全流程

```yaml
id: E2E-8.1
name: 拼单全流程
phase: 8
depends_on: [E2E-6.1, E2E-4.2]
timeout: 180s
```

**Step 8.1.1 — user_a 添加商品到购物车**

```bash
curl -s -X POST {{base_url}}/api/cart/items \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"skuId":"{{sku_id_1}}","quantity":3}'
```
断言:
- HTTP status = 201
- `$.data.id` 存在 → export `{{pool_cart_item_1}}`

**Step 8.1.2 — 创建拼单**

```bash
curl -s -X POST {{base_url}}/api/group-orders \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{
    "storeId":"{{store_id}}",
    "condition":"A",
    "minAmount":5000,
    "deadline":"2099-12-31T23:59:59Z",
    "cartItemIds":["{{pool_cart_item_1}}"]
  }'
```
断言:
- HTTP status = 201
- `$.data.id` 存在 → export `{{group_order_id}}`
- `$.data.groupNo` 匹配正则 `^G\d{14}[A-Za-z0-9]{4}$`
- `$.data.status` = "pooling" 或 "active"

**Step 8.1.3 — 验证拼单池可见**

```bash
curl -s -X GET "{{base_url}}/api/group-orders?storeId={{store_id}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- 结果中包含 id="{{group_order_id}}" 的拼单

**Step 8.1.4 — user_b 添加到购物车**

```bash
curl -s -X POST {{base_url}}/api/cart/items \
  -H "Authorization: Bearer {{c_token_b}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"skuId":"{{sku_id_2}}","quantity":2}'
```
断言:
- HTTP status = 201
- `$.data.id` 存在 → export `{{pool_cart_item_2}}`

**Step 8.1.5 — user_b 加入拼单**

```bash
curl -s -X POST {{base_url}}/api/group-orders/{{group_order_id}}/join \
  -H "Authorization: Bearer {{c_token_b}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"cartItemIds":["{{pool_cart_item_2}}"]}'
```
断言:
- HTTP status = 200
- `$.data.participantCount` >= 2

**Step 8.1.6 — user_a 手动截单**

```bash
curl -s -X PUT {{base_url}}/api/group-orders/{{group_order_id}}/close \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.status` = "closed" 或 "merged"

**Step 8.1.7 — 验证非发起人不可截单**

```bash
curl -s -X PUT {{base_url}}/api/group-orders/{{group_order_id}}/close \
  -H "Authorization: Bearer {{c_token_b}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 403 或 400


### E2E-8.3 退款全流程

```yaml
id: E2E-8.3
name: 退款全流程
phase: 8
depends_on: [E2E-7.1]  # 使用 E2E-7.1 创建的订单
```

**Step 8.3.1 — C 端申请退款**

```bash
curl -s -X POST {{base_url}}/api/orders/{{order_id}}/refund \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"items":[],"reason":"自动化测试-全额退款"}'
```
断言:
- HTTP status = 200 或 201
- `$.data.status` = "refunding"

**Step 8.3.2 — 店长尝试审批（应被拒）**

```bash
curl -s -X POST {{base_url}}/api/merchant/orders/{{order_id}}/refund/approve \
  -H "Authorization: Bearer {{b_manager_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"approved":true}'
```
断言:
- HTTP status = 403

**Step 8.3.3 — 老板审批退款**

```bash
curl -s -X POST {{base_url}}/api/merchant/orders/{{order_id}}/refund/approve \
  -H "Authorization: Bearer {{b_admin_token}}" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: {{tenant_id}}" \
  -d '{"approved":true}'
```
断言:
- HTTP status = 200
- `$.data.status` = "refunded"

**Step 8.3.4 — 验证退款后订单状态**

```bash
curl -s -X GET {{base_url}}/api/orders/{{order_id}} \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.status` = "refunded"


### E2E-8.4 催单

```yaml
id: E2E-8.4
name: 催单
phase: 8
depends_on: [E2E-7.1]
```

```bash
curl -s -X POST {{base_url}}/api/orders/{{order_id}}/urge \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200（如果订单状态允许催单）
- 或 400（如果已超次数或状态不允许）


### E2E-8.5 再来一单

```yaml
id: E2E-8.5
name: 再来一单
phase: 8
depends_on: [E2E-7.1]
```

```bash
curl -s -X POST {{base_url}}/api/orders/{{order_id}}/reorder \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- 购物车中应包含原订单的菜品


### E2E-8.6 储值卡

```yaml
id: E2E-8.6
name: 储值卡购买与余额支付
phase: 8
depends_on: [E2E-6.1]
```

**Step 8.6.1 — 查询余额**

```bash
curl -s -X GET {{base_url}}/api/prepaid/balance \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "x-app-id: {{app_id}}"
```
断言:
- HTTP status = 200
- `$.data.personalBalance` >= 0

**Step 8.6.2 — 购买储值卡（Mock 模式）**

```bash
curl -s -X POST {{base_url}}/api/prepaid/recharge \
  -H "Authorization: Bearer {{c_token_a}}" \
  -H "Content-Type: application/json" \
  -H "x-app-id: {{app_id}}" \
  -d '{"amount":10000,"type":"personal"}'
```
断言:
- HTTP status = 200 或 201
- 记录返回内容（可能返回 mock wxJSAPIParams）


---

## 阶段 9 — Packager：源码打包交付

### E2E-9.1 完整打包流水线

```yaml
id: E2E-9.1
name: 源码打包与验证
phase: 9
depends_on: []  # 独立运行，需要完整的 server 源目录
```

**Step 9.1.1 — Dry Run**

```bash
cd packager && cat > /tmp/test-manifest.json << 'EOF'
{"version":"1.0.0","tenantId":"test-001","watermarkId":"wm-001",
 "targetDir":"../server","outputDir":"../delivery-test/server",
 "modules":[{"id":"base","name":"基础","purchased":true},
  {"id":"group-meal","name":"团餐","purchased":true},
  {"id":"prepaid","name":"储值","purchased":false},
  {"id":"points","name":"积分","purchased":false}]}
EOF
npx ts-node src/index.ts -m /tmp/test-manifest.json --dry-run
```
断言:
- stdout 含 "DRY RUN"
- stdout 含 "To remove: prepaid, points"

**Step 9.1.2 — Full Run**

```bash
rm -rf ../delivery-test 2>/dev/null
npx ts-node src/index.ts -m /tmp/test-manifest.json
```
断言:
- stdout 含 "=== Delivery packaging complete ==="
- JSON output 中 `$.success` = true
- `$.removedModules` 含 "prepaid" 和 "points"
- `$.watermarkedFiles` >= 100
- `$.checksum` 长度为 64 (SHA-256)

**Step 9.1.3 — 验证模块删除**

```bash
test ! -d ../delivery-test/server/src/prepaid && echo "prepaid removed OK"
test ! -d ../delivery-test/server/src/points && echo "points removed OK"
test -d ../delivery-test/server/src/cart && echo "cart preserved OK"
```
断言:
- stdout 含 "prepaid removed OK"
- stdout 含 "points removed OK"
- stdout 含 "cart preserved OK"

**Step 9.1.4 — 验证水印注入**

```bash
head -5 ../delivery-test/server/src/main.ts
```
断言:
- stdout 含 `@watermark wm-001`
- stdout 含 `@tenant test-001`
- stdout 含 `@delivered`

**Step 9.1.5 — 验证导入清理**

```bash
grep -c "PrepaidModule\|PointsModule" ../delivery-test/server/src/app.module.ts || echo "imports cleaned OK"
```
断言:
- stdout 含 "imports cleaned OK" 或 grep 返回 0 匹配

---

## 阶段 10 — 跨端联动测试

### CROSS-001 P→B→C 商家入驻到下单完整链路

```yaml
id: CROSS-001
name: P→B→C 跨端完整动线
phase: 10
depends_on: []  # 从零开始
timeout: 180s
```

**Step 10.1.1 — P端创建Tenant**

```bash
P_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')
DEMO_TID=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | jq -r '.data.user.tenantId')

NT=$(curl -s -X POST http://localhost:3000/api/admin/tenants \
  -H "Authorization: Bearer $P_TOKEN" -H "Content-Type: application/json" -H "x-tenant-id: $DEMO_TID" \
  -d '{"appId":"wx_cross_test","name":"跨端测试餐厅"}')
CROSS_TID=$(echo "$NT" | jq -r '.data.id')
```
断言:
- HTTP status = 200 或 201
- `$CROSS_TID` 非空
- admin 自动创建 (GET /api/merchant/staff → length >= 1)

**Step 10.2.1 — P端分配模块**

```bash
curl -s -X PUT "http://localhost:3000/api/admin/tenants/$CROSS_TID/modules" \
  -H "Authorization: Bearer $P_TOKEN" -H "Content-Type: application/json" -H "x-tenant-id: $DEMO_TID" \
  -d '{"moduleIds":["base","group-meal","discount","coupon"]}'
```
断言: HTTP status = 200, data 数组长度 = 4

**Step 10.3.1 — B端登录+创建门店+菜品**

```bash
B_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -H "x-tenant-id: $CROSS_TID" -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')
SID=$(curl -s -X POST http://localhost:3000/api/merchant/stores -H "Authorization: Bearer $B_TOKEN" -H "Content-Type: application/json" -H "x-tenant-id: $CROSS_TID" -d '{"name":"跨端店"}' | jq -r '.data.id')
CID=$(curl -s -X POST "http://localhost:3000/api/merchant/stores/$SID/categories" -H "Authorization: Bearer $B_TOKEN" -H "Content-Type: application/json" -H "x-tenant-id: $CROSS_TID" -d '{"name":"主食"}' | jq -r '.data.id')
DID=$(curl -s -X POST "http://localhost:3000/api/merchant/stores/$SID/dishes" -H "Authorization: Bearer $B_TOKEN" -H "Content-Type: application/json" -H "x-tenant-id: $CROSS_TID" -d "{\"name\":\"汉堡\",\"categoryId\":\"$CID\",\"price\":1500,\"stock\":10}" | jq -r '.data.id')
curl -s -X PUT "http://localhost:3000/api/merchant/dishes/$DID/publish" -H "Authorization: Bearer $B_TOKEN" -H "x-tenant-id: $CROSS_TID"
```
断言: SID/CID/DID 均非空，publish 返回 200

**Step 10.4.1 — C端验证菜品可见**

```bash
curl -s "http://localhost:3000/api/dishes" -H "x-app-id: wx_cross_test"
```
断言: HTTP 200, `$.data.items` 至少 1 条, 名称包含"汉堡"

### CROSS-004 License吊销跨端影响

```yaml
id: CROSS-004
name: License吊销 → B端+C端不可用
phase: 10
depends_on: [CROSS-001]
```

```bash
# 吊销
curl -s -X PUT "http://localhost:3000/api/admin/tenants/$CROSS_TID/license" \
  -H "Authorization: Bearer $P_TOKEN" -H "Content-Type: application/json" -H "x-tenant-id: $DEMO_TID" \
  -d '{"action":"revoke"}'
# B端验证
curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -H "x-tenant-id: $CROSS_TID" -d '{"username":"admin","password":"admin123"}'
# C端验证  
curl -s "http://localhost:3000/api/dishes" -H "x-app-id: wx_cross_test"
```
断言:
- B端: HTTP 403 或 401
- C端: HTTP 403 TENANT_EXPIRED 或 400/空

---

## 全链路冒烟（最小回归集）

```yaml
# 发版前执行，预计 10 分钟
smoke_test:
  phases: [1, 2, 3, 4, 6, 7, 9, 10]
  cases:
    - E2E-1.1   # 创建 Tenant
    - E2E-2.1   # 模块分配
    - E2E-3.1   # B 端登录
    - E2E-3.2   # 引导初始化
    - E2E-4.1   # 创建菜品
    - E2E-4.2   # 上架
    - E2E-6.1   # C 端登录
    - E2E-7.1   # 完整点餐（步骤 7.1.1-7.1.17）
    - E2E-9.1   # Packager 打包验证
    - CROSS-001 # P→B→C 跨端联动
  stop_on_first_failure: true

# 跨端联动冒烟
cross_end_smoke:
  phases: [1, 3, 4, 7]
  cases:
    - CROSS-001 # P创建Tenant → B登录 → 建菜品 → C端可见
    - CROSS-004 # P吊销License → B不可登录 + C不可访问
    - CROSS-007 # B创建折扣 → C下单触发
```

---

## Agent 执行规则

```
1. 全局变量从"全局配置"块加载
2. 从阶段 1 开始，按 depends_on 拓扑排序
3. 每个 step:
   a. 检查前置变量是否存在，缺失 → FAIL (MISSING_VAR)
   b. 替换 {{变量}} 为实际值
   c. 执行 curl 命令
   d. 对照断言检查响应:
      - HTTP status 不匹配 → FAIL (HTTP_STATUS)
      - JSONPath 不匹配 → FAIL (ASSERTION)
      - 正则不匹配 → FAIL (PATTERN)
   e. 提取 export 变量供下游使用
   f. 输出: [PASS] 或 [FAIL] + 实际值 vs 期望值
4. 任一 step FAIL → 该用例标记为 FAIL，跳过后续 step
5. 阶段内无 depends_on 关系的步骤可并行执行
6. 全量执行完成后输出汇总报告
```

---

> **配套文档**:
> - Human 版: `specs/E2E-TEST-SPEC.md`
> - 测试覆盖清单: `specs/QA-TEST-SPEC.md`
> - Spec 研究提示词: `specs/SPEC-RESEARCH-PROMPT.md`
