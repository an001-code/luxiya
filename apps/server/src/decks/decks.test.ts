import { describe, expect, it } from 'vitest';
import type { SignalColor } from '@pgr/protocol';
import { createMemoryRepository } from '../persistence/memory-repository.js';
import type { AppRepository, StoredCard } from '../persistence/types.js';
import { buildServer } from '../server.js';
import { DeckService } from './service.js';

const timestamp = '2026-11-09T00:00:00.000Z';
const card = (id: string, signal?: SignalColor, status: StoredCard['status'] = 'published'): StoredCard => ({
  id,
  name: id,
  type: signal ? 'tactic' : 'character',
  ...(signal ? { subtype: 'normal' as const, signal } : { pp: 3000, dp: 1 }),
  cost: signal ? 0 : 2,
  attribute: signal ? 'none' : 'physical',
  traits: [],
  text: ['测试卡牌'],
  effectIds: [],
  structuredEffects: [],
  status,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const seedDeckCards = async (repository: AppRepository): Promise<void> => {
  await repository.saveCard(card('SIG-R', 'red'));
  await repository.saveCard(card('SIG-B', 'blue'));
  await repository.saveCard(card('SIG-Y', 'yellow'));
  for (let index = 1; index <= 10; index += 1) await repository.saveCard(card(`UNIT-${index}`));
  await repository.saveCard(card('DRAFT-ONLY', undefined, 'draft'));
};

const validEntries = [
  { cardId: 'SIG-R', count: 4 },
  { cardId: 'SIG-B', count: 4 },
  { cardId: 'SIG-Y', count: 4 },
  ...Array.from({ length: 9 }, (_, index) => ({ cardId: `UNIT-${index + 1}`, count: 4 })),
  { cardId: 'UNIT-10', count: 2 },
];

describe('DeckService', () => {
  it('saves incomplete drafts with validation messages but refuses to activate them', async () => {
    const repository = createMemoryRepository();
    await seedDeckCards(repository);
    const service = new DeckService(repository, () => new Date(timestamp));
    const draft = await service.create('user-1', { name: '未完成牌组', cards: [{ cardId: 'SIG-R', count: 4 }] });

    expect(draft.active).toBe(false);
    expect(draft.validationErrors).toEqual(expect.arrayContaining(['牌组必须恰好包含50张卡牌', '蓝色信号球必须恰好4张', '黄色信号球必须恰好4张']));
    await expect(service.activate('user-1', draft.id)).rejects.toMatchObject({ message: 'DECK_INVALID', details: draft.validationErrors });
  });

  it('enforces copy limits and rejects draft or unknown cards', async () => {
    const repository = createMemoryRepository();
    await seedDeckCards(repository);
    const service = new DeckService(repository);
    const result = await service.create('user-1', {
      name: '非法牌组',
      cards: [{ cardId: 'SIG-R', count: 5 }, { cardId: 'DRAFT-ONLY', count: 1 }, { cardId: 'UNKNOWN', count: 1 }],
    });

    expect(result.validationErrors).toEqual(expect.arrayContaining([
      '同编号卡牌最多4张：SIG-R',
      '卡牌尚未发布：DRAFT-ONLY',
      '未知卡牌：UNKNOWN',
    ]));
  });

  it('activates a valid deck and atomically deactivates the previous deck', async () => {
    const repository = createMemoryRepository();
    await seedDeckCards(repository);
    const service = new DeckService(repository, () => new Date(timestamp));
    const first = await service.create('user-1', { name: '牌组一', cards: validEntries });
    const second = await service.create('user-1', { name: '牌组二', cards: validEntries });

    expect((await service.activate('user-1', first.id)).active).toBe(true);
    expect((await service.activate('user-1', second.id)).active).toBe(true);
    const decks = await service.list('user-1');
    expect(decks.find((deck) => deck.id === first.id)?.active).toBe(false);
    expect(decks.find((deck) => deck.id === second.id)?.active).toBe(true);
  });

  it('prevents another player from editing or deleting a deck they do not own', async () => {
    const repository = createMemoryRepository();
    await seedDeckCards(repository);
    const service = new DeckService(repository);
    const deck = await service.create('user-1', { name: '私有牌组', cards: [] });

    await expect(service.update('user-2', deck.id, { name: '窃取', cards: validEntries })).rejects.toThrow('DECK_NOT_FOUND');
    await expect(service.delete('user-2', deck.id)).rejects.toThrow('DECK_NOT_FOUND');
  });
});

describe('deck HTTP API', () => {
  it('requires login and returns only the current player decks', async () => {
    const repository = createMemoryRepository();
    await seedDeckCards(repository);
    const server = buildServer({ repository });
    expect((await server.inject({ method: 'GET', url: '/api/decks' })).statusCode).toBe(401);
    const registered = await server.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'deck_owner', password: 'TestPass!21' } });
    const cookie = String(registered.headers['set-cookie']).split(';')[0]!;

    const created = await server.inject({ method: 'POST', url: '/api/decks', headers: { cookie }, payload: { name: '我的牌组', cards: [] } });
    expect(created.statusCode).toBe(201);
    expect((await server.inject({ method: 'GET', url: '/api/decks', headers: { cookie } })).json()).toMatchObject({ decks: [{ name: '我的牌组' }] });
    await server.close();
  });
});
