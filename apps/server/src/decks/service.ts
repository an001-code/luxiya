import { randomUUID } from 'node:crypto';
import type { AppRepository, DeckCardEntry, StoredDeck } from '../persistence/types.js';

export interface DeckInput {
  name: string;
  cards: DeckCardEntry[];
}

export class DeckValidationError extends Error {
  constructor(readonly details: string[]) { super('DECK_INVALID'); }
}

const normalizeEntries = (entries: DeckCardEntry[]): DeckCardEntry[] => {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.count);
  return [...counts.entries()].map(([cardId, count]) => ({ cardId, count })).sort((left, right) => left.cardId.localeCompare(right.cardId));
};

export class DeckService {
  constructor(private readonly repository: AppRepository, private readonly now: () => Date = () => new Date()) {}

  async create(userId: string, input: DeckInput): Promise<StoredDeck> {
    const cards = normalizeEntries(input.cards);
    const now = this.now().toISOString();
    return this.repository.saveDeck({
      id: randomUUID(),
      userId,
      name: input.name.trim(),
      active: false,
      validationErrors: await this.validate(cards),
      cards,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(userId: string, id: string, input: DeckInput): Promise<StoredDeck> {
    const existing = await this.requireOwned(userId, id);
    const cards = normalizeEntries(input.cards);
    return this.repository.saveDeck({
      ...existing,
      name: input.name.trim(),
      active: false,
      validationErrors: await this.validate(cards),
      cards,
      updatedAt: this.now().toISOString(),
    });
  }

  async list(userId: string): Promise<StoredDeck[]> {
    return this.repository.listDecksByUser(userId);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.requireOwned(userId, id);
    await this.repository.deleteDeck(id);
  }

  async activate(userId: string, id: string): Promise<StoredDeck> {
    return this.repository.withTransaction(async (transaction) => {
      const current = await transaction.findDeckById(id);
      if (!current || current.userId !== userId) throw new Error('DECK_NOT_FOUND');
      const validationErrors = await this.validate(current.cards, transaction);
      if (validationErrors.length > 0) throw new DeckValidationError(validationErrors);
      const now = this.now().toISOString();
      for (const deck of await transaction.listDecksByUser(userId)) {
        if (deck.id !== id && deck.active) await transaction.saveDeck({ ...deck, active: false, updatedAt: now });
      }
      return transaction.saveDeck({ ...current, active: true, validationErrors: [], updatedAt: now });
    });
  }

  private async requireOwned(userId: string, id: string): Promise<StoredDeck> {
    const deck = await this.repository.findDeckById(id);
    if (!deck || deck.userId !== userId) throw new Error('DECK_NOT_FOUND');
    return deck;
  }

  private async validate(entries: DeckCardEntry[], repository: AppRepository = this.repository): Promise<string[]> {
    const errors: string[] = [];
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);
    if (total !== 50) errors.push('牌组必须恰好包含50张卡牌');
    const signalCounts = { red: 0, blue: 0, yellow: 0 };
    for (const entry of entries) {
      if (!Number.isInteger(entry.count) || entry.count < 1) {
        errors.push(`卡牌数量必须是正整数：${entry.cardId}`);
        continue;
      }
      if (entry.count > 4) errors.push(`同编号卡牌最多4张：${entry.cardId}`);
      const card = await repository.findCardById(entry.cardId);
      if (!card) {
        errors.push(`未知卡牌：${entry.cardId}`);
        continue;
      }
      if (card.status !== 'published') errors.push(`卡牌尚未发布：${entry.cardId}`);
      if (card.signal) signalCounts[card.signal] += entry.count;
    }
    if (signalCounts.red !== 4) errors.push('红色信号球必须恰好4张');
    if (signalCounts.blue !== 4) errors.push('蓝色信号球必须恰好4张');
    if (signalCounts.yellow !== 4) errors.push('黄色信号球必须恰好4张');
    return errors;
  }
}
