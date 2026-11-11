import type { EffectAction, EffectDuration, EffectPlayer, StructuredEffect } from '@pgr/protocol';
import { presetRules, targetName, zoneNames } from './EffectFields.js';

const abilityNames: Record<StructuredEffect['ability'], string> = {
  permanent: '永久能力', automatic: '自动能力', activated: '起动能力', enter: '出场时', instant: '瞬时能力', charge: '充能时',
};
const playerNames: Record<EffectPlayer, string> = { self: '我方', opponent: '对方' };
const durationNames: Record<EffectDuration['kind'], string> = {
  instant: '本次', attack: '本次攻击中', turn: '本回合', 'next-turn': '下个回合', permanent: '永久',
};

const fixed = (value: { kind: string; value?: number; multiplier?: number; stat?: string }): string => value.kind === 'fixed' ? String(value.value ?? 0) : value.kind === 'selected-count' ? `所选卡牌数量 × ${value.multiplier ?? 1}` : `这张卡的 ${value.stat?.toUpperCase() ?? '数值'}`;

export const summarizeAction = (action: EffectAction): string => {
  switch (action.kind) {
    case 'draw': return `${playerNames[action.player]}抽 ${fixed(action.amount)} 张牌`;
    case 'discard': return `舍弃目标「${action.targetId || '未指定'}」`;
    case 'modify-stat': return `目标「${action.targetId || '未指定'}」${durationNames[action.duration.kind]}${action.operation === 'add' ? '增加' : '变为'} ${fixed(action.value)} ${action.stat.toUpperCase()}`;
    case 'move-card': return `将目标「${action.targetId || '未指定'}」移动到${zoneNames[action.to]}`;
    case 'rest': return `横置目标「${action.targetId || '未指定'}」`;
    case 'upright': return `重置目标「${action.targetId || '未指定'}」`;
    case 'freeze': return `冻结目标「${action.targetId || '未指定'}」`;
    case 'modify-corruption': return `${playerNames[action.player]}侵蚀度${action.operation === 'subtract' ? '降低' : action.operation === 'add' ? '增加' : '变为'} ${fixed(action.value)}`;
    case 'signal-as': return `目标「${action.targetId || '未指定'}」作为 ${action.count} 个${{ red: '红', blue: '蓝', yellow: '黄' }[action.color]}色信号球`;
    case 'search': return `${playerNames[action.player]}检索 ${action.count} 张牌到${zoneNames[action.destination]}`;
    case 'play': return `使用目标「${action.targetId || '未指定'}」${action.ignoreCost ? '且无须支付费用' : ''}`;
    case 'equip': return `将目标「${action.targetId || '未指定'}」装备给「${action.sourceTargetId || '未指定'}」`;
    case 'choose': return `从 ${action.options.length} 个选项中选择`;
    case 'custom': return action.customHandlerId ? `应用「${presetRules[action.customHandlerId] ?? '尚未支持的特殊规则'}」` : '动作尚未配置完整';
  }
};

export const summarizeEffect = (effect: StructuredEffect): string => {
  let actions = effect.actions.map(summarizeAction).join('，然后');
  for (const [index, target] of effect.targets.entries()) actions = actions.replaceAll(`「${target.id}」`, `「${targetName(target, index)}」`);
  actions = actions.replaceAll('「source」', '「这张卡本身」').replaceAll('「equipped-character」', '「装备此卡的角色」');
  return `${abilityNames[effect.ability]}，${actions || '尚未配置动作'}。`;
};

const registeredCustomHandlers = new Set([
  'haste', 'weapon_haste', 'charge_zero', 'charge_choice_red', 'charge_choice_blue', 'charge_choice_yellow',
  'enter_draw_discard', 'enter_swap_energy', 'enter_recover_blue', 'corruption_draw', 'signal_draw', 'equipment_pp',
  'charge_top_rested', 'gray_raven_team_bonus', 'reorder_signals', 'blue_signal_discount', 'floating_dp', 'evolve_lucia',
  'search_top_five_gray_raven', 'lucia_blue_activated', 'leave_recover_sealed_blade', 'triple_signal',
  'qu_energy_replacement', 'sealed_blade', 'support_recover_signal',
]);

export const effectBlockingIssues = (effect: StructuredEffect): string[] => {
  const issues: string[] = [];
  if (!effect.id.trim()) issues.push('效果 ID 不能为空');
  if (effect.actions.length === 0) issues.push('至少需要一个动作');
  const targetIds = new Set(effect.targets.map((target) => target.id));
  const builtInTargets = new Set(['source', 'equipped-character']);
  for (const action of effect.actions) {
    if (action.kind === 'custom') {
      if (!action.customHandlerId.trim()) issues.push('动作尚未配置完整');
      else if (!registeredCustomHandlers.has(action.customHandlerId)) issues.push('自定义处理器需由开发人员注册后才能发布');
    }
    if ('targetId' in action && !action.targetId.trim()) issues.push('动作尚未配置完整');
    else if ('targetId' in action && !targetIds.has(action.targetId) && !builtInTargets.has(action.targetId)) issues.push(`目标「${action.targetId}」尚未定义`);
  }
  return [...new Set(issues)];
};
