import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const api = 'http://localhost:3001';
const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')}`;

const login = async (page: Page, username: string, password: string) => {
  await page.goto('/');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '进入终端' }).click();
  await expect(page.locator('.platform-header')).toBeVisible();
};

const register = async (page: Page, username: string) => {
  await page.goto('/');
  await page.getByRole('button', { name: /创建账号/ }).click();
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill('E2ePlayer!21');
  await page.getByRole('button', { name: '创建并登录' }).click();
  await expect(page.locator('.platform-header')).toBeVisible();
};

const seedPublishedCards = async (context: BrowserContext) => {
  const definitions = [
    { id: 'E2E-SIG-R', name: 'E2E红色信号', type: 'tactic', subtype: 'normal', signal: 'red' },
    { id: 'E2E-SIG-B', name: 'E2E蓝色信号', type: 'tactic', subtype: 'normal', signal: 'blue' },
    { id: 'E2E-SIG-Y', name: 'E2E黄色信号', type: 'tactic', subtype: 'normal', signal: 'yellow' },
    ...Array.from({ length: 10 }, (_, index) => ({ id: `E2E-UNIT-${index + 1}`, name: `E2E构造体${index + 1}`, type: 'character', pp: 3000, dp: 1 })),
  ];
  for (const definition of definitions) {
    const input = { ...definition, cost: 0, attribute: 'none', traits: ['E2E'], text: ['端到端测试卡牌。'], effectIds: [], structuredEffects: [], imageDataUrl: png };
    const created = await context.request.post(`${api}/api/admin/cards`, { data: input });
    if (created.status() === 409) await context.request.put(`${api}/api/admin/cards/${definition.id}`, { data: input });
    const published = await context.request.post(`${api}/api/admin/cards/${definition.id}/publish`);
    expect(published.ok()).toBeTruthy();
  }
};

const buildDeck = async (context: BrowserContext, name: string) => {
  const cards = [
    { cardId: 'E2E-SIG-R', count: 4 }, { cardId: 'E2E-SIG-B', count: 4 }, { cardId: 'E2E-SIG-Y', count: 4 },
    ...Array.from({ length: 9 }, (_, index) => ({ cardId: `E2E-UNIT-${index + 1}`, count: 4 })),
    { cardId: 'E2E-UNIT-10', count: 2 },
  ];
  const created = await context.request.post(`${api}/api/decks`, { data: { name, cards } });
  expect(created.ok()).toBeTruthy();
  const id = (await created.json()).deck.id as string;
  expect((await context.request.post(`${api}/api/decks/${id}/activate`)).ok()).toBeTruthy();
};

test('administrator manages cards and two authenticated players start a custom-deck match', async ({ browser }, testInfo) => {
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required for E2E');
  const adminContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const admin = await adminContext.newPage();
  await login(admin, process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'Anonce', adminPassword);
  await admin.getByRole('button', { name: '卡牌录入' }).click();
  await expect(admin.getByRole('heading', { name: '卡牌录入' })).toBeVisible();
  await expect(admin.getByRole('heading', { name: '卡牌索引' })).toBeVisible();
  await admin.screenshot({ path: testInfo.outputPath('admin-card-editor-1920.png'), fullPage: true });
  const form = admin.locator('.card-form');
  expect(await form.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
  await form.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(form.getByRole('button', { name: '保存草稿' })).toBeInViewport();
  await admin.setViewportSize({ width: 1280, height: 720 });
  await form.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await admin.screenshot({ path: testInfo.outputPath('admin-card-editor-1280.png'), fullPage: true });
  await expect(form.getByRole('button', { name: '保存草稿' })).toBeInViewport();
  await admin.setViewportSize({ width: 1920, height: 1080 });
  await seedPublishedCards(adminContext);
  await admin.reload();
  await admin.getByRole('button', { name: '卡牌库' }).click();
  await expect(admin.getByText('E2E构造体1', { exact: true }).first()).toBeVisible();

  const suffix = Date.now().toString(36);
  const hostContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const guestContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await register(host, `host_${suffix}`);
  await register(guest, `guest_${suffix}`);
  await buildDeck(hostContext, '主机E2E牌组');
  await buildDeck(guestContext, '访客E2E牌组');
  await host.reload(); await guest.reload();
  const [roomResponse] = await Promise.all([
    host.waitForResponse((response) => response.url() === `${api}/api/rooms` && response.request().method() === 'POST'),
    host.getByRole('button', { name: '创建对战房间' }).click(),
  ]);
  expect(roomResponse.status(), await roomResponse.text()).toBe(201);
  const code = await host.locator('.lobby-card h1').textContent();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await guest.getByPlaceholder('六位房间码').fill(code!);
  await guest.getByRole('button', { name: '加入房间' }).click();
  await expect(guest.locator('.lobby-card h1')).toHaveText(code!);
  await host.getByRole('button', { name: '使用启用牌组准备' }).click();
  await guest.getByRole('button', { name: '使用启用牌组准备' }).click();
  await expect(host.locator('.battlefield-shell')).toBeVisible();
  await expect(guest.locator('.battlefield-shell')).toBeVisible();
  await expect(host.locator('.opponent-hand strong')).toHaveText('4');
  await host.screenshot({ path: testInfo.outputPath('custom-deck-battle-1920.png'), fullPage: true });
  await host.setViewportSize({ width: 1280, height: 720 });
  await host.screenshot({ path: testInfo.outputPath('custom-deck-battle-1280.png'), fullPage: true });
  await host.getByRole('button', { name: '认输' }).click();
  await expect(guest.getByText('胜利')).toBeVisible();
  await Promise.all([adminContext.close(), hostContext.close(), guestContext.close()]);
});
