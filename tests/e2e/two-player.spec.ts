import { expect, test } from '@playwright/test';

test('two guests join by room code, start a hidden-information game and concede', async ({ browser }, testInfo) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.setViewportSize({ width: 1920, height: 1080 });
  await guest.setViewportSize({ width: 1920, height: 1080 });

  await host.goto('/');
  await host.getByRole('button', { name: '创建房间' }).click();
  const code = await host.locator('.lobby-card h1').textContent();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await guest.goto('/');
  await guest.getByPlaceholder('房间码').fill(code!);
  await guest.getByRole('button', { name: '加入' }).click();
  await expect(guest.locator('.lobby-card h1')).toHaveText(code!);

  await host.getByRole('button', { name: '选择开发牌组并准备' }).click();
  await guest.getByRole('button', { name: '选择开发牌组并准备' }).click();
  await expect(host.locator('.battlefield-shell')).toBeVisible();
  await expect(guest.locator('.battlefield-shell')).toBeVisible();
  await expect(host.locator('[data-field-slot]')).toHaveCount(10);
  await expect(host.locator('[data-energy-slot]')).toHaveCount(20);
  await expect(host.locator('[data-signal-slot]')).toHaveCount(24);
  await expect(host.locator('[data-processing-zone]')).toHaveCount(2);
  await expect(host.locator('.opponent-hand strong')).toHaveText('4');
  await expect(host.locator('.opponent-hand button')).toHaveCount(0);

  const signalSlotBox = await host.locator('.resource-panel.self .signal-slot').first().boundingBox();
  const energySlotBox = await host.locator('.resource-panel.self .energy-slot').first().boundingBox();
  expect(signalSlotBox?.width).toBeGreaterThanOrEqual(48);
  expect(signalSlotBox?.height).toBeGreaterThanOrEqual(68);
  expect(energySlotBox?.width).toBeGreaterThanOrEqual(56);
  expect(energySlotBox?.height).toBeGreaterThanOrEqual(76);
  const arenaBackground = await host.locator('.arena-backdrop').evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(arenaBackground).toContain('arena-background');

  const openingCard = host.locator('.hand-cards .mini-card').first();
  const openingCardName = await openingCard.getAttribute('title');
  await openingCard.click();
  await expect(host.locator('.detail-panel h2')).toHaveText(openingCardName!);

  const ownEnergy = host.locator('.resource-panel.self .energy-slot:not(.empty)').first();
  const ownEnergyName = await ownEnergy.getAttribute('title');
  await ownEnergy.click();
  await expect(host.locator('.detail-panel h2')).toHaveText(ownEnergyName!);
  await host.screenshot({ path: testInfo.outputPath('battlefield-1920.png'), fullPage: true });
  await host.setViewportSize({ width: 1280, height: 720 });
  await expect(host.locator('.battlefield-shell')).toBeVisible();
  await host.screenshot({ path: testInfo.outputPath('battlefield-1280.png'), fullPage: true });

  await host.getByRole('button', { name: '认输' }).click();
  await expect(guest.getByText('胜利')).toBeVisible();
  await expect(host.getByText('败北')).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});
