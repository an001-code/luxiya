import type { EffectAction, EffectCondition, EffectCost, StructuredEffect } from '@pgr/protocol';

export const registeredCustomEffectHandlers = new Set([
  'haste',
  'weapon_haste',
  'charge_zero',
  'charge_choice_red',
  'charge_choice_blue',
  'charge_choice_yellow',
  'enter_draw_discard',
  'enter_swap_energy',
  'enter_recover_blue',
  'corruption_draw',
  'signal_draw',
  'equipment_pp',
  'charge_top_rested',
  'gray_raven_team_bonus',
  'reorder_signals',
  'blue_signal_discount',
  'floating_dp',
]);

const customHandlerErrors = (effectId: string, nodes: Array<EffectAction | EffectCondition | EffectCost>): string[] => {
  const errors: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'custom' && !registeredCustomEffectHandlers.has(node.customHandlerId)) {
      errors.push(`效果 ${effectId}：未注册效果处理器 ${node.customHandlerId}`);
    }
    if (node.kind === 'choose') {
      for (const option of node.options) errors.push(...customHandlerErrors(effectId, [...(option.conditions ?? []), ...option.actions]));
    }
  }
  return errors;
};

export const validateExecutableEffect = (effect: StructuredEffect): string[] => {
  const errors = customHandlerErrors(effect.id, [...effect.conditions, ...effect.costs, ...effect.actions]);
  const targetIds = new Set(effect.targets.map((target) => target.id));
  const specialTargets = new Set(['source', 'equipped-character']);
  const validateTargets = (actions: EffectAction[]): void => {
    for (const action of actions) {
      if ('targetId' in action && !targetIds.has(action.targetId) && !specialTargets.has(action.targetId)) {
        errors.push(`效果 ${effect.id}：目标 ${action.targetId} 未定义`);
      }
      if (action.kind === 'choose') for (const option of action.options) validateTargets(option.actions);
    }
  };
  validateTargets(effect.actions);
  return [...new Set(errors)];
};
