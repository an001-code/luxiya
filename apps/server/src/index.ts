import { buildServer } from './server.js';

const server = buildServer();
await server.listen({ port: 3001, host: '0.0.0.0' });
console.log('Card battle server listening on http://localhost:3001');
