import { test as setup } from '@playwright/test';

const AUTH_FILE = 'tests/.auth.json';

setup('登录并保存状态', async ({ page }) => {
  await page.goto('http://localhost:5173/#/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('用户名').fill('admin');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('.el-button--primary').click();
  await page.waitForURL('**/#/dashboard', { timeout: 10000 });
  await page.context().storageState({ path: AUTH_FILE });
});
