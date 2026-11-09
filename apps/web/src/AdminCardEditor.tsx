import { useState, type ChangeEvent } from 'react';
import type { CardDraftInput } from './api.js';

const initial: CardDraftInput = { id: '', name: '', type: 'character', cost: 0, attribute: 'physical', traits: [], pp: 0, dp: 0, text: [], effectIds: [], structuredEffects: [] };

export function AdminCardEditor({ onSave, onPublish }: { onSave: (input: CardDraftInput) => void; onPublish: (id: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const [imagePreview, setImagePreview] = useState('');
  const image = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => { const value = String(reader.result); setImagePreview(value); setDraft((current) => ({ ...current, imageDataUrl: value })); }; reader.readAsDataURL(file);
  };
  const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);
  return <section className="admin-editor">
    <header><div><small>ADMIN // CARD REGISTRY</small><h1>卡牌录入</h1></div><div className="draft-state">草稿模式</div></header>
    <div className="editor-columns"><form className="card-form" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      <div className="form-grid"><label>卡牌编号<input value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value.toUpperCase() })} required /></label><label>卡牌名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
        <label>类型<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as CardDraftInput['type'] })}><option value="character">角色</option><option value="tactic">战术</option><option value="item">道具</option></select></label><label>费用<input type="number" min="0" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: Number(event.target.value) })} /></label></div>
      <label className="image-drop">完整卡图<input type="file" accept="image/png,image/jpeg,image/webp" onChange={image} /><span>PNG / JPEG / WebP，最大 8 MiB</span></label>
      <label>原始规则文本<textarea rows={5} value={draft.text.join('\n')} onChange={(event) => setDraft({ ...draft, text: lines(event.target.value) })} /></label>
      <label>效果处理器 ID<textarea rows={3} placeholder="每行一个稳定 effectId" value={draft.effectIds.join('\n')} onChange={(event) => setDraft({ ...draft, effectIds: lines(event.target.value) })} /></label>
      <section className="effect-structure"><h2>结构化效果</h2><p>能力类型 → 触发/条件 → 费用 → 目标 → 动作。复杂效果必须绑定已注册 handlerId。</p><button type="button" onClick={() => setDraft({ ...draft, structuredEffects: [...draft.structuredEffects, { id: `effect-${draft.structuredEffects.length + 1}`, ability: 'automatic', actions: [{ type: 'custom' }] }] })}>＋ 添加效果结构</button><strong>{draft.structuredEffects.length} 项</strong></section>
      <footer><button type="submit">保存草稿</button><button type="button" className="primary-action" disabled={!draft.id} onClick={() => onPublish(draft.id)}>发布卡牌</button></footer>
    </form><aside className="card-preview"><div>{imagePreview ? <img src={imagePreview} alt="卡图预览" /> : <span>完整卡图预览</span>}</div><code>{draft.id || 'CARD-ID'}</code><h2>{draft.name || '未命名卡牌'}</h2><p>费用 {draft.cost} · {draft.attribute}</p>{draft.text.map((line) => <p key={line}>{line}</p>)}</aside></div>
  </section>;
}
