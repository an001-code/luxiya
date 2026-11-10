import type {
  CardInstance,
  EffectAction,
  EffectCost,
  EffectFrame,
  EffectValue,
  EffectZone,
  GameState,
  PendingDecision,
  PlayerId,
  StructuredEffect,
} from '@pgr/protocol';
import { advanceEffectFrameTargets, createEffectFrame } from './state.js';
import { executeCurrentCardCustomAction } from './current-card-handlers.js';
import {
  cardsInZone,
  effectPlayerId,
  locateCard,
  matchesCardFilter,
  removeLocatedCard,
} from './selectors.js';

export type EffectRng = () => number;

export interface EffectSource {
  controllerId: PlayerId;
  sourceInstanceId: string;
}

const shuffle = <T>(items: T[], rng: EffectRng): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
};

const drawOne = (state: GameState, playerId: PlayerId, rng: EffectRng): void => {
  const player = state.players[playerId]!;
  if (player.deck.length === 0 && player.graveyard.length > 0) {
    player.deck = shuffle(player.graveyard.splice(0).map((card) => ({ ...card, face: 'down' as const, rested: false })), rng);
    player.corruption += 1;
  }
  const card = player.deck.shift();
  if (card) player.hand.push({ ...card, face: 'up' });
};

const sourceDefinition = (state: GameState, frame: EffectFrame) => {
  const source = locateCard(state, frame.sourceInstanceId)?.card;
  return source ? state.cardDefinitions[source.cardId] : undefined;
};

const effectValue = (state: GameState, frame: EffectFrame, value: EffectValue): number => {
  if (value.kind === 'fixed') return value.value;
  if (value.kind === 'selected-count') return (frame.selectedTargets[value.targetId]?.length ?? 0) * (value.multiplier ?? 1);
  const definition = sourceDefinition(state, frame);
  if (value.stat === 'pp') return definition?.pp ?? 0;
  if (value.stat === 'dp') return definition?.dp ?? 0;
  return 0;
};

const targetCards = (state: GameState, frame: EffectFrame, targetId: string): CardInstance[] =>
  (targetId === 'source' ? [frame.sourceInstanceId] : frame.selectedTargets[targetId] ?? []).flatMap((instanceId) => {
    const located = locateCard(state, instanceId);
    return located ? [located.card] : [];
  });

const discardCandidates = (state: GameState, frame: EffectFrame, cost: Extract<EffectCost, { kind: 'discard' }>): CardInstance[] => {
  const playerId = effectPlayerId(state, frame.controllerId, cost.player);
  return state.players[playerId]!.hand.filter((card) => {
    const definition = state.cardDefinitions[card.cardId];
    return Boolean(definition && matchesCardFilter(card, definition, cost.filter));
  });
};

const sourceOrTargets = (state: GameState, frame: EffectFrame, target: 'source' | string): CardInstance[] => {
  if (target === 'source') {
    const located = locateCard(state, frame.sourceInstanceId);
    return located ? [located.card] : [];
  }
  return targetCards(state, frame, target);
};

const energyCandidates = (state: GameState, frame: EffectFrame): CardInstance[] =>
  state.players[frame.controllerId]!.energy.filter((card) => !card.rested);

const signalCandidates = (state: GameState, frame: EffectFrame, cost: Extract<EffectCost, { kind: 'eliminate-signals' }>): CardInstance[] => {
  const signals = state.players[frame.controllerId]!.signals;
  return signals.filter((card) => {
    if (!cost.color || cost.color === 'any') return true;
    return state.cardDefinitions[card.cardId]?.signal === cost.color;
  });
};

const staticCostAffordable = (state: GameState, frame: EffectFrame, cost: EffectCost): boolean => {
  if (cost.kind === 'discard') return discardCandidates(state, frame, cost).length >= effectValue(state, frame, cost.amount);
  if (cost.kind === 'rest') {
    const cards = sourceOrTargets(state, frame, cost.target);
    return cards.length > 0 && cards.every((card) => !card.rested);
  }
  if (cost.kind === 'pay-energy') return energyCandidates(state, frame).length >= effectValue(state, frame, cost.amount);
  if (cost.kind === 'eliminate-signals') return signalCandidates(state, frame, cost).length >= effectValue(state, frame, cost.amount);
  if (cost.kind === 'move-card') return targetCards(state, frame, cost.targetId).length > 0;
  return false;
};

const decisionForCards = (
  state: GameState,
  frame: EffectFrame,
  index: number,
  cards: CardInstance[],
  amount: number,
  prompt: string,
): PendingDecision => ({
  id: `${frame.id}:cost:${index}`,
  frameId: frame.id,
  playerId: frame.controllerId,
  kind: 'select-cards',
  purpose: 'cost',
  prompt,
  min: frame.effect.optional ? 0 : amount,
  max: amount,
  targetId: `cost:${index}`,
  options: cards.map((card) => ({
    id: card.instanceId,
    instanceId: card.instanceId,
    cardId: card.cardId,
    label: state.cardDefinitions[card.cardId]?.name ?? card.cardId,
  })),
});

const planCosts = (state: GameState, frame: EffectFrame): boolean => {
  if (!frame.effect.costs.every((cost) => staticCostAffordable(state, frame, cost))) {
    frame.cancelled = true;
    return true;
  }
  while (frame.costIndex < frame.effect.costs.length) {
    const index = frame.costIndex;
    const cost = frame.effect.costs[index]!;
    let cards: CardInstance[] | null = null;
    let amount = 0;
    let prompt = '请选择要支付的卡牌';
    if (cost.kind === 'discard') {
      cards = discardCandidates(state, frame, cost);
      amount = effectValue(state, frame, cost.amount);
      prompt = `请选择 ${amount} 张要丢弃的手牌`;
    } else if (cost.kind === 'pay-energy') {
      cards = energyCandidates(state, frame);
      amount = effectValue(state, frame, cost.amount);
      prompt = `请选择 ${amount} 张费用牌`;
    } else if (cost.kind === 'eliminate-signals') {
      cards = signalCandidates(state, frame, cost);
      amount = effectValue(state, frame, cost.amount);
      prompt = `请选择 ${amount} 张要消除的信号球`;
    }
    if (cards) {
      const key = `cost:${index}`;
      if (!frame.selectedTargets[key]) {
        if (!frame.effect.optional && cards.length === amount) {
          frame.selectedTargets[key] = cards.map((card) => card.instanceId);
          frame.costIndex += 1;
          continue;
        }
        frame.status = 'waiting-for-decision';
        state.pendingDecision = decisionForCards(state, frame, index, cards, amount, prompt);
        return false;
      }
    }
    frame.costIndex += 1;
  }
  return true;
};

const selectedCostCards = (state: GameState, frame: EffectFrame, index: number): CardInstance[] =>
  (frame.selectedTargets[`cost:${index}`] ?? []).flatMap((id) => {
    const located = locateCard(state, id);
    return located ? [located.card] : [];
  });

const costsStillPayable = (state: GameState, frame: EffectFrame): boolean => frame.effect.costs.every((cost, index) => {
  if (!staticCostAffordable(state, frame, cost)) return false;
  if (cost.kind === 'discard' || cost.kind === 'pay-energy' || cost.kind === 'eliminate-signals') {
    const amount = effectValue(state, frame, cost.amount);
    return selectedCostCards(state, frame, index).length === amount;
  }
  return true;
});

const moveToZone = (state: GameState, card: CardInstance, playerId: PlayerId, zone: EffectZone, position: 'top' | 'bottom' = 'bottom'): boolean => {
  const player = state.players[playerId]!;
  if (zone === 'field') {
    const slot = player.field.findIndex((item) => item === null);
    if (slot < 0) return false;
    player.field[slot] = card;
    return true;
  }
  const destination = player[zone];
  if (zone === 'hand') card.face = 'up';
  if (zone === 'deck') card.face = 'down';
  if (position === 'top') destination.unshift(card);
  else destination.push(card);
  return true;
};

const payCosts = (state: GameState, frame: EffectFrame): void => {
  frame.effect.costs.forEach((cost, index) => {
    if (cost.kind === 'discard') {
      for (const card of selectedCostCards(state, frame, index)) {
        const located = locateCard(state, card.instanceId);
        if (located) state.players[located.playerId]!.graveyard.push(removeLocatedCard(state, located)!);
      }
    } else if (cost.kind === 'rest') {
      for (const card of sourceOrTargets(state, frame, cost.target)) card.rested = true;
    } else if (cost.kind === 'pay-energy') {
      for (const card of selectedCostCards(state, frame, index)) card.rested = true;
    } else if (cost.kind === 'eliminate-signals') {
      for (const card of selectedCostCards(state, frame, index)) {
        const located = locateCard(state, card.instanceId);
        if (located) state.players[located.playerId]!.graveyard.push(removeLocatedCard(state, located)!);
      }
    } else if (cost.kind === 'move-card') {
      for (const card of targetCards(state, frame, cost.targetId)) {
        const located = locateCard(state, card.instanceId);
        if (located) moveToZone(state, removeLocatedCard(state, located)!, located.playerId, cost.to);
      }
    }
  });
  frame.costsPaid = true;
  frame.stage = 'actions';
};

const addModifier = (
  state: GameState,
  frame: EffectFrame,
  action: Extract<EffectAction, { kind: 'modify-stat' | 'signal-as' }>,
  value: number | string,
): void => {
  state.continuousModifiers.push({
    id: `${frame.id}:modifier:${frame.actionIndex}:${state.continuousModifiers.length + 1}`,
    sourceInstanceId: frame.sourceInstanceId,
    controllerId: frame.controllerId,
    kind: action.kind === 'modify-stat' ? 'stat' : 'signal-as',
    targetInstanceIds: action.targetId === 'source'
      ? [frame.sourceInstanceId]
      : [...(frame.selectedTargets[action.targetId] ?? [])],
    value,
    ...(action.kind === 'modify-stat' ? { stat: action.stat, operation: action.operation } : { count: action.count }),
    duration: action.duration,
    createdTurn: state.turn,
  });
};

const executeAction = (state: GameState, frame: EffectFrame, action: EffectAction, rng: EffectRng): boolean => {
  if (action.kind === 'draw') {
    const playerId = effectPlayerId(state, frame.controllerId, action.player);
    for (let count = effectValue(state, frame, action.amount); count > 0; count -= 1) drawOne(state, playerId, rng);
  } else if (action.kind === 'discard') {
    for (const card of targetCards(state, frame, action.targetId)) {
      const located = locateCard(state, card.instanceId);
      if (located) state.players[located.playerId]!.graveyard.push(removeLocatedCard(state, located)!);
    }
  } else if (action.kind === 'modify-stat') {
    addModifier(state, frame, action, effectValue(state, frame, action.value));
  } else if (action.kind === 'move-card') {
    for (const card of targetCards(state, frame, action.targetId)) {
      const located = locateCard(state, card.instanceId);
      if (!located) continue;
      const moved = removeLocatedCard(state, located)!;
      if (action.face) moved.face = action.face;
      if (action.rested !== undefined) moved.rested = action.rested;
      moveToZone(state, moved, located.playerId, action.to, action.position);
    }
  } else if (action.kind === 'rest' || action.kind === 'upright') {
    for (const card of targetCards(state, frame, action.targetId)) card.rested = action.kind === 'rest';
  } else if (action.kind === 'freeze') {
    for (const card of targetCards(state, frame, action.targetId)) card.frozen = true;
  } else if (action.kind === 'modify-corruption') {
    const player = state.players[effectPlayerId(state, frame.controllerId, action.player)]!;
    const before = player.corruption;
    const value = effectValue(state, frame, action.value);
    if (action.operation === 'set') player.corruption = value;
    else if (action.operation === 'add') player.corruption += value;
    else player.corruption = Math.max(0, player.corruption - value);
    if (player.corruption !== before) state.events.push({
      id: state.events.length + 1,
      type: 'corruption-changed',
      playerId: player.id,
      message: `${player.id} 的侵蚀变为 ${player.corruption}`,
      public: true,
      createdAtTurn: state.turn,
    });
  } else if (action.kind === 'signal-as') {
    addModifier(state, frame, action, action.color);
  } else if (action.kind === 'choose') {
    if (!frame.selectedOptionId) {
      frame.status = 'waiting-for-decision';
      state.pendingDecision = {
        id: `${frame.id}:choice:${frame.actionIndex}`,
        frameId: frame.id,
        playerId: frame.controllerId,
        kind: 'choose-option',
        purpose: 'choice',
        prompt: '请选择一项效果',
        min: 0,
        max: 0,
        options: action.options.map((option) => ({ id: option.id, label: option.label })),
      };
      return false;
    }
    const option = action.options.find((candidate) => candidate.id === frame.selectedOptionId);
    if (option && conditionListMet(state, frame, option.conditions ?? [])) {
      for (const nested of option.actions) executeAction(state, frame, nested, rng);
    }
    delete frame.selectedOptionId;
  } else if (action.kind === 'custom') {
    if (executeCurrentCardCustomAction(state, frame, action.customHandlerId) === 'waiting') return false;
  }
  return true;
};

const conditionListMet = (state: GameState, frame: EffectFrame, conditions: StructuredEffect['conditions']): boolean => conditions.every((condition) => {
  if (condition.kind === 'controller-has-card') {
    const playerId = effectPlayerId(state, frame.controllerId, condition.player);
    const matches = cardsInZone(state, playerId, condition.zone).filter((card) => {
      const definition = state.cardDefinitions[card.cardId];
      return Boolean(definition && matchesCardFilter(card, definition, condition.filter));
    });
    return matches.length >= condition.min;
  }
  if (condition.kind === 'corruption-compare') {
    const left = state.players[effectPlayerId(state, frame.controllerId, condition.left)]!.corruption;
    const right = state.players[effectPlayerId(state, frame.controllerId, condition.right)]!.corruption;
    if (condition.operator === 'lt') return left < right;
    if (condition.operator === 'lte') return left <= right;
    if (condition.operator === 'eq') return left === right;
    if (condition.operator === 'gte') return left >= right;
    return left > right;
  }
  if (condition.kind === 'turn-event') {
    const playerId = effectPlayerId(state, frame.controllerId, condition.player);
    const eventTypes = condition.event === 'corruption-changed' ? ['damage', 'deck-refresh', 'corruption-changed'] : [condition.event];
    return state.events.some((gameEvent) => gameEvent.createdAtTurn === state.turn
      && gameEvent.playerId === playerId && eventTypes.includes(gameEvent.type));
  }
  if (condition.kind === 'source-attached') return false;
  return false;
});

const conditionsMet = (state: GameState, frame: EffectFrame): boolean => conditionListMet(state, frame, frame.effect.conditions);

export const enqueueEffects = (state: GameState, source: EffectSource, effects: StructuredEffect[]): void => {
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const frame = createEffectFrame(state, {
      controllerId: source.controllerId,
      sourceInstanceId: source.sourceInstanceId,
      effect: effects[index]!,
    });
    if (conditionsMet(state, frame)) state.effectStack.push(frame);
  }
};

export const continueEffectResolution = (state: GameState, rng: EffectRng): void => {
  while (!state.pendingDecision && state.effectStack.length > 0) {
    const frame = state.effectStack.at(-1)!;
    if (frame.cancelled) {
      state.effectStack.pop();
      continue;
    }
    if (frame.stage === 'targets') {
      advanceEffectFrameTargets(state, frame);
      continue;
    }
    if (frame.stage === 'costs') {
      if (!planCosts(state, frame)) return;
      if (frame.cancelled) continue;
      const optionalCancelled = frame.effect.optional && frame.effect.costs.some((cost, index) =>
        (cost.kind === 'discard' || cost.kind === 'pay-energy' || cost.kind === 'eliminate-signals')
        && selectedCostCards(state, frame, index).length < effectValue(state, frame, cost.amount));
      if (optionalCancelled || !costsStillPayable(state, frame)) {
        frame.cancelled = true;
        continue;
      }
      payCosts(state, frame);
      continue;
    }
    if (frame.actionIndex >= frame.effect.actions.length) {
      state.continuousModifiers = state.continuousModifiers.filter((modifier) =>
        !(modifier.sourceInstanceId === frame.sourceInstanceId && modifier.duration.kind === 'instant'));
      state.effectStack.pop();
      continue;
    }
    const action = frame.effect.actions[frame.actionIndex]!;
    if (!executeAction(state, frame, action, rng)) return;
    frame.actionIndex += 1;
  }
};
