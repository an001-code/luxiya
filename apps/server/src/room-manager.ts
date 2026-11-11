import { randomBytes, randomUUID } from 'node:crypto';
import { cardDefinitions, developmentDeck } from '@pgr/cards';
import { advanceProcessing, applyCommand, createGame, createPlayerView, type Rng } from '@pgr/game-core';
import type { CardDefinition, DeckDefinition, GameCommand, GameState, RoomCredentials, RoomSnapshot } from '@pgr/protocol';

export interface MatchSeatConfig {
  playerId: string;
  deck: DeckDefinition;
  definitions: CardDefinition[];
}

interface Seat {
  playerId: string;
  token: string;
  ready: boolean;
  connected: boolean;
  deck: DeckDefinition;
  definitions: CardDefinition[];
  disconnectedAt?: number;
}

interface Room {
  code: string;
  seats: Seat[];
  game?: GameState;
}

interface RoomManagerOptions {
  codeGenerator?: () => string;
  tokenGenerator?: () => string;
  now?: () => number;
  rng?: Rng;
}

export const createSeededRng = (seedText: string): Rng => {
  let seed = 0x811c9dc5;
  for (const character of seedText) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 0x01000193);
  }
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (): string => Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join('');

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly codeGenerator: () => string;
  private readonly tokenGenerator: () => string;
  private readonly now: () => number;
  private readonly rng: Rng;

  constructor(options: RoomManagerOptions = {}) {
    this.codeGenerator = options.codeGenerator ?? randomCode;
    this.tokenGenerator = options.tokenGenerator ?? randomUUID;
    this.now = options.now ?? Date.now;
    this.rng = options.rng ?? Math.random;
  }

  createRoom(config?: MatchSeatConfig): RoomCredentials {
    let code = this.codeGenerator().toUpperCase();
    for (let attempt = 0; this.rooms.has(code) && attempt < 10; attempt += 1) code = this.codeGenerator().toUpperCase();
    if (this.rooms.has(code)) throw new Error('ROOM_CODE_EXHAUSTED');
    const credentials = { code, playerId: config?.playerId ?? `p-${randomUUID()}`, token: this.tokenGenerator() };
    this.rooms.set(code, { code, seats: [{
      ...credentials,
      ready: false,
      connected: true,
      deck: structuredClone(config?.deck ?? developmentDeck),
      definitions: structuredClone(config?.definitions ?? cardDefinitions),
    }] });
    return credentials;
  }

  joinRoom(codeInput: string, config?: MatchSeatConfig): RoomCredentials {
    const code = codeInput.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.seats.length >= 2) throw new Error('ROOM_FULL');
    const credentials = { code, playerId: config?.playerId ?? `p-${randomUUID()}`, token: this.tokenGenerator() };
    if (room.seats.some((seat) => seat.playerId === credentials.playerId)) throw new Error('PLAYER_ALREADY_SEATED');
    room.seats.push({
      ...credentials,
      ready: false,
      connected: true,
      deck: structuredClone(config?.deck ?? developmentDeck),
      definitions: structuredClone(config?.definitions ?? cardDefinitions),
    });
    return credentials;
  }

  resume(credentials: RoomCredentials): RoomCredentials {
    const room = this.requireRoom(credentials.code);
    const seat = this.requireSeat(credentials);
    seat.connected = true;
    delete seat.disconnectedAt;
    if (room.game?.status === 'paused' && room.seats.every((item) => item.connected)) room.game.status = 'playing';
    return credentials;
  }

  setReady(credentials: RoomCredentials, ready: boolean): void {
    const room = this.requireRoom(credentials.code);
    const seat = this.requireSeat(credentials);
    seat.ready = ready;
    if (!room.game && room.seats.length === 2 && room.seats.every((item) => item.ready)) {
      const definitions = [...new Map(room.seats.flatMap((item) => item.definitions).map((definition) => [definition.id, definition])).values()];
      room.game = createGame(
        [room.seats[0]!.playerId, room.seats[1]!.playerId],
        [room.seats[0]!.deck, room.seats[1]!.deck],
        definitions,
        this.rng,
      );
      room.game.processingMode = 'deferred';
    }
  }

  applyCommand(credentials: RoomCredentials, command: GameCommand): ReturnType<typeof applyCommand> {
    const room = this.requireRoom(credentials.code);
    this.requireSeat(credentials);
    if (!room.game) throw new Error('GAME_NOT_STARTED');
    if (command.playerId !== credentials.playerId) throw new Error('PLAYER_MISMATCH');
    const result = applyCommand(room.game, command, this.rng);
    if (result.accepted) room.game = result.state;
    return result;
  }

  concede(credentials: RoomCredentials): ReturnType<typeof applyCommand> {
    const room = this.requireRoom(credentials.code);
    if (!room.game) throw new Error('GAME_NOT_STARTED');
    return this.applyCommand(credentials, {
      type: 'CONCEDE', commandId: randomUUID(), playerId: credentials.playerId, expectedVersion: room.game.version,
    });
  }

  advanceProcessing(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room?.game?.pendingProcessing || room.game.status !== 'playing') return false;
    room.game = advanceProcessing(room.game, this.rng);
    return true;
  }

  advanceAutomaticPhases(code: string): void {
    const room = this.rooms.get(code);
    if (!room?.game) return;
    for (let steps = 0; steps < 2; steps++) {
      const state = room.game;
      if (state.status !== 'playing' || state.pendingDraw || state.pendingProcessing || state.pendingDecision || (state.phase !== 'upright' && state.phase !== 'draw')) return;
      const result = applyCommand(state, { type: 'ADVANCE_PHASE', playerId: state.activePlayerId, commandId: randomUUID(), expectedVersion: state.version }, this.rng);
      if (!result.accepted) return;
      room.game = result.state;
    }
  }

  markDisconnected(credentials: RoomCredentials): void {
    const seat = this.requireSeat(credentials);
    seat.connected = false;
    seat.disconnectedAt = this.now();
    const room = this.requireRoom(credentials.code);
    if (room.game && room.game.status === 'playing') room.game.status = 'paused';
  }

  expireDisconnectedRooms(): void {
    const deadline = this.now() - 10 * 60_000;
    for (const [code, room] of this.rooms) {
      if (room.seats.some((seat) => !seat.connected && (seat.disconnectedAt ?? Infinity) <= deadline)) this.rooms.delete(code);
    }
  }

  getSnapshot(credentials: RoomCredentials): RoomSnapshot {
    const room = this.requireRoom(credentials.code);
    this.requireSeat(credentials);
    const connectedSeats = room.seats.filter((seat) => seat.connected).length;
    const status = room.game
      ? room.game.status
      : 'waiting';
    return {
      code: room.code,
      status: status === 'playing' && connectedSeats < room.seats.length ? 'paused' : status,
      seats: room.seats.map(({ playerId, connected, ready }) => ({ playerId, connected, ready })),
      viewerId: credentials.playerId,
      ...(room.game ? { game: createPlayerView(room.game, credentials.playerId) } : {}),
    };
  }

  private requireRoom(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('ROOM_NOT_FOUND');
    return room;
  }

  private requireSeat(credentials: RoomCredentials): Seat {
    const room = this.requireRoom(credentials.code);
    const seat = room.seats.find((item) => item.playerId === credentials.playerId && item.token === credentials.token);
    if (!seat) throw new Error('INVALID_CREDENTIALS');
    return seat;
  }
}

