import type {
  AppRepository,
  CardListFilter,
  SessionRecord,
  StoredCard,
  StoredDeck,
  UserRecord,
} from './types.js';

interface MemoryState {
  users: Map<string, UserRecord>;
  usernameKeys: Map<string, string>;
  sessions: Map<string, SessionRecord>;
  cards: Map<string, StoredCard>;
  decks: Map<string, StoredDeck>;
}

const emptyState = (): MemoryState => ({
  users: new Map(),
  usernameKeys: new Map(),
  sessions: new Map(),
  cards: new Map(),
  decks: new Map(),
});

const copy = <T>(value: T): T => structuredClone(value);
const usernameKey = (value: string): string => value.trim().toLocaleLowerCase('en-US');

class MemoryRepository implements AppRepository {
  constructor(private state: MemoryState = emptyState()) {}

  async createUser(user: UserRecord): Promise<UserRecord> {
    const key = usernameKey(user.usernameKey);
    if (this.state.usernameKeys.has(key)) throw new Error('USERNAME_TAKEN');
    const saved = copy({ ...user, usernameKey: key });
    this.state.users.set(saved.id, saved);
    this.state.usernameKeys.set(key, saved.id);
    return copy(saved);
  }

  async saveUser(user: UserRecord): Promise<UserRecord> {
    const existing = this.state.users.get(user.id);
    const key = usernameKey(user.usernameKey);
    const owner = this.state.usernameKeys.get(key);
    if (owner && owner !== user.id) throw new Error('USERNAME_TAKEN');
    if (existing) this.state.usernameKeys.delete(existing.usernameKey);
    const saved = copy({ ...user, usernameKey: key });
    this.state.users.set(saved.id, saved);
    this.state.usernameKeys.set(key, saved.id);
    return copy(saved);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.state.users.get(id);
    return user ? copy(user) : null;
  }

  async findUserByUsernameKey(value: string): Promise<UserRecord | null> {
    const id = this.state.usernameKeys.get(usernameKey(value));
    if (!id) return null;
    const user = this.state.users.get(id);
    return user ? copy(user) : null;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    this.state.sessions.set(session.tokenHash, copy(session));
  }

  async findSession(tokenHash: string): Promise<SessionRecord | null> {
    const session = this.state.sessions.get(tokenHash);
    return session ? copy(session) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.state.sessions.delete(tokenHash);
  }

  async saveCard(card: StoredCard): Promise<StoredCard> {
    const saved = copy(card);
    this.state.cards.set(card.id, saved);
    return copy(saved);
  }

  async findCardById(id: string): Promise<StoredCard | null> {
    const card = this.state.cards.get(id);
    return card ? copy(card) : null;
  }

  async deleteCard(id: string): Promise<void> {
    if ([...this.state.decks.values()].some((deck) => deck.cards.some((entry) => entry.cardId === id))) throw new Error('CARD_IN_USE');
    this.state.cards.delete(id);
  }

  async listCards(filter: CardListFilter = {}): Promise<StoredCard[]> {
    return [...this.state.cards.values()]
      .filter((card) => !filter.status || card.status === filter.status)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(copy);
  }

  async saveDeck(deck: StoredDeck): Promise<StoredDeck> {
    const saved = copy(deck);
    this.state.decks.set(deck.id, saved);
    return copy(saved);
  }

  async findDeckById(id: string): Promise<StoredDeck | null> {
    const deck = this.state.decks.get(id);
    return deck ? copy(deck) : null;
  }

  async listDecksByUser(userId: string): Promise<StoredDeck[]> {
    return [...this.state.decks.values()]
      .filter((deck) => deck.userId === userId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(copy);
  }

  async deleteDeck(id: string): Promise<void> {
    this.state.decks.delete(id);
  }

  async withTransaction<T>(work: (repository: AppRepository) => Promise<T>): Promise<T> {
    const original = this.state;
    const pending = copy(this.state);
    this.state = pending;
    try {
      return await work(this);
    } catch (error) {
      this.state = original;
      throw error;
    }
  }

  async close(): Promise<void> {}
}

export const createMemoryRepository = (): AppRepository => new MemoryRepository();
