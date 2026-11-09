import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthGuard } from '../auth/routes.js';
import { rejectAuthError } from '../auth/routes.js';
import { DeckValidationError } from './service.js';
import type { DeckService } from './service.js';

const deckInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  cards: z.array(z.object({
    cardId: z.string().trim().min(1).max(48),
    count: z.number().int().min(1).max(50),
  })).max(50),
});

const rejectDeckError = (reply: FastifyReply, error: unknown): FastifyReply => {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  if (message === 'DECK_NOT_FOUND') return reply.code(404).send({ error: message });
  if (error instanceof DeckValidationError) return reply.code(422).send({ error: error.message, details: error.details });
  return reply.code(400).send({ error: message });
};

export const registerDeckRoutes = (app: FastifyInstance, service: DeckService, auth: AuthGuard): void => {
  const currentUser = async (request: FastifyRequest, reply: FastifyReply) => {
    try { return await auth.requireUser(request); }
    catch (error) { rejectAuthError(reply, error); return null; }
  };

  app.get('/api/decks', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    return { decks: await service.list(user.id) };
  });

  app.post('/api/decks', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    const parsed = deckInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_DECK_INPUT', details: parsed.error.issues });
    return reply.code(201).send({ deck: await service.create(user.id, parsed.data) });
  });

  app.put<{ Params: { id: string } }>('/api/decks/:id', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    const parsed = deckInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_DECK_INPUT', details: parsed.error.issues });
    try { return { deck: await service.update(user.id, request.params.id, parsed.data) }; }
    catch (error) { return rejectDeckError(reply, error); }
  });

  app.delete<{ Params: { id: string } }>('/api/decks/:id', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    try { await service.delete(user.id, request.params.id); return reply.code(204).send(); }
    catch (error) { return rejectDeckError(reply, error); }
  });

  app.post<{ Params: { id: string } }>('/api/decks/:id/activate', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    try { return { deck: await service.activate(user.id, request.params.id) }; }
    catch (error) { return rejectDeckError(reply, error); }
  });
};
