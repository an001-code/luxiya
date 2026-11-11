import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthGuard } from '../auth/routes.js';
import { rejectAuthError } from '../auth/routes.js';
import { CardValidationError } from './service.js';
import type { CardService } from './service.js';
import { cardInputSchema } from './schema.js';

const rejectCardError = (reply: FastifyReply, error: unknown): FastifyReply => {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  if (message === 'CARD_NOT_FOUND') return reply.code(404).send({ error: message });
  if (message === 'CARD_EXISTS') return reply.code(409).send({ error: message });
  if (message === 'CARD_IN_USE') return reply.code(409).send({ error: message, details: ['这张卡牌仍被牌组使用，请先从相关牌组中移除后再删除。'] });
  if (error instanceof CardValidationError) return reply.code(422).send({ error: error.message, details: error.details });
  return reply.code(400).send({ error: message });
};

export const registerCardRoutes = (app: FastifyInstance, service: CardService, auth: AuthGuard): void => {
  app.delete<{ Params: { id: string } }>('/api/admin/cards/:id', async (request, reply) => {
    try { await auth.requireUser(request, 'admin'); }
    catch (error) { return rejectAuthError(reply, error); }
    try { await service.delete(request.params.id); return reply.code(204).send(); }
    catch (error) { return rejectCardError(reply, error); }
  });

  app.get('/api/cards', async () => ({ cards: await service.listPublished() }));

  app.get('/api/admin/cards', async (request, reply) => {
    try {
      await auth.requireUser(request, 'admin');
      return { cards: await service.listAll() };
    } catch (error) {
      return rejectAuthError(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>('/api/cards/:id/image', async (request, reply) => {
    const image = await service.findImage(request.params.id);
    if (!image) return reply.code(404).send({ error: 'CARD_IMAGE_NOT_FOUND' });
    return reply.type(image.mime).send(Buffer.from(image.bytes));
  });

  app.get<{ Params: { id: string } }>('/api/admin/cards/:id/image', async (request, reply) => {
    try {
      await auth.requireUser(request, 'admin');
    } catch (error) {
      return rejectAuthError(reply, error);
    }
    const image = await service.findAdminImage(request.params.id);
    if (!image) return reply.code(404).send({ error: 'CARD_IMAGE_NOT_FOUND' });
    return reply.type(image.mime).send(Buffer.from(image.bytes));
  });

  app.post('/api/admin/cards', async (request, reply) => {
    try {
      await auth.requireUser(request, 'admin');
    } catch (error) {
      return rejectAuthError(reply, error);
    }
    const parsed = cardInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_CARD_INPUT', details: parsed.error.issues });
    try {
      return reply.code(201).send({ card: await service.createDraft(parsed.data) });
    } catch (error) {
      return rejectCardError(reply, error);
    }
  });

  app.put<{ Params: { id: string } }>('/api/admin/cards/:id', async (request, reply) => {
    try {
      await auth.requireUser(request, 'admin');
    } catch (error) {
      return rejectAuthError(reply, error);
    }
    const parsed = cardInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_CARD_INPUT', details: parsed.error.issues });
    try {
      return { card: await service.updateDraft(request.params.id, parsed.data) };
    } catch (error) {
      return rejectCardError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>('/api/admin/cards/:id/publish', async (request, reply) => {
    try {
      await auth.requireUser(request, 'admin');
      return { card: await service.publish(request.params.id) };
    } catch (error) {
      if (error instanceof CardValidationError || (error instanceof Error && error.message.startsWith('CARD_'))) return rejectCardError(reply, error);
      return rejectAuthError(reply, error);
    }
  });
};
