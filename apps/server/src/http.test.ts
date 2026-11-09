import { afterEach, describe, expect, test } from 'vitest';
import { buildServer } from './server.js';

describe('HTTP API', () => {
  const servers: Array<ReturnType<typeof buildServer>> = [];
  afterEach(async () => Promise.all(servers.splice(0).map((server) => server.close())));

  test('reports health and creates then joins a room', async () => {
    const server = buildServer();
    servers.push(server);
    expect((await server.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ ok: true });
    const created = (await server.inject({ method: 'POST', url: '/api/rooms' })).json();
    expect(created.code).toMatch(/^[A-Z0-9]{6}$/);
    const joined = await server.inject({ method: 'POST', url: `/api/rooms/${created.code}/join` });
    expect(joined.statusCode).toBe(200);
    expect(joined.json().playerId).not.toBe(created.playerId);
  });
});
