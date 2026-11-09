import cors from '@fastify/cors';
import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';
import type { CardDefinition, ClientToServerEvents, DeckDefinition, RoomCredentials, ServerToClientEvents } from '@pgr/protocol';
import { registerAuthRoutes } from './auth/routes.js';
import { AuthService } from './auth/service.js';
import { registerCardRoutes } from './cards/routes.js';
import { CardService } from './cards/service.js';
import { registerDeckRoutes } from './decks/routes.js';
import { DeckService } from './decks/service.js';
import { createMemoryRepository } from './persistence/memory-repository.js';
import type { AppRepository } from './persistence/types.js';
import { RoomManager, type MatchSeatConfig } from './room-manager.js';

const statusForError = (error: unknown): number => {
  const message = error instanceof Error ? error.message : '';
  if (message === 'ROOM_NOT_FOUND') return 404;
  if (message === 'ROOM_FULL' || message === 'PLAYER_ALREADY_SEATED') return 409;
  if (message === 'ACTIVE_DECK_REQUIRED' || message === 'ACTIVE_DECK_INVALID') return 422;
  if (message === 'UNAUTHENTICATED') return 401;
  return 400;
};

interface BuildServerOptions {
  manager?: RoomManager;
  repository?: AppRepository;
  now?: () => Date;
}

export const buildServer = (options: BuildServerOptions = {}) => {
  const manager = options.manager ?? new RoomManager();
  const repository = options.repository ?? createMemoryRepository();
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  void app.register(cors, { origin: true, credentials: true });

  const authService = new AuthService(repository, { ...(options.now ? { now: options.now } : {}) });
  const authGuard = registerAuthRoutes(app, authService, { secureCookie: process.env.NODE_ENV === 'production' });
  registerCardRoutes(app, new CardService(repository), authGuard);
  registerDeckRoutes(app, new DeckService(repository), authGuard);

  const matchConfig = async (userId: string): Promise<MatchSeatConfig> => {
    const active = (await repository.listDecksByUser(userId)).find((deck) => deck.active);
    if (!active) throw new Error('ACTIVE_DECK_REQUIRED');
    if (active.validationErrors.length > 0) throw new Error('ACTIVE_DECK_INVALID');
    const definitions = new Map<string, CardDefinition>();
    const cards: string[] = [];
    for (const entry of active.cards) {
      const card = await repository.findCardById(entry.cardId);
      if (!card || card.status !== 'published') throw new Error('ACTIVE_DECK_INVALID');
      definitions.set(card.id, card);
      cards.push(...Array.from({ length: entry.count }, () => entry.cardId));
    }
    const deck: DeckDefinition = { id: active.id, name: active.name, developmentOnly: false, cards };
    return { playerId: userId, deck, definitions: [...definitions.values()] };
  };

  const authenticatedMatchConfig = async (request: Parameters<typeof authGuard.requireUser>[0]): Promise<MatchSeatConfig> => {
    const user = await authGuard.requireUser(request);
    return matchConfig(user.id);
  };

  app.get('/api/health', async () => ({ ok: true }));
  app.post('/api/rooms', async (request, reply) => {
    try { return reply.code(201).send(manager.createRoom(await authenticatedMatchConfig(request))); }
    catch (error) { return reply.code(statusForError(error)).send({ error: error instanceof Error ? error.message : 'UNKNOWN' }); }
  });
  app.post<{ Params: { code: string } }>('/api/rooms/:code/join', async (request, reply) => {
    try { return manager.joinRoom(request.params.code, await authenticatedMatchConfig(request)); }
    catch (error) { return reply.code(statusForError(error)).send({ error: error instanceof Error ? error.message : 'UNKNOWN' }); }
  });

  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: { origin: 'http://localhost:5173' },
  });

  const emitRoom = (code: string): void => {
    const room = manager.rooms.get(code);
    if (!room) return;
    for (const socket of io.sockets.sockets.values()) {
      const credentials = socket.data.credentials as RoomCredentials | undefined;
      if (credentials?.code === code) {
        const snapshot = manager.getSnapshot(credentials);
        socket.emit('room:snapshot', snapshot);
        if (snapshot.game) socket.emit('game:snapshot', snapshot.game);
      }
    }
  };

  io.on('connection', (socket) => {
    socket.on('room:resume', (credentials) => {
      try {
        manager.resume(credentials);
        socket.data.credentials = credentials;
        void socket.join(credentials.code);
        emitRoom(credentials.code);
        socket.to(credentials.code).emit('opponent:connection', true);
      } catch { socket.disconnect(true); }
    });
    socket.on('room:ready', (ready) => {
      const credentials = socket.data.credentials as RoomCredentials | undefined;
      if (!credentials) return;
      manager.setReady(credentials, ready);
      emitRoom(credentials.code);
    });
    socket.on('game:command', (command) => {
      const credentials = socket.data.credentials as RoomCredentials | undefined;
      if (!credentials) return;
      const result = manager.applyCommand(credentials, command);
      if (!result.accepted && result.rejection) socket.emit('command:rejected', result.rejection);
      else {
        io.to(credentials.code).emit('game:events', result.emittedEvents);
        emitRoom(credentials.code);
      }
    });
    socket.on('game:concede', () => {
      const credentials = socket.data.credentials as RoomCredentials | undefined;
      if (!credentials) return;
      manager.concede(credentials);
      emitRoom(credentials.code);
    });
    socket.on('disconnect', () => {
      const credentials = socket.data.credentials as RoomCredentials | undefined;
      if (!credentials) return;
      manager.markDisconnected(credentials);
      socket.to(credentials.code).emit('opponent:connection', false);
      emitRoom(credentials.code);
    });
  });

  const expirationTimer = setInterval(() => manager.expireDisconnectedRooms(), 30_000);
  expirationTimer.unref();
  app.addHook('onClose', async () => { clearInterval(expirationTimer); io.close(); await repository.close(); });
  return app;
};

