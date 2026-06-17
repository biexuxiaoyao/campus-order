import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaMariaDb({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'root123456',
  database: 'campus_order',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...\n');

  // Tenant
  const tenant = await prisma.tenant.upsert({
    where: { appId: 'wx8ebfaf4a045bf7c3' },
    update: {},
    create: {
      appId: 'wx8ebfaf4a045bf7c3',
      name: '校园订餐Demo店',
      status: 'active',
    },
  });
  console.log(`✅ Tenant: ${tenant.name}`);

  // Brand Config
  await prisma.brandConfig.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      config: {
        name: '🍱 美味校园餐厅',
        logo: '',
        themeColor: '#07C160',
        banners: ['今日特惠：满30减5', '新用户首单立减10元'],
        hours: '08:00-21:00',
        phone: '13800138000',
      },
    },
  });
  console.log('✅ Brand Config');

  // Admin User (password: admin123)
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.adminUser.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
    update: {},
    create: {
      tenantId: tenant.id,
      username: 'admin',
      passwordHash,
      role: 'owner',
      status: 'active',
    },
  });
  console.log(`✅ Admin: admin / admin123`);

  // Store
  const store = await prisma.store.upsert({
    where: { id: 'demo-store-001' },
    update: {},
    create: {
      id: 'demo-store-001',
      tenantId: tenant.id,
      name: '美味校园餐厅（总店）',
      address: 'A栋教学楼1层',
      phone: '13800138000',
      status: 'active',
    },
  });
  console.log(`✅ Store: ${store.name}`);

  // Categories
  const categories = [
    { id: 'cat-001', storeId: store.id, name: '🔥 热销推荐', sortOrder: 1 },
    { id: 'cat-002', storeId: store.id, name: '🍚 米饭套餐', sortOrder: 2 },
    { id: 'cat-003', storeId: store.id, name: '🍜 面食粉类', sortOrder: 3 },
    { id: 'cat-004', storeId: store.id, name: '🥤 饮品甜品', sortOrder: 4 },
    { id: 'cat-005', storeId: store.id, name: '🥗 小食凉菜', sortOrder: 5 },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({ where: { id: cat.id }, update: {}, create: cat });
  }
  console.log(`✅ ${categories.length} Categories`);

  // Dishes with SKUs
  const dishes = [
    {
      id: 'dish-001',
      storeId: store.id,
      categoryId: 'cat-001',
      name: '红烧肉套餐',
      imageUrl: '',
      unit: '份',
      status: 'published' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '规格', value: '小份' }], price: 1500, stock: 50, availableStock: 50 },
        { specs: [{ name: '规格', value: '大份' }], price: 2200, stock: 30, availableStock: 30 },
      ],
    },
    {
      id: 'dish-002',
      storeId: store.id,
      categoryId: 'cat-001',
      name: '宫保鸡丁盖饭',
      imageUrl: '',
      unit: '份',
      status: 'published' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '规格', value: '标准' }], price: 1600, stock: 40, availableStock: 40 },
      ],
    },
    {
      id: 'dish-003',
      storeId: store.id,
      categoryId: 'cat-002',
      name: '回锅肉炒饭',
      imageUrl: '',
      unit: '份',
      status: 'published' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '规格', value: '小份' }], price: 1200, stock: 60, availableStock: 60 },
        { specs: [{ name: '规格', value: '大份' }], price: 1800, stock: 40, availableStock: 40 },
      ],
    },
    {
      id: 'dish-004',
      storeId: store.id,
      categoryId: 'cat-002',
      name: '鱼香肉丝盖饭',
      imageUrl: '',
      unit: '份',
      status: 'published' as const,
      estimatedToday: true,
      skus: [
        { specs: [{ name: '规格', value: '标准' }], price: 1400, stock: 35, availableStock: 0 },
      ],
    },
    {
      id: 'dish-005',
      storeId: store.id,
      categoryId: 'cat-003',
      name: '牛肉拉面',
      imageUrl: '',
      unit: '碗',
      status: 'published' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '辣度', value: '不辣' }], price: 1800, stock: 25, availableStock: 25 },
        { specs: [{ name: '辣度', value: '微辣' }], price: 1800, stock: 25, availableStock: 25 },
        { specs: [{ name: '辣度', value: '中辣' }], price: 1800, stock: 20, availableStock: 20 },
      ],
    },
    {
      id: 'dish-006',
      storeId: store.id,
      categoryId: 'cat-003',
      name: '炸酱面',
      imageUrl: '',
      unit: '碗',
      status: 'published' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '规格', value: '小碗' }], price: 1000, stock: 50, availableStock: 50 },
        { specs: [{ name: '规格', value: '大碗' }], price: 1500, stock: 30, availableStock: 30 },
      ],
    },
    {
      id: 'dish-007',
      storeId: store.id,
      categoryId: 'cat-004',
      name: '珍珠奶茶',
      imageUrl: '',
      unit: '杯',
      status: 'published' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '温度', value: '常温' }], price: 800, stock: 100, availableStock: 100 },
        { specs: [{ name: '温度', value: '加冰' }], price: 800, stock: 100, availableStock: 100 },
      ],
    },
    {
      id: 'dish-008',
      storeId: store.id,
      categoryId: 'cat-004',
      name: '冰镇绿豆汤',
      imageUrl: '',
      unit: '杯',
      status: 'published' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '规格', value: '标准' }], price: 500, stock: 200, availableStock: 200 },
      ],
    },
    {
      id: 'dish-009',
      storeId: store.id,
      categoryId: 'cat-005',
      name: '凉拌黄瓜',
      imageUrl: '',
      unit: '份',
      status: 'published' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '规格', value: '标准' }], price: 600, stock: 80, availableStock: 80 },
      ],
    },
    {
      id: 'dish-010',
      storeId: store.id,
      categoryId: 'cat-005',
      name: '煎饺（10只）',
      imageUrl: '',
      unit: '份',
      status: 'draft' as const,
      estimatedToday: false,
      skus: [
        { specs: [{ name: '口味', value: '猪肉白菜' }], price: 1200, stock: 30, availableStock: 30 },
        { specs: [{ name: '口味', value: '韭菜鸡蛋' }], price: 1000, stock: 30, availableStock: 30 },
      ],
    },
  ];

  for (const dish of dishes) {
    const { skus, ...dishData } = dish;
    await prisma.dish.upsert({
      where: { id: dishData.id },
      update: {},
      create: dishData,
    });
    for (const sku of skus) {
      const skuId = `${dishData.id}-${sku.specs.map(s => s.value).join('-')}`;
      await prisma.sku.upsert({
        where: { id: skuId },
        update: {},
        create: { id: skuId, dishId: dishData.id, ...sku },
      });
    }
  }
  console.log(`✅ ${dishes.length} Dishes with SKUs`);
  console.log(`   (1 draft: 煎饺, 1 估清: 鱼香肉丝盖饭)`);

  // Coupon Template
  await prisma.couponTemplate.upsert({
    where: { id: 'coupon-001' },
    update: {},
    create: {
      id: 'coupon-001',
      storeId: store.id,
      name: '满30减5',
      type: 'full_reduction',
      threshold: 3000,
      value: 500,
      totalQty: 100,
      usedQty: 0,
      startAt: new Date('2026-01-01'),
      endAt: new Date('2026-12-31'),
      status: 'active',
    },
  });
  console.log('✅ Coupon Template: 满30减5');

  // Discount Rule
  await prisma.discountRule.upsert({
    where: { id: 'discount-001' },
    update: {},
    create: {
      id: 'discount-001',
      storeId: store.id,
      name: '新用户9折',
      conditions: { type: 'first_order', value: true },
      actions: { type: 'percent_off', value: 10 },
      priority: 10,
      isStackable: false,
      status: 'active',
    },
  });
  console.log('✅ Discount Rule: 新用户9折');

  // Spec Template
  await prisma.specTemplate.upsert({
    where: { id: 'spec-001' },
    update: {},
    create: {
      id: 'spec-001',
      storeId: store.id,
      name: '辣度选择',
      options: [
        { name: '辣度', values: ['不辣', '微辣', '中辣', '特辣'] },
      ],
    },
  });
  console.log('✅ Spec Template: 辣度选择');

  // Printer
  await prisma.printer.upsert({
    where: { id: 'printer-001' },
    update: {},
    create: {
      id: 'printer-001',
      storeId: store.id,
      brand: 'yilianyun',
      deviceId: 'YL-001',
      apiKey: 'demo-key',
      status: 'active',
    },
  });
  console.log('✅ Printer: 易联云 YL-001');

  console.log('\n🎉 Seed complete! (Group Order skipped — needs real user)\n');
  console.log('登录信息:');
  console.log('  管理后台: http://localhost:5173');
  console.log('  用户名: admin');
  console.log('  密码: admin123');
  console.log('  小程序: 微信开发者工具中查看');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
