import { useEffect, useMemo, useState } from 'react';
import type { CardCatalogEntry, DeckSummary } from './api.js';

interface Props {
  cards: CardCatalogEntry[]; decks: DeckSummary[]; selectedDeckId: string | null;
  onSelectDeck: (id: string) => void; onSave: (deck: DeckSummary) => void; onActivate: (id: string) => void;
}

export function DeckEditor({ cards, decks, selectedDeckId, onSelectDeck, onSave, onActivate }: Props) {
  const selected = decks.find((deck) => deck.id === selectedDeckId) ?? decks[0];
  const [entries, setEntries] = useState(selected?.cards ?? []);
  useEffect(() => setEntries(selected?.cards ?? []), [selected?.id]);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.cardId, entry.count])), [entries]);
  const change = (cardId: string, delta: number) => setEntries((current) => {
    const count = (current.find((entry) => entry.cardId === cardId)?.count ?? 0) + delta;
    return count <= 0 ? current.filter((entry) => entry.cardId !== cardId) : [...current.filter((entry) => entry.cardId !== cardId), { cardId, count: Math.min(count, 4) }];
  });
  return <section className="platform-workspace deck-builder">
    <aside className="deck-list"><h2>我的牌组</h2>{decks.map((deck) => <button className={deck.id === selected?.id ? 'active' : ''} key={deck.id} onClick={() => onSelectDeck(deck.id)}><b>{deck.name}</b><span>{deck.active ? '启用中' : `${deck.cards.reduce((sum, item) => sum + item.count, 0)}张`}</span></button>)}</aside>
    <div className="deck-canvas"><header><div><small>构筑进度</small><h1>{selected?.name ?? '新牌组'}</h1></div><strong className={total === 50 ? 'valid-count' : ''}>{total} / 50</strong></header>
      <div className="deck-rows">{entries.map((entry) => { const definition = cards.find((card) => card.id === entry.cardId); return <div key={entry.cardId}><code>{entry.cardId}</code><b>{definition?.name ?? '未知卡牌'}</b><span>× {entry.count}</span><button onClick={() => change(entry.cardId, -1)}>−</button><button onClick={() => change(entry.cardId, 1)}>＋</button></div>; })}</div>
      <div className="validation-panel">{selected?.validationErrors.length ? selected.validationErrors.map((error) => <p key={error}>△ {error}</p>) : <p className="valid">◇ 牌组结构合法</p>}</div>
      <footer><button disabled={!selected} onClick={() => selected && onSave({ ...selected, cards: entries })}>保存草稿</button><button className="primary-action" disabled={!selected || Boolean(selected.validationErrors.length)} onClick={() => selected && onActivate(selected.id)}>设为启用牌组</button></footer>
    </div>
    <aside className="deck-pool"><h2>卡池</h2>{cards.map((card) => <button key={card.id} onClick={() => change(card.id, 1)} disabled={(entryMap.get(card.id) ?? 0) >= 4}><span>{card.cost}</span><b>{card.name}</b><small>{entryMap.get(card.id) ?? 0}/4</small></button>)}</aside>
  </section>;
}
