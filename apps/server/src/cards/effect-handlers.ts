export const registeredEffectHandlers = new Set([
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
]);

export const hasEffectHandler = (handlerId: string): boolean => registeredEffectHandlers.has(handlerId);
