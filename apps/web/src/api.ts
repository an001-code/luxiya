import type { Attribute, CardSubtype, CardType, SignalColor, StructuredEffect } from '@pgr/protocol';

export const API = 'http://localhost:3001';

export interface UserSummary { id: string; username: string; role: 'player' | 'admin' }
export interface CardCatalogEntry {
  id: string; name: string; type: CardType; subtype?: CardSubtype; cost: number; attribute: Attribute;
  traits: string[]; pp?: number; dp?: number; signal?: SignalColor; text: string[]; effectIds: string[];
  structuredEffects: StructuredEffect[]; rarity?: string; status: 'draft' | 'published'; version: number;
  hasImage: boolean; imageMime?: string; createdAt: string; updatedAt: string;
}
export interface DeckSummary {
  id: string; name: string; active: boolean; cards: Array<{ cardId: string; count: number }>;
  validationErrors: string[];
}
export interface CardDraftInput {
  id: string; name: string; type: CardType; subtype?: CardSubtype; cost: number; attribute: Attribute;
  traits: string[]; pp?: number; dp?: number; signal?: SignalColor; text: string[]; effectIds: string[];
  structuredEffects: StructuredEffect[]; rarity?: string; artPath?: string; imageDataUrl?: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details: string[] = []) { super(message); }
}

export const apiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json() as T & { error?: string; details?: string[] };
  if (!response.ok) throw new ApiError(body.error ?? 'REQUEST_FAILED', response.status, body.details ?? []);
  return body;
};

export const cardImageUrl = (id: string): string => `${API}/api/cards/${encodeURIComponent(id)}/image`;
export const adminCardImageUrl = (id: string): string => `${API}/api/admin/cards/${encodeURIComponent(id)}/image`;

export const saveAdminCard = async (input: CardDraftInput, existingId: string | null): Promise<CardCatalogEntry> => {
  const path = existingId ? `/api/admin/cards/${encodeURIComponent(existingId)}` : '/api/admin/cards';
  const { card } = await apiRequest<{ card: CardCatalogEntry }>(path, {
    method: existingId ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
  return card;
};

export const publishAdminCard = async (id: string): Promise<CardCatalogEntry> => {
  const { card } = await apiRequest<{ card: CardCatalogEntry }>(`/api/admin/cards/${encodeURIComponent(id)}/publish`, { method: 'POST' });
  return card;
};

export const saveAndPublishAdminCard = async (input: CardDraftInput, existingId: string | null): Promise<CardCatalogEntry> => {
  const saved = await saveAdminCard(input, existingId);
  return publishAdminCard(saved.id);
};
