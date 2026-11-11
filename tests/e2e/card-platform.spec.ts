import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { getCardDefinition } from '@pgr/cards';

const api = 'http://127.0.0.1:3011';
let png = '';
const liveCardId = 'E2E-BP01-007';

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
  const definition = { ...getCardDefinition('BP01-007'), id: cardId };
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
    { cardId: liveCardId, count: 4 },
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
  await expect(page.getByRole('dialog', { name: '抽牌完成' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('automatic-draw-confirmation.png') });
  await page.getByRole('button', { name: '确认抽牌' }).click();
  await expect(page.locator('.phase-status')).toContainText('费用填充');
  await page.getByRole('dialog', { name: '选择费用填充' }).getByRole('button', { name: '跳过填充' }).click();
  await expect(page.locator('.phase-status')).toContainText('主要阶段');
};

const playFirstUnit = async (page: Page) => {
  const unit = page.locator('.hand-cards .mini-card[title^="E2E构造体"]').first();
  await expect(unit).toBeVisible();
  await unit.click();
  await page.getByRole('button', { name: '出场至 A3 · 费用 0', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('choose-field-position.png') });
  await page.getByRole('button', { name: '使用卡牌' }).click();
  await expect(page.locator('[data-field-slot="self-2"] .mini-card')).toBeVisible();
  await expect(page.locator('.field-row.self .mini-card[title^="E2E构造体"]')).toBeVisible();
  const artwork = page.locator('.field-row.self .mini-card img').first();
  await expect.poll(() => artwork.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
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
  png = await admin.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 336;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 240, 336); gradient.addColorStop(0, '#24587d'); gradient.addColorStop(1, '#571f42');
    context.fillStyle = gradient; context.fillRect(0, 0, 240, 336);
    context.strokeStyle = '#88cfff'; context.lineWidth = 6; context.strokeRect(12, 12, 216, 312);
    context.fillStyle = '#e8f7ff'; context.font = 'bold 26px sans-serif'; context.fillText('PGR', 30, 60); context.fillText('TEST CARD', 30, 270);
    return canvas.toDataURL('image/png');
  });
  await syncCurrentCardDraft(adminContext, liveCardId);
  const deleteHeaders = await authHeaders(adminContext);
  const disposableId = `E2E-DELETE-${Date.now()}`;
  const disposable = await adminContext.request.post(`${api}/api/admin/cards`, { headers: deleteHeaders, data: { ...getCardDefinition('BP01-007'), id: disposableId } });
  expect(disposable.status()).toBe(201);
  expect((await adminContext.request.delete(`${api}/api/admin/cards/${disposableId}`, { headers: deleteHeaders })).status()).toBe(204);
  expect((await adminContext.request.delete(`${api}/api/admin/cards/${disposableId}`, { headers: deleteHeaders })).status()).toBe(404);
  await admin.reload();
  await admin.getByRole('button', { name: '卡牌录入' }).click();
  await expect(admin.getByRole('heading', { name: '卡牌录入' })).toBeVisible();
  await expect(admin.getByRole('heading', { name: '卡牌索引' })).toBeVisible();
  await admin.getByLabel('搜索管理卡牌').fill(liveCardId);
  await admin.locator('.admin-card-list button', { hasText: liveCardId }).click();
  await expect(admin.getByLabel('卡牌名称')).toHaveValue('刹那冰华');
  await expect(admin.locator('.effect-action-editor')).toHaveCount(3);
  await admin.locator('input[type="file"]').setInputFiles({
    name: 'E2E-BP01-007.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1]!, 'base64'),
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
  const saveResponsePromise = admin.waitForResponse((response) => response.url().endsWith(`/api/admin/cards/${liveCardId}`) && response.request().method() === 'PUT').then((response) => ({ response }));
  const saveFailurePromise = admin.waitForEvent('requestfailed', { predicate: (request) => request.url().includes(`/api/admin/cards/${liveCardId}`) }).then((request) => ({ request }));
  const publishResponsePromise = admin.waitForResponse((response) => response.url().endsWith(`/api/admin/cards/${liveCardId}/publish`) && response.request().method() === 'POST');
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
  await admin.getByPlaceholder('搜索编号、名称或特征').fill(liveCardId);
  await expect(admin.locator('.catalog-card', { hasText: liveCardId })).toBeVisible();

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

  await Promise.all([host.getByRole('button', { name: /确认调度/ }).click(), guest.getByRole('button', { name: /确认调度/ }).click()]);
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
  await guest.getByRole('button', { name: '攻击', exact: true }).click();
  await guest.getByRole('button', { name: '攻击对方玩家', exact: true }).click();
  await guest.screenshot({ path: testInfo.outputPath('choose-attack-target.png') });
  await guest.getByRole('button', { name: '确认攻击', exact: true }).click();
  await expect(host.locator('.phase-status')).toContainText('攻击响应窗口');
  const instant = host.getByRole('dialog', { name: '是否阻挡本次攻击？' }).locator('.mini-card[title="刹那冰华"]').first();
  await expect(instant).toBeVisible();
  await instant.click();
  await host.getByRole('button', { name: '使用卡牌' }).click();
  await expect(host.locator('[data-processing-zone="self"] .mini-card')).toHaveCount(1);
  await expect(guest.locator('[data-processing-zone="opponent"] .mini-card')).toHaveCount(1);
  await host.screenshot({ path: testInfo.outputPath('processing-public-1920.png') });
  const decision = host.locator('.effect-decision');
  await expect(decision).toContainText('请选择追加丢弃的手牌');
  const choice = decision.locator('[data-decision-option]').first();
  await choice.click();

  await host.setViewportSize({ width: 1280, height: 720 });
  const decisionBox = await decision.boundingBox();
  expect(decisionBox && decisionBox.y >= 0 && decisionBox.y + decisionBox.height <= 720).toBeTruthy();
  await expect(host.getByRole('dialog')).toBeVisible();
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
  await host.setViewportSize({ width: 1280, height: 720 });
  const processingBox = await host.locator('.processing-console').boundingBox();
  expect(processingBox && processingBox.height >= 164).toBeTruthy();
  const handBox = await host.locator('.hand-zone').boundingBox();
  expect(handBox && handBox.y + handBox.height <= 720).toBeTruthy();
  await expect(host.locator('.hand-cards .mini-card').last()).toBeInViewport({ ratio: 1 });
  const lastEnergyBox = await host.locator('.resource-panel.self [data-energy-slot="9"]').boundingBox();
  expect(lastEnergyBox && lastEnergyBox.y + lastEnergyBox.height <= 720).toBeTruthy();
  expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await host.screenshot({ path: testInfo.outputPath('battle-layout-1280.png') });
  await host.setViewportSize({ width: 1920, height: 1080 });

  await guest.getByRole('button', { name: '不响应' }).click();
  const defense = host.getByRole('dialog', { name: '是否阻挡本次攻击？' });
  await expect(defense).toBeVisible();
  await host.setViewportSize({ width: 1280, height: 720 });
  await defense.locator('.blocker-choice-grid .mini-card').first().click();
  await defense.getByRole('button', { name: '确认阻挡' }).scrollIntoViewIfNeeded();
  await expect(defense.getByRole('button', { name: '确认阻挡' })).toBeInViewport();
  await host.screenshot({ path: testInfo.outputPath('choose-blocker-1280.png') });
  await defense.getByRole('button', { name: '确认阻挡' }).click();
  await expect(host.locator('[data-field-slot="self-2"] .mini-card')).toHaveClass(/rested/);
  await guest.getByRole('button', { name: '不响应' }).click();
  await host.getByRole('button', { name: '不响应' }).click();
  await expect(host.locator('.phase-status')).not.toContainText('攻击响应窗口');
  await Promise.all([adminContext.close(), hostContext.close(), guestContext.close()]);
});
