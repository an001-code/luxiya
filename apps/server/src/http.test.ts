import { afterEach, describe, expect, test } from 'vitest';
import { buildServer } from './server.js';
import { createMemoryRepository } from './persistence/memory-repository.js';
import type { StoredCard } from './persistence/types.js';
import { DeckService } from './decks/service.js';
import { RoomManager } from './room-manager.js';

const storedCard = (id: string, signal?: 'red' | 'blue' | 'yellow'): StoredCard => ({
  id, name: id, type: signal ? 'tactic' : 'character', ...(signal ? { subtype: 'normal' as const, signal } : { pp: 1000, dp: 1 }),
  cost: 0, attribute: 'none', traits: [], text: ['测试'], effectIds: [], structuredEffects: [], status: 'published', version: 1, effectSchemaVersion: 1,
  createdAt: '2026-11-09T00:00:00.000Z', updatedAt: '2026-11-09T00:00:00.000Z',
});

describe('HTTP API', () => {
  const servers: Array<ReturnType<typeof buildServer>> = [];
  afterEach(async () => Promise.all(servers.splice(0).map((server) => server.close())));

  test('reports health and rejects unauthenticated room access', async () => {
    const server = buildServer();
    servers.push(server);
    expect((await server.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ ok: true });
    expect((await server.inject({ method: 'POST', url: '/api/rooms' })).statusCode).toBe(401);
    expect((await server.inject({ method: 'POST', url: '/api/rooms/ABC123/join' })).statusCode).toBe(401);
  });

  test('loads an authenticated players active deck and rejects accounts without one', async () => {
    const repository = createMemoryRepository();
    const manager = new RoomManager({ codeGenerator: () => 'DECK01', tokenGenerator: () => 'room-token' });
    const server = buildServer({ repository, manager });
    servers.push(server);
    for (const entry of [storedCard('SIG-R', 'red'), storedCard('SIG-B', 'blue'), storedCard('SIG-Y', 'yellow')]) await repository.saveCard(entry);
    for (let index = 1; index <= 10; index += 1) await repository.saveCard(storedCard(`UNIT-${index}`));

    const registered = await server.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'room_owner', password: 'TestPass!21' } });
    const cookie = String(registered.headers['set-cookie']).split(';')[0]!;
    expect((await server.inject({ method: 'POST', url: '/api/rooms', headers: { cookie } })).statusCode).toBe(422);

    const userId = registered.json().user.id as string;
    const deckService = new DeckService(repository);
    const deck = await deckService.create(userId, {
      name: '启用牌组',
      cards: [
        { cardId: 'SIG-R', count: 4 }, { cardId: 'SIG-B', count: 4 }, { cardId: 'SIG-Y', count: 4 },
        ...Array.from({ length: 9 }, (_, index) => ({ cardId: `UNIT-${index + 1}`, count: 4 })),
        { cardId: 'UNIT-10', count: 2 },
      ],
    });
    await deckService.activate(userId, deck.id);

    const created = await server.inject({ method: 'POST', url: '/api/rooms', headers: { cookie } });
    expect(created.statusCode).toBe(201);
    expect(created.json().playerId).toBe(userId);
    expect(manager.rooms.get('DECK01')?.seats[0]?.playerId).toBe(userId);
  });
});
