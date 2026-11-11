import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { getCardDefinition } from '@pgr/cards';
import type { CardDefinition, CardInstance, ClientToServerEvents, GameCommand, LegalAction, PlayerView, RoomCredentials, ServerToClientEvents } from '@pgr/protocol';

const api = 'http://127.0.0.1:3011';
const upgradedId = 'E2E-EVOLVE-LUCIA-5'; const baseId = 'E2E-EVOLVE-LUCIA-2';
const headers = async (context: BrowserContext) => ({ Cookie: `pgr_session=${encodeURIComponent((await context.cookies()).find((cookie) => cookie.name === 'pgr_session')!.value)}` });

test('five-energy red lotus exposes and executes A1 evolution with normal play also affordable', async ({ browser }, testInfo) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [admin, first, second] = contexts as [BrowserContext, BrowserContext, BrowserContext];
  const sockets: Array<Socket<ServerToClientEvents, ClientToServerEvents>> = [];
  try {
    expect((await admin.request.post(`${api}/api/auth/login`, { data: { username: process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'Anonce', password: process.env.BOOTSTRAP_ADMIN_PASSWORD } })).ok()).toBeTruthy();
    const adminPage = await admin.newPage(); await adminPage.goto('/');
    const imageDataUrl = await adminPage.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 168; const painter = canvas.getContext('2d')!; painter.fillStyle = '#214867'; painter.fillRect(0, 0, 120, 168); painter.fillStyle = '#fff'; painter.font = '15px sans-serif'; painter.fillText('LUCIA TEST', 12, 80); return canvas.toDataURL('image/png'); });
    const definitions: CardDefinition[] = [
      { ...getCardDefinition('ST01-001'), id: upgradedId }, { ...getCardDefinition('ST01-004'), id: baseId },
      ...(['red', 'blue', 'yellow'] as const).map((signal, index) => ({ ...getCardDefinition(['BP01-080', 'BP01-081', 'BP01-084'][index]!), id: `E2E-EVOLVE-SIGNAL-${signal}` })),
      ...Array.from({ length: 8 }, (_, index): CardDefinition => ({ id: `E2E-EVOLVE-FILL-${index}`, name: `升变测试构造体${index + 1}`, type: 'character', cost: 0, attribute: 'physical', pp: 1000, dp: 0, traits: ['开发测试'], text: ['无能力。'], effectIds: [], structuredEffects: [] })),
    ];
    const adminHeaders = await headers(admin);
    for (const definition of definitions) {
      const data = { ...definition, structuredEffects: definition.structuredEffects ?? [], imageDataUrl };
      const created = await admin.request.post(`${api}/api/admin/cards`, { headers: adminHeaders, data });
      if (created.status() === 409) expect((await admin.request.put(`${api}/api/admin/cards/${definition.id}`, { headers: adminHeaders, data })).ok()).toBeTruthy();
      else expect(created.status()).toBe(201);
      expect((await admin.request.post(`${api}/api/admin/cards/${definition.id}/publish`, { headers: adminHeaders })).ok()).toBeTruthy();
    }
    const deck = [
      { cardId: upgradedId, count: 4 }, { cardId: baseId, count: 4 },
      ...(['red', 'blue', 'yellow'] as const).map((color) => ({ cardId: `E2E-EVOLVE-SIGNAL-${color}`, count: 4 })),
      ...Array.from({ length: 8 }, (_, index) => ({ cardId: `E2E-EVOLVE-FILL-${index}`, count: index === 7 ? 2 : 4 })),
    ];
    for (const [index, context] of [first, second].entries()) {
      expect((await context.request.post(`${api}/api/auth/register`, { data: { username: `ev${index}_${Date.now().toString(36)}`, password: 'EvolutionTest!21' } })).ok()).toBeTruthy();
      const auth = await headers(context);
      const response = await context.request.post(`${api}/api/decks`, { headers: auth, data: { name: '红莲升变回归', cards: deck } });
      expect(response.ok()).toBeTruthy();
      expect((await context.request.post(`${api}/api/decks/${(await response.json()).deck.id}/activate`, { headers: auth })).ok()).toBeTruthy();
    }
    const host = await first.request.post(`${api}/api/rooms`, { headers: await headers(first) }); expect(host.ok()).toBeTruthy();
    const hostSeat = await host.json() as RoomCredentials;
    const joined = await second.request.post(`${api}/api/rooms/${hostSeat.code}/join`, { headers: await headers(second) }); expect(joined.ok()).toBeTruthy();
    const seats = [hostSeat, await joined.json() as RoomCredentials];
    const peers = seats.map((credentials, index) => {
      let current: PlayerView | undefined; let rejection = '';
      const socket = io(api, { transports: ['websocket'], forceNew: true, reconnection: false }) as Socket<ServerToClientEvents, ClientToServerEvents>; sockets.push(socket);
      socket.on('room:snapshot', (snapshot) => { if (snapshot.game) current = snapshot.game; });
      socket.on('command:rejected', (error) => { rejection = error.message; });
      socket.on('connect', () => socket.emit('room:resume', credentials));
      return { socket, credentials, context: [first, second][index]!, state: () => current!, error: () => rejection };
    });
    await Promise.all(peers.map((peer) => expect.poll(() => peer.socket.connected).toBe(true)));
    peers.forEach((peer) => peer.socket.emit('room:ready', true));
    await Promise.all(peers.map((peer) => expect.poll(() => peer.state()?.phase).toBe('mulligan')));
    const send = async (peer: typeof peers[number], action: LegalAction) => {
      const before = peer.state().version;
      peer.socket.emit('game:command', { ...action, commandId: randomUUID(), playerId: peer.credentials.playerId, expectedVersion: before } as GameCommand);
      await Promise.all(peers.map((entry) => expect.poll(() => entry.error() || (entry.state()?.version > before ? 'accepted' : 'waiting')).toBe('accepted')));
    };
    await send(peers[0]!, { type: 'MULLIGAN', instanceIds: [] }); await send(peers[1]!, { type: 'MULLIGAN', instanceIds: [] });
    const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
    let ready: typeof peers[number] | undefined;
    for (let step = 0; step < 240; step++) {
      const current = peers[0]!.state();
      const actor = peers.find((peer) => peer.credentials.playerId === current.activePlayerId)!;
      const view = actor.state();
      if (view.phase === 'draw') { await send(actor, { type: 'CONFIRM_DRAW' }); continue; }
      if (view.phase === 'energy') {
        const hand = view.self.hand as CardInstance[];
        const fee = hand.find((card) => card.cardId.startsWith('E2E-EVOLVE-FILL-')) ?? hand.find((card) => card.cardId.includes('-SIGNAL-')) ?? hand[0];
        await send(actor, view.self.energy.length < 5 && fee ? { type: 'SET_ENERGY', instanceId: fee.instanceId } : { type: 'SET_ENERGY' }); continue;
      }
      if (view.phase === 'end') {
        await send(peers.find((peer) => peer.credentials.playerId === view.priorityWindow!.priorityPlayerId)!, { type: 'PASS_RESPONSE' }); continue;
      }
      const evolution = view.legalActions.find((action) => action.type === 'PLAY_CARD' && action.evolutionTargetSlot === 0);
      if (evolution && view.self.energy.length === 5 && view.self.energy.every((card) => !card.rested)) { ready = actor; break; }
      const base = view.legalActions.find((action) => action.type === 'PLAY_CARD' && action.fieldSlot === 0 && (view.self.hand as CardInstance[]).find((card) => card.instanceId === action.instanceId)?.cardId === baseId);
      if (base?.type === 'PLAY_CARD') {
        const available = view.self.energy.filter((card) => !card.rested);
        const matching = available.find((card) => card.cardId && definitionMap.get(card.cardId)?.attribute === 'physical')!;
        const paymentIds = [matching, ...available.filter((card) => card !== matching)].slice(0, 2).map((card) => card.instanceId);
        await send(actor, { ...base, paymentIds }); continue;
      }
      await send(actor, { type: 'END_PHASE' });
    }
    expect(ready, 'could not reach screenshot setup through legal commands').toBeTruthy();
    const player = ready!; const state = player.state();
    const upgrade = (state.self.hand as CardInstance[]).find((card) => card.cardId === upgradedId)!;
    const page = await player.context.newPage(); await page.goto('/');
    await page.evaluate((credentials) => sessionStorage.setItem('pgr-room-credentials', JSON.stringify(credentials)), player.credentials); await page.reload();
    await page.locator(`.hand-cards [data-card-view="${upgrade.instanceId}"]`).click();
    const dialog = page.getByRole('dialog', { name: '使用《露西亚·红莲》' });
    await expect(dialog.getByRole('button', { name: '通常出场 · 费用 5' })).toBeEnabled();
    await dialog.getByRole('button', { name: '升变召唤 · 费用 2' }).click();
    await expect(dialog).toContainText('已选择：升变 A1 · 露西亚·红莲 · 费用 2');
    const fees = state.self.energy;
    const physical = fees.find((card) => card.cardId && definitionMap.get(card.cardId)?.attribute === 'physical')!;
    for (const fee of [physical, fees.find((card) => card.instanceId !== physical.instanceId)!]) await dialog.locator(`.payment-options [data-card-view="${fee.instanceId}"]`).click();
    await page.screenshot({ path: testInfo.outputPath('red-lotus-five-energy-evolution.png') });
    await dialog.getByRole('button', { name: '确认升变' }).click();
    await expect.poll(() => player.state().self.field[0]?.cardId).toBe(upgradedId);
    expect(player.state().self.field[0]?.underneath?.[0]?.cardId).toBe(baseId);
    expect(player.state().self.energy.filter((card) => card.rested)).toHaveLength(2);
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await Promise.all(contexts.map((context) => context.close()));
  }
});
