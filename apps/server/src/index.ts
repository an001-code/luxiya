import { buildServer } from './server.js';
import { connectMySqlRepository, mysqlConfigFromEnv } from './persistence/mysql-repository.js';
import { loadProjectEnv } from './env.js';

loadProjectEnv();
const repository = await connectMySqlRepository(mysqlConfigFromEnv());
const server = buildServer({ repository });
await server.listen({ port: 3001, host: '0.0.0.0' });
console.log('Card battle server listening on http://localhost:3001');
