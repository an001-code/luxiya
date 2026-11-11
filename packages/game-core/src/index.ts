import { cardDefinitions as builtInCardDefinitions, getCardDefinition } from '@pgr/cards';
import type {
  CardDefinition,
  CardInstance,
  DeckDefinition,
  GameCommand,
  GameEvent,
  GameResult,
  GameState,
  LegalAction,
  PlayerBoardView,
  PlayerId,
  PlayerState,
  PlayerView,
  PublicCardView,
} from '@pgr/protocol';
import { resolveEffectDecision } from './effects/state.js';
import { continueEffectResolution, enqueueEffects } from './effects/interpreter.js';
import {
  blueDiscountSignals,
  conditionalFloatingDp,
  conditionalTeamPpBonus,
} from './effects/current-card-handlers.js';

export { registeredCustomEffectHandlers, validateExecutableEffect } from './effects/capabilities.js';
export { resolveEffectDecision, startEffectResolution } from './effects/state.js';
export { continueEffectResolution, enqueueEffects } from './effects/interpreter.js';
export { selectCardInstanceIds } from './effects/selectors.js';
export { applyQuProcessingReplacement } from './effects/current-card-handlers.js';

export type Rng = () => number;

export const sequenceRng = (values: number[]): Rng => {
  let index = 0;
  return () => {
    const value = values[index % Math.max(values.length, 1)] ?? 0.5;
    index += 1;
    return value;
  };
};

export const validateDeck = (
  deck: DeckDefinition,
  lookup: (id: string) => CardDefinition = getCardDefinition,
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (deck.cards.length !== 50) errors.push('牌组必须恰好包含50张卡牌');
  const counts = new Map<string, number>();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) if (count > 4) errors.push(`${id} 超过同编号4张上限`);
  for (const color of ['red', 'blue', 'yellow'] as const) {
    const count = deck.cards.filter((id) => lookup(id).signal === color).length;
    if (count !== 4) errors.push(`${color}信号球必须恰好4张`);
  }
  return { valid: errors.length === 0, errors };
};

const shuffle = <T>(items: T[], rng: Rng): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};

const createInstances = (deck: DeckDefinition, owner: string): CardInstance[] =>
  deck.cards.map((cardId, index) => ({
    instanceId: `${owner}-${index + 1}`,
    cardId,
    face: 'down',
    rested: false,
  }));

const drawOne = (state: GameState, player: PlayerState, rng: Rng): CardInstance | null => {
  if (player.deck.length === 0 && player.graveyard.length > 0) {
    player.deck = shuffle(player.graveyard.splice(0).map((card) => ({ ...card, face: 'down' as const, rested: false })), rng);
    player.corruption += 1;
    addEvent(state, 'deck-refresh', player.id, `${player.id} 进行了牌组更新，侵蚀+1`);
  }
  const card = player.deck.shift() ?? null;
  if (card) {
    card.face = 'up';
    player.hand.push(card);
  }
  return card;
};

const addEvent = (state: GameState, type: string, playerId: string | undefined, message: string): GameEvent => {
  const event: GameEvent = {
    id: state.events.length + 1,
    type,
    message,
    public: true,
    createdAtTurn: state.turn,
    ...(playerId ? { playerId } : {}),
  };
  state.events.push(event);
  return event;
};

export function createGame(playerIds: [PlayerId, PlayerId], deck: DeckDefinition, rng: Rng): GameState;
export function createGame(
  playerIds: [PlayerId, PlayerId],
  decks: [DeckDefinition, DeckDefinition],
  definitions: CardDefinition[],
  rng: Rng,
): GameState;
export function createGame(
  playerIds: [PlayerId, PlayerId],
  deckOrDecks: DeckDefinition | [DeckDefinition, DeckDefinition],
  definitionsOrRng: CardDefinition[] | Rng,
  suppliedRng?: Rng,
): GameState {
  const definitions = typeof definitionsOrRng === 'function' ? builtInCardDefinitions : definitionsOrRng;
  const rng = typeof definitionsOrRng === 'function' ? definitionsOrRng : suppliedRng;
  if (!rng) throw new Error('RNG is required');
  const decks: [DeckDefinition, DeckDefinition] = Array.isArray(deckOrDecks) ? deckOrDecks : [deckOrDecks, deckOrDecks];
  const definitionMap = Object.fromEntries(definitions.map((definition) => [definition.id, structuredClone(definition)]));
  const lookup = (id: string): CardDefinition => {
    const definition = definitionMap[id];
    if (!definition) throw new Error(`Unknown card: ${id}`);
    return definition;
  };
  for (const deck of decks) {
    const validation = validateDeck(deck, lookup);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
  }
  const players = Object.fromEntries(playerIds.map((id, index) => {
    const shuffled = shuffle(createInstances(decks[index]!, id), rng);
    const hand = shuffled.splice(0, 4).map((card) => ({ ...card, face: 'up' as const }));
    const energy = shuffled.splice(0, 2).map((card) => ({ ...card, face: 'up' as const }));
    const player: PlayerState = {
      id, deck: shuffled, hand, energy, graveyard: [], processing: [], field: Array(5).fill(null),
      signals: [], corruption: 0, mulliganDone: false,
    };
    return [id, player];
  })) as Record<PlayerId, PlayerState>;
  const activePlayerId = playerIds[Math.floor(rng() * 2)] ?? playerIds[0];
  const state: GameState = {
    id: `game-${Math.floor(rng() * 1_000_000).toString(36)}`,
    version: 0,
    cardDefinitions: definitionMap,
    status: 'playing',
    players,
    playerOrder: playerIds,
    activePlayerId,
    phase: 'mulligan',
    turn: 1,
    pendingAttack: null,
    priorityWindow: null,
    effectStack: [],
    pendingDecision: null,
    continuousModifiers: [],
    abilityUsage: [],
    winnerId: null,
    processedCommandIds: [],
    events: [],
  };
  addEvent(state, 'game-start', undefined, '对局创建，双方进行起手调度');
  return state;
}

const definitionFor = (state: GameState, cardId: string): CardDefinition => {
  const definition = state.cardDefinitions[cardId];
  if (!definition) throw new Error(`Unknown card in game snapshot: ${cardId}`);
  return definition;
};

const opponentId = (state: GameState, playerId: string): string =>
  state.playerOrder.find((id) => id !== playerId) ?? state.playerOrder[0];

const isHaste = (state: GameState, card: CardInstance): boolean => {
  if (card.evolved) return true;
  const definition = definitionFor(state, card.cardId);
  if (definition.structuredEffects?.some((effect) => effect.sourceEffectId === 'haste')) return true;
  return definition.effectIds.includes('weapon_haste') && Boolean(card.attached?.some((item) => definitionFor(state, item.cardId).traits.includes('封刃太刀')));
};

const effectiveStat = (state: GameState, card: CardInstance, stat: 'pp' | 'dp', base: number): number =>
  state.continuousModifiers
    .filter((modifier) => modifier.kind === 'stat' && modifier.stat === stat && modifier.targetInstanceIds.includes(card.instanceId))
    .reduce((value, modifier) => modifier.operation === 'set' ? Number(modifier.value) : value + Number(modifier.value), base);

const controllingPlayer = (state: GameState, card: CardInstance): PlayerState | undefined =>
  state.playerOrder.map((id) => state.players[id]!).find((player) => player.field.some((fieldCard) => fieldCard?.instanceId === card.instanceId));

const effectivePp = (state: GameState, card: CardInstance): number => effectiveStat(state, card, 'pp',
  (definitionFor(state, card.cardId).pp ?? 0)
  + (card.attached ?? []).reduce((sum, item) => sum + (definitionFor(state, item.cardId).pp ?? 0), 0)
  + (card.temporaryPp ?? 0)
  + (controllingPlayer(state, card) ? conditionalTeamPpBonus(state, controllingPlayer(state, card)!, card.cardId) : 0));

const effectiveDp = (state: GameState, card: CardInstance): number => effectiveStat(state, card, 'dp',
  conditionalFloatingDp(state, controllingPlayer(state, card) ?? state.players[state.activePlayerId]!, card.cardId, definitionFor(state, card.cardId).dp ?? 0)
  + (card.temporaryDp ?? 0));

const evolutionTargetSlots = (state: GameState, player: PlayerState, cardId: string): number[] => {
  if (!definitionFor(state, cardId).structuredEffects?.some((effect) => effect.sourceEffectId === 'evolve_lucia')) return [];
  return player.field.flatMap((card, slot) => {
    if (!card) return [];
    const definition = definitionFor(state, card.cardId);
    return definition.type === 'character' && definition.cost <= 4 && definition.traits.includes('露西亚') ? [slot] : [];
  });
};

export const getLegalActions = (state: GameState, playerId: string): LegalAction[] => {
  if (state.status !== 'playing') return [];
  if (state.pendingProcessing) return [];
  const player = state.players[playerId];
  if (!player) return [];
  if (state.pendingDecision) {
    if (state.pendingDecision.playerId !== playerId) return [];
    return [{
      type: 'RESOLVE_EFFECT_DECISION',
      decisionId: state.pendingDecision.id,
      selectedInstanceIds: [],
    }];
  }
  if (state.phase === 'mulligan' && !player.mulliganDone) return [{ type: 'MULLIGAN', instanceIds: [] }];
  if (state.pendingAttack) {
    if (state.pendingAttack.priorityPlayerId !== playerId) return [];
    const actions: LegalAction[] = [{ type: 'PASS_RESPONSE' }];
    if (playerId !== state.activePlayerId && state.pendingAttack.blockerSlot === undefined) {
      player.field.forEach((card, blockerSlot) => {
        const threshold = state.pendingAttack?.maxBlockerPpExclusive;
        if (card && !card.rested && (threshold === undefined || effectivePp(state, card) > threshold)) actions.push({ type: 'BLOCK', blockerSlot });
      });
    }
    for (const card of player.hand) {
      if (definitionFor(state, card.cardId).subtype === 'instant' && canPay(state, player, card.cardId)) actions.push({ type: 'PLAY_CARD', instanceId: card.instanceId });
    }
    return actions;
  }
  if (state.priorityWindow) {
    if (state.priorityWindow.priorityPlayerId !== playerId) return [];
    const actions: LegalAction[] = [{ type: 'PASS_RESPONSE' }];
    for (const card of player.hand) {
      if (definitionFor(state, card.cardId).subtype === 'instant' && canPay(state, player, card.cardId)) {
        actions.push({ type: 'PLAY_CARD', instanceId: card.instanceId });
      }
    }
    return actions;
  }
  if (state.activePlayerId !== playerId) return [];
  if (state.phase === 'upright' || state.phase === 'draw') return [{ type: 'ADVANCE_PHASE' }];
  if (state.phase === 'energy') return [{ type: 'SET_ENERGY' }, ...player.hand.map((card) => ({ type: 'SET_ENERGY' as const, instanceId: card.instanceId }))];
  if (state.phase !== 'main') return [];
  const actions: LegalAction[] = [{ type: 'END_PHASE' }];
  for (const card of player.hand) {
    const definition = definitionFor(state, card.cardId);
    const canEvolve = evolutionTargetSlots(state, player, card.cardId).length > 0;
    const minimumCost = canEvolve ? 2 : discountedCost(state, player, card.cardId, supportsBlueDiscount(state, card.cardId) ? blueDiscountSignals(state, player) : []) ?? definition.cost;
    if (definition.subtype === 'instant' || !canPay(state, player, card.cardId, minimumCost)) continue;
    const hasEmptySlot = player.field.some((item) => item === null);
    const hasEquipmentTarget = definition.subtype === 'equipment' && player.field.some((item) => item && definitionFor(state, item.cardId).type === 'character' && !item.attached?.length);
    if ((definition.type === 'character' || definition.subtype === 'support') && !hasEmptySlot && !canEvolve) continue;
    if (definition.subtype === 'equipment' && !hasEmptySlot && !hasEquipmentTarget) continue;
    actions.push({ type: 'PLAY_CARD', instanceId: card.instanceId });
  }
  for (let startIndex = 0; startIndex + 2 < player.signals.length; startIndex += 1) actions.push({ type: 'ELIMINATE_SIGNALS', startIndex });
  player.field.forEach((card) => {
    if (!card || card.rested) return;
    definitionFor(state, card.cardId).structuredEffects?.forEach((effect, abilityIndex) => {
      if (effect.ability === 'activated') actions.push({ type: 'ACTIVATE_ABILITY', sourceInstanceId: card.instanceId, abilityIndex });
    });
  });
  player.field.forEach((card, attackerSlot) => {
    if (!card || card.rested || (card.enteredTurn === state.turn && !isHaste(state, card))) return;
    actions.push({ type: 'DECLARE_ATTACK', attackerSlot, target: 'player' });
    const opponent = state.players[opponentId(state, playerId)]!;
    opponent.field.forEach((target, targetSlot) => {
      if (target?.rested) actions.push({ type: 'DECLARE_ATTACK', attackerSlot, target: 'character', targetSlot });
    });
  });
  return actions;
};

const publicCard = (state: GameState, card: CardInstance, hideIdentity = false): PublicCardView => ({
  instanceId: card.instanceId,
  cardId: hideIdentity ? null : card.cardId,
  face: card.face,
  rested: card.rested,
  ...(!hideIdentity && definitionFor(state, card.cardId).type === 'character' ? { effectivePp: effectivePp(state, card), effectiveDp: effectiveDp(state, card) } : {}),
  ...(card.enteredTurn === undefined ? {} : { enteredTurn: card.enteredTurn }),
  ...(card.frozen === undefined ? {} : { frozen: card.frozen }),
  ...(card.temporaryPp === undefined ? {} : { temporaryPp: card.temporaryPp }),
  ...(card.temporaryDp === undefined ? {} : { temporaryDp: card.temporaryDp }),
  ...(card.attached ? { attached: card.attached.map((item) => publicCard(state, item, hideIdentity)) } : {}),
  ...(card.underneath ? { underneath: card.underneath.map((item) => publicCard(state, item, hideIdentity)) } : {}),
  ...(card.mode === undefined ? {} : { mode: card.mode }),
  ...(card.evolved === undefined ? {} : { evolved: card.evolved }),
  ...(card.returnAtTurn === undefined ? {} : { returnAtTurn: card.returnAtTurn }),
});

const boardView = (state: GameState, player: PlayerState, own: boolean): PlayerBoardView => ({
  id: player.id,
  hand: own ? player.hand.map((card) => ({ ...card })) : { count: player.hand.length },
  deck: { count: player.deck.length },
  graveyard: player.graveyard.map((card) => publicCard(state, card)),
  processing: player.processing.map((card) => publicCard(state, card)),
  field: player.field.map((card) => card ? publicCard(state, card) : null),
  signals: player.signals.map((card) => publicCard(state, card)),
  energy: player.energy.map((card) => publicCard(state, card, !own && card.face === 'down')),
  corruption: player.corruption,
});

export const createPlayerView = (state: GameState, playerId: PlayerId): PlayerView => {
  const self = state.players[playerId];
  if (!self) throw new Error('Player is not part of this game');
  const opponent = state.players[opponentId(state, playerId)]!;
  const pendingDecision = state.pendingDecision?.playerId === playerId
    ? {
      id: state.pendingDecision.id,
      frameId: state.pendingDecision.frameId,
      kind: state.pendingDecision.kind,
      purpose: state.pendingDecision.purpose,
      prompt: state.pendingDecision.prompt,
      min: state.pendingDecision.min,
      max: state.pendingDecision.max,
      ...(state.pendingDecision.targetId === undefined ? {} : { targetId: state.pendingDecision.targetId }),
      options: structuredClone(state.pendingDecision.options),
    }
    : null;
  return {
    gameId: state.id,
    opening: { selfDone: self.mulliganDone, opponentDone: opponent.mulliganDone },
    processingPending: Boolean(state.pendingProcessing),
    version: state.version,
    status: state.status,
    viewerId: playerId,
    self: boardView(state, self, true),
    opponent: boardView(state, opponent, false),
    activePlayerId: state.activePlayerId,
    phase: state.phase,
    turn: state.turn,
    pendingAttack: state.pendingAttack,
    priorityWindow: state.priorityWindow,
    pendingDecision,
    winnerId: state.winnerId,
    legalActions: getLegalActions(state, playerId),
    events: state.events.filter((event) => event.public),
  };
};

const reject = (state: GameState, code: NonNullable<GameResult['rejection']>['code'], message: string): GameResult => ({
  accepted: false,
  state,
  legalActions: [],
  emittedEvents: [],
  rejection: { code, message },
});

const supportsBlueDiscount = (state: GameState, cardId: string): boolean =>
  definitionFor(state, cardId).structuredEffects?.some((effect) => effect.sourceEffectId === 'blue_signal_discount') ?? false;

const discountedCost = (state: GameState, player: PlayerState, cardId: string, discountSignalIds: string[]): number | null => {
  const definition = definitionFor(state, cardId);
  if (!supportsBlueDiscount(state, cardId)) return discountSignalIds.length === 0 ? definition.cost : null;
  if (new Set(discountSignalIds).size !== discountSignalIds.length) return null;
  const legalIds = new Set(blueDiscountSignals(state, player));
  if (discountSignalIds.some((id) => !legalIds.has(id))) return null;
  return Math.max(0, definition.cost - discountSignalIds.length * 2);
};

const canPay = (state: GameState, player: PlayerState, cardId: string, cost = definitionFor(state, cardId).cost): boolean => {
  const definition = definitionFor(state, cardId);
  const available = player.energy.filter((card) => !card.rested);
  if (available.length < cost) return false;
  if (cost === 0 || definition.attribute === 'none') return true;
  return available.some((card) => card.face === 'up' && definitionFor(state, card.cardId).attribute === definition.attribute);
};

const selectedPayment = (state: GameState, player: PlayerState, cardId: string, paymentIds: string[] | undefined, cost = definitionFor(state, cardId).cost): CardInstance[] | null => {
  const definition = definitionFor(state, cardId);
  const ids = paymentIds ?? [];
  if (ids.length !== cost || new Set(ids).size !== ids.length) return null;
  const selected = ids.map((id) => player.energy.find((card) => card.instanceId === id && !card.rested));
  if (selected.some((card) => !card)) return null;
  const cards = selected as CardInstance[];
  if (cost > 0 && definition.attribute !== 'none'
    && !cards.some((card) => card.face === 'up' && definitionFor(state, card.cardId).attribute === definition.attribute)) return null;
  return cards;
};

const pay = (player: PlayerState, selected: CardInstance[]): void => {
  for (const selectedCard of selected) {
    const index = player.energy.findIndex((card) => card.instanceId === selectedCard.instanceId);
    const card = player.energy[index]!;
    if (card.face === 'up') card.rested = true;
    else {
      player.energy.splice(index, 1);
      card.face = 'up';
      player.graveyard.push(card);
    }
  }
};

const checkDefeat = (state: GameState): void => {
  const defeated = state.playerOrder.filter((id) => {
    const player = state.players[id]!;
    return player.corruption >= 7 || (player.deck.length === 0 && player.graveyard.length === 0);
  });
  if (defeated.length === 0) return;
  state.status = 'finished';
  state.winnerId = defeated.length === 2 ? null : opponentId(state, defeated[0]!);
  addEvent(state, 'game-finished', state.winnerId ?? undefined, state.winnerId ? `${state.winnerId} 获胜` : '双方同时败北，平局');
};

const attackCharge = (state: GameState, player: PlayerState, attacker: CardInstance, rng: Rng): void => {
  const attackerDefinition = definitionFor(state, attacker.cardId);
  const chargeModifier = attackerDefinition.structuredEffects
    ?.flatMap((effect) => effect.ability === 'permanent' ? effect.actions : [])
    .find((action) => action.kind === 'modify-stat' && action.targetId === 'source' && action.stat === 'charge');
  const chargeCount = chargeModifier?.kind === 'modify-stat' && chargeModifier.value.kind === 'fixed'
    ? (chargeModifier.operation === 'set' ? chargeModifier.value.value : 1 + chargeModifier.value.value)
    : 1;
  for (let index = 0; index < Math.max(0, chargeCount); index += 1) {
    const card = player.deck.shift();
    if (!card) return;
    card.face = 'up';
    const definition = definitionFor(state, card.cardId);
    if (definition.signal) {
      player.signals.unshift(card);
      const chargeEffects = definition.structuredEffects?.filter((effect) => effect.ability === 'charge') ?? [];
      enqueueEffects(state, { controllerId: player.id, sourceInstanceId: attacker.instanceId }, chargeEffects);
      continueEffectResolution(state, rng);
      if (state.pendingDecision) return;
    } else player.hand.push(card);
    addEvent(state, 'attack-charge', player.id, `${player.id} 执行攻击充能`);
  }
};

const damagePlayer = (state: GameState, player: PlayerState, amount: number, rng: Rng): void => {
  for (let i = 0; i < amount; i += 1) {
    if (player.deck.length === 0 && player.graveyard.length > 0) {
      player.deck = shuffle(player.graveyard.splice(0).map((card) => ({ ...card, face: 'down' as const, rested: false })), rng);
      player.corruption += 1;
    }
    const card = player.deck.shift();
    if (card) player.energy.push({ ...card, face: 'down', rested: false });
    player.corruption += 1;
    checkDefeat(state);
    if (state.status === 'finished') break;
  }
};

const sendFieldCardToGrave = (state: GameState, player: PlayerState, slot: number): void => {
  const card = player.field[slot];
  if (!card) return;
  player.field[slot] = null;
  const attached = card.attached ?? [];
  const underneath = card.underneath ?? [];
  delete card.attached;
  delete card.underneath;
  player.graveyard.push(card, ...underneath, ...attached);
  const sealedBlade = attached.find((item) => item.cardId === 'BP01-023');
  if (card.cardId === 'PR-016' && sealedBlade && player.signals.length > 0) {
    player.graveyard.push(...player.signals.splice(0, 1));
    const bladeIndex = player.graveyard.findIndex((item) => item.instanceId === sealedBlade.instanceId);
    if (bladeIndex >= 0) {
      const [recovered] = player.graveyard.splice(bladeIndex, 1);
      player.field[slot] = { ...recovered!, enteredTurn: state.turn };
    }
  }
};

const resolveAttack = (state: GameState, rng: Rng): void => {
  if (state.processingMode === 'deferred') { resolveDeferredAttack(state, rng); return; }
  const pending = state.pendingAttack;
  if (!pending) return;
  const attackerPlayer = state.players[state.activePlayerId]!;
  const defenderPlayer = state.players[opponentId(state, state.activePlayerId)]!;
  const attacker = attackerPlayer.field[pending.attackerSlot];
  if (!attacker) {
    state.continuousModifiers = state.continuousModifiers.filter((modifier) => modifier.duration.kind !== 'attack');
    state.pendingAttack = null;
    return;
  }
  if (pending.stage === 'response') {
    pending.stage = 'combat';
    attackCharge(state, attackerPlayer, attacker, rng);
    if (state.pendingDecision || state.effectStack.length > 0) return;
  }
  const defenderSlot = pending.blockerSlot ?? (pending.target === 'character' ? pending.targetSlot : undefined);
  if (defenderSlot !== undefined) {
    const defender = defenderPlayer.field[defenderSlot];
    if (defender && effectivePp(state, attacker) >= effectivePp(state, defender)) {
      sendFieldCardToGrave(state, defenderPlayer, defenderSlot);
      addEvent(state, 'character-destroyed', defenderPlayer.id, `${definitionFor(state, defender.cardId).name} 被战斗破坏`);
    }
  } else {
    const amount = effectiveDp(state, attacker);
    damagePlayer(state, defenderPlayer, amount, rng);
    addEvent(state, 'damage', defenderPlayer.id, `${defenderPlayer.id} 受到${amount}点伤害`);
  }
  state.continuousModifiers = state.continuousModifiers.filter((modifier) => modifier.duration.kind !== 'attack');
  state.pendingAttack = null;
};

const cleanupResolvedTactics = (state: GameState): void => {
  if (state.pendingDecision || state.effectStack.length > 0) return;
  for (const entry of state.processingCleanup ?? []) {
    const player = state.players[entry.playerId]!;
    const index = player.processing.findIndex((card) => card.instanceId === entry.instanceId);
    if (index < 0) continue;
    const [card] = player.processing.splice(index, 1);
    if (entry.destination === 'signals') player.signals.unshift(card!);
    else player.graveyard.push(card!);
  }
  state.processingCleanup = [];
};

const revealCharge = (state: GameState, player: PlayerState, kind: 'attack-charge' | 'damage-charge', rng: Rng): boolean => {
  if (player.deck.length === 0 && player.graveyard.length > 0) {
    player.deck = shuffle(player.graveyard.splice(0).map((card) => ({ ...card, face: 'down' as const, rested: false })), rng);
    player.corruption += 1;
    addEvent(state, 'deck-refresh', player.id, `${player.id} 进行了牌组更新，侵蚀+1`);
  }
  const card = player.deck.shift();
  if (!card) return false;
  card.face = 'up'; player.processing.push(card);
  state.pendingProcessing = { kind, playerId: player.id, instanceId: card.instanceId };
  addEvent(state, 'processing-revealed', player.id, `${player.id} ${kind === 'attack-charge' ? '攻击' : '伤害'}充能公开《${definitionFor(state, card.cardId).name}》`);
  return true;
};

const resolveDeferredAttack = (state: GameState, rng: Rng): void => {
  const pending = state.pendingAttack;
  if (!pending || state.pendingProcessing || state.pendingDecision) return;
  const attackerPlayer = state.players[state.activePlayerId]!;
  const defenderPlayer = state.players[opponentId(state, state.activePlayerId)]!;
  const attacker = attackerPlayer.field[pending.attackerSlot];
  const finish = () => {
    state.continuousModifiers = state.continuousModifiers.filter((modifier) => modifier.duration.kind !== 'attack');
    state.pendingAttack = null;
  };
  if (!attacker) { finish(); return; }
  if (pending.stage === 'response') {
    pending.stage = 'combat';
    const modifier = definitionFor(state, attacker.cardId).structuredEffects
      ?.flatMap((effect) => effect.ability === 'permanent' ? effect.actions : [])
      .find((action) => action.kind === 'modify-stat' && action.targetId === 'source' && action.stat === 'charge');
    pending.remainingCharges = Math.max(0, modifier?.kind === 'modify-stat' && modifier.value.kind === 'fixed'
      ? modifier.operation === 'set' ? modifier.value.value : 1 + modifier.value.value : 1);
  }
  if ((pending.remainingCharges ?? 0) > 0) {
    pending.remainingCharges! -= 1;
    if (revealCharge(state, attackerPlayer, 'attack-charge', rng)) return;
    pending.remainingCharges = 0;
  }
  const defenderSlot = pending.blockerSlot ?? (pending.target === 'character' ? pending.targetSlot : undefined);
  if (defenderSlot !== undefined) {
    const defender = defenderPlayer.field[defenderSlot];
    if (defender && effectivePp(state, attacker) >= effectivePp(state, defender)) {
      sendFieldCardToGrave(state, defenderPlayer, defenderSlot);
      addEvent(state, 'character-destroyed', defenderPlayer.id, `${definitionFor(state, defender.cardId).name} 被战斗破坏`);
    }
    finish(); return;
  }
  if (pending.remainingDamage === undefined) {
    pending.remainingDamage = Math.max(0, effectiveDp(state, attacker));
    addEvent(state, 'damage', defenderPlayer.id, `${defenderPlayer.id} 受到${pending.remainingDamage}点伤害`);
  }
  if (pending.remainingDamage > 0) {
    pending.remainingDamage -= 1;
    if (revealCharge(state, defenderPlayer, 'damage-charge', rng)) return;
    defenderPlayer.corruption += 1;
    checkDefeat(state);
    if (state.status !== 'finished' && pending.remainingDamage > 0) { resolveDeferredAttack(state, rng); return; }
  }
  finish();
};

/** Advance a server-owned public checkpoint. Clients cannot invoke this with a game command. */
export const advanceProcessing = (state: GameState, rng: Rng): GameState => {
  if (!state.pendingProcessing || state.status !== 'playing') return state;
  const next = structuredClone(state);
  const pending = next.pendingProcessing!;
  next.pendingProcessing = null;
  const player = next.players[pending.playerId]!;
  const index = player.processing.findIndex((card) => card.instanceId === pending.instanceId);
  if (index < 0) throw new Error('PROCESSING_CARD_MISSING');
  const card = player.processing[index]!;
  const definition = definitionFor(next, card.cardId);
  if (pending.kind === 'tactic') {
    next.processingCleanup = [...(next.processingCleanup ?? []), { playerId: player.id, instanceId: card.instanceId, destination: definition.signal ? 'signals' : 'graveyard' }];
    const effects = definition.structuredEffects?.filter((effect) =>
      (effect.trigger?.event === 'card-used' && effect.ability === 'automatic')
      || (definition.subtype === 'instant' && effect.ability === 'instant')
      || (!definition.signal && definition.subtype !== 'instant' && effect.ability === 'enter')) ?? [];
    enqueueEffects(next, { controllerId: player.id, sourceInstanceId: card.instanceId }, effects);
    continueEffectResolution(next, rng);
    cleanupResolvedTactics(next);
  } else {
    if (pending.kind === 'attack-charge') {
      if (definition.signal) {
        next.processingCleanup = [...(next.processingCleanup ?? []), { playerId: player.id, instanceId: card.instanceId, destination: 'signals' }];
        const attacker = player.field[next.pendingAttack!.attackerSlot];
        if (attacker) enqueueEffects(next, { controllerId: player.id, sourceInstanceId: attacker.instanceId }, definition.structuredEffects?.filter((effect) => effect.ability === 'charge') ?? []);
        continueEffectResolution(next, rng);
        cleanupResolvedTactics(next);
      } else { player.processing.splice(index, 1); player.hand.push(card); }
      addEvent(next, 'attack-charge', player.id, `${player.id} 执行攻击充能`);
    } else {
      player.processing.splice(index, 1);
      player.energy.push({ ...card, face: 'down', rested: false });
      player.corruption += 1;
      addEvent(next, 'damage-charge', player.id, `${player.id} 完成伤害充能，侵蚀+1`);
      checkDefeat(next);
    }
    if (!next.pendingDecision && next.effectStack.length === 0 && next.status === 'playing') resolveDeferredAttack(next, rng);
  }
  next.version += 1;
  if (!next.pendingProcessing && !next.pendingDecision) checkDefeat(next);
  return next;
};

const finishTurn = (state: GameState, playerId: PlayerId): void => {
  const player = state.players[playerId]!;
  for (let index = player.energy.length - 1; index >= 0; index -= 1) {
    if (player.energy[index]!.face === 'down') player.graveyard.push(...player.energy.splice(index, 1));
  }
  while (player.hand.length > 7) player.graveyard.push(player.hand.pop()!);
  for (const card of player.field) if (card) { delete card.temporaryPp; delete card.temporaryDp; }
  state.continuousModifiers = state.continuousModifiers.filter((modifier) => {
    if (modifier.duration.kind === 'turn') return false;
    if (modifier.duration.kind === 'next-turn' && modifier.controllerId === playerId && state.turn > modifier.createdTurn) return false;
    return true;
  });
  state.priorityWindow = null;
  state.activePlayerId = opponentId(state, playerId);
  state.phase = 'upright';
  state.turn += 1;
  addEvent(state, 'turn-ended', playerId, `${playerId} 结束回合`);
};

export const applyCommand = (state: GameState, command: GameCommand, rng: Rng): GameResult => {
  if (state.processedCommandIds.includes(command.commandId)) return reject(state, 'DUPLICATE_COMMAND', '命令已处理');
  const independentMulligan = command.type === 'MULLIGAN' && state.phase === 'mulligan'
    && !state.players[command.playerId]?.mulliganDone && command.expectedVersion >= 0 && command.expectedVersion <= state.version;
  if (command.expectedVersion !== state.version && !independentMulligan) return reject(state, 'STALE_VERSION', '客户端状态已过期');
  if (state.status === 'finished') return reject(state, 'GAME_FINISHED', '对局已经结束');
  if (state.status === 'paused') return reject(state, 'ILLEGAL_ACTION', '对局已暂停，请等待双方重连');
  if (!state.players[command.playerId]) return reject(state, 'ILLEGAL_ACTION', '玩家不在该对局中');
  if (state.pendingProcessing && command.type !== 'CONCEDE') return reject(state, 'ILLEGAL_ACTION', '请等待处理区卡牌结算');
  if (state.pendingDecision) {
    if (command.type !== 'RESOLVE_EFFECT_DECISION') return reject(state, 'ILLEGAL_ACTION', '请先完成当前效果选择');
    const resolution = resolveEffectDecision(state, command);
    if (!resolution.accepted) return reject(state, resolution.code, resolution.message);
    const resolved = resolution.state;
    continueEffectResolution(resolved, rng);
    cleanupResolvedTactics(resolved);
    if (resolved.pendingAttack?.stage === 'combat' && !resolved.pendingDecision && resolved.effectStack.length === 0) {
      resolveAttack(resolved, rng);
    }
    if (!resolved.pendingProcessing && !resolved.pendingDecision) checkDefeat(resolved);
    resolved.version += 1;
    resolved.processedCommandIds.push(command.commandId);
    return {
      accepted: true,
      state: resolved,
      legalActions: getLegalActions(resolved, command.playerId),
      emittedEvents: resolved.events.slice(state.events.length),
    };
  }
  const next = structuredClone(state);
  const player = next.players[command.playerId]!;
  const emittedBefore = next.events.length;

  if (command.type === 'CONCEDE') {
    next.status = 'finished';
    next.winnerId = opponentId(next, command.playerId);
    addEvent(next, 'concede', command.playerId, `${command.playerId} 认输`);
  } else if (command.type === 'MULLIGAN' && next.phase === 'mulligan' && !player.mulliganDone) {
    if (new Set(command.instanceIds).size !== command.instanceIds.length || command.instanceIds.some((id) => !player.hand.some((card) => card.instanceId === id))) return reject(state, 'ILLEGAL_ACTION', '调度只能选择自己当前的手牌');
    const selected = player.hand.filter((card) => command.instanceIds.includes(card.instanceId));
    player.hand = player.hand.filter((card) => !command.instanceIds.includes(card.instanceId));
    for (let i = 0; i < selected.length; i += 1) drawOne(next, player, rng);
    player.deck.push(...selected.map((card) => ({ ...card, face: 'down' as const })));
    player.mulliganDone = true;
    addEvent(next, 'mulligan', player.id, `${player.id} 完成起手调度`);
    if (next.playerOrder.every((id) => next.players[id]!.mulliganDone)) next.phase = 'upright';
  } else if (command.type === 'ADVANCE_PHASE' && command.playerId === next.activePlayerId) {
    if (next.phase === 'upright') {
      for (const card of [...player.field.filter(Boolean), ...player.energy] as CardInstance[]) card.rested = false;
      next.phase = 'draw';
    } else if (next.phase === 'draw') {
      const count = next.turn === 1 ? 1 : 2;
      for (let i = 0; i < count; i += 1) drawOne(next, player, rng);
      next.phase = 'energy';
    } else return reject(state, 'ILLEGAL_ACTION', '当前阶段不能推进');
  } else if (command.type === 'SET_ENERGY' && command.playerId === next.activePlayerId && next.phase === 'energy') {
    if (command.instanceId) {
      if (player.energy.length >= 10) return reject(state, 'ILLEGAL_ACTION', '费用区已满');
      const index = player.hand.findIndex((card) => card.instanceId === command.instanceId);
      if (index < 0) return reject(state, 'ILLEGAL_ACTION', '卡牌不在手牌中');
      const [card] = player.hand.splice(index, 1);
      player.energy.push({ ...card!, face: 'up', rested: false });
    }
    next.phase = 'main';
  } else if (command.type === 'PLAY_CARD') {
    const index = player.hand.findIndex((card) => card.instanceId === command.instanceId);
    if (index < 0) return reject(state, 'ILLEGAL_ACTION', '卡牌不在手牌中');
    const card = player.hand[index]!;
    const definition = definitionFor(next, card.cardId);
    const inResponse = Boolean(definition.subtype === 'instant' && (
      next.pendingAttack?.priorityPlayerId === command.playerId
      || next.priorityWindow?.priorityPlayerId === command.playerId
    ));
    if (!inResponse && (next.phase !== 'main' || next.activePlayerId !== command.playerId || definition.subtype === 'instant')) return reject(state, 'NOT_YOUR_ACTION', '当前不能使用该卡牌');
    const evolutionSlot = command.evolutionTargetSlot;
    if (evolutionSlot !== undefined && !evolutionTargetSlots(next, player, card.cardId).includes(evolutionSlot)) {
      return reject(state, 'ILLEGAL_ACTION', '升变对象不合法');
    }
    const playCost = evolutionSlot === undefined ? discountedCost(next, player, card.cardId, command.discountSignalIds ?? []) : 2;
    if (playCost === null) return reject(state, 'ILLEGAL_ACTION', '费用折扣所选信号球不合法');
    if (!canPay(next, player, card.cardId, playCost)) return reject(state, 'ILLEGAL_ACTION', '费用或属性条件不满足');
    const payment = selectedPayment(next, player, card.cardId, command.paymentIds, playCost);
    if (!payment) return reject(state, 'ILLEGAL_ACTION', '请选择符合费用和属性要求的费用牌');
    for (const signalId of command.discountSignalIds ?? []) {
      const signalIndex = player.signals.findIndex((signal) => signal.instanceId === signalId);
      player.graveyard.push(...player.signals.splice(signalIndex, 1));
    }
    pay(player, payment);
    player.hand.splice(index, 1);
    card.face = 'up';
    if (next.processingMode === 'deferred' && definition.type === 'tactic') {
      player.processing.push(card);
      next.pendingProcessing = { kind: 'tactic', playerId: player.id, instanceId: card.instanceId };
      addEvent(next, 'processing-revealed', player.id, `${player.id} 将《${definition.name}》放入处理区`);
    } else if (evolutionSlot !== undefined) {
      const target = player.field[evolutionSlot]!;
      player.field[evolutionSlot] = {
        ...card,
        enteredTurn: next.turn,
        evolved: true,
        underneath: [target, ...(target.underneath ?? [])],
      };
    } else if (definition.signal) {
      player.signals.unshift(card);
    } else if (definition.type === 'character' || definition.subtype === 'support') {
      const slot = command.fieldSlot ?? player.field.findIndex((item) => item === null);
      if (slot < 0 || slot >= 5 || player.field[slot]) return reject(state, 'ILLEGAL_ACTION', '没有合法战场卡位');
      player.field[slot] = { ...card, enteredTurn: next.turn };
    } else if (definition.subtype === 'equipment' && command.targetSlot !== undefined && command.targetSlot >= 0 && player.field[command.targetSlot]) {
      const target = player.field[command.targetSlot]!;
      if (target.attached?.length) return reject(state, 'ILLEGAL_ACTION', '该角色已经装备了道具');
      target.attached = [card];
    } else if (definition.subtype === 'equipment') {
      const slot = command.fieldSlot ?? player.field.findIndex((item) => item === null);
      if (slot < 0 || slot >= 5 || player.field[slot]) return reject(state, 'ILLEGAL_ACTION', '没有合法装备位置');
      player.field[slot] = { ...card, enteredTurn: next.turn };
    } else player.graveyard.push(card);
    const triggeredEffects = definition.structuredEffects?.filter((effect) =>
      (effect.trigger?.event === 'card-used' && effect.ability === 'automatic')
      || (definition.subtype === 'instant' && effect.ability === 'instant')
      || (!definition.signal && definition.subtype !== 'instant' && effect.ability === 'enter')) ?? [];
    if (!next.pendingProcessing) {
      enqueueEffects(next, { controllerId: player.id, sourceInstanceId: card.instanceId }, triggeredEffects);
      continueEffectResolution(next, rng);
    }
    addEvent(next, 'play-card', player.id, `${player.id} 使用了《${definition.name}》`);
    if (next.pendingAttack) {
      next.pendingAttack.priorityPlayerId = opponentId(next, command.playerId);
      next.pendingAttack.consecutivePasses = 0;
    } else if (next.priorityWindow) {
      next.priorityWindow.priorityPlayerId = opponentId(next, command.playerId);
      next.priorityWindow.consecutivePasses = 0;
    }
  } else if (command.type === 'ACTIVATE_ABILITY' && next.phase === 'main' && next.activePlayerId === command.playerId && !next.pendingAttack) {
    const source = player.field.find((fieldCard) => fieldCard?.instanceId === command.sourceInstanceId);
    if (!source) return reject(state, 'ILLEGAL_ACTION', '能力来源不在战场');
    const effect = definitionFor(next, source.cardId).structuredEffects?.[command.abilityIndex];
    if (!effect || effect.ability !== 'activated') return reject(state, 'ILLEGAL_ACTION', '起动能力不存在');
    if (effect.oncePerTurn && next.abilityUsage.some((usage) => usage.sourceInstanceId === source.instanceId && usage.effectId === effect.id && usage.turn === next.turn)) {
      return reject(state, 'ILLEGAL_ACTION', '该能力本回合已经使用');
    }
    enqueueEffects(next, { controllerId: player.id, sourceInstanceId: source.instanceId }, [effect]);
    continueEffectResolution(next, rng);
    next.abilityUsage.push({ sourceInstanceId: source.instanceId, effectId: effect.id, playerId: player.id, turn: next.turn, count: 1 });
    addEvent(next, 'ability-activated', player.id, `${player.id} 发动了《${definitionFor(next, source.cardId).name}》的起动能力`);
  } else if (command.type === 'ELIMINATE_SIGNALS' && next.phase === 'main' && next.activePlayerId === command.playerId && !next.pendingAttack) {
    if (command.startIndex < 0 || command.startIndex + 2 >= player.signals.length) return reject(state, 'ILLEGAL_ACTION', '必须消除三张相邻信号球');
    const removed = player.signals.splice(command.startIndex, 3);
    player.graveyard.push(...removed);
    drawOne(next, player, rng);
    addEvent(next, 'signals-eliminated', player.id, `${player.id} 消除三张相邻信号球并抽1张牌`);
  } else if (command.type === 'DECLARE_ATTACK' && next.phase === 'main' && next.activePlayerId === command.playerId && !next.pendingAttack) {
    const attacker = player.field[command.attackerSlot];
    if (!attacker || attacker.rested || (attacker.enteredTurn === next.turn && !isHaste(next, attacker))) return reject(state, 'ILLEGAL_ACTION', '该角色不能攻击');
    if (command.target === 'character') {
      const target = next.players[opponentId(next, player.id)]!.field[command.targetSlot ?? -1];
      if (!target?.rested) return reject(state, 'ILLEGAL_ACTION', '只能攻击横置角色');
    }
    attacker.rested = true;
    next.pendingAttack = {
      attackerSlot: command.attackerSlot,
      target: command.target,
      ...(command.targetSlot === undefined ? {} : { targetSlot: command.targetSlot }),
      priorityPlayerId: opponentId(next, player.id),
      consecutivePasses: 0,
      stage: 'response',
    };
    const sealedBlade = attacker.attached?.find((item) => item.cardId === 'BP01-023');
    const sealedBladeUsed = next.abilityUsage.some((usage) => usage.sourceInstanceId === sealedBlade?.instanceId
      && usage.effectId === 'sealed-blade-attack' && usage.turn === next.turn);
    const restable = player.field.find((fieldCard) => fieldCard && fieldCard.instanceId !== attacker.instanceId && !fieldCard.rested);
    if (sealedBlade && definitionFor(next, attacker.cardId).name.includes('深红囚影') && !sealedBladeUsed && restable) {
      restable.rested = true;
      next.pendingAttack.maxBlockerPpExclusive = 4000;
      next.abilityUsage.push({ sourceInstanceId: sealedBlade.instanceId, effectId: 'sealed-blade-attack', playerId: player.id, turn: next.turn, count: 1 });
    }
    addEvent(next, 'attack-declared', player.id, `${player.id} 宣言攻击`);
    const attackEffects = definitionFor(next, attacker.cardId).structuredEffects?.filter((effect) =>
      effect.ability === 'automatic' && effect.trigger?.event === 'attack-declared') ?? [];
    enqueueEffects(next, { controllerId: player.id, sourceInstanceId: attacker.instanceId }, attackEffects);
    continueEffectResolution(next, rng);
  } else if (command.type === 'BLOCK' && next.pendingAttack?.priorityPlayerId === command.playerId && command.playerId !== next.activePlayerId) {
    const blocker = player.field[command.blockerSlot];
    if (!blocker || blocker.rested) return reject(state, 'ILLEGAL_ACTION', '该角色不能阻挡');
    if (next.pendingAttack.maxBlockerPpExclusive !== undefined && effectivePp(next, blocker) <= next.pendingAttack.maxBlockerPpExclusive) {
      return reject(state, 'ILLEGAL_ACTION', '该角色的 PP 不足以阻挡本次攻击');
    }
    blocker.rested = true;
    next.pendingAttack.blockerSlot = command.blockerSlot;
    next.pendingAttack.priorityPlayerId = next.activePlayerId;
    next.pendingAttack.consecutivePasses = 0;
    addEvent(next, 'block', player.id, `${player.id} 进行了阻挡`);
  } else if (command.type === 'PASS_RESPONSE' && next.pendingAttack?.priorityPlayerId === command.playerId) {
    next.pendingAttack.consecutivePasses += 1;
    next.pendingAttack.priorityPlayerId = opponentId(next, command.playerId);
    if (next.pendingAttack.consecutivePasses >= 2) resolveAttack(next, rng);
  } else if (command.type === 'PASS_RESPONSE' && next.priorityWindow?.priorityPlayerId === command.playerId) {
    next.priorityWindow.consecutivePasses += 1;
    next.priorityWindow.priorityPlayerId = opponentId(next, command.playerId);
    if (next.priorityWindow.consecutivePasses >= 2) finishTurn(next, next.activePlayerId);
  } else if (command.type === 'END_PHASE' && next.phase === 'main' && next.activePlayerId === command.playerId && !next.pendingAttack) {
    next.phase = 'end';
    next.priorityWindow = { kind: 'end-phase', priorityPlayerId: command.playerId, consecutivePasses: 0 };
    addEvent(next, 'end-phase-window', command.playerId, `${command.playerId} 进入结束阶段瞬时窗口`);
  } else {
    return reject(state, 'ILLEGAL_ACTION', '该操作当前不可执行');
  }

  next.version += 1;
  next.processedCommandIds.push(command.commandId);
  if (!next.pendingProcessing && !next.pendingDecision) checkDefeat(next);
  return {
    accepted: true,
    state: next,
    legalActions: getLegalActions(next, command.playerId),
    emittedEvents: next.events.slice(emittedBefore),
  };
};

export type { GameCommand, GameResult, GameState, PlayerView } from '@pgr/protocol';
