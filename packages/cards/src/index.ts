import type { CardDefinition, DeckDefinition } from '@pgr/protocol';

const character = (
  id: string, name: string, cost: number, attribute: CardDefinition['attribute'], pp: number, dp: number,
  traits: string[], text: string[] = [], effectIds: string[] = [],
): CardDefinition => ({ id, name, type: 'character', cost, attribute, pp, dp, traits, text, effectIds, artPath: `/cards/${id}.webp` });

const tactic = (
  id: string, name: string, cost: number, attribute: CardDefinition['attribute'], subtype: 'normal' | 'instant',
  text: string[], effectIds: string[], signal?: CardDefinition['signal'], traits: string[] = [],
): CardDefinition => ({ id, name, type: 'tactic', subtype, cost, attribute, traits, text, effectIds, ...(signal ? { signal } : {}), artPath: `/cards/${id}.webp` });

const item = (
  id: string, name: string, cost: number, subtype: 'equipment' | 'support', text: string[], effectIds: string[],
  pp?: number, traits: string[] = [],
): CardDefinition => ({ id, name, type: 'item', subtype, cost, attribute: 'physical', traits, ...(pp === undefined ? {} : { pp }), text, effectIds, artPath: `/cards/${id}.webp` });

export const cardDefinitions: CardDefinition[] = [
  character('ST01-005', '露西亚·红莲', 3, 'physical', 3000, 0, ['露西亚', '灰鸦小队'], ['【出】：抽1张牌，丢弃1张手牌。'], ['enter_draw_discard']),
  character('ST01-006', '露西亚·红莲', 7, 'physical', 8000, 2, ['露西亚', '灰鸦小队']),
  character('ST01-004', '露西亚·红莲', 2, 'physical', 3000, 1, ['露西亚', '灰鸦小队'], ['【永】：充能0。'], ['charge_zero']),
  character('ST01-001', '露西亚·红莲', 5, 'physical', 5000, 1, ['露西亚', '灰鸦小队'], ['升变：费用5以下的〈露西亚〉。', '【出】：检索低费灰鸦角色。'], ['evolve_lucia', 'enter_search_gray_raven']),
  character('PR-016', '露西亚·深红囚影', 5, 'lightning', 4500, 1, ['阿尔法', '升格者'], ['装备〈封刃太刀〉时获得【速攻】。'], ['weapon_haste']),
  character('PR-006', '露西亚·深红之渊', 4, 'physical', 4000, 1, ['阿尔法', '升格者'], ['【出】：交换明费。'], ['enter_swap_energy']),
  character('PR-004', '露西亚·鸦羽', 5, 'ice', 5000, 1, ['露西亚', '灰鸦小队'], ['满足队伍条件时PP+1000。'], ['gray_raven_team_bonus']),
  character('BP03-077', '露西亚·深红之渊', 3, 'physical', 3000, 0, ['阿尔法', '升格者'], ['攻击时可将1张信号球视为蓝色。'], ['attack_blue_signal']),
  character('BP03-076', '露西亚·深红之渊', 4, 'physical', 4000, 1, ['阿尔法', '升格者'], ['【出】：回收蓝色信号球。'], ['enter_recover_blue']),
  character('BP03-075', '露西亚·深红之渊', 8, 'physical', 6500, 1, ['阿尔法', '升格者'], ['【速攻】；可消耗蓝色信号球减费。'], ['haste', 'blue_signal_discount']),
  character('BP03-009', '露西亚·誓焰', 3, 'fire', 3000, 0, ['露西亚', '灰鸦小队·高级'], ['我方存在浮空角色时基本DP变为1。'], ['floating_dp']),
  tactic('BP01-079', '第五次交锋', 0, 'none', 'normal', ['使用后进入信号球区并抽1张牌。'], ['signal_draw', 'charge_choice_red'], 'red'),
  tactic('BP01-080', '无忧无虑大作战', 0, 'none', 'normal', ['使用后进入信号球区并抽1张牌。'], ['signal_draw', 'charge_choice_red'], 'red'),
  tactic('BP01-081', '桎梏与囚笼', 0, 'none', 'normal', ['使用后进入信号球区并抽1张牌。'], ['signal_draw', 'charge_choice_blue'], 'blue'),
  tactic('BP01-084', '解开项圈', 0, 'none', 'normal', ['使用后进入信号球区并抽1张牌。'], ['signal_draw', 'charge_choice_yellow'], 'yellow'),
  tactic('BP01-037', '万世铭', 1, 'physical', 'normal', ['将1张信号球视为3个同色信号球。'], ['triple_signal'], undefined, ['万世铭']),
  tactic('BP01-007', '刹那冰华', 0, 'ice', 'instant', ['1张灰鸦小队角色PP+1500。'], ['instant_pp_boost']),
  item('BP01-023', '夜煌——大太刀', 3, 'equipment', ['装备角色PP+1000。'], ['equipment_pp', 'sealed_blade'], 1000, ['大太刀', '封刃太刀']),
  item('BP01-011', '冕饵', 3, 'equipment', ['侵蚀变化过则抽1张牌。'], ['equipment_pp', 'corruption_draw'], 1000, ['增幅器']),
  item('BP01-012', '沃托', 2, 'support', ['丢弃2张角色并横置：回收信号球。'], ['support_recover_signal']),
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
