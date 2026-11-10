import type { EffectChoiceOption, StructuredEffect } from '@pgr/protocol';

const event = (eventName: NonNullable<StructuredEffect['trigger']>['event']) => ({ kind: 'event' as const, event: eventName });
const fixed = (value: number) => ({ kind: 'fixed' as const, value });
const turn = { kind: 'turn' as const };
const permanent = { kind: 'permanent' as const };

const signalDraw: StructuredEffect = {
  id: 'signal-draw', sourceEffectId: 'signal_draw', ability: 'automatic', trigger: event('card-used'),
  conditions: [], costs: [], targets: [],
  actions: [{ kind: 'draw', player: 'self', amount: fixed(1) }],
};

const chargeChoice = (id: string, sourceEffectId: string, options: EffectChoiceOption[]): StructuredEffect => ({
  id, sourceEffectId, ability: 'charge', trigger: event('attack-charge'),
  conditions: [], costs: [], targets: [],
  actions: [{ kind: 'choose', options }],
});

const equipmentPp: StructuredEffect = {
  id: 'equipment-pp', sourceEffectId: 'equipment_pp', ability: 'permanent',
  conditions: [], costs: [], targets: [],
  actions: [{
    kind: 'modify-stat', targetId: 'equipped-character', stat: 'pp', operation: 'add',
    value: { kind: 'source-stat', stat: 'pp' }, duration: permanent,
  }],
  duration: permanent,
};

export const currentCardEffects: Record<string, StructuredEffect[]> = {
  'ST01-005': [
    {
      id: 'red-lotus-enter-draw', sourceEffectId: 'enter_draw_discard', ability: 'enter', trigger: event('card-entered'),
      conditions: [], costs: [], targets: [], actions: [{ kind: 'draw', player: 'self', amount: fixed(1) }],
    },
    {
      id: 'red-lotus-enter-discard', sourceEffectId: 'enter_draw_discard', ability: 'enter', trigger: event('card-entered'),
      conditions: [], costs: [],
      targets: [{ id: 'discarded', kind: 'cards', player: 'self', zone: 'hand', min: 1, max: 1 }],
      actions: [{ kind: 'discard', targetId: 'discarded' }],
    },
  ],
  'ST01-004': [{
    id: 'red-lotus-charge-zero', sourceEffectId: 'charge_zero', ability: 'permanent',
    conditions: [], costs: [], targets: [],
    actions: [{ kind: 'modify-stat', targetId: 'source', stat: 'charge', operation: 'set', value: fixed(0), duration: permanent }],
    duration: permanent,
  }],
  'BP01-079': [signalDraw, chargeChoice('red-signal-charge-choice', 'charge_choice_red', [
    { id: 'dp-plus-one', label: '攻击角色 DP+1', actions: [{ kind: 'modify-stat', targetId: 'source', stat: 'dp', operation: 'add', value: fixed(1), duration: { kind: 'attack' } }] },
    { id: 'pp-plus-2000', label: '攻击角色 PP+2000', actions: [{ kind: 'modify-stat', targetId: 'source', stat: 'pp', operation: 'add', value: fixed(2000), duration: { kind: 'attack' } }] },
  ])],
  'BP01-080': [signalDraw, chargeChoice('red-signal-charge-choice-2', 'charge_choice_red', [
    { id: 'dp-plus-one', label: '攻击角色 DP+1', actions: [{ kind: 'modify-stat', targetId: 'source', stat: 'dp', operation: 'add', value: fixed(1), duration: { kind: 'attack' } }] },
    { id: 'pp-plus-2000', label: '攻击角色 PP+2000', actions: [{ kind: 'modify-stat', targetId: 'source', stat: 'pp', operation: 'add', value: fixed(2000), duration: { kind: 'attack' } }] },
  ])],
  'BP01-081': [signalDraw, chargeChoice('blue-signal-charge-choice', 'charge_choice_blue', [
    { id: 'draw-one', label: '抽 1 张牌', actions: [{ kind: 'draw', player: 'self', amount: fixed(1) }] },
    { id: 'pp-plus-2000', label: '攻击角色 PP+2000', actions: [{ kind: 'modify-stat', targetId: 'source', stat: 'pp', operation: 'add', value: fixed(2000), duration: { kind: 'attack' } }] },
  ])],
  'BP01-084': [signalDraw, chargeChoice('yellow-signal-charge-choice', 'charge_choice_yellow', [
    { id: 'corruption-minus-one', label: '若侵蚀不低于对方，侵蚀-1', conditions: [{ kind: 'corruption-compare', left: 'self', operator: 'gte', right: 'opponent' }], actions: [{ kind: 'modify-corruption', player: 'self', operation: 'subtract', value: fixed(1) }] },
    { id: 'pp-plus-2000', label: '攻击角色 PP+2000', actions: [{ kind: 'modify-stat', targetId: 'source', stat: 'pp', operation: 'add', value: fixed(2000), duration: { kind: 'attack' } }] },
  ])],
  'BP01-007': [{
    id: 'instant-gray-raven-boost', sourceEffectId: 'instant_pp_boost', ability: 'instant',
    conditions: [], costs: [],
    targets: [
      { id: 'boosted', kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1, filter: { types: ['character'], traits: ['灰鸦小队'] } },
      { id: 'extra-discard', kind: 'cards', player: 'self', zone: 'hand', min: 0, max: 99, optional: true },
    ],
    actions: [
      { kind: 'discard', targetId: 'extra-discard' },
      { kind: 'modify-stat', targetId: 'boosted', stat: 'pp', operation: 'add', value: fixed(1500), duration: turn },
      { kind: 'modify-stat', targetId: 'boosted', stat: 'pp', operation: 'add', value: { kind: 'selected-count', targetId: 'extra-discard', multiplier: 1000 }, duration: turn },
    ],
  }],
  'BP01-011': [equipmentPp, {
    id: 'corruption-changed-draw', sourceEffectId: 'corruption_draw', ability: 'enter', trigger: event('card-entered'),
    conditions: [{ kind: 'turn-event', event: 'corruption-changed', player: 'self' }],
    costs: [], targets: [], actions: [{ kind: 'draw', player: 'self', amount: fixed(1) }],
  }],
  'BP01-023': [equipmentPp],
};

export const effectsForCurrentCard = (cardId: string): StructuredEffect[] | undefined =>
  currentCardEffects[cardId]?.map((effect) => structuredClone(effect));
