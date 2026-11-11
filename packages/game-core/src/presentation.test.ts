import { describe, expect, it } from 'vitest';
import { developmentDeck } from '@pgr/cards';
import { advanceProcessing, applyCommand, createGame, createPlayerView, sequenceRng } from './index.js';

const rng = () => sequenceRng([0.1]);
describe('online presentation checkpoints', () => {
  it('keeps a charged signal public until its charge choice has resolved', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, rng());
    state.processingMode = 'deferred'; state.phase = 'main';
    const player = state.players[state.activePlayerId]!;
    player.field[0] = { instanceId: 'charge-attacker', cardId: 'DEV-002', face: 'up', rested: true };
    player.deck.unshift({ instanceId: 'charged-red', cardId: 'BP01-080', face: 'down', rested: false });
    state.pendingAttack = { attackerSlot: 0, target: 'player', priorityPlayerId: player.id, consecutivePasses: 1, stage: 'response' };
    const started = applyCommand(state, { type: 'PASS_RESPONSE', commandId: 'charge-start', playerId: player.id, expectedVersion: 0 }, rng());
    const choice = advanceProcessing(started.state, rng());
    expect(choice.pendingDecision?.kind).toBe('choose-option');
    expect(choice.players[player.id]!.processing[0]?.instanceId).toBe('charged-red');
    expect(choice.players[player.id]!.signals).toHaveLength(0);
    const resolved = applyCommand(choice, { type: 'RESOLVE_EFFECT_DECISION', commandId: 'charge-choice', playerId: player.id, expectedVersion: choice.version, decisionId: choice.pendingDecision!.id, optionId: choice.pendingDecision!.options.at(-1)!.id, selectedInstanceIds: [] }, rng());
    expect(resolved.accepted).toBe(true);
    expect(resolved.state.players[player.id]!.signals[0]?.instanceId).toBe('charged-red');
    expect(resolved.state.players[player.id]!.processing).toHaveLength(0);
  });

  it('retains a tactic through its decision, pauses checkpoints on disconnection, and then sends it to the graveyard', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, rng());
    state.processingMode = 'deferred'; state.phase = 'main';
    const attackerId = state.activePlayerId;
    const defenderId = state.playerOrder.find((id) => id !== attackerId)!;
    const defender = state.players[defenderId]!;
    state.pendingAttack = { attackerSlot: 0, target: 'player', priorityPlayerId: defenderId, consecutivePasses: 0, stage: 'response' };
    defender.field[0] = { instanceId: 'boost-me', cardId: 'ST01-005', face: 'up', rested: false };
    defender.hand = [{ instanceId: 'instant', cardId: 'BP01-007', face: 'up', rested: false }, { instanceId: 'extra', cardId: 'DEV-001', face: 'up', rested: false }];
    const played = applyCommand(state, { type: 'PLAY_CARD', instanceId: 'instant', paymentIds: [], commandId: 'instant-play', playerId: defenderId, expectedVersion: 0 }, rng());
    expect(played.accepted).toBe(true);
    const paused = { ...played.state, status: 'paused' as const };
    expect(advanceProcessing(paused, rng())).toBe(paused);
    const waiting = advanceProcessing(played.state, rng());
    expect(waiting.pendingDecision?.targetId).toBe('extra-discard');
    expect(waiting.players[defenderId]!.processing[0]?.instanceId).toBe('instant');
    expect(waiting.players[defenderId]!.graveyard).toHaveLength(0);
    const resolved = applyCommand(waiting, { type: 'RESOLVE_EFFECT_DECISION', decisionId: waiting.pendingDecision!.id, selectedInstanceIds: ['extra'], playerId: defenderId, commandId: 'discard-extra', expectedVersion: waiting.version }, rng());
    expect(resolved.state.players[defenderId]!.processing).toHaveLength(0);
    expect(resolved.state.players[defenderId]!.graveyard.map((card) => card.instanceId)).toEqual(['extra', 'instant']);
    expect(createPlayerView(resolved.state, defenderId).self.field[0]?.effectivePp).toBe(5500);
  });

  it('accepts simultaneous independent mulligans from the same version and waits for both', () => {
    const initial = createGame(['p1', 'p2'], developmentDeck, rng());
    const first = applyCommand(initial, { type: 'MULLIGAN', instanceIds: [], commandId: 'a', playerId: 'p1', expectedVersion: 0 }, rng());
    expect(first.state.phase).toBe('mulligan');
    const second = applyCommand(first.state, { type: 'MULLIGAN', instanceIds: [], commandId: 'b', playerId: 'p2', expectedVersion: 0 }, rng());
    expect(second.accepted).toBe(true);
    expect(second.state.phase).toBe('upright');
    expect(createPlayerView(first.state, 'p1').opening).toEqual({ selfDone: true, opponentDone: false });
    expect(applyCommand(first.state, { type: 'MULLIGAN', instanceIds: [], commandId: 'a', playerId: 'p1', expectedVersion: 0 }, rng()).accepted).toBe(false);
  });

  it('keeps a played tactic publicly in processing before its effect runs', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, rng());
    state.processingMode = 'deferred'; state.phase = 'main';
    const playerId = state.activePlayerId;
    state.players[playerId]!.hand = [{ instanceId: 'played-signal', cardId: 'BP01-079', face: 'up', rested: false }];
    const result = applyCommand(state, { type: 'PLAY_CARD', instanceId: 'played-signal', paymentIds: [], commandId: 'play', playerId, expectedVersion: state.version }, rng());
    expect(result.accepted).toBe(true);
    expect(result.state.players[playerId]!.processing[0]?.cardId).toBe('BP01-079');
    expect(result.state.players[playerId]!.signals).toHaveLength(0);
    expect(result.state.players[playerId]!.hand).toHaveLength(0);
    const other = state.playerOrder.find((id) => id !== playerId)!;
    expect(createPlayerView(result.state, other).opponent.processing[0]?.cardId).toBe('BP01-079');
    expect(createPlayerView(result.state, playerId).legalActions).toEqual([]);
    expect(applyCommand(result.state, { type: 'END_PHASE', commandId: 'invalid', playerId, expectedVersion: result.state.version }, rng()).accepted).toBe(false);
    const resolved = advanceProcessing(result.state, rng());
    expect(resolved.players[playerId]!.processing).toHaveLength(0);
    expect(resolved.players[playerId]!.signals[0]?.instanceId).toBe('played-signal');
    expect(resolved.players[playerId]!.hand).toHaveLength(1);
    expect(resolved.version).toBe(result.state.version + 1);
  });

  it('reveals attack and damage charges before moving to hand and hidden energy', () => {
    const state = createGame(['p1', 'p2'], developmentDeck, rng());
    state.processingMode = 'deferred'; state.phase = 'main'; state.turn = 3;
    const attacker = state.players[state.activePlayerId]!;
    const defenderId = state.playerOrder.find((id) => id !== attacker.id)!;
    const defender = state.players[defenderId]!;
    attacker.field[0] = { instanceId: 'attacker', cardId: 'DEV-002', face: 'up', rested: false };
    attacker.deck.unshift({ instanceId: 'attack-flip', cardId: 'DEV-002', face: 'down', rested: false });
    defender.deck.unshift({ instanceId: 'damage-flip', cardId: 'DEV-003', face: 'down', rested: false });
    const attack = applyCommand(state, { type: 'DECLARE_ATTACK', attackerSlot: 0, target: 'player', playerId: attacker.id, commandId: 'attack', expectedVersion: 0 }, rng());
    const pass = applyCommand(attack.state, { type: 'PASS_RESPONSE', playerId: defenderId, commandId: 'pass1', expectedVersion: 1 }, rng());
    const flip = applyCommand(pass.state, { type: 'PASS_RESPONSE', playerId: attacker.id, commandId: 'pass2', expectedVersion: 2 }, rng());
    expect(flip.state.pendingProcessing?.kind).toBe('attack-charge');
    expect(createPlayerView(flip.state, defenderId).opponent.processing[0]?.cardId).toBe('DEV-002');
    const damage = advanceProcessing(flip.state, rng());
    expect(damage.players[attacker.id]!.hand.some((card) => card.instanceId === 'attack-flip')).toBe(true);
    expect(damage.pendingProcessing?.kind).toBe('damage-charge');
    expect(createPlayerView(damage, attacker.id).opponent.processing[0]?.cardId).toBe('DEV-003');
    const completed = advanceProcessing(damage, rng());
    expect(completed.players[defenderId]!.corruption).toBe(1);
    expect(completed.pendingAttack).toBeNull();
    expect(createPlayerView(completed, attacker.id).opponent.energy.at(-1)?.cardId).toBeNull();
  });
});
