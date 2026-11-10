import type { StructuredEffect } from '@pgr/protocol';

export interface EffectTemplate {
  id: string;
  name: string;
  description: string;
  create: (effectId: string) => StructuredEffect;
}

const base = (id: string, ability: StructuredEffect['ability']): Omit<StructuredEffect, 'actions'> => ({
  id,
  ability,
  conditions: [],
  costs: [],
  targets: [],
  duration: { kind: 'instant' },
});

export const effectTemplates: EffectTemplate[] = [
  {
    id: 'enter-draw-one',
    name: '出场抽牌',
    description: '出场时，我方抽 1 张牌。',
    create: (id) => ({ ...base(id, 'enter'), actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }] }),
  },
  {
    id: 'enter-draw-discard',
    name: '出场抽一弃一',
    description: '出场时，我方抽 1 张牌，然后选择 1 张手牌舍弃。',
    create: (id) => ({
      ...base(id, 'enter'),
      targets: [{ id: 'discard-target', kind: 'cards', player: 'self', zone: 'hand', min: 1, max: 1 }],
      actions: [
        { kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } },
        { kind: 'discard', targetId: 'discard-target' },
      ],
    }),
  },
  {
    id: 'enter-reduce-corruption',
    name: '出场降低侵蚀',
    description: '出场时，我方侵蚀度降低 1。',
    create: (id) => ({
      ...base(id, 'enter'),
      actions: [{ kind: 'modify-corruption', player: 'self', operation: 'subtract', value: { kind: 'fixed', value: 1 } }],
    }),
  },
  {
    id: 'permanent-pp-boost',
    name: '永久 PP 加成',
    description: '让指定角色永久获得 PP 加成。',
    create: (id) => ({
      ...base(id, 'permanent'),
      targets: [{ id: 'boost-target', kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1, filter: { types: ['character'] } }],
      actions: [{ kind: 'modify-stat', targetId: 'boost-target', stat: 'pp', operation: 'add', value: { kind: 'fixed', value: 1000 }, duration: { kind: 'permanent' } }],
      duration: { kind: 'permanent' },
    }),
  },
];

export const cloneTemplate = (template: EffectTemplate, effectId: string): StructuredEffect =>
  structuredClone(template.create(effectId));
