import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { cardsById } from '@pgr/cards';
import type { ClientToServerEvents, GameCommand, LegalAction, RoomCredentials, RoomSnapshot, ServerToClientEvents } from '@pgr/protocol';
import { Battlefield } from './Battlefield.js';
import { AuthScreen } from './AuthScreen.js';
import { CardLibrary } from './CardLibrary.js';
import { DeckEditor } from './DeckEditor.js';
import { AdminCardEditor } from './AdminCardEditor.js';
import { API, ApiError, apiRequest, type CardCatalogEntry, type CardDraftInput, type DeckSummary, type UserSummary } from './api.js';

const storageKey = 'pgr-room-credentials';
type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type PlatformTab = 'lobby' | 'cards' | 'decks' | 'admin';

export default function App() {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [tab, setTab] = useState<PlatformTab>('lobby');
  const [cards, setCards] = useState<CardCatalogEntry[]>([]);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<RoomCredentials | null>(() => {
    const saved = sessionStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) as RoomCredentials : null;
  });
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef<GameSocket | null>(null);

  const loadPlatform = useCallback(async () => {
    const [cardBody, deckBody] = await Promise.all([
      apiRequest<{ cards: CardCatalogEntry[] }>('/api/cards'),
      apiRequest<{ decks: DeckSummary[] }>('/api/decks'),
    ]);
    setCards(cardBody.cards);
    for (const card of cardBody.cards) cardsById.set(card.id, card);
    setDecks(deckBody.decks);
    setSelectedDeckId((current) => current ?? deckBody.decks[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void apiRequest<{ user: UserSummary }>('/api/auth/me').then(({ user: current }) => {
      setUser(current); return loadPlatform();
    }).catch(() => setUser(null)).finally(() => setCheckingSession(false));
  }, [loadPlatform]);

  useEffect(() => {
    if (!credentials || !user) return;
    sessionStorage.setItem(storageKey, JSON.stringify(credentials));
    const socket = io(API, { transports: ['websocket'], withCredentials: true }) as GameSocket;
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('room:resume', credentials));
    socket.on('room:snapshot', setRoom);
    socket.on('command:rejected', (rejection) => setError(rejection.message));
    socket.on('connect_error', () => setError('无法连接本地对战服务'));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [credentials, user]);

  const authenticate = async (mode: 'login' | 'register', username: string, password: string) => {
    setAuthBusy(true); setError('');
    try {
      const result = await apiRequest<{ user: UserSummary }>(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) });
      setUser(result.user); await loadPlatform();
    } catch (authError) { setError(authError instanceof Error ? authError.message : '登录失败'); }
    finally { setAuthBusy(false); }
  };

  const requestRoom = async (url: string) => {
    setError('');
    try { setCredentials(await apiRequest<RoomCredentials>(url, { method: 'POST' })); }
    catch (requestError) { setError(requestError instanceof ApiError && requestError.message === 'ACTIVE_DECK_REQUIRED' ? '请先在牌组编辑中启用一个合法牌组' : requestError instanceof Error ? requestError.message : '房间操作失败'); }
  };

  const sendAction = (action: LegalAction) => {
    if (!room?.game || !credentials) return;
    const command = { ...action, commandId: crypto.randomUUID(), playerId: credentials.playerId, expectedVersion: room.game.version } as GameCommand;
    socketRef.current?.emit('game:command', command);
  };

  const leaveRoom = () => {
    socketRef.current?.disconnect();
    sessionStorage.removeItem(storageKey);
    setRoom(null);
    setCredentials(null);
  };

  const logout = async () => { await apiRequest('/api/auth/logout', { method: 'POST' }); leaveRoom(); setUser(null); };

  if (checkingSession) return <main className="loading-screen">正在建立战术数据链路…</main>;
  if (!user) return <AuthScreen busy={authBusy} error={error} onSubmit={(mode, username, password) => void authenticate(mode, username, password)} />;
  if (room?.game) return <><Battlefield view={room.game} onCommand={sendAction} /><button className="leave-battle" onClick={leaveRoom}>离开房间</button></>;

  const navigation = <header className="platform-header"><button className="platform-brand" onClick={() => setTab('lobby')}><i />构造体卡牌对战</button><nav><button className={tab === 'lobby' ? 'active' : ''} onClick={() => setTab('lobby')}>对战大厅</button><button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>卡牌库</button><button className={tab === 'decks' ? 'active' : ''} onClick={() => setTab('decks')}>牌组编辑</button>{user.role === 'admin' && <button className={tab === 'admin' ? 'active admin' : 'admin'} onClick={() => setTab('admin')}>卡牌录入</button>}</nav><div className="user-chip"><span>{user.role === 'admin' ? 'ADMIN' : 'PLAYER'}</span><b>{user.username}</b><button onClick={() => void logout()}>退出</button></div></header>;

  const lobby = !credentials ? <main className="command-lobby"><section><small>ONLINE DUEL // READY</small><h1>对战大厅</h1><p>使用当前启用牌组创建房间，或输入另一位指挥官分享的六位房间码。</p><div className="active-deck-summary"><span>当前牌组</span><b>{decks.find((deck) => deck.active)?.name ?? '尚未启用牌组'}</b></div><button className="primary-action" onClick={() => void requestRoom('/api/rooms')}>创建对战房间</button><div className="join-row"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))} placeholder="六位房间码" maxLength={6} /><button onClick={() => void requestRoom(`/api/rooms/${joinCode}/join`)} disabled={joinCode.length !== 6}>加入房间</button></div>{error && <p className="form-error">{error}</p>}</section></main> : <main className="lobby-screen">
      <section className="lobby-card">
        <p>线上测试房间</p><h1>{credentials.code}</h1><small>将房间码发送给另一位玩家</small>
        <div className="seats">{room?.seats.map((seat, index) => <div key={seat.playerId} className={seat.connected ? 'connected' : ''}><span>{index === 0 ? '房主' : '访客'}</span><b>{seat.playerId === credentials.playerId ? '你' : '对手'}</b><em>{seat.ready ? '已准备' : seat.connected ? '等待准备' : '已断线'}</em></div>) ?? <div>正在连接…</div>}</div>
        <button className="ready-button" onClick={() => socketRef.current?.emit('room:ready', true)} disabled={!room || room.seats.length < 2}>使用启用牌组准备</button>
        <button className="leave-room" onClick={leaveRoom}>离开房间</button>
        {error && <p className="error">{error}</p>}
      </section>
    </main>;

  return <div className="platform-shell">{navigation}{tab === 'lobby' && lobby}{tab === 'cards' && <CardLibrary cards={cards} loading={false} />}{tab === 'decks' && (decks.length ? <DeckEditor cards={cards} decks={decks} selectedDeckId={selectedDeckId} onSelectDeck={setSelectedDeckId} onSave={(deck) => void apiRequest(`/api/decks/${deck.id}`, { method: 'PUT', body: JSON.stringify({ name: deck.name, cards: deck.cards }) }).then(loadPlatform)} onActivate={(id) => void apiRequest(`/api/decks/${id}/activate`, { method: 'POST' }).then(loadPlatform)} /> : <main className="empty-platform"><h1>还没有牌组</h1><p>先创建一个空白草稿，再从已发布卡牌中开始构筑。</p><button className="primary-action" onClick={() => void apiRequest('/api/decks', { method: 'POST', body: JSON.stringify({ name: '新建牌组', cards: [] }) }).then(loadPlatform)}>创建牌组草稿</button></main>)}{tab === 'admin' && user.role === 'admin' && <AdminCardEditor onSave={(input: CardDraftInput) => void apiRequest('/api/admin/cards', { method: 'POST', body: JSON.stringify(input) }).then(loadPlatform).catch((saveError) => setError(saveError instanceof Error ? saveError.message : '保存失败'))} onPublish={(id) => void apiRequest(`/api/admin/cards/${id}/publish`, { method: 'POST' }).then(loadPlatform).catch((publishError) => setError(publishError instanceof ApiError ? [publishError.message, ...publishError.details].join('；') : '发布失败'))} />}{error && tab !== 'lobby' && <div className="global-error">{error}</div>}</div>;
}
