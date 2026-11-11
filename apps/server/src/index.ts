import { buildServer } from './server.js';
import { createSeededRng, RoomManager } from './room-manager.js';
import { connectMySqlRepository, mysqlConfigFromEnv } from './persistence/mysql-repository.js';
import { loadProjectEnv } from './env.js';

loadProjectEnv();
const repository = await connectMySqlRepository(mysqlConfigFromEnv());
const manager = process.env.GAME_RNG_SEED ? new RoomManager({ rng: createSeededRng(process.env.GAME_RNG_SEED) }) : undefined;
const server = buildServer({ repository, ...(manager ? { manager } : {}) });
const port = Number(process.env.PORT ?? 3001);
await server.listen({ port, host: '0.0.0.0' });
console.log(`Card battle server listening on http://localhost:${port}`);
