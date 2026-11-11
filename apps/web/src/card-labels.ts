import type { Attribute, CardDefinition, CardSubtype, CardType } from '@pgr/protocol';
export const attributeLabels: Record<Attribute, string> = { physical: '物理', fire: '火', lightning: '雷', ice: '冰', dark: '暗', void: '空', none: '无属性' };
export const cardTypeLabels: Record<CardType, string> = { character: '角色牌', tactic: '战术牌', item: '道具牌' };
export const subtypeLabels: Record<CardSubtype, string> = { normal: '普通', instant: '瞬时', equipment: '装备', support: '辅助机' };
export const cardTypeLabel = (card: Pick<CardDefinition, 'type' | 'subtype'>): string => `${cardTypeLabels[card.type]}${card.subtype ? ` · ${subtypeLabels[card.subtype]}` : ''}`;
