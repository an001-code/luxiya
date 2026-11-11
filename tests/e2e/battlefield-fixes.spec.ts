import { expect, test } from '@playwright/test';
import { cardDefinitions } from '@pgr/cards';
import type { LegalAction, PlayerBoardView, PlayerView } from '@pgr/protocol';

const board = (id: string): PlayerBoardView => ({ id, hand: [], deck: { count: 40 }, graveyard: [], processing: [], signals: [], energy: [], field: [null, null, null, null, null], corruption: 0 });
const card = (instanceId: string, cardId = 'BP01-079') => ({ instanceId, cardId, face: 'up' as const, rested: false });
const view: PlayerView = { gameId: 'ui-fixes', version: 1, viewerId: 'p1', activePlayerId: 'p1', status: 'playing', phase: 'main', turn: 2,
  self: board('p1'), opponent: { ...board('p2'), hand: { count: 4 } }, pendingAttack: null, priorityWindow: null, winnerId: null, events: [], legalActions: [], pendingDecision: null };

// Render the production component with server-shaped snapshots; real-room transport is covered separately.
for (const width of [1280, 1920]) {
  test(`signal sorting, dark energy and field equipment at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/image')) return route.fulfill({ status: 404 });
      return route.fulfill({ json: path === '/api/auth/me' ? { user: { id: 'test', username: '测试', role: 'player' } }
        : path === '/api/decks' ? { decks: [] } : { cards: cardDefinitions } });
    });
    await page.goto('/');
    await page.evaluate(async (snapshot) => {
      const source = await (await fetch('/src/Battlefield.tsx')).text();
      const main = await (await fetch('/src/main.tsx')).text();
      const reactUrl = source.match(/from ["']([^"']*\/react\.js[^"']*)["']/)![1]!;
      const domUrl = main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)![1]!;
      const componentUrl = '/src/Battlefield.tsx';
      const [reactModule, domModule, { Battlefield }] = await Promise.all([import(reactUrl), import(domUrl), import(componentUrl)]);
      const { createElement } = reactModule.default ?? reactModule;
      const { createRoot } = domModule.default ?? domModule;
      document.getElementById('root')!.style.display = 'none';
      const host = document.createElement('div'); document.body.append(host);
      const root = createRoot(host);
      const harness = window as unknown as { battleCommands: LegalAction[]; renderBattle: (next: PlayerView) => void };
      harness.battleCommands = [];
      harness.renderBattle = (next) => root.render(createElement(Battlefield, { view: next, onCommand: (action: LegalAction) => harness.battleCommands.push(action) }));
      harness.renderBattle(snapshot);
    }, { ...view, pendingDecision: { id: 'sort', frameId: 'raven', kind: 'order-cards', purpose: 'action', prompt: '排列信号球（从前到后）', min: 12, max: 12,
      options: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, instanceId: `s${i}`, cardId: 'BP01-079', label: `信号球 ${i + 1}` })) } } as PlayerView);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '将 信号球 2 前移', exact: true }).click();
    await page.locator('.ordered-card-list li').nth(2).dragTo(page.locator('.ordered-card-list li').first());
    await expect(page.locator('.ordered-card-face strong').first()).toHaveText('信号球 3');
    await page.getByRole('button', { name: '确认顺序' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '确认顺序' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`signal-order-${width}.png`) });
    await page.getByRole('button', { name: '确认顺序' }).click();
    const commands = await page.evaluate(() => (window as unknown as { battleCommands: LegalAction[] }).battleCommands);
    expect(commands[0]).toMatchObject({ type: 'RESOLVE_EFFECT_DECISION', decisionId: 'sort', selectedInstanceIds: ['s2', 's1', 's0', ...Array.from({ length: 9 }, (_, i) => `s${i + 3}`)] });
    const equipmentView: PlayerView = { ...view, self: { ...view.self, energy: [{ ...card('dark', 'ST01-005'), face: 'down' }], field: [card('weapon', 'BP01-023'), card('host', 'PR-016'), null, null, null] }, legalActions: [{ type: 'EQUIP_CARD', sourceSlot: 0, targetSlot: 1 }] };
    await page.evaluate((snapshot) => (window as unknown as { renderBattle: (next: PlayerView) => void }).renderBattle(snapshot), equipmentView);
    await expect(page.locator('[data-card-view="dark"] .battle-card-back')).toBeVisible();
    await page.locator('[data-card-view="dark"]').click();
    await expect(page.locator('.detail-panel h2')).toHaveText(cardDefinitions.find((definition) => definition.id === 'ST01-005')!.name);
    await page.getByRole('button', { name: '装备', exact: true }).click();
    await page.getByRole('button', { name: /A2 ·/ }).click();
    await page.getByRole('button', { name: '确认装备', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { battleCommands: LegalAction[] }).battleCommands.at(-1))).toEqual({ type: 'EQUIP_CARD', sourceSlot: 0, targetSlot: 1 });
  });
}
