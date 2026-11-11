import type { Attribute, CardSubtype, CardType, SignalColor } from './index.js';

export type EffectAbility = 'permanent' | 'automatic' | 'activated' | 'enter' | 'instant' | 'charge';
export type EffectPlayer = 'self' | 'opponent';
export type EffectZone = 'deck' | 'hand' | 'graveyard' | 'processing' | 'field' | 'signals' | 'energy';
export type EffectEvent = 'card-used' | 'card-entered' | 'card-left' | 'attack-declared' | 'attack-charge'
  | 'damage-charge' | 'corruption-changed' | 'turn-start' | 'turn-end' | 'card-moved-to-processing';

export type EffectValue =
  | { kind: 'fixed'; value: number }
  | { kind: 'selected-count'; targetId: string; multiplier?: number }
  | { kind: 'source-stat'; stat: 'pp' | 'dp' | 'charge' };

export interface EffectCardFilter {
  types?: CardType[];
  subtypes?: CardSubtype[];
  names?: string[];
  traits?: string[];
  attributes?: Attribute[];
  signals?: SignalColor[];
  minCost?: number;
  maxCost?: number;
  minPp?: number;
  maxPp?: number;
  rested?: boolean;
  face?: 'up' | 'down';
}

export interface EffectTrigger { kind: 'event'; event: EffectEvent }

export type EffectCondition =
  | { kind: 'controller-has-card'; player: EffectPlayer; zone: EffectZone; filter: EffectCardFilter; min: number }
  | { kind: 'source-attached'; filter: EffectCardFilter }
  | { kind: 'corruption-compare'; left: EffectPlayer; operator: 'lt' | 'lte' | 'eq' | 'gte' | 'gt'; right: EffectPlayer }
  | { kind: 'turn-event'; event: EffectEvent; player: EffectPlayer }
  | { kind: 'custom'; customHandlerId: string };

export type EffectCost =
  | { kind: 'discard'; player: EffectPlayer; amount: EffectValue; filter?: EffectCardFilter }
  | { kind: 'rest'; target: 'source' | string }
  | { kind: 'pay-energy'; amount: EffectValue }
  | { kind: 'eliminate-signals'; amount: EffectValue; color?: SignalColor | 'any'; adjacent: boolean }
  | { kind: 'move-card'; targetId: string; to: EffectZone }
  | { kind: 'custom'; customHandlerId: string };

export type EffectTarget =
  | { id: string; kind: 'player'; player: EffectPlayer; min: number; max: number; optional?: boolean }
  | { id: string; kind: 'cards'; player: EffectPlayer; zone: EffectZone; min: number; max: number; prompt?: string | undefined; optional?: boolean; ordered?: boolean; filter?: EffectCardFilter };

export type EffectDuration =
  | { kind: 'instant' }
  | { kind: 'attack' }
  | { kind: 'turn' }
  | { kind: 'next-turn' }
  | { kind: 'permanent' };

export interface EffectChoiceOption { id: string; label: string; conditions?: EffectCondition[]; actions: EffectAction[] }

export type EffectAction =
  | { kind: 'draw'; player: EffectPlayer; amount: EffectValue }
  | { kind: 'discard'; targetId: string }
  | { kind: 'modify-stat'; targetId: string; stat: 'pp' | 'dp' | 'charge'; operation: 'add' | 'set'; value: EffectValue; duration: EffectDuration }
  | { kind: 'move-card'; targetId: string; to: EffectZone; position?: 'top' | 'bottom'; rested?: boolean; face?: 'up' | 'down' }
  | { kind: 'rest'; targetId: string }
  | { kind: 'upright'; targetId: string }
  | { kind: 'freeze'; targetId: string }
  | { kind: 'modify-corruption'; player: EffectPlayer; operation: 'add' | 'subtract' | 'set'; value: EffectValue }
  | { kind: 'signal-as'; targetId: string; color: SignalColor; count: number; duration: EffectDuration }
  | { kind: 'search'; player: EffectPlayer; count: number; filter: EffectCardFilter; destination: EffectZone; remainder: 'shuffle' | 'deck-bottom' }
  | { kind: 'play'; targetId: string; ignoreCost: boolean }
  | { kind: 'equip'; targetId: string; sourceTargetId: string }
  | { kind: 'choose'; options: EffectChoiceOption[] }
  | { kind: 'custom'; customHandlerId: string };

export interface StructuredEffect {
  id: string;
  sourceEffectId?: string;
  ability: EffectAbility;
  trigger?: EffectTrigger;
  conditions: EffectCondition[];
  costs: EffectCost[];
  targets: EffectTarget[];
  actions: EffectAction[];
  duration?: EffectDuration;
  optional?: boolean;
  oncePerTurn?: boolean;
}
