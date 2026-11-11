import { describe, expect, test } from 'vitest';
import { createSeededRng, RoomManager } from './room-manager.js';
import { cardDefinitions, developmentDeck } from '@pgr/cards';

describe('RoomManager', () => {
  test('creates a repeatable random sequence from an explicit seed', () => {
    const first = createSeededRng('e2e-card-effects');
    const second = createSeededRng('e2e-card-effects');
    expect(Array.from({ length: 100 }, () => first())).toEqual(Array.from({ length: 100 }, () => second()));
  });
  test('creates a six-character room and lets exactly one opponent join', () => {
    const manager = new RoomManager({ codeGenerator: () => 'ABC123', tokenGenerator: () => 'token' });
    const host = manager.createRoom();
    const guest = manager.joinRoom(host.code);
    expect(host.code).toBe('ABC123');
    expect(guest.playerId).not.toBe(host.playerId);
    expect(() => manager.joinRoom(host.code)).toThrow('ROOM_FULL');
  });

  test('starts a game after both seats are ready and filters snapshots per player', () => {
    let token = 0;
    const manager = new RoomManager({ codeGenerator: () => 'READY1', tokenGenerator: () => `token-${token += 1}` });
    const host = manager.createRoom();
    const guest = manager.joinRoom(host.code);
    manager.setReady(host, true);
    manager.setReady(guest, true);
    const hostView = manager.getSnapshot(host);
    const guestView = manager.getSnapshot(guest);
    expect(hostView.status).toBe('playing');
    expect(hostView.game?.self.id).toBe(host.playerId);
    expect(guestView.game?.self.id).toBe(guest.playerId);
    expect(hostView.game?.opponent.hand).toEqual({ count: 4 });
  });

  test('resumes a seat with the original token and expires disconnected rooms after ten minutes', () => {
    let now = 1_000;
    const manager = new RoomManager({ codeGenerator: () => 'RESUME', tokenGenerator: () => 'secret', now: () => now });
    const credentials = manager.createRoom();
    manager.markDisconnected(credentials);
    expect(manager.resume(credentials).playerId).toBe(credentials.playerId);
    manager.markDisconnected(credentials);
    now += 10 * 60_000 + 1;
    manager.expireDisconnectedRooms();
    expect(() => manager.resume(credentials)).toThrow('ROOM_NOT_FOUND');
  });

  test('starts a match with each seats selected deck and snapshots custom definitions', () => {
    let token = 0;
    const manager = new RoomManager({ codeGenerator: () => 'CUSTOM', tokenGenerator: () => `token-${token += 1}` });
    const customDefinition = { ...cardDefinitions.find((card) => card.id === 'DEV-008')!, id: 'CUSTOM-008', name: '玩家二辅助机' };
    const guestDeck = {
      ...developmentDeck,
      id: 'guest-custom',
      cards: developmentDeck.cards.map((id, index) => id === 'DEV-008' && index === developmentDeck.cards.lastIndexOf('DEV-008') ? 'CUSTOM-008' : id),
    };
    const host = manager.createRoom({ playerId: 'user-host', deck: developmentDeck, definitions: cardDefinitions });
    const guest = manager.joinRoom(host.code, { playerId: 'user-guest', deck: guestDeck, definitions: [...cardDefinitions, customDefinition] });

    manager.setReady(host, true);
    manager.setReady(guest, true);
    const game = manager.getSnapshot(host).game!;
    expect(game.self.id).toBe('user-host');
    expect(manager.rooms.get(host.code)?.game?.cardDefinitions['CUSTOM-008']?.name).toBe('玩家二辅助机');
    expect(Object.values(manager.rooms.get(host.code)!.game!.players['user-guest']!).flatMap((value) => Array.isArray(value) ? value : []).some((card) => card?.cardId === 'CUSTOM-008')).toBe(true);
  });
});
