import { useState, type FormEvent } from 'react';

interface AuthScreenProps {
  busy: boolean;
  error: string;
  onSubmit: (mode: 'login' | 'register', username: string, password: string) => void;
}

export function AuthScreen({ busy, error, onSubmit }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(mode, username, password); };
  return <main className="auth-screen">
    <div className="entry-grid" />
    <section className="auth-terminal">
      <div className="auth-brand"><span>GRAY RAVEN // CARD LINK</span><b>战术终端</b></div>
      <div className="auth-status"><i /> 数据链路待验证</div>
      <h1>{mode === 'login' ? '账号登录' : '创建账号'}</h1>
      <p>登录后浏览卡牌、构筑牌组并进入线上对局。</p>
      <form onSubmit={submit}>
        <label>用户名<input name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={24} required /></label>
        <label>密码<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" disabled={busy}>{busy ? '正在验证…' : mode === 'login' ? '进入终端' : '创建并登录'}</button>
      </form>
      <button className="text-action" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '没有账号？创建账号' : '已有账号？账号登录'}</button>
    </section>
  </main>;
}
