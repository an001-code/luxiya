import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { UserRole } from '../persistence/types.js';
import type { AuthService, PublicUser } from './service.js';

const cookieName = 'pgr_session';
const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_]+$/),
  password: z.string().min(8).max(128),
});

const readCookie = (request: FastifyRequest): string | null => {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === cookieName) return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return null;
};

const sessionCookie = (token: string, secure: boolean): string => [
  `${cookieName}=${encodeURIComponent(token)}`,
  'Path=/',
  'HttpOnly',
  'SameSite=Lax',
  `Max-Age=${30 * 24 * 60 * 60}`,
  ...(secure ? ['Secure'] : []),
].join('; ');

const clearCookie = (secure: boolean): string => [
  `${cookieName}=`,
  'Path=/',
  'HttpOnly',
  'SameSite=Lax',
  'Max-Age=0',
  ...(secure ? ['Secure'] : []),
].join('; ');

const statusForAuthError = (error: unknown): number => {
  const message = error instanceof Error ? error.message : '';
  if (message === 'USERNAME_TAKEN') return 409;
  if (message === 'FORBIDDEN') return 403;
  if (message === 'INVALID_CREDENTIALS' || message === 'UNAUTHENTICATED') return 401;
  return 400;
};

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'UNKNOWN';

export interface AuthGuard {
  requireUser(request: FastifyRequest, role?: UserRole): Promise<PublicUser>;
}

export const registerAuthRoutes = (
  app: FastifyInstance,
  service: AuthService,
  options: { secureCookie?: boolean } = {},
): AuthGuard => {
  const secure = options.secureCookie ?? false;
  const requireUser = async (request: FastifyRequest, role?: UserRole): Promise<PublicUser> => {
    const token = readCookie(request);
    if (!token) throw new Error('UNAUTHENTICATED');
    return service.authenticate(token, role);
  };

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_AUTH_INPUT', details: parsed.error.issues });
    try {
      const session = await service.register(parsed.data.username, parsed.data.password);
      return reply.header('Set-Cookie', sessionCookie(session.token, secure)).code(201).send({ user: session.user });
    } catch (error) {
      return reply.code(statusForAuthError(error)).send({ error: errorMessage(error) });
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_AUTH_INPUT', details: parsed.error.issues });
    try {
      const session = await service.login(parsed.data.username, parsed.data.password);
      return reply.header('Set-Cookie', sessionCookie(session.token, secure)).send({ user: session.user });
    } catch (error) {
      return reply.code(statusForAuthError(error)).send({ error: errorMessage(error) });
    }
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = readCookie(request);
    if (token) await service.logout(token);
    return reply.header('Set-Cookie', clearCookie(secure)).code(204).send();
  });

  app.get('/api/auth/me', async (request, reply) => {
    try {
      return { user: await requireUser(request) };
    } catch (error) {
      return reply.header('Set-Cookie', clearCookie(secure)).code(statusForAuthError(error)).send({ error: errorMessage(error) });
    }
  });

  return { requireUser };
};

export const rejectAuthError = (reply: FastifyReply, error: unknown): FastifyReply => (
  reply.code(statusForAuthError(error)).send({ error: errorMessage(error) })
);
