import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const freePort = async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing probe port');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
};

test('combined workspace startup exposes both the web page and the MySQL-backed login API', async ({ request }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const port = await freePort();
  const webPort = await freePort();
  const child = spawn(process.execPath, ['node_modules/concurrently/dist/bin/concurrently.js', '--kill-others-on-fail', '-n', 'server,web',
    'npm run dev -w @pgr/server', `npm run dev -w @pgr/web -- --port ${webPort} --strictPort`], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    detached: process.platform !== 'win32',
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  try {
    await expect.poll(async () => {
      try {
        return (await request.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1000 })).status();
      } catch { return 0; }
    }, { timeout: 12_000, message: 'The combined dev command must execute and listen, rather than leaving a silent watcher' }).toBe(200);
    expect((await request.get(`http://127.0.0.1:${webPort}`)).status()).toBe(200);
    const login = await request.post(`http://127.0.0.1:${port}/api/auth/login`, { data: {
      username: process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'Anonce', password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    } });
    expect(login.status()).toBe(200);
    expect(await login.json()).toMatchObject({ user: { role: 'admin' } });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nCaptured startup output:\n${output}`);
  } finally {
    if (child.pid && child.exitCode === null) {
      if (process.platform === 'win32') await promisify(execFile)('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      else process.kill(-child.pid, 'SIGTERM');
    }
  }
});
