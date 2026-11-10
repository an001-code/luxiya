import { z } from 'zod';
import type { EffectAction, StructuredEffect } from '@pgr/protocol';

const playerSchema = z.enum(['self', 'opponent']);
const zoneSchema = z.enum(['deck', 'hand', 'graveyard', 'processing', 'field', 'signals', 'energy']);
const eventSchema = z.enum(['card-used', 'card-entered', 'card-left', 'attack-declared', 'attack-charge', 'damage-charge', 'corruption-changed', 'turn-start', 'turn-end', 'card-moved-to-processing']);
const durationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('instant') }), z.object({ kind: z.literal('attack') }),
  z.object({ kind: z.literal('turn') }), z.object({ kind: z.literal('next-turn') }), z.object({ kind: z.literal('permanent') }),
]);
const valueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), value: z.number().int() }),
  z.object({ kind: z.literal('selected-count'), targetId: z.string().trim().min(1), multiplier: z.number().optional() }),
  z.object({ kind: z.literal('source-stat'), stat: z.enum(['pp', 'dp', 'charge']) }),
]);
const cardFilterSchema = z.object({
  types: z.array(z.enum(['character', 'tactic', 'item'])).optional(), subtypes: z.array(z.enum(['normal', 'instant', 'equipment', 'support'])).optional(),
  names: z.array(z.string().trim().min(1)).optional(), traits: z.array(z.string().trim().min(1)).optional(),
  attributes: z.array(z.enum(['fire', 'lightning', 'dark', 'ice', 'physical', 'void', 'none'])).optional(),
  signals: z.array(z.enum(['red', 'blue', 'yellow'])).optional(),
  minCost: z.number().int().min(0).optional(), maxCost: z.number().int().min(0).optional(),
  minPp: z.number().int().optional(), maxPp: z.number().int().optional(), rested: z.boolean().optional(), face: z.enum(['up', 'down']).optional(),
});
const customNodeSchema = z.object({ kind: z.literal('custom'), customHandlerId: z.string().trim().min(1).max(100) });
const conditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('controller-has-card'), player: playerSchema, zone: zoneSchema, filter: cardFilterSchema, min: z.number().int().min(0) }),
  z.object({ kind: z.literal('source-attached'), filter: cardFilterSchema }),
  z.object({ kind: z.literal('corruption-compare'), left: playerSchema, operator: z.enum(['lt', 'lte', 'eq', 'gte', 'gt']), right: playerSchema }),
  z.object({ kind: z.literal('turn-event'), event: eventSchema }), customNodeSchema,
]);
const costSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('discard'), player: playerSchema, amount: valueSchema, filter: cardFilterSchema.optional() }),
  z.object({ kind: z.literal('rest'), target: z.union([z.literal('source'), z.string().trim().min(1)]) }),
  z.object({ kind: z.literal('pay-energy'), amount: valueSchema }),
  z.object({ kind: z.literal('eliminate-signals'), amount: valueSchema, color: z.enum(['red', 'blue', 'yellow', 'any']).optional(), adjacent: z.boolean() }),
  z.object({ kind: z.literal('move-card'), targetId: z.string().trim().min(1), to: zoneSchema }), customNodeSchema,
]);
const targetSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().trim().min(1), kind: z.literal('player'), player: playerSchema, min: z.number().int().min(0), max: z.number().int().min(0), optional: z.boolean().optional() }),
  z.object({ id: z.string().trim().min(1), kind: z.literal('cards'), player: playerSchema, zone: zoneSchema, min: z.number().int().min(0), max: z.number().int().min(0), optional: z.boolean().optional(), ordered: z.boolean().optional(), filter: cardFilterSchema.optional() }),
]);

const actionSchema: z.ZodType<EffectAction> = z.lazy(() => z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draw'), player: playerSchema, amount: valueSchema }),
  z.object({ kind: z.literal('discard'), targetId: z.string().trim().min(1) }),
  z.object({ kind: z.literal('modify-stat'), targetId: z.string().trim().min(1), stat: z.enum(['pp', 'dp', 'charge']), operation: z.enum(['add', 'set']), value: valueSchema, duration: durationSchema }),
  z.object({ kind: z.literal('move-card'), targetId: z.string().trim().min(1), to: zoneSchema, position: z.enum(['top', 'bottom']).optional(), rested: z.boolean().optional(), face: z.enum(['up', 'down']).optional() }),
  z.object({ kind: z.literal('rest'), targetId: z.string().trim().min(1) }), z.object({ kind: z.literal('upright'), targetId: z.string().trim().min(1) }),
  z.object({ kind: z.literal('freeze'), targetId: z.string().trim().min(1) }),
  z.object({ kind: z.literal('modify-corruption'), player: playerSchema, operation: z.enum(['add', 'subtract', 'set']), value: valueSchema }),
  z.object({ kind: z.literal('signal-as'), targetId: z.string().trim().min(1), color: z.enum(['red', 'blue', 'yellow']), count: z.number().int().min(1), duration: durationSchema }),
  z.object({ kind: z.literal('search'), player: playerSchema, count: z.number().int().min(1), filter: cardFilterSchema, destination: zoneSchema, remainder: z.enum(['shuffle', 'deck-bottom']) }),
  z.object({ kind: z.literal('play'), targetId: z.string().trim().min(1), ignoreCost: z.boolean() }),
  z.object({ kind: z.literal('equip'), targetId: z.string().trim().min(1), sourceTargetId: z.string().trim().min(1) }),
  z.object({ kind: z.literal('choose'), options: z.array(z.object({ id: z.string().trim().min(1), label: z.string().trim().min(1), conditions: z.array(conditionSchema).optional(), actions: z.array(actionSchema).min(1) })).min(1) }),
  customNodeSchema,
])) as z.ZodType<EffectAction>;

export const structuredEffectSchema: z.ZodType<StructuredEffect> = z.object({
  id: z.string().trim().min(1).max(80), sourceEffectId: z.string().trim().min(1).max(100).optional(),
  ability: z.enum(['permanent', 'automatic', 'activated', 'enter', 'instant', 'charge']),
  trigger: z.object({ kind: z.literal('event'), event: eventSchema }).optional(), conditions: z.array(conditionSchema), costs: z.array(costSchema), targets: z.array(targetSchema),
  actions: z.array(actionSchema).min(1), duration: durationSchema.optional(), optional: z.boolean().optional(), oncePerTurn: z.boolean().optional(),
}) as z.ZodType<StructuredEffect>;

export const cardInputSchema = z.object({
  id: z.string().trim().min(1).max(48).regex(/^[A-Za-z0-9-]+$/),
  name: z.string().trim().min(1).max(100),
  type: z.enum(['character', 'tactic', 'item']),
  subtype: z.enum(['normal', 'instant', 'equipment', 'support']).optional(),
  cost: z.number().int().min(0).max(99),
  attribute: z.enum(['fire', 'lightning', 'dark', 'ice', 'physical', 'void', 'none']),
  traits: z.array(z.string().trim().min(1).max(40)).max(20),
  pp: z.number().int().min(0).optional(),
  dp: z.number().int().min(0).optional(),
  signal: z.enum(['red', 'blue', 'yellow']).optional(),
  text: z.array(z.string().trim().min(1).max(500)).max(20),
  effectIds: z.array(z.string().trim().min(1).max(100)).max(20),
  structuredEffects: z.array(structuredEffectSchema).max(20),
  rarity: z.string().trim().min(1).max(24).optional(),
  artPath: z.string().trim().min(1).max(255).optional(),
  imageDataUrl: z.string().optional(),
});

export type CardInput = z.infer<typeof cardInputSchema>;
