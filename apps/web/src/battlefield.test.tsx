import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { PlayerBoardView, PlayerView } from '@pgr/protocol';
import { Battlefield } from './Battlefield.js';

const board = (id: string, own: boolean): PlayerBoardView => ({
  id,
  hand: own ? [] : { count: 4 },
  deck: { count: 44 },
  graveyard: [], processing: [], field: [null, null, null, null, null], signals: [], energy: [], corruption: 0,
});

const view: PlayerView = {
  gameId: 'game', version: 0, status: 'playing', viewerId: 'p1', self: board('p1', true), opponent: board('p2', false),
  activePlayerId: 'p1', phase: 'main', turn: 1, pendingAttack: null, winnerId: null,
  legalActions: [{ type: 'END_PHASE' }], events: [],
};

describe('Battlefield', () => {
  test('renders mirrored resources, ten field slots and the three inspector tabs', () => {
    const html = renderToStaticMarkup(<Battlefield view={view} onCommand={() => undefined} />);
    expect(html.match(/data-field-slot=/g)).toHaveLength(10);
    expect(html.match(/data-energy-slot=/g)).toHaveLength(20);
    expect(html).toContain('对手信号球区');
    expect(html).toContain('我方费用区');
    expect(html).toContain('卡牌详情');
    expect(html).toContain('回合记录');
    expect(html).toContain('墓地');
    expect(html).toContain('认输');
  });

  test('shows a result overlay when the game has finished', () => {
    const html = renderToStaticMarkup(<Battlefield view={{ ...view, status: 'finished', winnerId: 'p1' }} onCommand={() => undefined} />);
    expect(html).toContain('对局结束');
    expect(html).toContain('胜利');
  });

  test('offers an explicit mulligan confirmation during opening setup', () => {
    const html = renderToStaticMarkup(<Battlefield view={{ ...view, phase: 'mulligan', legalActions: [{ type: 'MULLIGAN', instanceIds: [] }] }} onCommand={() => undefined} />);
    expect(html).toContain('确认调度');
  });
});
