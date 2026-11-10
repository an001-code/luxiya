import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from './memory-repository.js';
import { connectMySqlRepository } from './mysql-repository.js';
import type { StoredCard, StoredDeck } from './types.js';
import { migrateDatabase } from './migrations.js';

const makeCard = (): StoredCard => ({
  id: 'BP01-079',
  name: '第五次交锋',
  type: 'tactic',
  subtype: 'normal',
  cost: 0,
  attribute: 'none',
  traits: [],
  signal: 'red',
  text: ['使用后进入信号球区并抽1张牌。'],
  effectIds: ['signal_draw'],
  status: 'published',
  version: 1,
  effectSchemaVersion: 1,
  imageMime: 'image/webp',
  imageData: new Uint8Array([82, 73, 70, 70]),
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
});

const makeDeck = (): StoredDeck => ({
  id: 'deck-1',
  userId: 'user-1',
  name: '露西亚测试牌组',
  active: false,
  validationErrors: ['牌组需要恰好50张卡牌'],
  cards: [{ cardId: 'BP01-079', count: 4 }],
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
});

describe('AppRepository memory contract', () => {
  it('prevents accounts that differ only by username case', async () => {
    const repository = createMemoryRepository();
    await repository.createUser({
      id: 'user-1', username: 'Anonce', usernameKey: 'anonce', passwordHash: 'scrypt:hash', role: 'admin', createdAt: '2026-11-09T00:00:00.000Z',
    });

    await expect(repository.createUser({
      id: 'user-2', username: 'ANONCE', usernameKey: 'anonce', passwordHash: 'scrypt:other', role: 'player', createdAt: '2026-11-09T00:00:01.000Z',
    })).rejects.toThrow('USERNAME_TAKEN');
    await expect(repository.findUserByUsernameKey('ANONCE')).resolves.toMatchObject({ id: 'user-1', username: 'Anonce' });
  });

  it('round-trips sessions without storing a raw browser token', async () => {
    const repository = createMemoryRepository();
    await repository.createUser({
      id: 'user-1', username: 'player', usernameKey: 'player', passwordHash: 'scrypt:hash', role: 'player', createdAt: '2026-11-09T00:00:00.000Z',
    });
    await repository.saveSession({ tokenHash: 'sha256-only', userId: 'user-1', expiresAt: '2026-12-09T00:00:00.000Z' });

    await expect(repository.findSession('sha256-only')).resolves.toEqual({
      tokenHash: 'sha256-only', userId: 'user-1', expiresAt: '2026-12-09T00:00:00.000Z',
    });
    await expect(repository.findSession('raw-browser-token')).resolves.toBeNull();
  });

  it('returns defensive copies of card images and deck entries', async () => {
    const repository = createMemoryRepository();
    const card = makeCard();
    const deck = makeDeck();
    await repository.saveCard(card);
    await repository.saveDeck(deck);

    card.imageData![0] = 0;
    deck.cards[0]!.count = 1;

    await expect(repository.findCardById('BP01-079')).resolves.toMatchObject({ imageData: new Uint8Array([82, 73, 70, 70]) });
    await expect(repository.findDeckById('deck-1')).resolves.toMatchObject({ cards: [{ cardId: 'BP01-079', count: 4 }] });
  });

  it('rolls back every write when a transaction fails', async () => {
    const repository = createMemoryRepository();
    await expect(repository.withTransaction(async (transaction) => {
      await transaction.saveCard(makeCard());
      await transaction.saveDeck(makeDeck());
      throw new Error('VALIDATION_FAILED');
    })).rejects.toThrow('VALIDATION_FAILED');

    await expect(repository.findCardById('BP01-079')).resolves.toBeNull();
    await expect(repository.findDeckById('deck-1')).resolves.toBeNull();
  });
});

describe('MySQL repository configuration', () => {
  it('treats an already-existing effect schema column as an idempotent migration', async () => {
    const executor = {
      query: async (statement: string) => {
        if (statement.startsWith('ALTER TABLE cards ADD COLUMN effect_schema_version')) throw { code: 'ER_DUP_FIELDNAME' };
        return [];
      },
    };
    await expect(migrateDatabase(executor as never)).resolves.toBeUndefined();
  });

  it('rejects unsafe database identifiers before opening a connection', async () => {
    await expect(connectMySqlRepository({
      host: '127.0.0.1', port: 1, user: 'unused', password: 'unused', database: 'cards`; DROP DATABASE mysql; --',
    })).rejects.toThrow('INVALID_DATABASE_NAME');
  });
});
