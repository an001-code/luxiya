import { useMemo, useState, type ChangeEvent } from 'react';
import { adminCardImageUrl, type CardCatalogEntry, type CardDraftInput } from './api.js';

const blankDraft = (): CardDraftInput => ({
  id: '', name: '', type: 'character', cost: 0, attribute: 'physical', traits: [], pp: 0, dp: 0,
  text: [], effectIds: [], structuredEffects: [],
});

const draftFromCard = (card: CardCatalogEntry): CardDraftInput => ({
  id: card.id, name: card.name, type: card.type,
  ...(card.subtype ? { subtype: card.subtype } : {}),
  cost: card.cost, attribute: card.attribute, traits: [...card.traits],
  ...(card.pp === undefined ? {} : { pp: card.pp }),
  ...(card.dp === undefined ? {} : { dp: card.dp }),
  ...(card.signal ? { signal: card.signal } : {}),
  text: [...card.text], effectIds: [...card.effectIds],
  structuredEffects: structuredClone(card.structuredEffects),
  ...(card.rarity ? { rarity: card.rarity } : {}),
});

interface AdminCardEditorProps {
  cards: CardCatalogEntry[];
  onSave: (input: CardDraftInput, existingId: string | null) => Promise<void>;
  onPublish: (id: string) => Promise<void>;
}

export function AdminCardEditor({ cards, onSave, onPublish }: AdminCardEditorProps) {
  const firstCard = cards[0];
  const [selectedId, setSelectedId] = useState<string | null>(firstCard?.id ?? null);
  const [draft, setDraft] = useState<CardDraftInput>(() => firstCard ? draftFromCard(firstCard) : blankDraft());
  const [imagePreview, setImagePreview] = useState(() => firstCard?.hasImage ? adminCardImageUrl(firstCard.id) : '');
  const [query, setQuery] = useState('');
  const selectedCard = cards.find((card) => card.id === selectedId);
  const filteredCards = useMemo(() => {
    const key = query.trim().toLocaleLowerCase('zh-CN');
    return cards.filter((card) => !key || `${card.id} ${card.name} ${card.traits.join(' ')}`.toLocaleLowerCase('zh-CN').includes(key));
  }, [cards, query]);

  const selectCard = (card: CardCatalogEntry) => {
    setSelectedId(card.id);
    setDraft(draftFromCard(card));
    setImagePreview(card.hasImage ? adminCardImageUrl(card.id) : '');
  };
  const newCard = () => { setSelectedId(null); setDraft(blankDraft()); setImagePreview(''); };
  const image = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      setImagePreview(value);
      setDraft((current) => ({ ...current, imageDataUrl: value }));
    };
    reader.readAsDataURL(file);
  };
  const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);

  return <section className="admin-editor">
    <header><div><small>ADMIN // CARD REGISTRY</small><h1>卡牌录入</h1></div><div className="draft-state">{selectedId ? '编辑草稿' : '新建草稿'}</div></header>
    <div className="editor-columns">
      <aside className="admin-card-index">
        <header><div><small>CARD INDEX</small><h2>卡牌索引</h2></div><b>{cards.length}</b></header>
        <button type="button" className="new-card-button" onClick={newCard}>＋ 新建卡牌</button>
        <input aria-label="搜索管理卡牌" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="编号 / 名称 / 特征" />
        <div className="admin-card-list">{filteredCards.map((card) => <button type="button" key={card.id} className={card.id === selectedId ? 'selected' : ''} onClick={() => selectCard(card)}>
          <code>{card.id}</code><span>{card.name}</span><em className={card.status}>{card.status === 'published' ? '已发布' : '草稿'}</em>{!card.hasImage && <i>缺图</i>}
        </button>)}</div>
      </aside>

      <form className="card-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft, selectedId).then(() => setSelectedId(draft.id)); }}>
        <div className="form-grid">
          <label>卡牌编号<input value={draft.id} disabled={selectedId !== null} onChange={(event) => setDraft({ ...draft, id: event.target.value.toUpperCase() })} required /></label>
          <label>卡牌名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
          <label>类型<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as CardDraftInput['type'] })}><option value="character">角色</option><option value="tactic">战术</option><option value="item">道具</option></select></label>
          <label>子类型<select value={draft.subtype ?? ''} onChange={(event) => setDraft((current) => { const next = { ...current }; if (event.target.value) next.subtype = event.target.value as NonNullable<CardDraftInput['subtype']>; else delete next.subtype; return next; })}><option value="">无</option><option value="normal">普通战术</option><option value="instant">瞬时战术</option><option value="equipment">装备</option><option value="support">辅助机</option></select></label>
          <label>费用<input type="number" min="0" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: Number(event.target.value) })} /></label>
          <label>属性<select value={draft.attribute} onChange={(event) => setDraft({ ...draft, attribute: event.target.value as CardDraftInput['attribute'] })}><option value="physical">物理</option><option value="fire">火</option><option value="lightning">雷</option><option value="ice">冰</option><option value="dark">暗</option><option value="void">空</option><option value="none">无</option></select></label>
          <label>PP<input type="number" min="0" value={draft.pp ?? ''} onChange={(event) => setDraft((current) => { const next = { ...current }; if (event.target.value === '') delete next.pp; else next.pp = Number(event.target.value); return next; })} /></label>
          <label>DP<input type="number" min="0" value={draft.dp ?? ''} onChange={(event) => setDraft((current) => { const next = { ...current }; if (event.target.value === '') delete next.dp; else next.dp = Number(event.target.value); return next; })} /></label>
          <label>稀有度<input value={draft.rarity ?? ''} onChange={(event) => setDraft((current) => { const next = { ...current }; if (event.target.value) next.rarity = event.target.value; else delete next.rarity; return next; })} placeholder="ST / C / U / R / SR" /></label>
          <label>信号球<select value={draft.signal ?? ''} onChange={(event) => setDraft((current) => { const next = { ...current }; if (event.target.value) next.signal = event.target.value as NonNullable<CardDraftInput['signal']>; else delete next.signal; return next; })}><option value="">非信号球</option><option value="red">红</option><option value="blue">蓝</option><option value="yellow">黄</option></select></label>
        </div>
        <label>特征（每行一个）<textarea rows={3} value={draft.traits.join('\n')} onChange={(event) => setDraft({ ...draft, traits: lines(event.target.value) })} /></label>
        <label className="image-drop">完整卡图<input type="file" accept="image/png,image/jpeg,image/webp" onChange={image} /><span>{selectedCard?.hasImage ? '已保存卡图；重新选择文件将覆盖' : 'PNG / JPEG / WebP，最大 8 MiB'}</span></label>
        <label>原始规则文本<textarea rows={8} value={draft.text.join('\n')} onChange={(event) => setDraft({ ...draft, text: lines(event.target.value) })} /></label>
        <label>效果处理器 ID<textarea rows={4} placeholder="每行一个稳定 effectId" value={draft.effectIds.join('\n')} onChange={(event) => setDraft({ ...draft, effectIds: lines(event.target.value) })} /></label>
        <section className="effect-structure"><h2>结构化效果</h2><p>已从卡牌资料建立能力类型与处理器映射；尚未实现的复杂效果会继续保持草稿，避免错误裁定。</p><button type="button" onClick={() => setDraft({ ...draft, structuredEffects: [...draft.structuredEffects, { id: `effect-${draft.structuredEffects.length + 1}`, ability: 'automatic', conditions: [], costs: [], targets: [], actions: [{ kind: 'custom', customHandlerId: 'unconfigured' }], duration: { kind: 'instant' } }] })}>＋ 添加效果结构</button><strong>{draft.structuredEffects.length} 项</strong>
          <div className="effect-list">{draft.structuredEffects.map((effect, index) => <div key={`${effect.id}-${index}`}><code>{effect.id}</code><span>{effect.ability}</span><small>{effect.actions.find((action) => action.kind === 'custom')?.customHandlerId ?? '通用效果'}</small><button type="button" onClick={() => setDraft({ ...draft, structuredEffects: draft.structuredEffects.filter((_, itemIndex) => itemIndex !== index) })}>移除</button></div>)}</div>
        </section>
        <footer><button type="submit">保存草稿</button><button type="button" className="primary-action" disabled={!draft.id || !selectedId} onClick={() => { if (selectedId) void onPublish(selectedId); }}>发布卡牌</button></footer>
      </form>

      <aside className="card-preview"><div>{imagePreview ? <img src={imagePreview} alt="卡图预览" /> : <span>完整卡图预览</span>}</div><code>{draft.id || 'CARD-ID'}</code><h2>{draft.name || '未命名卡牌'}</h2><p>费用 {draft.cost} · {draft.attribute}{draft.rarity ? ` · ${draft.rarity}` : ''}</p>{draft.text.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}</aside>
    </div>
  </section>;
}
