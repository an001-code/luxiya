import { pathToFileURL } from 'node:url';
import { cardDefinitions } from '@pgr/cards';
import { connectMySqlRepository, mysqlConfigFromEnv } from './persistence/mysql-repository.js';
import { CURRENT_EFFECT_SCHEMA_VERSION, type AppRepository } from './persistence/types.js';
import { loadProjectEnv } from './env.js';

export const seedBuiltInCards = async (
  repository: AppRepository,
  now: () => Date = () => new Date(),
): Promise<{ inserted: number; synchronized: number }> => {
  let inserted = 0;
  let synchronized = 0;
  for (const definition of cardDefinitions) {
    const existing = await repository.findCardById(definition.id);
    if (existing) {
      if (existing.effectSchemaVersion < CURRENT_EFFECT_SCHEMA_VERSION) {
        await repository.saveCard({
          ...existing,
          effectIds: [...definition.effectIds],
          structuredEffects: definition.structuredEffects ?? [],
          effectSchemaVersion: CURRENT_EFFECT_SCHEMA_VERSION,
        });
        synchronized += 1;
      }
      continue;
    }
    const timestamp = now().toISOString();
    await repository.saveCard({
      ...definition,
      structuredEffects: definition.structuredEffects ?? [],
      status: 'draft',
      version: 1,
      effectSchemaVersion: CURRENT_EFFECT_SCHEMA_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    inserted += 1;
  }
  return { inserted, synchronized };
};

const run = async (): Promise<void> => {
  loadProjectEnv();
  const repository = await connectMySqlRepository(mysqlConfigFromEnv());
  try {
    const result = await seedBuiltInCards(repository);
    console.log(`Built-in cards inserted: ${result.inserted}; effect definitions synchronized: ${result.synchronized}`);
  } finally {
    await repository.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
