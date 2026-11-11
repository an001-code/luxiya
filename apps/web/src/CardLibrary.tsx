import { useMemo, useState } from 'react';
import type { CardCatalogEntry } from './api.js';
import { cardImageUrl } from './api.js';
import { attributeLabels, cardTypeLabel } from './card-labels.js';

export function CardLibrary({ cards, loading }: { cards: CardCatalogEntry[]; loading: boolean }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const filtered = useMemo(() => cards.filter((card) => (type === 'all' || card.type === type)
    && `${card.id}${card.name}${card.traits.join('')}`.toLowerCase().includes(query.toLowerCase())), [cards, query, type]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = filtered.find((card) => card.id === selectedId) ?? filtered[0];
  return <section className="platform-workspace card-library">
    <aside className="filter-rail"><h2>全部卡牌</h2><input placeholder="搜索编号、名称或特征" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="filter-stack">{[['all', '全部'], ['character', '角色'], ['tactic', '战术'], ['item', '道具']].map(([value, label]) => <button key={value} className={type === value ? 'active' : ''} onClick={() => setType(value!)}>{label}</button>)}</div>
      <small>{filtered.length} 张已发布卡牌</small></aside>
    <div className="card-catalog-grid">{loading ? <p>正在同步卡牌数据…</p> : filtered.map((card) => <button className={`catalog-card ${selected?.id === card.id ? 'selected' : ''}`} key={card.id} onClick={() => setSelectedId(card.id)}>
      <div className="catalog-art">{card.hasImage ? <img src={cardImageUrl(card.id)} alt={card.name} /> : <span>暂无卡图</span>}</div><strong>{card.name}</strong><code>{card.id}</code><em>费用 {card.cost}</em></button>)}{!loading && filtered.length === 0 && <p className="catalog-empty">没有找到符合条件的卡牌，试试其他名称或类型。</p>}</div>
    <aside className="detail-rail">{selected ? <><div className="detail-card-art">{selected.hasImage ? <img src={cardImageUrl(selected.id)} alt={selected.name} /> : '缺少卡图'}</div><code>{selected.id}</code><h2>{selected.name}</h2><div className="detail-tags"><span>费用 {selected.cost}</span><span>{attributeLabels[selected.attribute]}</span><span>{cardTypeLabel(selected)}</span></div>{selected.pp !== undefined && <p>PP {selected.pp} · DP {selected.dp ?? 0}</p>}<hr />{selected.text.map((line) => <p key={line}>{line}</p>)}</> : <p>选择一张卡牌查看详情</p>}</aside>
  </section>;
}
