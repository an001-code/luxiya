import { describe, expect, test } from 'vitest';
import { RoomManager } from './room-manager.js';

describe('RoomManager', () => {
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
});
