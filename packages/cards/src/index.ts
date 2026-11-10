import type { CardDefinition, DeckDefinition } from '@pgr/protocol';

const abilityByEffectId: Record<string, NonNullable<CardDefinition['structuredEffects']>[number]['ability']> = {
  charge_zero: 'permanent',
  evolve_lucia: 'activated',
  enter_search_gray_raven: 'enter',
  weapon_haste: 'permanent',
  leave_recover_sealed_blade: 'automatic',
  enter_swap_energy: 'enter',
  gray_raven_team_bonus: 'permanent',
  enter_reorder_signals: 'enter',
  attack_blue_signal: 'automatic',
  enter_recover_blue: 'enter',
  haste: 'permanent',
  blue_signal_discount: 'permanent',
  floating_dp: 'permanent',
  signal_draw: 'automatic',
  charge_choice_red: 'charge',
  charge_choice_blue: 'charge',
  charge_choice_yellow: 'charge',
  triple_signal: 'activated',
  qu_energy_replacement: 'automatic',
  instant_pp_boost: 'instant',
  equipment_pp: 'permanent',
  sealed_blade: 'permanent',
  corruption_draw: 'enter',
  support_recover_signal: 'activated',
};

const structuresFor = (effectIds: string[]): NonNullable<CardDefinition['structuredEffects']> => effectIds.map((handlerId) => ({
  id: handlerId.replaceAll('_', '-'),
  sourceEffectId: handlerId,
  ability: abilityByEffectId[handlerId] ?? 'automatic',
  ...((abilityByEffectId[handlerId] ?? 'automatic') === 'enter' ? { trigger: { kind: 'event' as const, event: 'card-entered' as const } } : {}),
  conditions: [],
  costs: [],
  targets: [],
  actions: [{ kind: 'custom', customHandlerId: handlerId }],
  duration: { kind: 'instant' },
}));

const character = (
  id: string, name: string, cost: number, attribute: CardDefinition['attribute'], pp: number, dp: number,
  traits: string[], text: string[] = [], effectIds: string[] = [], rarity?: string,
): CardDefinition => ({ id, name, type: 'character', cost, attribute, pp, dp, traits, text, effectIds, structuredEffects: structuresFor(effectIds), ...(rarity ? { rarity } : {}), artPath: `/cards/${id}.webp` });

const tactic = (
  id: string, name: string, cost: number, attribute: CardDefinition['attribute'], subtype: 'normal' | 'instant',
  text: string[], effectIds: string[], signal?: CardDefinition['signal'], traits: string[] = [], rarity?: string,
): CardDefinition => ({ id, name, type: 'tactic', subtype, cost, attribute, traits, text, effectIds, structuredEffects: structuresFor(effectIds), ...(signal ? { signal } : {}), ...(rarity ? { rarity } : {}), artPath: `/cards/${id}.webp` });

const item = (
  id: string, name: string, cost: number, subtype: 'equipment' | 'support', text: string[], effectIds: string[],
  pp?: number, traits: string[] = [], rarity?: string,
): CardDefinition => ({ id, name, type: 'item', subtype, cost, attribute: 'physical', traits, ...(pp === undefined ? {} : { pp }), text, effectIds, structuredEffects: structuresFor(effectIds), ...(rarity ? { rarity } : {}), artPath: `/cards/${id}.webp` });

export const cardDefinitions: CardDefinition[] = [
  character('ST01-005', '露西亚·红莲', 3, 'physical', 3000, 0, ['露西亚', '灰鸦小队'], [
    '【出】：抽一张牌，丢弃一张手牌。',
  ], ['enter_draw_discard'], 'ST'),
  character('ST01-006', '露西亚·红莲', 7, 'physical', 8000, 2, ['露西亚', '灰鸦小队'], ['无能力。'], [], 'ST'),
  character('ST01-004', '露西亚·红莲', 2, 'physical', 3000, 1, ['露西亚', '灰鸦小队'], ['【永】：充能0。'], ['charge_zero'], 'ST'),
  character('ST01-001', '露西亚·红莲', 5, 'physical', 5000, 1, ['露西亚', '灰鸦小队'], [
    '升变条件：费用5以下的〈露西亚〉特征卡，且费用区已有费用上限5及以上。',
    '升变费用：2。',
    '升变能力：将手牌中的该牌重叠在所取对象上方出场，获得〈速攻〉。',
    '【出】：丢弃1张手牌：公开我方牌组顶5张牌，选择其中1张费用为3及以下的〈灰鸦小队〉角色出场，将剩余的牌按任意顺序放置到牌组底。',
    '【起】：消除3颗相邻蓝色信号球：选择我方战场1张角色返回手牌。若如此做，选择我方手牌1张费用为4及以下的〈灰鸦小队〉角色出场。',
  ], ['evolve_lucia', 'enter_search_gray_raven'], 'R'),
  character('PR-016', '露西亚·深红囚影', 5, 'lightning', 4500, 1, ['阿尔法', '升格者'], [
    '【永】：若该牌下方存在〈封刃太刀〉，该牌获得〈速攻〉。',
    '【自】：该牌离场时，若该牌装备〈封刃太刀〉，可以消除一颗任意颜色信号球。若如此做，选择我方墓地1张〈封刃太刀〉，将其出场。',
  ], ['weapon_haste', 'leave_recover_sealed_blade'], 'PR'),
  character('PR-006', '露西亚·深红之渊', 4, 'physical', 4000, 1, ['阿尔法', '升格者'], [
    '【出】：丢弃1张手牌：选择我方费用区1张明费，将其加入手牌。若如此做，将我方牌组顶1张牌以横置状态放置到费用区。',
  ], ['enter_swap_energy'], 'PR'),
  character('PR-004', '露西亚·鸦羽', 5, 'ice', 5000, 1, ['露西亚', '灰鸦小队'], [
    '【永】：若我方战场存在〈里〉角色和〈丽芙〉角色，该牌PP+1000。',
    '【出】：将我方信号球区的牌按任意顺序排列。',
  ], ['gray_raven_team_bonus', 'enter_reorder_signals'], 'PR'),
  character('BP03-077', '露西亚·深红之渊', 3, 'physical', 3000, 0, ['阿尔法', '升格者'], [
    '【自】：该牌攻击时，若我方战场存在其他〈阿尔法〉角色，选择我方信号球区1张信号球，直到回合结束为止，其可以视为蓝色信号球。',
  ], ['attack_blue_signal'], 'R'),
  character('BP03-076', '露西亚·深红之渊', 4, 'physical', 4000, 1, ['阿尔法', '升格者'], [
    '【出】：选择我方墓地1张蓝色信号球，将其放置到我方信号球区最上方。',
  ], ['enter_recover_blue'], 'R'),
  character('BP03-075', '露西亚·深红之渊', 8, 'physical', 6500, 1, ['阿尔法', '升格者'], [
    '【永】：获得〈速攻〉。',
    '【永】：使用该牌时，可以将我方信号球区最少1张蓝色信号球放置到墓地。以此方法每放置1张蓝色信号球，该牌的费用-2。（仅在使用该牌时费用-2）',
  ], ['haste', 'blue_signal_discount'], 'SR'),
  character('BP03-009', '露西亚·誓焰', 3, 'fire', 3000, 0, ['露西亚', '灰鸦小队·高级'], [
    '【永】：若我方处理区存在浮空模式的角色，该牌基本DP变为1。',
  ], ['floating_dp'], 'U'),
  tactic('BP01-079', '第五次交锋', 0, 'none', 'normal', [
    '使用后将该牌放置到我方信号球区最上方，抽1张牌。',
    '【充能自】：从以下2项选择1项。',
    '·选择我方战场最多1张角色，直到回合结束为止，其DP+1。',
    '·选择我方战场最多1张角色，直到回合结束为止，其PP+2000。',
  ], ['signal_draw', 'charge_choice_red'], 'red', [], 'C'),
  tactic('BP01-080', '无忧无虑大作战', 0, 'none', 'normal', [
    '使用后将该牌放置到我方信号球区最上方，抽1张牌。',
    '【充能自】：从以下2项选择1项。',
    '·选择我方战场最多1张角色，直到回合结束为止，其DP+1。',
    '·选择我方战场最多1张角色，直到回合结束为止，其PP+2000。',
  ], ['signal_draw', 'charge_choice_red'], 'red', [], 'C'),
  tactic('BP01-081', '桎梏与囚笼', 0, 'none', 'normal', [
    '使用后将该牌放置到我方信号球区最上方，抽1张牌。',
    '【充能自】：从以下2项选择1项。',
    '·抽一张牌。',
    '·选择我方战场最多1张角色，直到回合结束为止，其PP+2000。',
  ], ['signal_draw', 'charge_choice_blue'], 'blue', [], 'C'),
  tactic('BP01-084', '解开项圈', 0, 'none', 'normal', [
    '使用后将该牌放置到我方信号球区最上方，抽1张牌。',
    '【充能自】：从以下2项选择1项。',
    '·若我方侵蚀计数不小于对方，我方侵蚀计数-1。',
    '·选择我方战场最多1张角色，直到回合结束为止，其PP+2000。',
  ], ['signal_draw', 'charge_choice_yellow'], 'yellow', [], 'C'),
  tactic('BP01-037', '万世铭', 1, 'physical', 'normal', [
    '该牌只能在我方战场存在〈曲〉角色时使用。选择我方信号球区1张信号球，直到回合结束为止，其可以视为3个与其相同的信号球。',
    '【自】：该牌因〈曲〉角色放置到处理区时，可以改为将该牌以横置状态放置到费用区。（该牌自身效果的“放置到处理区”包含充能、公开某个区域的该牌等情况）',
  ], ['triple_signal', 'qu_energy_replacement'], undefined, ['万世铭'], 'R'),
  tactic('BP01-007', '刹那冰华', 0, 'ice', 'instant', [
    '【瞬时】：选择我方战场1张〈灰鸦小队〉角色，直到回合结束为止，其PP+1500。可以追加丢弃任意数量的手牌，每丢弃1张，直到回合结束为止，其PP+1000。',
  ], ['instant_pp_boost'], undefined, [], 'R'),
  item('BP01-023', '夜煌——大太刀', 3, 'equipment', [
    '使用后可在主要阶段放置在装备角色下方，每张角色只能装备1张装备。',
    '【永】：若装备角色名称为《露西亚·深红囚影》，则其获得“【自】（回合1）：该牌攻击时，可以横置我方战场1张牌。若如此做，该牌的本次攻击不会被PP为5000及以下的角色阻挡”。',
  ], ['equipment_pp', 'sealed_blade'], 1000, ['大太刀', '封刃太刀'], 'U'),
  item('BP01-011', '冕饵', 3, 'equipment', [
    '使用后可在主要阶段放置在装备角色下方，每张角色只能装备1张装备。',
    '【出】：若该回合中我方的侵蚀计数发生过变化，抽1张牌。',
  ], ['equipment_pp', 'corruption_draw'], 1000, ['增幅器'], 'U'),
  item('BP01-012', '沃托', 2, 'support', [
    '【起】：丢弃2张角色，横置该牌：选择我方墓地1张信号球，将其放置到我方信号球区最上方。',
  ], ['support_recover_signal'], undefined, [], 'U'),
  character('DEV-001', '测试构造体·物理', 1, 'physical', 2000, 0, ['开发测试']),
  character('DEV-002', '测试构造体·火', 2, 'fire', 3000, 1, ['开发测试']),
  character('DEV-003', '测试构造体·雷', 3, 'lightning', 4000, 1, ['开发测试']),
  character('DEV-004', '测试构造体·冰', 4, 'ice', 5000, 1, ['开发测试']),
  character('DEV-005', '测试构造体·暗', 5, 'dark', 6000, 1, ['开发测试']),
  character('DEV-006', '测试构造体·空', 6, 'void', 7000, 2, ['开发测试']),
  item('DEV-007', '测试武装', 2, 'equipment', ['装备角色PP+500。'], ['equipment_pp'], 500, ['开发测试']),
  item('DEV-008', '测试辅助机', 1, 'support', ['无能力。'], [], undefined, ['开发测试']),
];

export const cardsById = new Map(cardDefinitions.map((card) => [card.id, card]));

const copies = (id: string, count: number): string[] => Array.from({ length: count }, () => id);

export const developmentDeck: DeckDefinition = {
  id: 'development-mirror-v1',
  name: '开发验证牌组（非正式平衡）',
  developmentOnly: true,
  cards: [
    ...copies('BP01-079', 4), ...copies('BP01-081', 4), ...copies('BP01-084', 4),
    ...copies('ST01-006', 4), ...copies('ST01-004', 4),
    ...copies('DEV-001', 4), ...copies('DEV-002', 4), ...copies('DEV-003', 4),
    ...copies('DEV-004', 4), ...copies('DEV-005', 4), ...copies('DEV-006', 4),
    ...copies('DEV-007', 4), ...copies('DEV-008', 2),
  ],
};

export const getCardDefinition = (id: string): CardDefinition => {
  const card = cardsById.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
};
