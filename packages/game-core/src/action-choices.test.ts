import { describe, expect, it } from 'vitest';
import { developmentDeck } from '@pgr/cards';
import { applyCommand, createGame, createPlayerView, getLegalActions, sequenceRng } from './index.js';
const rng = () => sequenceRng([0.1]);
const card = (instanceId: string, cardId = 'DEV-001') => ({ instanceId, cardId, face: 'up' as const, rested: false });

describe('explicit play choices and automatic draw confirmation', () => {
  it('only offers characters as attackers, character targets and blockers', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, rng()); state.phase = 'main'; state.turn = 3;
    const player = state.players[state.activePlayerId]!;
    const other = state.players[state.playerOrder.find((id) => id !== player.id)!]!;
    player.field = [card('attacker'), card('support', 'DEV-008'), null, null, null];
    other.field = [{ ...card('rested-character'), rested: true }, { ...card('rested-support', 'DEV-008'), rested: true }, card('blocker'), card('support-blocker', 'DEV-008'), null];
    const attacks = getLegalActions(state, player.id).filter((action) => action.type === 'DECLARE_ATTACK');
    expect(attacks).toEqual([{ type: 'DECLARE_ATTACK', attackerSlot: 0, target: 'player' }, { type: 'DECLARE_ATTACK', attackerSlot: 0, target: 'character', targetSlot: 0 }]);
    state.pendingAttack = { attackerSlot: 0, target: 'player', stage: 'response', priorityPlayerId: other.id, consecutivePasses: 0 };
    expect(getLegalActions(state, other.id).filter((action) => action.type === 'BLOCK')).toEqual([{ type: 'BLOCK', blockerSlot: 2 }]);
    const invalid = applyCommand(state, { type: 'BLOCK', blockerSlot: 3, commandId: 'invalid-support', playerId: other.id, expectedVersion: 0 }, rng());
    expect(invalid.accepted).toBe(false);
    expect(invalid.state).toBe(state);
  });

  it('offers and executes an affordable evolution without offering an unaffordable normal play', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, rng()); state.phase = 'main';
    const player = state.players[state.activePlayerId]!;
    player.hand = [card('evolve', 'ST01-001')];
    player.field[3] = card('base', 'ST01-005');
    player.energy = [card('fee1'), card('fee2')];
    const actions = getLegalActions(state, player.id).filter((action) => action.type === 'PLAY_CARD');
    expect(actions).toEqual([{ type: 'PLAY_CARD', instanceId: 'evolve', evolutionTargetSlot: 3, paymentCost: 2 }]);
    const result = applyCommand(state, { ...actions[0]!, type: 'PLAY_CARD', instanceId: 'evolve', paymentIds: ['fee1', 'fee2'], commandId: 'evolve', playerId: player.id, expectedVersion: 0 }, rng());
    expect(result.accepted).toBe(true);
    expect(result.state.players[player.id]!.field[3]).toMatchObject({ instanceId: 'evolve', evolved: true, underneath: [expect.objectContaining({ instanceId: 'base' })] });
  });
  it('enumerates only empty field slots for a normal character', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, rng()); state.phase = 'main';
    const player = state.players[state.activePlayerId]!;
    player.hand = [card('new')]; player.field[1] = card('occupied');
    player.energy = [card('fee')];
    const actions = getLegalActions(state, player.id).filter((action) => action.type === 'PLAY_CARD');
    expect(actions.map((action) => action.fieldSlot)).toEqual([0, 2, 3, 4]);
  });
  it('holds an online draw at a private confirmation and cannot draw it twice', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, rng()); state.processingMode = 'deferred'; state.phase = 'draw';
    const id = state.activePlayerId; const count = state.players[id]!.hand.length;
    const drawn = applyCommand(state, { type: 'ADVANCE_PHASE', playerId: id, expectedVersion: 0, commandId: 'draw' }, rng());
    expect(drawn.state.phase).toBe('draw');
    expect(drawn.state.players[id]!.hand).toHaveLength(count + 1);
    expect(getLegalActions(drawn.state, id)).toEqual([{ type: 'CONFIRM_DRAW' }]);
    expect(createPlayerView(drawn.state, id).drawConfirmation?.cards).toHaveLength(1);
    const other = state.playerOrder.find((playerId) => playerId !== id)!;
    expect(createPlayerView(drawn.state, other).drawConfirmation).toBeUndefined();
    expect(applyCommand(drawn.state, { type: 'ADVANCE_PHASE', playerId: id, expectedVersion: drawn.state.version, commandId: 'again' }, rng()).accepted).toBe(false);
    const confirmed = applyCommand(drawn.state, { type: 'CONFIRM_DRAW', playerId: id, expectedVersion: drawn.state.version, commandId: 'confirm' }, rng());
    expect(confirmed.state.phase).toBe('energy');
    expect(confirmed.state.players[id]!.hand).toHaveLength(count + 1);
  });
});
