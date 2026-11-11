import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { getCardDefinition } from '@pgr/cards';

const api = 'http://127.0.0.1:3011';
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

const authHeaders = async (context: BrowserContext) => {
  const session = (await context.cookies()).find((cookie) => cookie.name === 'pgr_session');
  if (!session) throw new Error('Missing authenticated browser session');
  return { Cookie: `pgr_session=${encodeURIComponent(session.value)}` };
};

const seedPublishedCards = async (context: BrowserContext) => {
  const headers = await authHeaders(context);
  const definitions = [
    { id: 'E2E-SIG-R', name: 'E2E红色信号', type: 'tactic', subtype: 'normal', signal: 'red' },
    { id: 'E2E-SIG-B', name: 'E2E蓝色信号', type: 'tactic', subtype: 'normal', signal: 'blue' },
    { id: 'E2E-SIG-Y', name: 'E2E黄色信号', type: 'tactic', subtype: 'normal', signal: 'yellow' },
    ...Array.from({ length: 10 }, (_, index) => ({ id: `E2E-UNIT-${index + 1}`, name: `E2E构造体${index + 1}`, type: 'character', pp: 3000, dp: 1, traits: ['E2E', '灰鸦小队'] })),
  ];
  for (const definition of definitions) {
    const input = { ...definition, cost: 0, attribute: 'none', traits: definition.traits ?? ['E2E'], text: ['端到端测试卡牌。'], effectIds: [], structuredEffects: [], imageDataUrl: png };
    const created = await context.request.post(`${api}/api/admin/cards`, { headers, data: input });
    if (created.status() === 409) await context.request.put(`${api}/api/admin/cards/${definition.id}`, { headers, data: input });
    const published = await context.request.post(`${api}/api/admin/cards/${definition.id}/publish`, { headers });
    expect(published.ok()).toBeTruthy();
  }
};

const syncCurrentCardDraft = async (context: BrowserContext, cardId: string) => {
  const headers = await authHeaders(context);
  const definition = getCardDefinition(cardId);
  const existing = await context.request.get(`${api}/api/admin/cards`, { headers });
  const existingBody = await existing.text();
  expect(existing.ok(), `${existing.status()}: ${existingBody}`).toBeTruthy();
  const found = (JSON.parse(existingBody) as { cards: Array<{ id: string }> }).cards.some((card) => card.id === cardId);
  const response = found
    ? await context.request.put(`${api}/api/admin/cards/${cardId}`, { headers, data: definition })
    : await context.request.post(`${api}/api/admin/cards`, { headers, data: definition });
  expect(response.ok(), await response.text()).toBeTruthy();
};

const buildDeck = async (context: BrowserContext, name: string) => {
  const headers = await authHeaders(context);
  const cards = [
    { cardId: 'BP01-007', count: 4 },
    { cardId: 'E2E-SIG-R', count: 4 }, { cardId: 'E2E-SIG-B', count: 4 }, { cardId: 'E2E-SIG-Y', count: 4 },
    ...Array.from({ length: 8 }, (_, index) => ({ cardId: `E2E-UNIT-${index + 1}`, count: 4 })),
    { cardId: 'E2E-UNIT-10', count: 2 },
  ];
  const created = await context.request.post(`${api}/api/decks`, { headers, data: { name, cards } });
  expect(created.ok()).toBeTruthy();
  const id = (await created.json()).deck.id as string;
  expect((await context.request.post(`${api}/api/decks/${id}/activate`, { headers })).ok()).toBeTruthy();
};

const advanceToMain = async (page: Page) => {
  const primary = page.locator('.action-console > .primary-action');
  await expect(page.locator('.phase-status')).toContainText('竖直阶段');
  await primary.click();
  await expect(page.locator('.phase-status')).toContainText('抽牌阶段');
  await primary.click();
  await expect(page.locator('.phase-status')).toContainText('费用填充');
  await expect(primary).toBeEnabled();
  await primary.click();
  await expect(page.locator('.phase-status')).toContainText('主要阶段');
};

const playFirstUnit = async (page: Page) => {
  const unit = page.locator('.hand-cards .mini-card[title^="E2E构造体"]').first();
  await expect(unit).toBeVisible();
  await unit.click();
  await page.getByRole('button', { name: '使用卡牌' }).click();
  await expect(page.locator('.field-row.self .mini-card[title^="E2E构造体"]')).toBeVisible();
};

const finishTurn = async (active: Page, opponent: Page) => {
  await active.getByRole('button', { name: '结束阶段' }).click();
  await active.getByRole('button', { name: '不响应' }).click();
  await opponent.getByRole('button', { name: '不响应' }).click();
};

test('administrator publishes BP01-007 and two players resolve its live effect', async ({ browser }, testInfo) => {
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required for E2E');
  const adminContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const admin = await adminContext.newPage();
  await login(admin, process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'Anonce', adminPassword);
  await syncCurrentCardDraft(adminContext, 'BP01-007');
  await admin.reload();
  await admin.getByRole('button', { name: '卡牌录入' }).click();
  await expect(admin.getByRole('heading', { name: '卡牌录入' })).toBeVisible();
  await expect(admin.getByRole('heading', { name: '卡牌索引' })).toBeVisible();
  await admin.getByLabel('搜索管理卡牌').fill('BP01-007');
  await admin.locator('.admin-card-list button', { hasText: 'BP01-007' }).click();
  await expect(admin.getByLabel('卡牌名称')).toHaveValue('刹那冰华');
  await expect(admin.locator('.effect-action-editor')).toHaveCount(3);
  await admin.locator('input[type="file"]').setInputFiles({
    name: 'BP01-007.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  const form = admin.locator('.card-form');
  expect(await form.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
  await form.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(form.getByRole('button', { name: '保存并发布' })).toBeInViewport();
  await admin.screenshot({ path: testInfo.outputPath('bp01-007-effect-builder-1920.png') });
  await admin.setViewportSize({ width: 1280, height: 720 });
  await form.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await admin.screenshot({ path: testInfo.outputPath('bp01-007-effect-builder-1280.png') });
  await expect(form.getByRole('button', { name: '保存并发布' })).toBeInViewport();
  await admin.setViewportSize({ width: 1920, height: 1080 });
  await form.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const saveResponsePromise = admin.waitForResponse((response) => response.url().endsWith('/api/admin/cards/BP01-007') && response.request().method() === 'PUT').then((response) => ({ response }));
  const saveFailurePromise = admin.waitForEvent('requestfailed', { predicate: (request) => request.url().includes('/api/admin/cards/BP01-007') }).then((request) => ({ request }));
  const publishResponsePromise = admin.waitForResponse((response) => response.url().endsWith('/api/admin/cards/BP01-007/publish') && response.request().method() === 'POST');
  await form.getByRole('button', { name: '保存并发布' }).click();
  const saveOutcome = await Promise.race([saveResponsePromise, saveFailurePromise]);
  if ('request' in saveOutcome) throw new Error(`Save request failed: ${saveOutcome.request.url()} — ${saveOutcome.request.failure()?.errorText ?? 'unknown'}`);
  const saveResponse = saveOutcome.response;
  expect(saveResponse.ok(), `${saveResponse.status()}: ${await saveResponse.text()}`).toBeTruthy();
  const publishResponse = await publishResponsePromise;
  expect(publishResponse.ok(), `${publishResponse.status()}: ${await publishResponse.text()}`).toBeTruthy();
  await seedPublishedCards(adminContext);
  await admin.reload();
  await admin.getByRole('button', { name: '卡牌库' }).click();
  await admin.getByPlaceholder('搜索编号、名称或特征').fill('BP01-007');
  await expect(admin.locator('.catalog-card', { hasText: 'BP01-007' })).toBeVisible();

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

  await host.getByRole('button', { name: /确认调度/ }).click();
  await guest.getByRole('button', { name: /确认调度/ }).click();
  await expect(guest.locator('.phase-status')).toContainText('我方行动');
  await advanceToMain(guest);
  await playFirstUnit(guest);
  await finishTurn(guest, host);

  await expect(host.locator('.phase-status')).toContainText('我方行动');
  await advanceToMain(host);
  await playFirstUnit(host);
  await finishTurn(host, guest);

  await expect(guest.locator('.phase-status')).toContainText('我方行动');
  await advanceToMain(guest);
  await guest.getByRole('button', { name: '攻击玩家' }).click();
  await expect(host.locator('.action-readout')).toContainText('攻击响应窗口');
  const instant = host.locator('.hand-cards .mini-card[title="刹那冰华"]').first();
  await expect(instant).toBeVisible();
  await instant.click();
  await host.getByRole('button', { name: '使用卡牌' }).click();
  const decision = host.locator('.effect-decision');
  await expect(decision).toContainText('请选择追加丢弃的手牌');
  const choice = decision.locator('[data-decision-option]').first();
  await choice.click();

  await host.setViewportSize({ width: 1280, height: 720 });
  const decisionBox = await decision.boundingBox();
  const selfFieldBox = await host.locator('.field-row.self').boundingBox();
  const opponentFieldBox = await host.locator('.field-row.opponent').boundingBox();
  expect(decisionBox && selfFieldBox && decisionBox.y + decisionBox.height <= selfFieldBox.y).toBeTruthy();
  expect(decisionBox && opponentFieldBox && opponentFieldBox.y + opponentFieldBox.height <= decisionBox.y).toBeTruthy();
  await host.screenshot({ path: testInfo.outputPath('bp01-007-decision-1280.png') });
  await host.setViewportSize({ width: 1920, height: 1080 });
  await host.getByRole('button', { name: '确认选择' }).click();

  await expect(host.locator('.field-row.self .mini-card small')).toContainText('PP 5500');
  await expect(guest.locator('.field-row.opponent .mini-card small')).toContainText('PP 5500');
  await host.getByRole('button', { name: '回合记录' }).click();
  await guest.getByRole('button', { name: '回合记录' }).click();
  await expect(host.locator('.turn-log')).toContainText('刹那冰华');
  const hostLog = await host.locator('.turn-log li').allTextContents();
  const guestLog = await guest.locator('.turn-log li').allTextContents();
  expect(hostLog).toEqual(guestLog);
  await host.screenshot({ path: testInfo.outputPath('bp01-007-resolved-1920.png') });

  await guest.getByRole('button', { name: '不响应' }).click();
  await host.getByRole('button', { name: '不响应' }).click();
  await expect(host.locator('.action-readout')).not.toContainText('攻击响应窗口');
  await Promise.all([adminContext.close(), hostContext.close(), guestContext.close()]);
});
