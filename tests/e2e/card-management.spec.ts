import { expect, test, type Locator } from '@playwright/test';
import { getCardDefinition } from '@pgr/cards';

const scrollToBottom = async (locator: Locator) => {
  expect(await locator.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
  await locator.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await locator.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
};

for (const width of [1280, 1920]) {
  test(`card management scrolls and supports Chinese effect editing at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
    let cards = Array.from({ length: 45 }, (_, index) => ({
      ...getCardDefinition('BP01-007'), id: `UI-${String(index).padStart(3, '0')}`, name: `构造体 ${index + 1}`,
      text: Array.from({ length: 24 }, (_, line) => `规则 ${line + 1}：选择我方战场的一张角色，直到回合结束为止，其 PP 增加 1000。`),
      hasImage: false, status: 'published', version: 1,
    }));
    const decks = [{ id: 'ui-deck', name: '测试构筑', active: false, cards: cards.map((card) => ({ cardId: card.id, count: 1 })), validationErrors: [] }];
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'DELETE') {
        cards = cards.filter((card) => card.id !== path.split('/').at(-1));
        return route.fulfill({ status: 204 });
      }
      const body = path === '/api/auth/me' ? { user: { id: 'ui-admin', username: '界面测试', role: 'admin' } }
        : path === '/api/decks' ? { decks } : { cards };
      await route.fulfill({ json: body });
    });
    await page.goto('/');
    await page.getByRole('button', { name: '卡牌库', exact: true }).click();
    await expect(page.locator('.catalog-card')).toHaveCount(45);
    await scrollToBottom(page.locator('.card-catalog-grid'));
    await expect(page.locator('.catalog-card').last()).toBeInViewport();
    await scrollToBottom(page.locator('.detail-rail'));
    await expect(page.locator('.detail-rail p').last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`library-${width}.png`) });

    await page.getByRole('button', { name: '牌组编辑', exact: true }).click();
    await scrollToBottom(page.locator('.deck-pool'));
    await expect(page.locator('.deck-pool button').last()).toBeInViewport();
    await scrollToBottom(page.locator('.deck-canvas'));
    await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeInViewport();

    await page.getByRole('button', { name: '卡牌录入', exact: true }).click();
    await scrollToBottom(page.locator('.card-preview'));
    await expect(page.locator('.card-preview p').last()).toBeInViewport();
    await page.getByRole('button', { name: '删除卡牌', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.admin-card-list button')).toHaveCount(45);
    await page.getByRole('button', { name: '删除卡牌', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(page.locator('.admin-card-list button')).toHaveCount(44);
    await expect(page.getByLabel('卡牌名称')).toHaveValue('');
    await page.getByRole('button', { name: '添加效果', exact: true }).click();
    await page.getByRole('button', { name: '添加目标', exact: true }).click();
    await page.getByLabel('动作类型').selectOption('modify-stat');
    await page.getByLabel('作用对象', { exact: true }).selectOption({ label: '对象 1 · 我方战场的卡牌' });
    await expect(page.getByLabel('效果 ID', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('目标 ID', { exact: true })).toHaveCount(0);
    await scrollToBottom(page.locator('.card-form'));
    await expect(page.getByRole('button', { name: '保存并发布', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`) });
  });
}
