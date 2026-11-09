import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, GameCommand, LegalAction, RoomCredentials, RoomSnapshot, ServerToClientEvents } from '@pgr/protocol';
import { Battlefield } from './Battlefield.js';

const API = 'http://localhost:3001';
const storageKey = 'pgr-room-credentials';
type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export default function App() {
  const [credentials, setCredentials] = useState<RoomCredentials | null>(() => {
    const saved = sessionStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) as RoomCredentials : null;
  });
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    if (!credentials) return;
    sessionStorage.setItem(storageKey, JSON.stringify(credentials));
    const socket = io(API, { transports: ['websocket'] }) as GameSocket;
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('room:resume', credentials));
    socket.on('room:snapshot', setRoom);
    socket.on('command:rejected', (rejection) => setError(rejection.message));
    socket.on('connect_error', () => setError('无法连接本地对战服务'));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [credentials]);

  const requestRoom = async (url: string) => {
    setError('');
    const response = await fetch(`${API}${url}`, { method: 'POST' });
    const body = await response.json() as RoomCredentials & { error?: string };
    if (!response.ok) { setError(body.error ?? '房间操作失败'); return; }
    setCredentials(body);
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

  if (!credentials) return (
    <main className="entry-screen">
      <div className="entry-grid" />
      <section className="entry-card">
        <p className="brand-mark">// 战术指挥终端</p>
        <h1>构造体卡牌对战</h1>
        <p>创建本地测试房间，或输入好友分享的六位房间码。</p>
        <button className="create-room" onClick={() => void requestRoom('/api/rooms')}>创建房间</button>
        <div className="join-row"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))} placeholder="房间码" maxLength={6} /><button onClick={() => void requestRoom(`/api/rooms/${joinCode}/join`)} disabled={joinCode.length !== 6}>加入</button></div>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );

  if (!room?.game) return (
    <main className="lobby-screen">
      <section className="lobby-card">
        <p>本地测试房间</p><h1>{credentials.code}</h1><small>将房间码发送给另一位玩家</small>
        <div className="seats">{room?.seats.map((seat, index) => <div key={seat.playerId} className={seat.connected ? 'connected' : ''}><span>{index === 0 ? '房主' : '访客'}</span><b>{seat.playerId === credentials.playerId ? '你' : '对手'}</b><em>{seat.ready ? '已准备' : seat.connected ? '等待准备' : '已断线'}</em></div>) ?? <div>正在连接…</div>}</div>
        <button className="ready-button" onClick={() => socketRef.current?.emit('room:ready', true)} disabled={!room || room.seats.length < 2}>选择开发牌组并准备</button>
        <button className="leave-room" onClick={leaveRoom}>离开房间</button>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );

  return <><Battlefield view={room.game} onCommand={sendAction} /><button className="leave-battle" onClick={leaveRoom}>离开房间</button></>;
}
