// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
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
  it('reorders signals before submitting the complete order', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<Battlefield view={{ ...baseView, legalActions: [], pendingDecision: {
      id: 'sort', frameId: 'raven', kind: 'order-cards', purpose: 'action', prompt: '排列信号球', min: 3, max: 3,
      options: ['a', 'b', 'c'].map((id) => ({ id, instanceId: id, cardId: 'BP01-079', label: id })),
    } }} onCommand={onCommand} />);
    await user.click(screen.getByRole('button', { name: '将 b 前移' }));
    expect(onCommand).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认顺序' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'RESOLVE_EFFECT_DECISION', decisionId: 'sort', selectedInstanceIds: ['b', 'a', 'c'] });
  });

  it('opens a target chooser for equipment already on the field', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    const weapon = { ...card, instanceId: 'weapon', cardId: 'BP01-023' };
    const host = { ...card, instanceId: 'host', cardId: 'PR-016' };
    render(<Battlefield view={{ ...baseView, self: { ...baseView.self, field: [weapon, host, null, null, null] },
      legalActions: [{ type: 'EQUIP_CARD', sourceSlot: 0, targetSlot: 1 }],
    }} onCommand={onCommand} />);
    await user.click(screen.getByRole('button', { name: '装备' }));
    const dialog = within(screen.getByRole('dialog', { name: '选择装备角色' }));
    await user.click(dialog.getByRole('button', { name: /A2/ }));
    await user.click(dialog.getByRole('button', { name: '确认装备' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'EQUIP_CARD', sourceSlot: 0, targetSlot: 1 });
  });

  it('lets the owner inspect a dark energy card while its board art remains hidden', async () => {
    const user = userEvent.setup();
    const { container } = render(<Battlefield view={{ ...baseView, legalActions: [], self: { ...baseView.self,
      hand: [], energy: [{ ...card, instanceId: 'dark', cardId: 'ST01-005', face: 'down' }],
    } }} onCommand={() => undefined} />);
    const fee = container.querySelector('[data-card-view="dark"]') as HTMLElement;
    expect(fee.querySelector('.battle-card-back')).toBeTruthy();
    await user.click(fee);
    expect(container.querySelector('.detail-art img')?.getAttribute('src')).toContain('/api/cards/ST01-005/image');
    expect(fee.querySelector('img')).toBeNull();
  });
  it('lets the player inspect a single effect target before confirming it', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<Battlefield view={{ ...baseView, pendingDecision: { id: 'pick-one', frameId: 'frame', kind: 'select-cards', purpose: 'target', prompt: '选择一张卡牌', min: 1, max: 1, options: [{ id: 'unit-in-hand', instanceId: 'unit-in-hand', cardId: 'BP01-079', label: '第五次交锋' }] }, legalActions: [{ type: 'RESOLVE_EFFECT_DECISION', decisionId: 'pick-one', selectedInstanceIds: [] }] }} onCommand={onCommand} />);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /第五次交锋/ }));
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByText('查看《第五次交锋》的完整效果')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认选择' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'RESOLVE_EFFECT_DECISION', decisionId: 'pick-one', selectedInstanceIds: ['unit-in-hand'] });
  });

  it('opens an independent mulligan dialog even for the non-active player', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<Battlefield view={{ ...baseView, phase: 'mulligan', activePlayerId: 'p2', legalActions: [{ type: 'MULLIGAN', instanceIds: [] }] }} onCommand={onCommand} />);
    expect(screen.getByRole('dialog', { name: '起手调度' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认调度 (0)' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'MULLIGAN', instanceIds: [] });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('announces a drawn and then discarded card from authoritative snapshots', () => {
    const drawn = { ...card, instanceId: 'drawn' };
    const { rerender } = render(<Battlefield view={baseView} onCommand={() => undefined} />);
    rerender(<Battlefield view={{ ...baseView, version: 2, self: board('p1', [card, drawn]) }} onCommand={() => undefined} />);
    expect(screen.getByText('我方抽牌 ×1')).toBeTruthy();
    rerender(<Battlefield view={{ ...baseView, version: 3, self: { ...board('p1', [card]), graveyard: [drawn] } }} onCommand={() => undefined} />);
    expect(screen.getByText('我方弃牌 ×1')).toBeTruthy();
  });

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
