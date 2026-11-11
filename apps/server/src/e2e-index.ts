import { buildServer } from './server.js';
import { loadProjectEnv } from './env.js';
import { connectMySqlRepository, mysqlConfigFromEnv } from './persistence/mysql-repository.js';
import { createSeededRng, RoomManager } from './room-manager.js';

loadProjectEnv();
const repository = await connectMySqlRepository(mysqlConfigFromEnv());
const manager = new RoomManager({ rng: createSeededRng('card-effects-e2e-8') });
const server = buildServer({ repository, manager });
await server.listen({ port: 3011, host: '127.0.0.1' });
console.log('Card battle E2E server listening on http://127.0.0.1:3011');
