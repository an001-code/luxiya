import { describe, expect, it } from 'vitest';
import type { StructuredEffect } from '@pgr/protocol';
import { validateExecutableEffect } from './capabilities.js';

const enterDraw: StructuredEffect = {
  id: 'enter-draw-one',
  ability: 'enter',
  trigger: { kind: 'event', event: 'card-entered' },
  conditions: [],
  costs: [],
  targets: [{ id: 'controller', kind: 'player', player: 'self', min: 1, max: 1 }],
  actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
  duration: { kind: 'instant' },
};

describe('structured effect capabilities', () => {
  it('accepts a typed enter effect composed only from executable common nodes', () => {
    expect(validateExecutableEffect(enterDraw)).toEqual([]);
  });

  it('identifies the effect and unregistered custom handler that block execution', () => {
    const effect: StructuredEffect = {
      ...enterDraw,
      id: 'future-special-effect',
      actions: [{ kind: 'custom', customHandlerId: 'future_special_effect' }],
    };

    expect(validateExecutableEffect(effect)).toEqual([
      '效果 future-special-effect：未注册效果处理器 future_special_effect',
    ]);
  });
});
