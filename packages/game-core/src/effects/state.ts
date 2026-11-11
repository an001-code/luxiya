import type {
  CardDefinition,
  CardInstance,
  EffectCardFilter,
  EffectFrame,
  EffectZone,
  EffectTarget,
  GameCommand,
  GameState,
  PendingDecision,
  PlayerId,
  StructuredEffect,
} from '@pgr/protocol';

export interface StartEffectResolutionInput {
  controllerId: PlayerId;
  sourceInstanceId: string;
  effect: StructuredEffect;
}

type DecisionCommand = Extract<GameCommand, { type: 'RESOLVE_EFFECT_DECISION' }>;

export type DecisionResolution =
  | { accepted: true; state: GameState }
  | { accepted: false; code: 'NOT_YOUR_ACTION' | 'ILLEGAL_ACTION'; message: string };

const otherPlayerId = (state: GameState, playerId: PlayerId): PlayerId =>
  state.playerOrder.find((id) => id !== playerId) ?? state.playerOrder[0];

const cardsInZone = (state: GameState, playerId: PlayerId, zone: EffectZone): CardInstance[] => {
  const player = state.players[playerId]!;
  if (zone === 'field') return player.field.filter((card): card is CardInstance => card !== null);
  if (zone === 'deck' || zone === 'hand' || zone === 'graveyard' || zone === 'processing' || zone === 'signals' || zone === 'energy') {
    return player[zone];
  }
  return [];
};

const matchesFilter = (card: CardInstance, definition: CardDefinition, filter: EffectCardFilter | undefined): boolean => {
  if (!filter) return true;
  if (filter.types && !filter.types.includes(definition.type)) return false;
  if (filter.subtypes && (!definition.subtype || !filter.subtypes.includes(definition.subtype))) return false;
  if (filter.names && !filter.names.includes(definition.name)) return false;
  if (filter.traits && !filter.traits.some((trait) => definition.traits.includes(trait))) return false;
  if (filter.attributes && !filter.attributes.includes(definition.attribute)) return false;
  if (filter.signals && (!definition.signal || !filter.signals.includes(definition.signal))) return false;
  if (filter.minCost !== undefined && definition.cost < filter.minCost) return false;
  if (filter.maxCost !== undefined && definition.cost > filter.maxCost) return false;
  if (filter.minPp !== undefined && (definition.pp ?? 0) < filter.minPp) return false;
  if (filter.maxPp !== undefined && (definition.pp ?? 0) > filter.maxPp) return false;
  if (filter.rested !== undefined && card.rested !== filter.rested) return false;
  if (filter.face !== undefined && card.face !== filter.face) return false;
  return true;
};

const targetPlayerId = (state: GameState, frame: EffectFrame, target: EffectTarget): PlayerId =>
  target.player === 'self' ? frame.controllerId : otherPlayerId(state, frame.controllerId);

const makeDecision = (state: GameState, frame: EffectFrame, target: Extract<EffectTarget, { kind: 'cards' }>): PendingDecision => {
  const playerId = targetPlayerId(state, frame, target);
  const cards = cardsInZone(state, playerId, target.zone).filter((card) => {
    const definition = state.cardDefinitions[card.cardId];
    return Boolean(definition && matchesFilter(card, definition, target.filter));
  });
  return {
    id: `${frame.id}:target:${target.id}:${frame.targetIndex}`,
    frameId: frame.id,
    playerId: frame.controllerId,
    kind: target.ordered ? 'order-cards' : 'select-cards',
    purpose: 'target',
    prompt: target.prompt ?? `请选择 ${target.min}-${target.max} 张卡牌`,
    min: target.min,
    max: target.max,
    targetId: target.id,
    options: cards.map((card) => ({
      id: card.instanceId,
      instanceId: card.instanceId,
      cardId: playerId === frame.controllerId
        || (target.zone !== 'hand' && target.zone !== 'deck' && !(target.zone === 'energy' && card.face === 'down'))
        ? card.cardId
        : null,
      label: playerId === frame.controllerId
        || (target.zone !== 'hand' && target.zone !== 'deck' && !(target.zone === 'energy' && card.face === 'down'))
        ? state.cardDefinitions[card.cardId]?.name ?? card.cardId
        : '隐藏卡牌',
    })),
  };
};

export const advanceEffectFrameTargets = (state: GameState, frame: EffectFrame): void => {
  while (frame.targetIndex < frame.effect.targets.length) {
    const target = frame.effect.targets[frame.targetIndex]!;
    if (target.kind === 'player') {
      frame.selectedTargets[target.id] = [targetPlayerId(state, frame, target)];
      frame.targetIndex += 1;
      continue;
    }
    const decision = makeDecision(state, frame, target);
    if (decision.options.length < target.min) {
      frame.cancelled = true;
      frame.stage = 'actions';
      frame.status = 'resolving';
      state.pendingDecision = null;
      return;
    }
    if (decision.options.length === 0 && target.min === 0) {
      frame.selectedTargets[target.id] = [];
      frame.targetIndex += 1;
      continue;
    }
    if (!target.optional && target.min === target.max && decision.options.length === target.min) {
      frame.selectedTargets[target.id] = decision.options.flatMap((option) => option.instanceId ? [option.instanceId] : []);
      frame.targetIndex += 1;
      continue;
    }
    frame.status = 'waiting-for-decision';
    state.pendingDecision = decision;
    return;
  }
  frame.status = 'resolving';
  frame.stage = 'costs';
  state.pendingDecision = null;
};

export const startEffectResolution = (state: GameState, input: StartEffectResolutionInput): GameState => {
  const next = structuredClone(state);
  const frame = createEffectFrame(next, input);
  next.effectStack.push(frame);
  advanceEffectFrameTargets(next, frame);
  return next;
};

export const createEffectFrame = (state: GameState, input: StartEffectResolutionInput): EffectFrame => ({
  id: `effect-${state.turn}-${state.effectStack.length + 1}-${input.effect.id}`,
  sourceInstanceId: input.sourceInstanceId,
  controllerId: input.controllerId,
  effect: structuredClone(input.effect),
  status: 'resolving',
  stage: 'targets',
  targetIndex: 0,
  costIndex: 0,
  costsPaid: false,
  actionIndex: 0,
  selectedTargets: {},
});

export const resolveEffectDecision = (state: GameState, command: DecisionCommand): DecisionResolution => {
  const decision = state.pendingDecision;
  if (!decision || decision.id !== command.decisionId) {
    return { accepted: false, code: 'ILLEGAL_ACTION', message: '该效果选择已失效' };
  }
  if (decision.playerId !== command.playerId) {
    return { accepted: false, code: 'NOT_YOUR_ACTION', message: '当前效果选择不属于该玩家' };
  }
  const selectedIds = command.selectedInstanceIds;
  if (new Set(selectedIds).size !== selectedIds.length
    || selectedIds.length < decision.min
    || selectedIds.length > decision.max
    || selectedIds.some((id) => !decision.options.some((option) => option.instanceId === id))) {
    return { accepted: false, code: 'ILLEGAL_ACTION', message: '效果目标选择不合法' };
  }
  if (decision.kind === 'choose-option' && (!command.optionId || !decision.options.some((option) => option.id === command.optionId))) {
    return { accepted: false, code: 'ILLEGAL_ACTION', message: '效果选项不合法' };
  }

  const next = structuredClone(state);
  const current = next.pendingDecision!;
  const frame = next.effectStack.find((candidate) => candidate.id === current.frameId);
  if (!frame) return { accepted: false, code: 'ILLEGAL_ACTION', message: '效果结算帧不存在' };
  if (current.targetId) frame.selectedTargets[current.targetId] = [...selectedIds];
  if (command.optionId) frame.selectedOptionId = command.optionId;
  next.pendingDecision = null;
  frame.status = 'resolving';
  if (current.purpose === 'target') {
    frame.targetIndex += 1;
    advanceEffectFrameTargets(next, frame);
  } else if (current.purpose === 'cost') {
    frame.costIndex += 1;
  }
  return { accepted: true, state: next };
};
