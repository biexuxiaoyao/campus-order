import { test, expect } from '@playwright/test';

test.describe('B端管理后台 — 阶段3→5 UI动线', () => {

  test('阶段3: 登录 → 数据面板', async ({ page }) => {
    await page.goto('http://localhost:5173/#/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2')).toContainText('数据面板');
    await expect(page.locator('.stats-card').first()).toBeVisible();
  });

  test('阶段3: 侧边栏菜单可见性', async ({ page }) => {
    await page.goto('http://localhost:5173/#/dashboard');
    await page.waitForLoadState('networkidle');

    const menu = page.locator('.sidebar-menu');
    await expect(menu).toBeVisible({ timeout: 3000 });

    const items = menu.locator('.el-menu-item span');
    const texts = await items.allTextContents();
    console.log('菜单文本:', texts);

    // 已登录（owner角色）应能看到的核心菜单
    const required = ['数据面板', '菜品管理', '订单管理'];
    for (const name of required) {
      expect(texts.some(t => t.includes(name)), `菜单应包含: ${name}`).toBeTruthy();
    }
  });

  test('阶段4: 菜品管理 — 列表加载', async ({ page }) => {
    await page.goto('http://localhost:5173/#/dishes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 页面标题
    await expect(page.locator('h2')).toContainText('菜品管理');

    // 表格或搜索栏至少出现一个
    const table = page.locator('.el-table');
    const searchBar = page.locator('.search-bar');
    await expect(table.or(searchBar).first()).toBeVisible({ timeout: 8000 });
  });

  test('阶段4: 新增菜品弹窗', async ({ page }) => {
    await page.goto('http://localhost:5173/#/dishes');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.locator('button:has-text("新增菜品")').click();
    await page.waitForSelector('.el-dialog', { timeout: 5000 });

    await expect(page.locator('.el-dialog')).toBeVisible();
    await page.locator('.el-dialog__footer button').first().click();
  });

  test('阶段5: 订单管理', async ({ page }) => {
    await page.goto('http://localhost:5173/#/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('h2')).toContainText('订单管理');
    const card = page.locator('.el-card');
    await expect(card).toBeVisible({ timeout: 8000 });
  });

  test('阶段5: 厨房模式', async ({ page }) => {
    await page.goto('http://localhost:5173/#/kitchen');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('.kitchen-header')).toBeVisible({ timeout: 5000 });
  });

  test('阶段5: 营业设置', async ({ page }) => {
    await page.goto('http://localhost:5173/#/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('h2')).toContainText('营业设置');
    await expect(page.locator('.el-card')).toBeVisible({ timeout: 5000 });
  });

  test('退出登录', async ({ page }) => {
    await page.goto('http://localhost:5173/#/dashboard');
    await page.waitForLoadState('networkidle');

    await page.locator('.user-info').click();
    await page.waitForTimeout(500);
    await page.locator('.el-dropdown-menu__item').filter({ hasText: '退出登录' }).click();

    await page.waitForURL('**/#/login', { timeout: 5000 });
    await expect(page.getByPlaceholder('用户名')).toBeVisible();
  });
});
