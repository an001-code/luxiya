import { createPool, type Pool, type PoolConnection, type PoolOptions, type RowDataPacket } from 'mysql2/promise';
import { migrateDatabase } from './migrations.js';
import type { StructuredEffect } from '@pgr/protocol';
import type {
  AppRepository,
  CardListFilter,
  CardStatus,
  DeckCardEntry,
  SessionRecord,
  StoredCard,
  StoredDeck,
  UserRecord,
  UserRole,
} from './types.js';

type DatabaseConnection = Pool | PoolConnection;

interface UserRow extends RowDataPacket {
  id: string;
  username: string;
  username_key: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

interface SessionRow extends RowDataPacket {
  token_hash: string;
  user_id: string;
  expires_at: string;
}

interface CardRow extends RowDataPacket {
  id: string;
  name: string;
  type: StoredCard['type'];
  subtype: StoredCard['subtype'] | null;
  cost: number;
  attribute_name: StoredCard['attribute'];
  traits: string | string[];
  pp: number | null;
  dp: number | null;
  signal_color: StoredCard['signal'] | null;
  rules_text: string | string[];
  effect_ids: string | string[];
  structured_effects: string | StructuredEffect[];
  art_path: string | null;
  rarity: string | null;
  status: CardStatus;
  version: number;
  image_mime: StoredCard['imageMime'] | null;
  image_data: Buffer | null;
  created_at: string;
  updated_at: string;
}

interface DeckRow extends RowDataPacket {
  id: string;
  user_id: string;
  name: string;
  active: number | boolean;
  validation_errors: string | string[];
  created_at: string;
  updated_at: string;
}

interface DeckCardRow extends RowDataPacket {
  deck_id: string;
  card_id: string;
  quantity: number;
}

const normalizeUsername = (value: string): string => value.trim().toLocaleLowerCase('en-US');
const parseJson = <T>(value: string | T): T => typeof value === 'string' ? JSON.parse(value) as T : value;

const toUser = (row: UserRow): UserRecord => ({
  id: row.id,
  username: row.username,
  usernameKey: row.username_key,
  passwordHash: row.password_hash,
  role: row.role,
  createdAt: row.created_at,
});

const toCard = (row: CardRow): StoredCard => ({
  id: row.id,
  name: row.name,
  type: row.type,
  ...(row.subtype ? { subtype: row.subtype } : {}),
  cost: row.cost,
  attribute: row.attribute_name,
  traits: parseJson<string[]>(row.traits),
  ...(row.pp === null ? {} : { pp: row.pp }),
  ...(row.dp === null ? {} : { dp: row.dp }),
  ...(row.signal_color ? { signal: row.signal_color } : {}),
  text: parseJson<string[]>(row.rules_text),
  effectIds: parseJson<string[]>(row.effect_ids),
  structuredEffects: parseJson<StructuredEffect[]>(row.structured_effects),
  ...(row.art_path ? { artPath: row.art_path } : {}),
  ...(row.rarity ? { rarity: row.rarity } : {}),
  status: row.status,
  version: row.version,
  ...(row.image_mime ? { imageMime: row.image_mime } : {}),
  ...(row.image_data ? { imageData: new Uint8Array(row.image_data) } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const isDuplicate = (error: unknown): boolean => (
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY'
);

class MySqlRepository implements AppRepository {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly pool: Pool,
    private readonly transactional = false,
  ) {}

  async createUser(user: UserRecord): Promise<UserRecord> {
    try {
      await this.database.execute(
        'INSERT INTO users (id, username, username_key, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [user.id, user.username, normalizeUsername(user.usernameKey), user.passwordHash, user.role, user.createdAt],
      );
      return { ...user, usernameKey: normalizeUsername(user.usernameKey) };
    } catch (error) {
      if (isDuplicate(error)) throw new Error('USERNAME_TAKEN');
      throw error;
    }
  }

  async saveUser(user: UserRecord): Promise<UserRecord> {
    try {
      await this.database.execute(
        `INSERT INTO users (id, username, username_key, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE username = VALUES(username), username_key = VALUES(username_key), password_hash = VALUES(password_hash), role = VALUES(role)`,
        [user.id, user.username, normalizeUsername(user.usernameKey), user.passwordHash, user.role, user.createdAt],
      );
      return { ...user, usernameKey: normalizeUsername(user.usernameKey) };
    } catch (error) {
      if (isDuplicate(error)) throw new Error('USERNAME_TAKEN');
      throw error;
    }
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const [rows] = await this.database.execute<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findUserByUsernameKey(value: string): Promise<UserRecord | null> {
    const [rows] = await this.database.execute<UserRow[]>('SELECT * FROM users WHERE username_key = ? LIMIT 1', [normalizeUsername(value)]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await this.database.execute(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), expires_at = VALUES(expires_at)`,
      [session.tokenHash, session.userId, session.expiresAt],
    );
  }

  async findSession(tokenHash: string): Promise<SessionRecord | null> {
    const [rows] = await this.database.execute<SessionRow[]>('SELECT * FROM sessions WHERE token_hash = ? LIMIT 1', [tokenHash]);
    const row = rows[0];
    return row ? { tokenHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
  }

  async saveCard(card: StoredCard): Promise<StoredCard> {
    await this.database.execute(
      `INSERT INTO cards (
        id, name, type, subtype, cost, attribute_name, traits, pp, dp, signal_color, rules_text, effect_ids,
        structured_effects, art_path, rarity, status, version, image_mime, image_data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), subtype = VALUES(subtype), cost = VALUES(cost),
        attribute_name = VALUES(attribute_name), traits = VALUES(traits), pp = VALUES(pp), dp = VALUES(dp),
        signal_color = VALUES(signal_color), rules_text = VALUES(rules_text), effect_ids = VALUES(effect_ids),
        structured_effects = VALUES(structured_effects), art_path = VALUES(art_path), rarity = VALUES(rarity),
        status = VALUES(status), version = VALUES(version), image_mime = VALUES(image_mime), image_data = VALUES(image_data),
        updated_at = VALUES(updated_at)`,
      [
        card.id, card.name, card.type, card.subtype ?? null, card.cost, card.attribute, JSON.stringify(card.traits),
        card.pp ?? null, card.dp ?? null, card.signal ?? null, JSON.stringify(card.text), JSON.stringify(card.effectIds),
        JSON.stringify(card.structuredEffects ?? []), card.artPath ?? null, card.rarity ?? null, card.status, card.version,
        card.imageMime ?? null, card.imageData ? Buffer.from(card.imageData) : null, card.createdAt, card.updatedAt,
      ],
    );
    return structuredClone(card);
  }

  async findCardById(id: string): Promise<StoredCard | null> {
    const [rows] = await this.database.execute<CardRow[]>('SELECT * FROM cards WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? toCard(rows[0]) : null;
  }

  async listCards(filter: CardListFilter = {}): Promise<StoredCard[]> {
    const [rows] = filter.status
      ? await this.database.execute<CardRow[]>('SELECT * FROM cards WHERE status = ? ORDER BY id', [filter.status])
      : await this.database.execute<CardRow[]>('SELECT * FROM cards ORDER BY id');
    return rows.map(toCard);
  }

  async saveDeck(deck: StoredDeck): Promise<StoredDeck> {
    if (!this.transactional) return this.withTransaction((transaction) => transaction.saveDeck(deck));
    await this.database.execute(
      `INSERT INTO decks (id, user_id, name, active, validation_errors, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), active = VALUES(active), validation_errors = VALUES(validation_errors), updated_at = VALUES(updated_at)`,
      [deck.id, deck.userId, deck.name, deck.active, JSON.stringify(deck.validationErrors), deck.createdAt, deck.updatedAt],
    );
    await this.database.execute('DELETE FROM deck_cards WHERE deck_id = ?', [deck.id]);
    for (const entry of deck.cards) {
      await this.database.execute('INSERT INTO deck_cards (deck_id, card_id, quantity) VALUES (?, ?, ?)', [deck.id, entry.cardId, entry.count]);
    }
    return structuredClone(deck);
  }

  async findDeckById(id: string): Promise<StoredDeck | null> {
    const [rows] = await this.database.execute<DeckRow[]>('SELECT * FROM decks WHERE id = ? LIMIT 1', [id]);
    if (!rows[0]) return null;
    return this.hydrateDeck(rows[0]);
  }

  async listDecksByUser(userId: string): Promise<StoredDeck[]> {
    const [rows] = await this.database.execute<DeckRow[]>('SELECT * FROM decks WHERE user_id = ? ORDER BY created_at', [userId]);
    return Promise.all(rows.map((row) => this.hydrateDeck(row)));
  }

  async deleteDeck(id: string): Promise<void> {
    await this.database.execute('DELETE FROM decks WHERE id = ?', [id]);
  }

  async withTransaction<T>(work: (repository: AppRepository) => Promise<T>): Promise<T> {
    if (this.transactional) return work(this);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(new MySqlRepository(connection, this.pool, true));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    if (!this.transactional) await this.pool.end();
  }

  private async hydrateDeck(row: DeckRow): Promise<StoredDeck> {
    const [cardRows] = await this.database.execute<DeckCardRow[]>('SELECT * FROM deck_cards WHERE deck_id = ? ORDER BY card_id', [row.id]);
    const cards: DeckCardEntry[] = cardRows.map((entry) => ({ cardId: entry.card_id, count: entry.quantity }));
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      active: Boolean(row.active),
      validationErrors: parseJson<string[]>(row.validation_errors),
      cards,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export interface MySqlRepositoryConfig extends PoolOptions {
  database: string;
}

export const createMySqlRepository = (config: MySqlRepositoryConfig): AppRepository => {
  const pool = createPool({ ...config, dateStrings: true, connectionLimit: config.connectionLimit ?? 10 });
  return new MySqlRepository(pool, pool);
};

export const connectMySqlRepository = async (config: MySqlRepositoryConfig): Promise<AppRepository> => {
  if (!/^[A-Za-z0-9_]+$/.test(config.database)) throw new Error('INVALID_DATABASE_NAME');
  const { database, ...serverConfig } = config;
  const bootstrapPool = createPool({ ...serverConfig, connectionLimit: 1 });
  try {
    await bootstrapPool.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally {
    await bootstrapPool.end();
  }
  const pool = createPool({ ...config, dateStrings: true, connectionLimit: config.connectionLimit ?? 10 });
  try {
    await migrateDatabase(pool);
    return new MySqlRepository(pool, pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
};

export const mysqlConfigFromEnv = (): MySqlRepositoryConfig => ({
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'pgr_card_battle',
});
