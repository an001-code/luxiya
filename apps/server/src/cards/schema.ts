import { z } from 'zod';

const actionSchema = z.object({
  type: z.enum(['draw', 'discard', 'modify_pp', 'modify_dp', 'move_card', 'signal', 'energy', 'equip', 'choose', 'custom']),
  amount: z.number().int().optional(),
  value: z.string().optional(),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const structuredEffectSchema = z.object({
  id: z.string().trim().min(1).max(80),
  ability: z.enum(['permanent', 'automatic', 'activated', 'enter', 'instant', 'charge']),
  trigger: z.string().trim().min(1).optional(),
  conditions: z.array(z.string().trim().min(1)).optional(),
  costs: z.array(z.string().trim().min(1)).optional(),
  targets: z.array(z.string().trim().min(1)).optional(),
  actions: z.array(actionSchema).min(1),
  duration: z.string().trim().min(1).optional(),
  oncePerTurn: z.boolean().optional(),
  handlerId: z.string().trim().min(1).max(100).optional(),
});

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
