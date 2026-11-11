// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardInstance, PlayerBoardView, PlayerView } from '@pgr/protocol';
import { AttackTargetDialog, DefenseDialog, PlayCardDialog } from './BattleChoices.js';
import { Battlefield } from './Battlefield.js';
afterEach(cleanup);
const card = (instanceId: string, cardId = 'DEV-001'): CardInstance => ({ instanceId, cardId, face: 'up', rested: false });
const board = (id: string): PlayerBoardView => ({ id, hand: [], deck: { count: 40 }, field: [null, null, null, null, null], energy: [], signals: [], processing: [], graveyard: [], corruption: 0 });
const view: PlayerView = { gameId: 'choices', version: 1, status: 'playing', viewerId: 'p1', activePlayerId: 'p1', self: board('p1'), opponent: board('p2'), phase: 'main', turn: 3, pendingAttack: null, pendingDecision: null, priorityWindow: null, winnerId: null, legalActions: [], events: [] };

describe('explicit battle choices', () => {
  it('selects an evolution target and pays the actual two-energy cost', async () => {
    const user = userEvent.setup(); const command = vi.fn();
    render(<PlayCardDialog card={card('evolve', 'ST01-001')} choices={[{ type: 'PLAY_CARD', instanceId: 'evolve', evolutionTargetSlot: 3, paymentCost: 2 }]}
      energy={[card('fee1'), card('fee2')]} field={[null, null, null, card('base', 'ST01-005'), null]} onCommand={command} onClose={() => undefined} onView={() => undefined} />);
    await user.click(screen.getByRole('button', { name: /升变 A4/ }));
    const confirm = screen.getByRole('button', { name: '确认升变' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    const fees = screen.getAllByTitle('测试构造体·物理');
    await user.click(fees[0]!); await user.click(fees[1]!);
    await user.click(confirm);
    expect(command).toHaveBeenCalledWith({ type: 'PLAY_CARD', instanceId: 'evolve', evolutionTargetSlot: 3, paymentIds: ['fee1', 'fee2'] });
  });
  it('uses the chosen field position instead of automatically using the first empty slot', async () => {
    const user = userEvent.setup(); const command = vi.fn();
    render(<PlayCardDialog card={card('new')} choices={[0, 4].map((fieldSlot) => ({ type: 'PLAY_CARD', instanceId: 'new', fieldSlot, paymentCost: 1 }))}
      energy={[card('fee')]} field={view.self.field} onCommand={command} onClose={() => undefined} onView={() => undefined} />);
    await user.click(screen.getByRole('button', { name: '出场至 A5 · 费用 1' }));
    await user.click(screen.getByTitle('测试构造体·物理'));
    await user.click(screen.getByRole('button', { name: '支付并使用' }));
    expect(command).toHaveBeenCalledWith({ type: 'PLAY_CARD', instanceId: 'new', fieldSlot: 4, paymentIds: ['fee'] });
  });
  it('confirms a character attack target rather than silently attacking the player', async () => {
    const user = userEvent.setup(); const command = vi.fn();
    render(<AttackTargetDialog view={{ ...view, opponent: { ...view.opponent, field: [null, null, { ...card('target'), rested: true }, null, null] } }}
      choices={[{ type: 'DECLARE_ATTACK', attackerSlot: 4, target: 'player' }, { type: 'DECLARE_ATTACK', attackerSlot: 4, target: 'character', targetSlot: 2 }]}
      onCommand={command} onClose={() => undefined} onView={() => undefined} />);
    await user.click(screen.getByRole('button', { name: /攻击 A3/ }));
    expect(command).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认攻击' }));
    expect(command).toHaveBeenCalledWith({ type: 'DECLARE_ATTACK', attackerSlot: 4, target: 'character', targetSlot: 2 });
  });
  it('automatically asks the defender and only offers legal blockers', async () => {
    const user = userEvent.setup(); const command = vi.fn();
    const defense: PlayerView = { ...view, activePlayerId: 'p2', self: { ...view.self, field: [{ ...card('rested', 'DEV-002'), rested: true }, null, null, null, card('legal')] },
      pendingAttack: { attackerSlot: 0, target: 'player', priorityPlayerId: 'p1', consecutivePasses: 0, stage: 'response' }, legalActions: [{ type: 'BLOCK', blockerSlot: 4 }, { type: 'PASS_RESPONSE' }] };
    render(<Battlefield view={defense} onCommand={command} />);
    const dialog = screen.getByRole('dialog', { name: '是否阻挡本次攻击？' });
    expect(within(dialog).queryByTitle('测试构造体·火')).toBeNull();
    await user.click(within(dialog).getByTitle('测试构造体·物理'));
    await user.click(within(dialog).getByRole('button', { name: '确认阻挡' }));
    expect(command).toHaveBeenCalledWith({ type: 'BLOCK', blockerSlot: 4 });
  });
  it('sends a pass when the player declines blocking', async () => {
    const user = userEvent.setup(); const command = vi.fn();
    render(<DefenseDialog view={{ ...view, legalActions: [{ type: 'PASS_RESPONSE' }] }} onCommand={command} onClose={() => undefined} onView={() => undefined} onPlay={() => undefined} />);
    await user.click(screen.getByRole('button', { name: '不阻挡' }));
    expect(command).toHaveBeenCalledWith({ type: 'PASS_RESPONSE' });
  });
  it('shows the automatically drawn cards and only asks for confirmation', async () => {
    const user = userEvent.setup(); const command = vi.fn(); const drawn = card('drawn');
    render(<Battlefield view={{ ...view, phase: 'draw', self: { ...view.self, hand: [drawn] }, drawConfirmation: { count: 1, cards: [drawn] }, legalActions: [{ type: 'CONFIRM_DRAW' }] }} onCommand={command} />);
    expect(screen.getByRole('dialog', { name: '抽牌完成' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '推进阶段' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认抽牌' }));
    expect(command).toHaveBeenCalledWith({ type: 'CONFIRM_DRAW' });
  });
});
