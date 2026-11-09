import { describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';
import { createMemoryRepository } from '../persistence/memory-repository.js';
import { bootstrapAdmin } from '../bootstrap-admin.js';
import { AuthService } from './service.js';

const cookieValue = (header: string | string[] | undefined): string => {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Missing Set-Cookie header');
  return value.split(';')[0]!;
};

describe('authentication HTTP API', () => {
  it('registers a player, stores only a password hash, and restores the session', async () => {
    const repository = createMemoryRepository();
    const server = buildServer({ repository });
    const registered = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'Lucia_21', password: 'TestPass!21' },
    });

    expect(registered.statusCode).toBe(201);
    expect(registered.json()).toMatchObject({ user: { username: 'Lucia_21', role: 'player' } });
    const stored = await repository.findUserByUsernameKey('lucia_21');
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(stored?.passwordHash).not.toContain('TestPass!21');

    const current = await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieValue(registered.headers['set-cookie']) } });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ user: { id: stored?.id, username: 'Lucia_21', role: 'player' } });
    await server.close();
  });

  it('rejects usernames that differ only by case', async () => {
    const server = buildServer({ repository: createMemoryRepository() });
    await server.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'Commandant', password: 'TestPass!21' } });
    const duplicate = await server.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'COMMANDANT', password: 'OtherPass!21' } });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'USERNAME_TAKEN' });
    await server.close();
  });

  it('logs in case-insensitively and invalidates the session on logout', async () => {
    const server = buildServer({ repository: createMemoryRepository() });
    await server.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'Liv', password: 'TestPass!21' } });
    const loggedIn = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'LIV', password: 'TestPass!21' } });
    const cookie = cookieValue(loggedIn.headers['set-cookie']);

    expect(loggedIn.statusCode).toBe(200);
    const loggedOut = await server.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(loggedOut.statusCode).toBe(204);
    expect(String(loggedOut.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
    await server.close();
  });

  it('treats expired sessions as logged out and clears their cookie', async () => {
    let now = new Date('2026-11-09T00:00:00.000Z');
    const server = buildServer({ repository: createMemoryRepository(), now: () => now });
    const registered = await server.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'Expired', password: 'TestPass!21' } });
    const cookie = cookieValue(registered.headers['set-cookie']);
    now = new Date('2027-01-01T00:00:00.000Z');

    const current = await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(current.statusCode).toBe(401);
    expect(String(current.headers['set-cookie'])).toContain('Max-Age=0');
    await server.close();
  });
});

describe('administrator bootstrap and authorization', () => {
  it('creates Anonce as an admin without storing the plaintext password', async () => {
    const repository = createMemoryRepository();
    const admin = await bootstrapAdmin(repository, { username: 'Anonce', password: 'BootstrapPass!21' });

    expect(admin).toMatchObject({ username: 'Anonce', role: 'admin' });
    const stored = await repository.findUserByUsernameKey('anonce');
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(stored?.passwordHash).not.toContain('BootstrapPass!21');
  });

  it('allows only administrators through the admin guard', async () => {
    const repository = createMemoryRepository();
    const service = new AuthService(repository);
    const playerSession = await service.register('player_one', 'TestPass!21');
    const admin = await bootstrapAdmin(repository, { username: 'Anonce', password: 'BootstrapPass!21' });
    const adminSession = await service.login(admin.username, 'BootstrapPass!21');

    await expect(service.authenticate(playerSession.token, 'admin')).rejects.toThrow('FORBIDDEN');
    await expect(service.authenticate(adminSession.token, 'admin')).resolves.toMatchObject({ role: 'admin' });
  });
});
