import type { CardDefinition, StructuredEffect } from '@pgr/protocol';

export type UserRole = 'player' | 'admin';
export type CardStatus = 'draft' | 'published';
export const CURRENT_EFFECT_SCHEMA_VERSION = 1;

export interface UserRecord {
  id: string;
  username: string;
  usernameKey: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface StoredCard extends CardDefinition {
  status: CardStatus;
  version: number;
  effectSchemaVersion: number;
  rarity?: string;
  structuredEffects?: StructuredEffect[];
  imageMime?: 'image/jpeg' | 'image/png' | 'image/webp';
  imageData?: Uint8Array;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCardEntry {
  cardId: string;
  count: number;
}

export interface StoredDeck {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  validationErrors: string[];
  cards: DeckCardEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CardListFilter {
  status?: CardStatus;
}

export interface AppRepository {
  createUser(user: UserRecord): Promise<UserRecord>;
  saveUser(user: UserRecord): Promise<UserRecord>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByUsernameKey(usernameKey: string): Promise<UserRecord | null>;
  saveSession(session: SessionRecord): Promise<void>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  saveCard(card: StoredCard): Promise<StoredCard>;
  findCardById(id: string): Promise<StoredCard | null>;
  listCards(filter?: CardListFilter): Promise<StoredCard[]>;
  saveDeck(deck: StoredDeck): Promise<StoredDeck>;
  findDeckById(id: string): Promise<StoredDeck | null>;
  listDecksByUser(userId: string): Promise<StoredDeck[]>;
  deleteDeck(id: string): Promise<void>;
  withTransaction<T>(work: (repository: AppRepository) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
