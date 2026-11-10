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
  'ST01-001': [
    {
      id: 'lucia-evolution', sourceEffectId: 'evolve_lucia', ability: 'permanent',
      conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'evolve_lucia' }], duration: permanent,
    },
    {
      id: 'gray-raven-top-five', sourceEffectId: 'enter_search_gray_raven', ability: 'enter', trigger: event('card-entered'),
      conditions: [], costs: [{ kind: 'discard', player: 'self', amount: fixed(1) }], targets: [],
      actions: [{ kind: 'custom', customHandlerId: 'search_top_five_gray_raven' }],
    },
    {
      id: 'lucia-blue-signal-activated', ability: 'activated', conditions: [], costs: [], targets: [],
      actions: [{ kind: 'custom', customHandlerId: 'lucia_blue_activated' }],
    },
  ],
  'PR-016': [
    { id: 'sealed-blade-haste', sourceEffectId: 'weapon_haste', ability: 'permanent', conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'weapon_haste' }], duration: permanent },
    { id: 'sealed-blade-leave-recovery', sourceEffectId: 'leave_recover_sealed_blade', ability: 'automatic', trigger: event('card-left'), conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'leave_recover_sealed_blade' }] },
  ],
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
  'BP01-037': [
    {
      id: 'triple-one-signal', sourceEffectId: 'triple_signal', ability: 'automatic', trigger: event('card-used'),
      conditions: [{ kind: 'controller-has-card', player: 'self', zone: 'field', filter: { names: ['曲'] }, min: 1 }],
      costs: [], targets: [{ id: 'tripled', kind: 'cards', player: 'self', zone: 'signals', min: 1, max: 1 }],
      actions: [{ kind: 'custom', customHandlerId: 'triple_signal' }],
    },
    { id: 'qu-processing-replacement', sourceEffectId: 'qu_energy_replacement', ability: 'automatic', trigger: event('card-moved-to-processing'), conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'qu_energy_replacement' }] },
  ],
  'PR-006': [{
    id: 'swap-faceup-energy', sourceEffectId: 'enter_swap_energy', ability: 'enter', trigger: event('card-entered'),
    conditions: [],
    costs: [{ kind: 'discard', player: 'self', amount: fixed(1) }],
    targets: [{ id: 'returned-energy', kind: 'cards', player: 'self', zone: 'energy', min: 1, max: 1, filter: { face: 'up' } }],
    actions: [
      { kind: 'move-card', targetId: 'returned-energy', to: 'hand', face: 'up' },
      { kind: 'custom', customHandlerId: 'charge_top_rested' },
    ],
  }],
  'PR-004': [
    {
      id: 'gray-raven-team-bonus', sourceEffectId: 'gray_raven_team_bonus', ability: 'permanent',
      conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'gray_raven_team_bonus' }], duration: permanent,
    },
    {
      id: 'reorder-signal-zone', sourceEffectId: 'enter_reorder_signals', ability: 'enter', trigger: event('card-entered'),
      conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'reorder_signals' }],
    },
  ],
  'BP03-077': [{
    id: 'attack-signal-as-blue', sourceEffectId: 'attack_blue_signal', ability: 'automatic', trigger: event('attack-declared'),
    conditions: [{ kind: 'controller-has-card', player: 'self', zone: 'field', filter: { traits: ['阿尔法'], types: ['character'] }, min: 2 }],
    costs: [],
    targets: [{ id: 'blue-signal', kind: 'cards', player: 'self', zone: 'signals', min: 1, max: 1 }],
    actions: [{ kind: 'signal-as', targetId: 'blue-signal', color: 'blue', count: 1, duration: turn }],
  }],
  'BP03-076': [{
    id: 'recover-blue-signal', sourceEffectId: 'enter_recover_blue', ability: 'enter', trigger: event('card-entered'),
    conditions: [], costs: [],
    targets: [{ id: 'recovered', kind: 'cards', player: 'self', zone: 'graveyard', min: 1, max: 1, filter: { signals: ['blue'] } }],
    actions: [{ kind: 'move-card', targetId: 'recovered', to: 'signals', position: 'top', face: 'up' }],
  }],
  'BP03-075': [
    { id: 'crimson-abyss-haste', sourceEffectId: 'haste', ability: 'permanent', conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'haste' }], duration: permanent },
    { id: 'blue-signal-cost-discount', sourceEffectId: 'blue_signal_discount', ability: 'permanent', conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'blue_signal_discount' }], duration: permanent },
  ],
  'BP03-009': [{
    id: 'floating-base-dp', sourceEffectId: 'floating_dp', ability: 'permanent',
    conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'floating_dp' }], duration: permanent,
  }],
  'BP01-011': [equipmentPp, {
    id: 'corruption-changed-draw', sourceEffectId: 'corruption_draw', ability: 'enter', trigger: event('card-entered'),
    conditions: [{ kind: 'turn-event', event: 'corruption-changed', player: 'self' }],
    costs: [], targets: [], actions: [{ kind: 'draw', player: 'self', amount: fixed(1) }],
  }],
  'BP01-023': [equipmentPp, {
    id: 'sealed-blade-attack', sourceEffectId: 'sealed_blade', ability: 'automatic', trigger: event('attack-declared'),
    conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'sealed_blade' }], oncePerTurn: true,
  }],
  'BP01-012': [{
    id: 'support-recover-signal', sourceEffectId: 'support_recover_signal', ability: 'activated',
    conditions: [],
    costs: [
      { kind: 'discard', player: 'self', amount: fixed(2), filter: { types: ['character'] } },
      { kind: 'rest', target: 'source' },
    ],
    targets: [{ id: 'recovered-signal', kind: 'cards', player: 'self', zone: 'graveyard', min: 1, max: 1, filter: { signals: ['red', 'blue', 'yellow'] } }],
    actions: [{ kind: 'move-card', targetId: 'recovered-signal', to: 'signals', position: 'top', face: 'up' }],
  }],
};

export const effectsForCurrentCard = (cardId: string): StructuredEffect[] | undefined =>
  currentCardEffects[cardId]?.map((effect) => structuredClone(effect));
