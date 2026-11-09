import { describe, expect, test } from 'vitest';
import { developmentDeck } from '@pgr/cards';
import {
  applyCommand,
  createGame,
  createPlayerView,
  sequenceRng,
  validateDeck,
} from './index.js';

describe('deck construction', () => {
  test('accepts the 50-card development deck with four signals of each colour', () => {
    expect(validateDeck(developmentDeck)).toEqual({ valid: true, errors: [] });
  });

  test('rejects decks that are not exactly 50 cards', () => {
    expect(validateDeck({ ...developmentDeck, cards: developmentDeck.cards.slice(1) }).valid).toBe(false);
  });
});

describe('deterministic game state', () => {
  test('creates the same shuffled opening state for the same random sequence', () => {
    const first = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.2, 0.8, 0.4]));
    const second = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.2, 0.8, 0.4]));
    expect(first).toEqual(second);
    expect(first.players.p1!.hand).toHaveLength(4);
    expect(first.players.p1!.energy).toHaveLength(2);
  });

  test('does not expose opponent hand identities or facedown energy', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    state.players.p2!.energy.push({ instanceId: 'secret', cardId: 'BP01-007', face: 'down', rested: false });
    const view = createPlayerView(state, 'p1');
    expect(view.opponent.hand).toEqual({ count: 4 });
    expect(view.opponent.energy.at(-1)).toMatchObject({ instanceId: 'secret', cardId: null, face: 'down' });
  });
});

describe('commands', () => {
  test('rejects a command with a stale expected version without changing state', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const result = applyCommand(state, {
      type: 'END_PHASE', commandId: 'stale', playerId: state.activePlayerId, expectedVersion: 99,
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(false);
    expect(result.state).toBe(state);
    expect(result.rejection?.code).toBe('STALE_VERSION');
  });

  test('advances from draw through energy fill into main and gives the active player legal actions', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    state.phase = 'draw';
    const result = applyCommand(state, {
      type: 'ADVANCE_PHASE', commandId: 'advance', playerId: state.activePlayerId, expectedVersion: state.version,
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(true);
    expect(result.state.phase).toBe('energy');
    const main = applyCommand(result.state, {
      type: 'SET_ENERGY', commandId: 'skip-energy', playerId: state.activePlayerId, expectedVersion: result.state.version,
    }, sequenceRng([0.1]));
    expect(main.state.phase).toBe('main');
    expect(main.legalActions.some((action) => action.type === 'END_PHASE')).toBe(true);
  });

  test('concedes immediately and awards the opponent', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const loser = state.activePlayerId;
    const result = applyCommand(state, {
      type: 'CONCEDE', commandId: 'give-up', playerId: loser, expectedVersion: state.version,
    }, sequenceRng([0.1]));
    expect(result.state.status).toBe('finished');
    expect(result.state.winnerId).not.toBe(loser);
  });

  test('plays a zero-cost signal into the ordered signal zone and draws a replacement', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const player = state.players[state.activePlayerId]!;
    state.phase = 'main';
    const signal = { instanceId: 'signal', cardId: 'BP01-079', face: 'up' as const, rested: false };
    player.hand = [signal];
    const result = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'signal-play', playerId: player.id, expectedVersion: state.version, instanceId: signal.instanceId,
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(true);
    expect(result.state.players[player.id]!.signals.map((card) => card.cardId)).toEqual(['BP01-079']);
    expect(result.state.players[player.id]!.hand).toHaveLength(1);
  });

  test('rejects a paid card when no face-up energy matches its attribute', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const player = state.players[state.activePlayerId]!;
    state.phase = 'main';
    player.hand = [{ instanceId: 'physical', cardId: 'ST01-006', face: 'up', rested: false }];
    player.energy = Array.from({ length: 7 }, (_, index) => ({ instanceId: `ice-${index}`, cardId: 'BP01-007', face: 'up' as const, rested: false }));
    const result = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'wrong-attribute', playerId: player.id, expectedVersion: state.version, instanceId: 'physical', fieldSlot: 0,
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe('ILLEGAL_ACTION');
  });

  test('resolves an unblocked attack after both players pass and creates facedown damage energy', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const attackerId = state.activePlayerId;
    const defenderId = state.playerOrder.find((id) => id !== attackerId)!;
    state.phase = 'main';
    state.players[attackerId]!.field[0] = { instanceId: 'attacker', cardId: 'BP03-075', face: 'up', rested: false, enteredTurn: 0 };
    const declared = applyCommand(state, {
      type: 'DECLARE_ATTACK', commandId: 'attack', playerId: attackerId, expectedVersion: state.version, attackerSlot: 0, target: 'player',
    }, sequenceRng([0.1]));
    const firstPass = applyCommand(declared.state, {
      type: 'PASS_RESPONSE', commandId: 'pass-1', playerId: defenderId, expectedVersion: declared.state.version,
    }, sequenceRng([0.1]));
    const secondPass = applyCommand(firstPass.state, {
      type: 'PASS_RESPONSE', commandId: 'pass-2', playerId: attackerId, expectedVersion: firstPass.state.version,
    }, sequenceRng([0.1]));
    expect(secondPass.state.pendingAttack).toBeNull();
    expect(secondPass.state.players[defenderId]!.corruption).toBe(1);
    expect(secondPass.state.players[defenderId]!.energy.at(-1)?.face).toBe('down');
  });

  test('cleans dark energy and discards down to seven cards at end of turn', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const player = state.players[state.activePlayerId]!;
    state.phase = 'main';
    player.hand = Array.from({ length: 9 }, (_, index) => ({ instanceId: `hand-${index}`, cardId: 'ST01-006', face: 'up' as const, rested: false }));
    player.energy.push({ instanceId: 'dark-cost', cardId: 'ST01-005', face: 'down', rested: false });
    const result = applyCommand(state, {
      type: 'END_PHASE', commandId: 'end', playerId: player.id, expectedVersion: state.version,
    }, sequenceRng([0.1]));
    expect(result.state.players[player.id]!.hand).toHaveLength(7);
    expect(result.state.players[player.id]!.energy.every((card) => card.face === 'up')).toBe(true);
    expect(result.state.players[player.id]!.graveyard).toHaveLength(3);
  });

  test('eliminates exactly three adjacent signals and draws one card', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const player = state.players[state.activePlayerId]!;
    state.phase = 'main';
    player.signals = ['red', 'blue', 'yellow', 'red'].map((color, index) => ({
      instanceId: `signal-${index}`,
      cardId: color === 'red' ? 'BP01-079' : color === 'blue' ? 'BP01-081' : 'BP01-084',
      face: 'up' as const,
      rested: false,
    }));
    const handBefore = player.hand.length;
    const result = applyCommand(state, {
      type: 'ELIMINATE_SIGNALS', commandId: 'three-orbs', playerId: player.id, expectedVersion: state.version, startIndex: 1,
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(true);
    expect(result.state.players[player.id]!.signals.map((card) => card.instanceId)).toEqual(['signal-0']);
    expect(result.state.players[player.id]!.hand).toHaveLength(handBefore + 1);
  });

  test('equips an equipment card beneath a character and pays its cost', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const player = state.players[state.activePlayerId]!;
    state.phase = 'main';
    player.field[0] = { instanceId: 'host', cardId: 'ST01-006', face: 'up', rested: false, enteredTurn: 0 };
    player.hand = [{ instanceId: 'weapon', cardId: 'BP01-023', face: 'up', rested: false }];
    player.energy = Array.from({ length: 3 }, (_, index) => ({ instanceId: `physical-${index}`, cardId: 'ST01-005', face: 'up' as const, rested: false }));
    const result = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'equip', playerId: player.id, expectedVersion: state.version, instanceId: 'weapon', targetSlot: 0,
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(true);
    expect(result.state.players[player.id]!.field[0]?.attached?.[0]?.cardId).toBe('BP01-023');
    expect(result.state.players[player.id]!.energy.every((card) => card.rested)).toBe(true);
  });

  test('rejects equipping a second item to an already equipped character', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const player = state.players[state.activePlayerId]!;
    state.phase = 'main';
    player.field[0] = {
      instanceId: 'host', cardId: 'ST01-006', face: 'up', rested: false, enteredTurn: 0,
      attached: [{ instanceId: 'first-weapon', cardId: 'BP01-023', face: 'up', rested: false }],
    };
    player.hand = [{ instanceId: 'second-weapon', cardId: 'BP01-023', face: 'up', rested: false }];
    player.energy = Array.from({ length: 3 }, (_, index) => ({ instanceId: `physical-${index}`, cardId: 'ST01-005', face: 'up' as const, rested: false }));
    const result = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'double-equip', playerId: player.id, expectedVersion: state.version, instanceId: 'second-weapon', targetSlot: 0,
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(false);
    expect(result.state).toBe(state);
  });

  test('only grants weapon haste when the required sealed blade is attached', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const player = state.players[state.activePlayerId]!;
    state.phase = 'main';
    player.field[0] = { instanceId: 'alpha', cardId: 'PR-016', face: 'up', rested: false, enteredTurn: state.turn };
    expect(createPlayerView(state, player.id).legalActions.some((action) => action.type === 'DECLARE_ATTACK')).toBe(false);
    player.field[0]!.attached = [{ instanceId: 'blade', cardId: 'BP01-023', face: 'up', rested: false }];
    expect(createPlayerView(state, player.id).legalActions.some((action) => action.type === 'DECLARE_ATTACK')).toBe(true);
  });

  test('applies the default red charge choice before combat damage', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
    const attackerId = state.activePlayerId;
    const defenderId = state.playerOrder.find((id) => id !== attackerId)!;
    state.phase = 'main';
    state.players[attackerId]!.field[0] = { instanceId: 'charger', cardId: 'ST01-006', face: 'up', rested: false, enteredTurn: 0 };
    state.players[attackerId]!.deck.unshift({ instanceId: 'red-charge', cardId: 'BP01-079', face: 'down', rested: false });
    const declared = applyCommand(state, { type: 'DECLARE_ATTACK', commandId: 'red-attack', playerId: attackerId, expectedVersion: state.version, attackerSlot: 0, target: 'player' }, sequenceRng([0.1]));
    const pass1 = applyCommand(declared.state, { type: 'PASS_RESPONSE', commandId: 'red-pass-1', playerId: defenderId, expectedVersion: declared.state.version }, sequenceRng([0.1]));
    const pass2 = applyCommand(pass1.state, { type: 'PASS_RESPONSE', commandId: 'red-pass-2', playerId: attackerId, expectedVersion: pass1.state.version }, sequenceRng([0.1]));
    expect(pass2.state.players[defenderId]!.corruption).toBe(3);
  });
});
