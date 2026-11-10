import type { Pool, PoolConnection } from 'mysql2/promise';

type MigrationExecutor = Pick<Pool | PoolConnection, 'query'>;

export const migrationStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    username VARCHAR(24) NOT NULL,
    username_key VARCHAR(24) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('player', 'admin') NOT NULL DEFAULT 'player',
    created_at VARCHAR(30) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    expires_at VARCHAR(30) NOT NULL,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS cards (
    id VARCHAR(48) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('character', 'tactic', 'item') NOT NULL,
    subtype VARCHAR(24) NULL,
    cost INT UNSIGNED NOT NULL,
    attribute_name VARCHAR(24) NOT NULL,
    traits JSON NOT NULL,
    pp INT NULL,
    dp INT NULL,
    signal_color VARCHAR(12) NULL,
    rules_text JSON NOT NULL,
    effect_ids JSON NOT NULL,
    structured_effects JSON NOT NULL,
    art_path VARCHAR(255) NULL,
    rarity VARCHAR(24) NULL,
    status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    version INT UNSIGNED NOT NULL DEFAULT 1,
    effect_schema_version INT UNSIGNED NOT NULL DEFAULT 0,
    image_mime VARCHAR(32) NULL,
    image_data LONGBLOB NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `ALTER TABLE cards ADD COLUMN effect_schema_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER version`,
  `CREATE TABLE IF NOT EXISTS decks (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(80) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    validation_errors JSON NOT NULL,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    CONSTRAINT fk_decks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_decks_user (user_id),
    INDEX idx_decks_active (user_id, active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id CHAR(36) NOT NULL,
    card_id VARCHAR(48) NOT NULL,
    quantity TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (deck_id, card_id),
    CONSTRAINT fk_deck_cards_deck FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
    CONSTRAINT fk_deck_cards_card FOREIGN KEY (card_id) REFERENCES cards(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
] as const;

export const migrateDatabase = async (executor: MigrationExecutor): Promise<void> => {
  for (const statement of migrationStatements) {
    try {
      await executor.query(statement);
    } catch (error) {
      const duplicateColumn = typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_FIELDNAME';
      if (!duplicateColumn) throw error;
    }
  }
};
