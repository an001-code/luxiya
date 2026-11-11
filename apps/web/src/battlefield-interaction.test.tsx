// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardInstance, PlayerBoardView, PlayerView } from '@pgr/protocol';
import { Battlefield } from './Battlefield.js';

afterEach(cleanup);

const card: CardInstance = { instanceId: 'unit-in-hand', cardId: 'BP01-079', face: 'up', rested: false };
const board = (id: string, hand: CardInstance[] | { count: number }): PlayerBoardView => ({
  id, hand, deck: { count: 44 }, graveyard: [], processing: [], field: [null, null, null, null, null], signals: [], energy: [], corruption: 0,
});
const baseView: PlayerView = {
  gameId: 'game', version: 1, status: 'playing', viewerId: 'p1', self: board('p1', [card]), opponent: board('p2', { count: 4 }),
  activePlayerId: 'p1', phase: 'main', turn: 1, pendingAttack: null, priorityWindow: null, pendingDecision: null,
  winnerId: null, legalActions: [{ type: 'PLAY_CARD', instanceId: card.instanceId, fieldSlot: 0, paymentIds: [] }], events: [],
};

describe('Battlefield interaction state', () => {
  it('clears the played hand selection before the next energy phase', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    const { container, rerender } = render(<Battlefield view={baseView} onCommand={onCommand} />);

    await user.click(container.querySelector('[data-card-view="unit-in-hand"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: '使用卡牌' }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'PLAY_CARD', instanceId: card.instanceId }));

    rerender(<Battlefield view={{
      ...baseView, version: 2, phase: 'energy', self: board('p1', []),
      legalActions: [{ type: 'SET_ENERGY' }],
    }} onCommand={onCommand} />);

    expect(screen.getByRole('button', { name: '跳过填充' }).hasAttribute('disabled')).toBe(false);
  });
});
