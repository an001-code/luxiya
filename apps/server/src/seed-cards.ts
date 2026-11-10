import { pathToFileURL } from 'node:url';
import { cardDefinitions } from '@pgr/cards';
import { connectMySqlRepository, mysqlConfigFromEnv } from './persistence/mysql-repository.js';
import type { AppRepository } from './persistence/types.js';
import { loadProjectEnv } from './env.js';

export const seedBuiltInCards = async (
  repository: AppRepository,
  now: () => Date = () => new Date(),
): Promise<number> => {
  let inserted = 0;
  for (const definition of cardDefinitions) {
    const existing = await repository.findCardById(definition.id);
    if (existing) {
      if (existing.status === 'draft' && existing.version === 1 && !existing.imageData) {
        await repository.saveCard({
          ...existing,
          ...definition,
          structuredEffects: definition.structuredEffects ?? [],
          updatedAt: now().toISOString(),
        });
      }
      continue;
    }
    const timestamp = now().toISOString();
    await repository.saveCard({
      ...definition,
      structuredEffects: definition.structuredEffects ?? [],
      status: 'draft',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    inserted += 1;
  }
  return inserted;
};

const run = async (): Promise<void> => {
  loadProjectEnv();
  const repository = await connectMySqlRepository(mysqlConfigFromEnv());
  try {
    const count = await seedBuiltInCards(repository);
    console.log(`Built-in card drafts inserted: ${count}`);
  } finally {
    await repository.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
